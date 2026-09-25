/**
 * App state: the open league, the save store, and save status. Screens read from here and subscribe to
 * changes; the engine does the work and the store does the saving.
 */
import type { BaseDb } from '../data/base-db';
import type { League, LeagueSummary, StartOptions } from '../engine/league/types';
import type { NewLeagueInput } from '../engine/league/create';
import type { SaveStore } from '../storage/saves';
import { exportFileName, exportFileNameFor, exportLeague, importLeague } from '../storage/saves';
import type { Progress, WorkerClient } from './worker-client';

export type SaveStatus =
  | { state: 'saved'; at: number }
  | { state: 'saving' }
  | { state: 'failed'; message: string }
  | { state: 'none' };

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
    this.league = null;
    this.saveStatus = { state: 'none' };
    await this.rememberLeague(null);
    this.emit();
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
      return { blob: await exportLeague(raw), fileName };
    }
    if (!this.league) throw new Error('Open a league to export it.');
    return { blob: await exportLeague(this.league), fileName: exportFileName(this.league) };
  }

  /** Imports a league file as a new save. A league already saved here comes in as a copy. */
  async importFile(file: Blob): Promise<League> {
    const league = await importLeague(file);
    if (this.leagues.some(l => l.id === league.meta.id)) {
      league.meta.id = newLeagueId();
      league.meta.name = `${league.meta.name} (copy)`;
    }
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
