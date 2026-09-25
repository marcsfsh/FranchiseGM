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

/**
 * Puts a holder's entry in a list, replacing his earlier entry (the same game, season, or career), and
 * keeps the best RECORD_DEPTH. Earlier achievements win ties: earlier seasons first, then list order, with
 * a changed entry going after the ones already at its value. An unchanged value keeps its place, and a
 * value of zero or less leaves the list. (A value that drops but stays positive keeps its entry even if a
 * player outside the list now has more; totals only drop on rare negative plays.)
 */
function place(
  list: RecordEntry[] | undefined,
  entry: RecordEntry,
  same: (e: RecordEntry) => boolean
): RecordEntry[] | undefined {
  const current = list ?? [];
  const mine = current.find(same);
  // Unchanged: the same value, or an entry that can't make the list.
  if (mine ? mine.value === entry.value : entry.value <= 0) return list;
  const last = current.at(-1);
  if (!mine && current.length >= RECORD_DEPTH && last && entry.value <= last.value) return list;
  const kept = current.filter(e => e !== mine);
  if (entry.value > 0) kept.push(entry);
  kept.sort((a, b) => b.value - a.value || a.season - b.season);
  return kept.slice(0, RECORD_DEPTH);
}

/**
 * Notes a record that changed hands: the entry now leads a list that had a different leader with a lower
 * value. A holder extending his own record, and the first entry in an empty list, aren't news.
 */
function note(
  broken: BrokenRecord[],
  scope: BrokenRecord['scope'],
  stat: BrokenRecord['stat'],
  before: RecordEntry[] | undefined,
  after: readonly RecordEntry[] | undefined,
  entry: RecordEntry,
  same: (e: RecordEntry) => boolean
): void {
  const previous = before?.[0];
  if (after?.[0] === entry && previous && !same(previous) && entry.value > previous.value)
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
      const same = (e: RecordEntry) => e.playerId === playerId && e.gameId === gameId;
      const after = place(before, entry, same);
      note(broken, 'game', stat, before, after, entry, same);
      if (after !== before) book.game[stat] = after as RecordEntry[];
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
        // One entry per player-season: a player traded mid-season keeps a single line, under his new team.
        const entry: RecordEntry = {
          value: statValue(p.season.totals, stat),
          team: p.season.team,
          season: p.season.season,
          playerId: p.id
        };
        const same = (e: RecordEntry) => e.playerId === p.id && e.season === entry.season;
        const before = book.season[stat];
        const after = place(before, entry, same);
        note(broken, 'season', stat, before, after, entry, same);
        if (after !== before) book.season[stat] = after as RecordEntry[];
      }
      const entry: RecordEntry = {
        value: statValue(p.career.totals, stat),
        team: p.career.team,
        season: p.lastSeason,
        playerId: p.id
      };
      const same = (e: RecordEntry) => e.playerId === p.id;
      const before = book.career[stat];
      const after = place(before, entry, same);
      note(broken, 'career', stat, before, after, entry, same);
      if (after !== before) book.career[stat] = after as RecordEntry[];
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
    const after = place(before, entry, same);
    note(broken, 'team', id, before, after, entry, same);
    if (after) book.team[id] = after;
  };
  put(
    'gamePoints',
    { value: game.points, team, season, gameId },
    e => e.gameId === gameId && e.team === team
  );
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
