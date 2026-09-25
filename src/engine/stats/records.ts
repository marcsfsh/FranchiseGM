/**
 * The records book (spec 18.5): the best single games, single seasons, and careers for every tracked stat,
 * plus team records (wins, points, winning streaks). It updates after each recorded game; a new record
 * holder is reported so the news feed (M18) can announce it. The add functions update the book they are
 * given, so callers pass a working copy (recordGames clones the stored book first).
 */
import type { TeamAbbr } from '../../data/team-colors';
import { LONG_STATS, STAT_KEYS, type PlayerLine, type StatKey } from '../sim/stats';
import type { SeasonLine, Totals } from './aggregate';

/** Stats with records: every stored stat but participation counts, plus total tackles. */
export const RECORD_STATS: readonly StatKey[] = STAT_KEYS.filter(
  k => !['snapsOffense', 'snapsDefense', 'snapsSpecial', 'started', 'penalties', 'penaltyYds'].includes(k)
);

/** How many entries each list keeps. */
export const RECORD_DEPTH = 10;

export type Scope = 'game' | 'season' | 'career';

export interface RecordEntry {
  value: number;
  team: TeamAbbr;
  /** The season it happened, or the last season of a career. */
  season: number;
  playerId?: string;
  gameId?: string;
}

export type TeamRecordId = 'wins' | 'points' | 'gamePoints' | 'winStreak';

export interface RecordsBook {
  game: Partial<Record<StatKey, RecordEntry[]>>;
  season: Partial<Record<StatKey, RecordEntry[]>>;
  career: Partial<Record<StatKey, RecordEntry[]>>;
  team: Record<TeamRecordId, RecordEntry[]>;
  /** Each team's current winning streak: its length and the game and season it began. */
  streaks: Partial<Record<TeamAbbr, { length: number; start: string; season: number }>>;
}

/** A record that changed hands. */
export interface BrokenRecord {
  scope: Scope | 'team';
  stat: StatKey | TeamRecordId;
  entry: RecordEntry;
  previous: RecordEntry | null;
}

export const emptyRecords = (): RecordsBook => ({
  game: {},
  season: {},
  career: {},
  team: { wins: [], points: [], gamePoints: [], winStreak: [] },
  streaks: {}
});

/** Total tackles are solo plus assisted (spec 9.2 stores the two). */
export function statValue(totals: Readonly<Totals> | Readonly<Partial<PlayerLine>>, key: StatKey): number {
  if (key === 'tackles') return (totals.soloTackles ?? 0) + (totals.assistedTackles ?? 0);
  return totals[key] ?? 0;
}

const identity = (e: RecordEntry): string => `${e.playerId ?? e.team}|${e.gameId ?? ''}|${e.season}`;

/**
 * Puts an entry in a list, replacing the same holder's earlier entry (the same game, season, or career),
 * and keeps the best RECORD_DEPTH. Earlier achievements win ties.
 */
function place(
  list: RecordEntry[] | undefined,
  entry: RecordEntry,
  same: (e: RecordEntry) => boolean
): { list: RecordEntry[]; top: boolean } {
  const kept = (list ?? []).filter(e => !same(e));
  kept.push(entry);
  kept.sort((a, b) => b.value - a.value || a.season - b.season || identity(a).localeCompare(identity(b)));
  const next = kept.slice(0, RECORD_DEPTH);
  return { list: next, top: next[0] === entry };
}

function note(
  broken: BrokenRecord[],
  scope: BrokenRecord['scope'],
  stat: BrokenRecord['stat'],
  before: RecordEntry[] | undefined,
  result: { list: RecordEntry[]; top: boolean },
  entry: RecordEntry
): void {
  const previous = before?.[0] ?? null;
  if (result.top && (!previous || entry.value > previous.value))
    broken.push({ scope, stat, entry, previous });
}

/** Single-game records from one game's lines. */
export function addGameRecords(
  book: RecordsBook,
  lines: readonly { playerId: string; team: TeamAbbr; line: Readonly<Partial<PlayerLine>> }[],
  season: number,
  gameId: string,
  broken: BrokenRecord[] = []
): BrokenRecord[] {
  for (const stat of RECORD_STATS) {
    for (const { playerId, team, line } of lines) {
      const value = statValue(line, stat);
      if (value <= 0) continue;
      const before = book.game[stat];
      const floor = before && before.length >= RECORD_DEPTH ? (before.at(-1) as RecordEntry).value : 0;
      if (value <= floor) continue;
      const entry: RecordEntry = { value, team, season, playerId, gameId };
      const result = place(before, entry, e => e.playerId === playerId && e.gameId === gameId);
      note(broken, 'game', stat, before, result, entry);
      book.game[stat] = result.list;
    }
  }
  return broken;
}

/** Single-season and career records for players whose histories just changed (regular season only). */
export function addPlayerRecords(
  book: RecordsBook,
  players: readonly { id: string; season: SeasonLine | null; career: SeasonLine; lastSeason: number }[],
  broken: BrokenRecord[] = []
): BrokenRecord[] {
  for (const stat of RECORD_STATS) {
    if (LONG_STATS.has(stat)) continue;
    for (const p of players) {
      if (p.season) {
        const value = statValue(p.season.totals, stat);
        const before = book.season[stat];
        if (value > 0) {
          const entry: RecordEntry = { value, team: p.season.team, season: p.season.season, playerId: p.id };
          const result = place(
            before,
            entry,
            e => e.playerId === p.id && e.season === entry.season && e.team === entry.team
          );
          note(broken, 'season', stat, before, result, entry);
          book.season[stat] = result.list;
        }
      }
      const value = statValue(p.career.totals, stat);
      const before = book.career[stat];
      if (value > 0) {
        const entry: RecordEntry = { value, team: p.career.team, season: p.lastSeason, playerId: p.id };
        const result = place(before, entry, e => e.playerId === p.id);
        note(broken, 'career', stat, before, result, entry);
        book.career[stat] = result.list;
      }
    }
  }
  return broken;
}

/** Team records after a game: points in the game, season wins and points, and winning streaks. */
export function addTeamRecords(
  book: RecordsBook,
  game: { gameId: string; season: number; team: TeamAbbr; points: number; won: boolean },
  seasonWins: number,
  seasonPoints: number,
  broken: BrokenRecord[] = []
): BrokenRecord[] {
  const { team, season, gameId } = game;
  const put = (id: TeamRecordId, entry: RecordEntry, same: (e: RecordEntry) => boolean) => {
    const before = book.team[id];
    const result = place(before, entry, same);
    note(broken, 'team', id, before, result, entry);
    book.team[id] = result.list;
  };
  put(
    'gamePoints',
    { value: game.points, team, season, gameId },
    e => e.gameId === gameId && e.team === team
  );
  if (seasonWins > 0)
    put('wins', { value: seasonWins, team, season }, e => e.team === team && e.season === season);
  put('points', { value: seasonPoints, team, season }, e => e.team === team && e.season === season);
  // A winning streak keeps one entry, named for the game and season it began.
  if (!game.won) delete book.streaks[team];
  else {
    const running = book.streaks[team];
    const streak = running
      ? { ...running, length: running.length + 1 }
      : { length: 1, start: gameId, season };
    book.streaks[team] = streak;
    put(
      'winStreak',
      { value: streak.length, team, season: streak.season, gameId: streak.start },
      e => e.team === team && e.gameId === streak.start
    );
  }
  return broken;
}
