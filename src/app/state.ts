/**
 * App state: the open league, the save store, and save status. Screens read from here and subscribe to
 * changes; the engine does the work and the store does the saving.
 */
import type { BaseDb } from '../data/base-db';
import type { CalibrationData } from '../engine/calibration/replay';
import type { CalibrationReport } from '../engine/calibration/report';
import type { RunPlan } from '../engine/calibration/run';
import type { TargetsFile } from '../engine/calibration/targets';
import type { League, LeagueSummary, StartOptions } from '../engine/league/types';
import { digestActions, freshSeed } from '../engine/rng';
import type { WeekOutcome } from '../engine/season/advance';
import { offseasonStep, type StepOutcome } from '../engine/season/offseason';
import type { InboxItem } from '../engine/season/inbox';
import { gameWeek } from '../engine/season/state';
import type { NewLeagueInput } from '../engine/league/create';
import type { SaveStore } from '../storage/saves';
import { exportFileName, exportFileNameFor, exportLeague, readLeagueFile } from '../storage/saves';
import { JobError, type Progress, type WorkerClient } from './worker-client';

export type SaveStatus =
  | { state: 'saved'; at: number }
  | { state: 'saving' }
  | { state: 'failed'; message: string }
  | { state: 'none' };

/**
 * How far an advance goes: one week (or one offseason step), to the end of the regular season, through the
 * Super Bowl, or through the offseason to the next season's week 1.
 */
export type AdvanceTarget = 'week' | 'playoffs' | 'season' | 'nextSeason';

type AdvancedWeek = Omit<WeekOutcome, 'decisions'>;
type AdvancedStep = Omit<StepOutcome, 'decisions'>;

export interface AdvanceReport {
  /** Weeks and offseason steps taken. */
  weeks: number;
  /** Messages that stopped the advance. */
  pauses: InboxItem[];
  /** The user stopped it between weeks. */
  stopped: boolean;
  /** What the user must do before the offseason can go on, when that stopped it. */
  blocked: string | null;
}

/** How long an edit waits for the next one before the league saves. */
const EDIT_SAVE_DELAY_MS = 600;

export class AppState {
  league: League | null = null;
  leagues: LeagueSummary[] = [];
  saveStatus: SaveStatus = { state: 'none' };
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly store: SaveStore,
    readonly baseDb: BaseDb,
    private readonly worker: WorkerClient,
    readonly gameVersion: string
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  async refreshList(): Promise<void> {
    this.leagues = await this.store.list();
    this.emit();
  }

  /** The league that was open last time, if it's still saved. */
  async lastLeagueId(): Promise<string | null> {
    try {
      const id = await this.store.getLastLeague();
      return id && this.leagues.some(l => l.id === id) ? id : null;
    } catch {
      return null;
    }
  }

  private rememberLeague(id: string | null): Promise<void> {
    // Remembering the last league is a convenience; a failure here never blocks play.
    return this.store.setLastLeague(id).catch(() => undefined);
  }

  async open(id: string): Promise<League> {
    const league = await this.store.load(id);
    this.league = league;
    this.saveStatus = { state: 'saved', at: this.leagues.find(l => l.id === id)?.savedAt ?? Date.now() };
    await this.rememberLeague(id);
    this.emit();
    return league;
  }

  async close(): Promise<void> {
    await this.flush();
    this.league = null;
    this.saveStatus = { state: 'none' };
    await this.rememberLeague(null);
    this.emit();
  }

  /**
   * Runs a calibration in the worker (spec 23.1, the dev menu). Returns null if `signal` aborts first.
   */
  async calibrate(
    plan: RunPlan,
    targets: TargetsFile,
    onProgress: (p: Progress) => void,
    signal?: AbortSignal
  ): Promise<CalibrationReport | null> {
    const data: CalibrationData = {
      names: this.baseDb.names,
      schedule: this.baseDb.schedule,
      climate: this.baseDb.climate
    };
    const job = this.worker.run<CalibrationReport>(
      'calibrate',
      { data, plan, targets, mode: 'full' },
      onProgress
    );
    const cancel = () => this.worker.cancel(job.id);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      return await job.result;
    } catch (error) {
      if (error instanceof JobError && error.cancelled) return null;
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  /**
   * Builds a league in the worker, saves it, and opens it. Returns null if `signal` aborts first; the
   * league is then discarded. A failed first save leaves the league open with a failed save status.
   */
  async create(
    name: string,
    start: StartOptions,
    onProgress: (p: Progress) => void,
    signal?: AbortSignal
  ): Promise<League | null> {
    const input: Omit<NewLeagueInput, 'onProgress'> = {
      id: newLeagueId(),
      name,
      start,
      gameVersion: this.gameVersion,
      names: this.baseDb.names,
      schedule: this.baseDb.schedule
    };
    const job = this.worker.run<League>('createLeague', input, onProgress);
    const cancel = () => this.worker.cancel(job.id);
    signal?.addEventListener('abort', cancel, { once: true });
    let league: League;
    try {
      league = await job.result;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
    if (signal?.aborted) return null;
    this.league = league;
    await this.save();
    await this.rememberLeague(league.meta.id);
    return league;
  }

  /** Saves the open league. Failures leave a persistent status the UI shows, with export as the way out. */
  async save(): Promise<boolean> {
    if (!this.league) return false;
    this.saveStatus = { state: 'saving' };
    this.emit();
    try {
      const summary = await this.store.save(this.league);
      this.saveStatus = { state: 'saved', at: summary.savedAt };
      await this.refreshList();
      return true;
    } catch (error) {
      this.saveStatus = { state: 'failed', message: error instanceof Error ? error.message : String(error) };
      this.emit();
      return false;
    }
  }

  private pendingSave: ReturnType<typeof setTimeout> | null = null;
  /** The user's actions since the last advance, which seed the next one's variance (spec 8.9). */
  private actions: unknown[] = [];
  /** Edits made while a week is in the worker, to reapply to the league it sends back. */
  private inFlight: ((league: League) => void)[] | null = null;

  /** Whether a week is being played in the worker; roster moves wait for it (they can't be replayed). */
  get advancing(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Applies a change to the open league from a screen (a depth chart move, a game plan setting) and saves
   * shortly after, so a burst of changes saves once. `action` describes the change for the next advance's
   * variance.
   */
  edit(change: (league: League) => void, action: unknown = 'edit'): void {
    if (!this.league) return;
    change(this.league);
    this.inFlight?.push(change);
    this.actions.push(action);
    if (this.pendingSave) clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => {
      this.pendingSave = null;
      void this.save();
    }, EDIT_SAVE_DELAY_MS);
  }

  /** Saves any edit still waiting for its save. */
  async flush(): Promise<void> {
    if (!this.pendingSave) return;
    clearTimeout(this.pendingSave);
    this.pendingSave = null;
    await this.save();
  }

  /**
   * Advances week by week in the worker (spec 4.2), stopping at the target, at a message that pauses under
   * the user's settings (spec 19.6), or between weeks once `signal` aborts. Each week's games go into
   * history before the league takes the new week, so a failed write leaves the week to replay; then the
   * league autosaves (spec 21). Edits the user makes while a week is in the worker apply to the league it
   * sends back, so none are lost.
   */
  async advance(
    target: AdvanceTarget,
    onWeek: (league: League, weeks: number) => void,
    signal?: AbortSignal
  ): Promise<AdvanceReport> {
    if (!this.league) throw new Error('Open a league to advance it.');
    await this.flush();
    const pauses: InboxItem[] = [];
    let weeks = 0;
    let blocked: string | null = null;
    while (this.league && !signal?.aborted) {
      const inSeason = gameWeek(this.league) !== null;
      // A season advance ends when the offseason opens; the offseason one when the next season starts.
      if (!inSeason && (target === 'season' || !offseasonStep(this.league.date))) break;
      const input = { actions: digestActions(this.actions), entropy: freshSeed() };
      const posted = this.actions.length;
      this.inFlight = [];
      let step: AdvancedWeek | AdvancedStep;
      let edits: ((league: League) => void)[];
      try {
        if (inSeason) {
          const week: AdvancedWeek = await this.worker.run<AdvancedWeek>('advanceWeek', {
            league: this.league,
            climate: this.baseDb.climate,
            input
          }).result;
          await this.store.history.record(week.league.meta.id, week.games);
          step = week;
        } else {
          const offseason: AdvancedStep = await this.worker.run<AdvancedStep>('advanceOffseason', {
            league: this.league,
            names: this.baseDb.names,
            climate: this.baseDb.climate,
            input
          }).result;
          // Preseason games go into history the same way, tagged so they stay out of career totals.
          if (offseason.games.length)
            await this.store.history.record(offseason.league.meta.id, offseason.games);
          step = offseason;
        }
      } finally {
        edits = this.inFlight;
        this.inFlight = null;
      }
      if ('blocked' in step && step.blocked) {
        blocked = step.blocked;
        break;
      }
      // Actions taken during the week count toward the next one.
      this.actions = this.actions.slice(posted);
      this.league = step.league;
      for (const change of edits) change(step.league);
      await this.save();
      weeks++;
      onWeek(step.league, weeks);
      pauses.push(...step.pauses);
      if (target === 'week' || pauses.length) break;
      if (target === 'playoffs' && step.league.date.phase !== 'regularSeason') break;
      if (target === 'nextSeason' && step.league.date.phase === 'regularSeason') break;
    }
    return { weeks, pauses, stopped: signal?.aborted === true, blocked };
  }

  /** Autosave hook (spec 21): after every week and every offseason phase. */
  autosave(): Promise<boolean> {
    return this.save();
  }

  /** Renames the open league. Returns false for a blank name, which leaves the name unchanged. */
  rename(name: string): boolean {
    if (!this.league || name.trim() === '') return false;
    this.league.meta.name = name.trim();
    void this.save();
    return true;
  }

  /**
   * Exports the open league, or a saved one by ID. Saved leagues export as stored, so a save from another
   * version of the game can still be exported and opened in the version that wrote it.
   */
  async exportLeague(id?: string): Promise<{ blob: Blob; fileName: string }> {
    if (id && id !== this.league?.meta.id) {
      const raw = await this.store.loadRaw(id);
      const summary = this.leagues.find(l => l.id === id);
      const fileName = summary ? exportFileNameFor(summary) : `franchise-gm-${id}.json.gz`;
      return { blob: await exportLeague(raw, await this.store.history.exportHistory(id)), fileName };
    }
    if (!this.league) throw new Error('Open a league to export it.');
    const history = await this.store.history.exportHistory(this.league.meta.id);
    return { blob: await exportLeague(this.league, history), fileName: exportFileName(this.league) };
  }

  /** Imports a league file as a new save. A league already saved here comes in as a copy. */
  async importFile(file: Blob): Promise<League> {
    const { league, history } = await readLeagueFile(file);
    if (this.leagues.some(l => l.id === league.meta.id)) {
      league.meta.id = newLeagueId();
      league.meta.name = `${league.meta.name} (copy)`;
    }
    if (history) await this.store.history.importHistory(league.meta.id, history);
    await this.store.save(league);
    await this.refreshList();
    return league;
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
    if (this.league?.meta.id === id) await this.close();
    await this.refreshList();
  }
}

function newLeagueId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `league-${Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('')}`;
}

/** Exports a league (the open one by default) and saves the file to the user's device. */
export async function exportToDevice(app: AppState, id?: string): Promise<void> {
  const { blob, fileName } = await app.exportLeague(id);
  downloadBlob(blob, fileName);
}

/** Saves a blob to the user's device. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
