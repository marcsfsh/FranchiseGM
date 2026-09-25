/**
 * Training (spec 10.5): a weekly focus for each unit, an individual focus for any player that overrides his
 * unit's, and an offseason training program. A focus puts more of the week's development into its
 * ratings and a little less into the rest; a program does the same at training camp. With auto on, the
 * coaching staff sets them: each unit works on its starters' weakest area, young players on their
 * position's weakest important rating, and the program follows the roster's age. AI teams always use auto.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { sideOf, type Position } from '../model/positions';
import type { RatingKey } from '../model/ratings';
import { HAND_SET_FORMULAS } from '../ratings/overall';
import { TUNING } from '../tuning';

export type Unit = 'offense' | 'defense' | 'special';
export const UNITS: readonly Unit[] = ['offense', 'defense', 'special'];
export const UNIT_LABELS: Record<Unit, string> = {
  offense: 'Offense',
  defense: 'Defense',
  special: 'Special teams'
};

export interface Focus {
  id: string;
  label: string;
  /** The units that can work on it; players of any unit can take it individually. */
  units: readonly Unit[];
  ratings: readonly RatingKey[];
}

/** The weekly focuses (spec 10.5 names footwork and ball security). */
export const FOCUSES: readonly Focus[] = [
  { id: 'balanced', label: 'Balanced', units: UNITS, ratings: [] },
  { id: 'footwork', label: 'Footwork', units: ['offense', 'defense'], ratings: ['agi', 'cod', 'acc', 'rls', 'pbf', 'rbf'] },
  { id: 'ballSecurity', label: 'Ball security', units: ['offense'], ratings: ['car', 'cth', 'cit', 'bcv'] },
  { id: 'routeRunning', label: 'Route running', units: ['offense'], ratings: ['srr', 'mrr', 'drr', 'rls'] },
  { id: 'accuracy', label: 'Throwing accuracy', units: ['offense'], ratings: ['sac', 'mac', 'dac', 'tor', 'tup', 'pac'] },
  { id: 'blocking', label: 'Blocking', units: ['offense'], ratings: ['rbk', 'rbp', 'rbf', 'pbk', 'pbp', 'pbf', 'ibl', 'lbk'] },
  { id: 'ballCarrying', label: 'Ball carrying', units: ['offense'], ratings: ['btk', 'trk', 'sfa', 'spm', 'jkm', 'bcv'] },
  { id: 'passRush', label: 'Pass rush', units: ['defense'], ratings: ['fmv', 'pmv', 'bsh', 'pow'] },
  { id: 'coverage', label: 'Coverage', units: ['defense'], ratings: ['mcv', 'zcv', 'prs', 'prc'] },
  { id: 'tackling', label: 'Tackling', units: ['defense', 'special'], ratings: ['tak', 'pur', 'pow'] },
  { id: 'runDefense', label: 'Run defense', units: ['defense'], ratings: ['bsh', 'tak', 'pur', 'prc'] },
  { id: 'filmStudy', label: 'Film study', units: ['offense', 'defense'], ratings: ['awr', 'prc'] },
  { id: 'kicking', label: 'Kicking', units: ['special'], ratings: ['kpw', 'kac'] },
  { id: 'returns', label: 'Returns', units: ['special'], ratings: ['ret', 'bcv', 'car'] },
  { id: 'snapping', label: 'Long snapping', units: ['special'], ratings: ['lsp'] }
]; // prettier-ignore

/** The offseason training programs. */
export const PROGRAMS: readonly Focus[] = [
  { id: 'balanced', label: 'Balanced', units: UNITS, ratings: [] },
  { id: 'strength', label: 'Strength and conditioning', units: UNITS, ratings: ['str', 'sta', 'tgh', 'pow', 'trk', 'rbp', 'pbp', 'thp'] },
  { id: 'speed', label: 'Speed and agility', units: UNITS, ratings: ['spd', 'acc', 'agi', 'cod', 'jmp'] },
  { id: 'technique', label: 'Technique', units: UNITS, ratings: ['srr', 'mrr', 'drr', 'rls', 'sac', 'mac', 'dac', 'rbf', 'pbf', 'fmv', 'pmv', 'mcv', 'zcv', 'prs', 'kac'] },
  { id: 'film', label: 'Film and playbook', units: UNITS, ratings: ['awr', 'prc', 'pac', 'bcv'] }
]; // prettier-ignore

const BY_ID = new Map(FOCUSES.map(f => [f.id, f]));
const PROGRAM_BY_ID = new Map(PROGRAMS.map(p => [p.id, p]));
export const focusOf = (id: string): Focus => BY_ID.get(id) ?? (FOCUSES[0] as Focus);
export const programOf = (id: string): Focus => PROGRAM_BY_ID.get(id) ?? (PROGRAMS[0] as Focus);

export interface TrainingPlan {
  /** The coaching staff sets the plan (AI teams always). */
  auto: boolean;
  /** Each unit's focus this week. */
  units: Record<Unit, string>;
  /** Players' own focuses, by player ID, in place of their unit's. */
  players: Record<string, string>;
  /** The offseason training program, for training camp. */
  program: string;
}

export const defaultTraining = (): TrainingPlan => ({
  auto: true,
  units: { offense: 'balanced', defense: 'balanced', special: 'balanced' },
  players: {},
  program: 'balanced'
});

export const unitOf = (position: Position): Unit => sideOf(position);

/** The focus a player works on this week: his own, or his unit's. */
export function playerFocus(plan: TrainingPlan, player: Player): Focus {
  return focusOf(plan.players[player.id] ?? plan.units[unitOf(player.position)]);
}

/** The ratings a position's overall weighs, heaviest first. */
export const keyRatings = (position: Position): RatingKey[] =>
  (Object.entries(HAND_SET_FORMULAS[position].coefficients) as [RatingKey, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

/** How far a player's ratings in a focus fall short of 99, weighted by what his overall weighs them. */
function need(player: Player, focus: Focus): number {
  const weights = HAND_SET_FORMULAS[player.position].coefficients;
  let total = 0;
  for (const key of focus.ratings) total += (weights[key] ?? 0) * (99 - player.ratings[key]);
  return total;
}

/**
 * The coaching staff's plan (spec 10.5): each unit takes the focus its starters need most (their overall's
 * weights on the ratings short of 99), players through age `individualAge` with room to grow take the focus
 * their own overall needs most, and the program follows the roster's average age.
 */
export function autoTraining(league: League, abbr: TeamAbbr): TrainingPlan {
  const T = TUNING.progression.training;
  const today = calendarDay(league.date);
  const roster = Object.values(league.players).filter(p => p.team === abbr && (p.status === 'active' || p.status === 'practice')); // prettier-ignore
  const plan = { ...league.teams[abbr].training, auto: true, players: {} as Record<string, string> };
  const byUnit = (unit: Unit) =>
    roster
      .filter(p => p.status === 'active' && unitOf(p.position) === unit)
      .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))
      .slice(0, T.unitStarters);
  const best = (players: readonly Player[], choices: readonly Focus[]): string =>
    choices
      .map(f => ({ f, need: players.reduce((sum, p) => sum + need(p, f), 0) }))
      .sort((a, b) => b.need - a.need)[0]?.f.id ?? 'balanced';
  const units = {} as Record<Unit, string>;
  for (const unit of UNITS) units[unit] = best(byUnit(unit), FOCUSES.filter(f => f.id !== 'balanced' && f.units.includes(unit)));
  for (const p of roster)
    if (ageOn(p.birthDate, today) <= T.individualAge && p.potential - p.ovr >= T.individualRoom)
      plan.players[p.id] = best([p], FOCUSES.filter(f => f.id !== 'balanced'));
  const ages = roster.filter(p => p.status === 'active').map(p => ageOn(p.birthDate, today));
  const age = ages.reduce((a, b) => a + b, 0) / Math.max(1, ages.length);
  const program = age <= T.youngTeam ? 'technique' : age >= T.oldTeam ? 'strength' : 'film';
  return { ...plan, units, program };
} // prettier-ignore
