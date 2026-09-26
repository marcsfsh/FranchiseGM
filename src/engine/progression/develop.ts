/**
 * Progression and regression (spec 10.5). A player's ratings move each regular-season week (a small share of
 * a year's change) and at training camp (the rest). Each rating follows its class's age curve, counted from
 * his position group's peak age: growth that fades and decline that builds. Growth is scaled by the room
 * left to his potential, his development trait, playing time, training focus, his position coach and
 * coordinator (and their development abilities at camp), scheme fit (at camp), injuries, and work ethic;
 * decline by the development trait, work ethic, and the training program. The settings' tables and speeds
 * scale both. A young player also grows faster with a mentor at his position group (spec 10.9); facilities
 * join in M16. Every change goes through changeRatings with its largest drivers, in overall points. At a
 * young player's first camps, his hidden potential drifts (spec 10.3's development variance), so some
 * rookies outgrow their grades and others stall.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { coachAbility } from '../abilities/coaches';
import { rolesFor } from '../fit/role-rating';
import { leagueFitContext } from '../league/fit';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { POSITION_GROUP, sideOf } from '../model/positions';
import { RATING_KEYS, type RatingKey } from '../model/ratings';
import type { StaffRole } from '../model/staff';
import { HAND_SET_FORMULAS } from '../ratings/overall';
import type { Rng } from '../rng';
import { FIT_SLOTS } from '../schemes/slots';
import { TUNING } from '../tuning';
import { changeRatings, type RatingCause, type RatingChange, type RatingDriver } from './change';
import { declineMultiplier, growthMultiplier } from './settings';
import { autoTraining, playerFocus, programOf, type Focus } from './training';

const P = TUNING.progression;
type CurveClass = keyof typeof P.curves;

const CLASS_OF = new Map<RatingKey, CurveClass>();
for (const [cls, keys] of Object.entries(P.classes) as [CurveClass, readonly RatingKey[]][])
  for (const key of keys) CLASS_OF.set(key, cls);
const classOf = (key: RatingKey): CurveClass => CLASS_OF.get(key) ?? 'skill';

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

/** A class's growth and decline in rating points a year, `years` from the player's peak age. */
export function ageCurve(cls: CurveClass, years: number): { growth: number; decline: number } {
  const c = P.curves[cls];
  return {
    growth: c.growth * logistic(-(years - c.growthEnd) / P.curveWidth),
    decline: c.decline * logistic((years - c.declineStart) / P.curveWidth)
  };
}

/** The ratings a player develops: what his overall weighs, plus the athletic and mental ones everyone has. */
const DEVELOPED: ReadonlySet<RatingKey> = new Set(['spd', 'acc', 'agi', 'cod', 'str', 'sta', 'awr', 'prc']);
function developed(player: Player): RatingKey[] {
  const weights = HAND_SET_FORMULAS[player.position].coefficients;
  return RATING_KEYS.filter(k => DEVELOPED.has(k) || (weights[k] ?? 0) > 0);
}

/** The coaches whose development rating counts: the position coach and his side's coordinator. */
const POSITION_COACH: Record<string, StaffRole> = {
  QB: 'QBC', RB: 'RBC', WR: 'WRC', TE: 'TEC', OL: 'OLC', DL: 'DLC', LB: 'LBC', DB: 'DBC', ST: 'STC'
}; // prettier-ignore
const COORDINATOR: Record<string, StaffRole> = { offense: 'OC', defense: 'DC', special: 'STC' };

function coaches(league: League, abbr: TeamAbbr, player: Player) {
  const roles = [POSITION_COACH[POSITION_GROUP[player.position]], COORDINATOR[sideOf(player.position)]];
  return roles.flatMap(role =>
    (league.teams[abbr].staff[role as StaffRole] ?? []).flatMap(id => (league.staff[id] ? [league.staff[id]] : []))
  ); // prettier-ignore
}

/** What a development step needs to know beyond the player. */
export interface StepContext {
  kind: Extract<RatingCause, 'weekly' | 'camp'>;
  /** Share of a year's change this step makes. */
  share: number;
  /** Share of a full game's snaps (weekly) or of a season's (camp); null for no playing time to judge. */
  snaps: number | null;
  /** Each team's best mentor's leadership by position group (spec 10.9), from `mentorsOf`. */
  mentors?: ReadonlyMap<string, number>;
}

const mentorKey = (team: TeamAbbr, group: string): string => `${team}|${group}`;

/**
 * Each team's best mentor by position group: the highest leadership over 50 among its veterans with
 * `mentorSeasons` credited seasons, on the roster, the practice squad, or a reserve list.
 */
export function mentorsOf(league: League): Map<string, number> {
  const best = new Map<string, number>();
  for (const p of Object.values(league.players)) {
    if (!p.team || !DEVELOPING.has(p.status) || p.experience < P.mentorSeasons) continue;
    const key = mentorKey(p.team, POSITION_GROUP[p.position]);
    if (p.personality.leadership > Math.max(50, best.get(key) ?? 0)) best.set(key, p.personality.leadership);
  }
  return best;
}

/**
 * One development step for a player: every developed rating moves by its class's age curve, scaled by the
 * drivers, with noise, rounded to whole points at random so small steps add up. Returns the change, or null.
 */
export function developPlayer(
  league: League,
  player: Player,
  step: StepContext,
  rng: Rng
): RatingChange | null {
  const today = calendarDay(league.date);
  const age = ageOn(player.birthDate, today);
  const group = POSITION_GROUP[player.position];
  const years = age - P.peakAge[group];
  const s = league.settings.development;
  const team = player.team;
  const plan = team ? league.teams[team].training : null;
  const weights = HAND_SET_FORMULAS[player.position].coefficients;
  const weightSum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;

  // Development variance (spec 10.3): at his first camps after the draft, a young player's ceiling drifts,
  // by his position group's setting. Camp comes before the season named for the year after the draft's.
  const drift = P.potentialDrift;
  const camp = league.date.season + 1 - player.draft.year;
  if (step.kind === 'camp' && camp >= 0 && camp < drift.camps) {
    const sd = (drift.sd * league.settings.draft.development[group]) / Math.sqrt(drift.camps);
    player.potential = Math.max(player.ovr, Math.min(99, Math.round(player.potential + rng.normal(0, sd))));
  }

  // Growth and decline factors, each a named driver.
  const grow: [string, number][] = [];
  const shrink: [string, number][] = [];
  const room = player.potential - player.ovr;
  grow.push([
    'potential',
    Math.min(P.potentialBounds[1], Math.max(P.potentialBounds[0], room / P.potentialRoom))
  ]);
  grow.push(['dev', P.devGrowth[player.dev]]);
  shrink.push(['dev', P.devDecline[player.dev]]);
  if (step.snaps !== null) grow.push(['snaps', P.snapBase + P.snapSpan * Math.min(1, step.snaps)]);
  const ethic = (player.personality.workEthic - 50) / 50;
  grow.push(['workEthic', 1 + P.workEthic * ethic]);
  shrink.push(['workEthic', 1 - P.workEthicDecline * ethic]);
  const out = player.injury?.weeksOut ?? 0;
  if (out) grow.push(['injury', 1 - P.injury * Math.min(1, out / P.injuryWeeks)]);
  if (!team) grow.push(['unsigned', P.unsignedGrowth]);
  const mentor =
    team && player.experience <= P.mentorYoung ? step.mentors?.get(mentorKey(team, group)) : undefined;
  if (mentor) grow.push(['mentor', 1 + (P.mentor * (mentor - 50)) / 50]);
  let bonus = 0;
  if (team) {
    const staff = coaches(league, team, player);
    const rating = staff.length ? staff.reduce((sum, m) => sum + (m.ratings.development ?? 50), 0) / staff.length : 50;
    grow.push(['coaching', 1 + (P.coaching * (rating - 50)) / 50]);
    if (step.kind === 'camp') {
      // Development abilities add points to the position's overall each offseason.
      for (const m of staff)
        for (const id of m.abilities ?? []) {
          const ability = coachAbility(id);
          if (ability?.development?.positions.includes(player.position)) bonus += ability.development.points;
        }
      const role = rolesFor(player, leagueFitContext(league, team), FIT_SLOTS)[0];
      if (role) grow.push(['fit', 1 + (P.fit * Math.max(-1, Math.min(1, role.fit / Math.max(1, league.settings.fitCap))))]);
    }
  } // prettier-ignore

  const focus: Focus | null = plan
    ? step.kind === 'camp'
      ? programOf(plan.program)
      : playerFocus(plan, player)
    : null;
  const focused = new Set(focus?.ratings ?? []);
  const T = P.training;
  const gMul = growthMultiplier(s, age, group);
  const dMul = declineMultiplier(s, age, group);
  const deltas: Partial<Record<RatingKey, number>> = {};
  const drivers = new Map<string, number>();
  const credit = (id: string, key: RatingKey, amount: number) =>
    drivers.set(id, (drivers.get(id) ?? 0) + (amount * (weights[key] ?? 0)) / weightSum);

  for (const key of developed(player)) {
    const curve = ageCurve(classOf(key), years);
    const baseGrowth = curve.growth * gMul * step.share;
    const baseDecline = curve.decline * dMul * step.share;
    const factors = [...grow];
    const cuts = [...shrink];
    if (focus && focus.ratings.length) {
      if (step.kind === 'camp') {
        factors.push(['training', focused.has(key) ? 1 + T.programBonus : 1 - T.programCost]);
        if (focused.has(key)) cuts.push(['training', 1 - T.programDecline]);
      } else factors.push(['training', focused.has(key) ? 1 + T.focusBonus : 1 - T.focusCost]);
    }
    const growth = factors.reduce((v, [, f]) => v * f, baseGrowth);
    const decline = cuts.reduce((v, [, f]) => v * f, baseDecline);
    credit('age', key, baseGrowth - baseDecline);
    // Each factor's share of the difference it made, by the log of its size.
    const attribute = (list: [string, number][], base: number, total: number, sign: number) => {
      const logs = list.map(([id, f]) => [id, Math.log(Math.max(1e-6, f))] as const);
      const sum = logs.reduce((a, [, l]) => a + l, 0);
      if (Math.abs(sum) < 1e-9) return;
      for (const [id, l] of logs) credit(id, key, (sign * (total - base) * l) / sum);
    };
    attribute(factors, baseGrowth, growth, 1);
    attribute(cuts, baseDecline, decline, -1);
    const coach = step.kind === 'camp' && (weights[key] ?? 0) > 0 ? bonus : 0;
    if (coach) credit('coaching', key, coach);
    const raw = growth - decline + coach + rng.normal(0, P.noise * Math.sqrt(step.share));
    // Whole points, rounded up or down at random in proportion, so small steps add up over a season.
    const whole = Math.floor(raw) + (rng.float() < raw - Math.floor(raw) ? 1 : 0);
    if (whole) deltas[key] = whole;
  } // prettier-ignore

  const change = changeRatings(player, deltas, step.kind, league.date, [...drivers].map(([id, amount]) => ({ id, amount }) satisfies RatingDriver)); // prettier-ignore
  if (player.ovr > player.potential) player.potential = player.ovr;
  return change;
}

/**
 * A player's expected overall change over a year at `age` from `ovr` (D-38): each rating his overall weighs
 * follows its class's age curve, growth scaled by his room to potential, his development trait, and his
 * work ethic, decline by his trait and work ethic, with the development settings; playing time, coaching,
 * and chance aren't known ahead.
 */
export function expectedChange(league: League, player: Player, age: number, ovr: number): number {
  const group = POSITION_GROUP[player.position];
  const s = league.settings.development;
  const room = Math.min(P.potentialBounds[1], Math.max(P.potentialBounds[0], (player.potential - ovr) / P.potentialRoom));
  const ethic = (player.personality.workEthic - 50) / 50;
  const grow = room * P.devGrowth[player.dev] * (1 + P.workEthic * ethic) * growthMultiplier(s, age, group);
  const shrink = P.devDecline[player.dev] * (1 - P.workEthicDecline * ethic) * declineMultiplier(s, age, group);
  let change = 0;
  for (const [key, weight] of Object.entries(HAND_SET_FORMULAS[player.position].coefficients)) {
    const curve = ageCurve(classOf(key as RatingKey), age - P.peakAge[group]);
    change += (weight ?? 0) * (curve.growth * grow - curve.decline * shrink);
  }
  return change;
} // prettier-ignore

/**
 * His projected overall in each of the next `seasons` seasons (D-38), from his age now: each season's
 * after the year of development that comes before it.
 */
export function projectedOverall(league: League, player: Player, seasons: number): number[] {
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const out: number[] = [];
  let ovr = player.ovr;
  for (let i = 0; i < seasons; i++) {
    ovr = Math.max(0, Math.min(99, ovr + expectedChange(league, player, age + i, ovr)));
    out.push(Math.round(ovr));
  }
  return out;
}

/** The players a team develops: its roster, practice squad, and injured reserve. */
const DEVELOPING = new Set<Player['status']>(['active', 'practice', 'ir', 'pup', 'nfi']);

/** Sets the plan for every team the coaching staff runs: AI teams, and the user's with auto on. */
export function coachTraining(league: League): void {
  for (const abbr of TEAM_ABBRS)
    if (abbr !== league.meta.start.userTeam || league.teams[abbr].training.auto)
      league.teams[abbr].training = autoTraining(league, abbr);
}

/**
 * A regular-season week's development (spec 10.5): every rostered player moves a week's share of a year,
 * his playing time from this week's snaps.
 */
export function weeklyDevelopment(league: League, snaps: Readonly<Record<string, number>>, rng: Rng): RatingChange[] {
  const share = (1 - P.campShare) / league.rules.season.weeks;
  const mentors = mentorsOf(league);
  const changes: RatingChange[] = [];
  for (const p of Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!p.team || !DEVELOPING.has(p.status)) continue;
    const change = developPlayer(league, p, { kind: 'weekly', share, snaps: (snaps[p.id] ?? 0) / P.fullGameSnaps, mentors }, rng);
    if (change) changes.push(change);
  }
  return changes;
} // prettier-ignore

/**
 * Training camp (spec 10.5): the larger offseason step for every player on a team, his playing time from
 * last season's snaps; free agents move too, growing half as fast on their own.
 */
export function campDevelopment(league: League, rng: Rng): RatingChange[] {
  const games = league.rules.season.games;
  const mentors = mentorsOf(league);
  const changes: RatingChange[] = [];
  for (const p of Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!(p.team && DEVELOPING.has(p.status)) && p.status !== 'freeAgent') continue;
    // Rookies have no season to judge, so playing time doesn't count for them.
    const snaps = p.experience === 0 ? null : (league.season.snaps[p.id] ?? 0) / (P.fullGameSnaps * games);
    const change = developPlayer(league, p, { kind: 'camp', share: P.campShare, snaps, mentors }, rng);
    if (change) changes.push(change);
  }
  return changes;
} // prettier-ignore
