/**
 * Seasons chained through the offseason, for the aging metrics (spec 23.3): a generated league played week
 * by week through the Super Bowl and then a step at a time through the offseason into the next season, as
 * the game does it, with the user's club on auto. Each season's week 1 players are recorded (the active
 * rosters for the roster metrics, everyone not retired for the aging curves, and each pick's round and
 * whether he starts, for the draft's hit rates), and each offseason's retirements.
 */
import { TEAM_ABBRS } from '../../data/team-colors';
import { startersOf } from '../league/depth';
import { calendarDay } from '../model/calendar';
import type { League } from '../league/types';
import { ageOn } from '../model/player';
import { POSITION_GROUP, type PositionGroup } from '../model/positions';
import { DEFAULT_RULES } from '../rules/ruleset';
import type { Slot } from '../schemes/slots';
import { advanceWeek } from '../season/advance';
import { advanceOffseason } from '../season/offseason';
import { gameWeek } from '../season/state';
import type { MetricValue } from './metrics';
import type { CalibrationData } from './replay';

export interface ChainPlayer {
  id: string;
  group: PositionGroup;
  /** Whole years on the season's opening day, and the exact age for averages. */
  age: number;
  exactAge: number;
  ovr: number;
  /** Credited seasons, and accrued ones, which NFL rosters count as experience (D-37). */
  experience: number;
  accrued: number;
  active: boolean;
  /** His draft, when a team drafted him; and whether he's a base starter on his team's depth chart. */
  draft: { year: number; round: number } | null;
  starter: boolean;
}

export interface ChainSnapshot {
  season: number;
  teams: number;
  players: ChainPlayer[];
}

export interface Retirement {
  group: PositionGroup;
  age: number;
  experience: number;
}

export interface AgingFacts {
  snapshots: ChainSnapshot[];
  retirements: Retirement[];
}

/** A chained league's facts, apart from the season samples. */
export interface ChainSample {
  league: number;
  aging: AgingFacts;
}

const YEAR_MS = 365.25 * 86_400_000;
const exactAge = (birthDate: string, day: string): number =>
  (Date.parse(day) - Date.parse(birthDate)) / YEAR_MS;

/** The base starters on a depth chart, 11 a side; specialists and situational players don't count. */
const BASE_SLOTS: readonly Slot[] = [
  'QB', 'RB1', 'X', 'Z', 'SLOT', 'TE1', 'LT', 'LG', 'C', 'RG', 'RT',
  'LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', 'MIKE', 'WILL', 'CB1', 'CB2', 'FS', 'SS'
]; // prettier-ignore

/**
 * Every player not retired on the season's opening day. A team's starters are the first players at each base
 * slot of its depth chart who are on its active roster, since a chart set at camp can still list players
 * cut since.
 */
export function snapshot(league: League): ChainSnapshot {
  const day = calendarDay(league.date);
  const starters = new Set(
    TEAM_ABBRS.flatMap(abbr => {
      const onRoster = (id: string) => league.players[id]?.team === abbr && league.players[id]?.status === 'active'; // prettier-ignore
      const firsts = startersOf(league.teams[abbr].depth.order, onRoster);
      return BASE_SLOTS.flatMap(slot => firsts[slot] ?? []);
    })
  );
  const players = Object.values(league.players)
    .filter(p => p.status !== 'retired')
    .map(p => ({
      id: p.id,
      group: POSITION_GROUP[p.position],
      age: ageOn(p.birthDate, day),
      exactAge: exactAge(p.birthDate, day),
      ovr: p.ovr,
      experience: p.experience,
      accrued: p.accrued,
      active: p.team !== null && p.status === 'active',
      draft: 'round' in p.draft ? { year: p.draft.year, round: p.draft.round } : null,
      starter: starters.has(p.id)
    }));
  return { season: league.date.season, teams: Object.keys(league.teams).length, players };
}

/**
 * Plays `seasons` seasons of a league from its first week 1, through each offseason, calling `onSeason`
 * after each; the last season ends with its Super Bowl.
 */
export function runChain(
  league: League,
  data: CalibrationData,
  seasons: number,
  onSeason?: (done: number) => void
): AgingFacts {
  const facts: AgingFacts = { snapshots: [], retirements: [] };
  const input = { actions: 0, entropy: 0 };
  for (let s = 0; s < seasons; s++) {
    facts.snapshots.push(snapshot(league));
    while (gameWeek(league) !== null) {
      const week = advanceWeek(league, data.climate, input);
      if (week.blocked)
        throw new Error(`The chained league stopped in week ${league.date.week}: ${week.blocked}`);
    }
    if (s < seasons - 1) {
      const season = league.date.season;
      while (league.date.phase !== 'regularSeason') {
        const step = advanceOffseason(league, { names: data.names, climate: data.climate }, input);
        if (step.blocked) throw new Error(`The chained league stopped in the offseason: ${step.blocked}`);
      }
      const awards = calendarDay({ season, phase: 'awards', week: 1 });
      for (const p of Object.values(league.players))
        if (p.status === 'retired' && p.retiredIn === season)
          facts.retirements.push({ group: POSITION_GROUP[p.position], age: exactAge(p.birthDate, awards), experience: p.experience }); // prettier-ignore
    }
    onSeason?.(s + 1);
  }
  return facts;
}

const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** The groups the aging curves are measured for; specialists age too slowly to find a peak in a decade. */
export const CURVE_GROUPS: readonly PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];

/** Youngest and oldest ages the curves read, and the fewest players an age needs to count. */
const CURVE_AGES: readonly [number, number] = [21, 37];
const CURVE_MIN = 20;

/**
 * The age a position group's players stop improving, by the delta method: the mean change in overall
 * from one season's week 1 to the next, by age at the first, for every player in both (so players who
 * leave rosters count while they're in the league), smoothed over three ages; the peak is where it turns
 * from rising to falling. A change is mostly the next camp's, about three quarters of a year on, so the
 * crossing is placed there. Null when the curve never turns.
 */
export function peakAge(samples: readonly AgingFacts[], group: PositionGroup): MetricValue {
  const sums = new Map<number, { total: number; n: number }>();
  for (const facts of samples)
    for (let i = 0; i + 1 < facts.snapshots.length; i++) {
      const later = new Map(facts.snapshots[i + 1]?.players.map(p => [p.id, p]) ?? []);
      for (const p of facts.snapshots[i]?.players ?? []) {
        const next = later.get(p.id);
        if (p.group !== group || !next) continue;
        const cell = sums.get(p.age) ?? { total: 0, n: 0 };
        cell.total += next.ovr - p.ovr;
        cell.n++;
        sums.set(p.age, cell);
      }
    }
  const n = [...sums.values()].reduce((a, c) => a + c.n, 0);
  const smoothed = new Map<number, number>();
  for (let age = CURVE_AGES[0]; age <= CURVE_AGES[1]; age++) {
    const cells = [age - 1, age, age + 1].map(a => sums.get(a)).filter((c): c is { total: number; n: number } => !!c); // prettier-ignore
    const count = cells.reduce((a, c) => a + c.n, 0);
    if ((sums.get(age)?.n ?? 0) >= CURVE_MIN)
      smoothed.set(age, cells.reduce((a, c) => a + c.total, 0) / count);
  }
  for (let age = CURVE_AGES[0]; age < CURVE_AGES[1]; age++) {
    const now = smoothed.get(age);
    const next = smoothed.get(age + 1);
    if (now === undefined || next === undefined || now <= 0 || next > 0) continue;
    return { value: age + 0.75 + now / (now - next), n };
  }
  return { value: null, n };
}

/** The aging metrics (spec 23.3) from chained leagues. */
export function computeAging(samples: readonly AgingFacts[]): Map<string, MetricValue> {
  const out = new Map<string, MetricValue>();
  const snapshots = samples.flatMap(s => s.snapshots);
  const rosters = snapshots.flatMap(s => s.players.filter(p => p.active));
  if (!rosters.length) return out;
  const teamSeasons = snapshots.reduce((a, s) => a + s.teams, 0);
  out.set('aging.meanAge', { value: mean(rosters.map(p => p.exactAge)), n: rosters.length });
  // Experience as the NFL's roster reports count it: accrued seasons and this one, so a rookie has one; its
  // rookies and first-year players are those with no accrued season (D-37).
  out.set('aging.meanExperience', { value: mean(rosters.map(p => p.accrued + 1)), n: rosters.length });
  out.set('aging.rookiesPerTeam', { value: rosters.filter(p => p.accrued === 0).length / teamSeasons, n: teamSeasons }); // prettier-ignore
  out.set('aging.over30PerTeam', { value: rosters.filter(p => p.age >= 30).length / teamSeasons, n: teamSeasons }); // prettier-ignore

  // Rating inflation: each chain's league-average overall on active rosters, its first season to its last.
  const average = (snap: ChainSnapshot | undefined, group?: PositionGroup): number | null =>
    mean(snap?.players.filter(p => p.active && (!group || p.group === group)).map(p => p.ovr) ?? []);
  const drift = (group?: PositionGroup): number | null =>
    mean(
      samples.flatMap(s => {
        const first = average(s.snapshots[0], group);
        const last = average(s.snapshots.at(-1), group);
        return s.snapshots.length > 1 && first !== null && last !== null ? [last - first] : [];
      })
    );
  const chains = samples.filter(s => s.snapshots.length > 1).length;
  out.set('aging.ovrDrift', { value: chains ? drift() : null, n: chains });
  const groups = CURVE_GROUPS.map(g => drift(g)).filter((d): d is number => d !== null);
  out.set('aging.groupDrift', { value: chains && groups.length ? Math.max(...groups.map(Math.abs)) : null, n: chains }); // prettier-ignore

  for (const group of CURVE_GROUPS) out.set(`aging.peakAge.${group}`, peakAge(samples, group));
  const retired = samples.flatMap(s => s.retirements);
  out.set('aging.retireAge', { value: mean(retired.map(r => r.age)), n: retired.length });
  out.set('aging.retireExperience', { value: mean(retired.map(r => r.experience)), n: retired.length });
  for (const [id, value] of draftHits(samples)) out.set(id, value);
  return out;
}

/** Seasons a pick is followed, from his first, and the seasons as a starter that make him a hit (D-50). */
const FOLLOWED = 8;
const HIT_SEASONS = 4;

/**
 * Draft hit rates by round (spec 23.3; D-50): of the picks in the drafts the chained leagues held with at
 * least FOLLOWED seasons left to play, specialists apart, the share who were base starters on week 1's depth
 * chart in HIT_SEASONS or more of their first FOLLOWED seasons. With them, the quarterbacks each of those
 * drafts took in its first round.
 */
export function draftHits(samples: readonly AgingFacts[]): Map<string, MetricValue> {
  const rounds = Array.from({ length: DEFAULT_RULES.season.draftRounds }, () => ({ picks: 0, hits: 0 }));
  let drafts = 0;
  let quarterbacks = 0;
  for (const facts of samples) {
    const first = facts.snapshots[0]?.season;
    const last = facts.snapshots.at(-1)?.season;
    if (first === undefined || last === undefined) continue;
    const picks = new Map<string, number>();
    const starts = new Map<string, number>();
    for (const snap of facts.snapshots)
      for (const p of snap.players) {
        if (!p.draft || p.group === 'ST' || p.draft.year <= first || p.draft.year + FOLLOWED - 1 > last)
          continue;
        picks.set(p.id, p.draft.round);
        if (p.starter && snap.season < p.draft.year + FOLLOWED) starts.set(p.id, (starts.get(p.id) ?? 0) + 1);
      }
    for (const [id, round] of picks) {
      const cell = rounds[round - 1];
      if (!cell) continue;
      cell.picks++;
      if ((starts.get(id) ?? 0) >= HIT_SEASONS) cell.hits++;
    }
    // Every draft the chain held, followed or not: its first-round quarterbacks.
    const firstRound = new Map<number, Set<string>>();
    for (let year = first + 1; year <= last; year++) firstRound.set(year, new Set());
    for (const snap of facts.snapshots)
      for (const p of snap.players)
        if (p.draft?.round === 1 && p.group === 'QB') firstRound.get(p.draft.year)?.add(p.id);
    for (const qbs of firstRound.values()) {
      drafts++;
      quarterbacks += qbs.size;
    }
  }
  const out = new Map<string, MetricValue>(
    rounds.map((c, i) => [`draft.starterRate.R${i + 1}`, { value: c.picks ? c.hits / c.picks : null, n: c.picks }]) // prettier-ignore
  );
  out.set('draft.qbsFirstRound', { value: drafts ? quarterbacks / drafts : null, n: drafts });
  return out;
}
