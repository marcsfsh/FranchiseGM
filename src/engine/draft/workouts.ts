/**
 * The combine, pro days, and top-30 visits (spec 10.4; D-44). The combine invites the class's best
 * prospects by the consensus view and pro days take the next ones. Each works out (the 40-yard dash, the
 * bench press, the vertical and broad jumps, the 3-cone drill, and the shuttle), his results drawn from his
 * ratings with noise, and what the drills show narrows the consensus misjudgment of him, so an underrated
 * prospect rises and an overrated one falls. Specialists don't run the drills. Teams bring prospects in
 * for top-30 visits, which show them their personalities.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import type { Ratings } from '../model/ratings';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { perceivedValue, type DraftClass, type Measurables, type Prospect } from './class';
import { teamGrades } from './scouting';

const W = TUNING.draft.workout;
const SPECIALISTS = new Set(['K', 'P', 'LS']);

/** One drill's result: a + b x the rating it tests, with noise. */
const drill = (rng: Rng, [a, b, sd]: readonly number[], rating: number): number =>
  (a ?? 0) + (b ?? 0) * rating + rng.normal(0, sd ?? 0);

/** A prospect's workout results from his ratings (spec 10.4). */
export function measure(ratings: Ratings, rng: Rng): Measurables {
  const r = ratings;
  const hundredths = (x: number) => Math.round(x * 100) / 100;
  return {
    forty: hundredths(drill(rng, W.forty, 0.8 * r.spd + 0.2 * r.acc)),
    bench: Math.max(0, Math.round(drill(rng, W.bench, r.str))),
    vertical: Math.round(drill(rng, W.vertical, r.jmp) * 2) / 2,
    broad: Math.round(drill(rng, W.broad, r.jmp)),
    cone: hundredths(drill(rng, W.cone, (r.agi + r.cod) / 2)),
    shuttle: hundredths(drill(rng, W.shuttle, (r.cod + r.acc) / 2))
  };
}

export interface WorkoutNews {
  /** The prospects whose standing rose most, and fell most, best first. */
  risers: Prospect[];
  fallers: Prospect[];
}

/**
 * Runs the combine or the pro days: the prospects who work out there, in the consensus order, get their
 * results, and the consensus misjudgment of each narrows. Returns the biggest movers among them.
 */
export function workOut(draft: DraftClass, where: 'combine' | 'proDay', rng: Rng): WorkoutNews {
  const waiting = draft.prospects
    .filter(p => p.workout === null && !SPECIALISTS.has(p.player.position))
    .sort((a, b) => perceivedValue(b) - perceivedValue(a) || (a.player.id < b.player.id ? -1 : 1));
  const group = waiting.slice(0, where === 'combine' ? W.invites : W.proDays);
  const moves: { p: Prospect; move: number }[] = [];
  for (const p of group) {
    p.workout = where;
    p.measurables = measure(p.player.ratings, rng.fork(p.player.id));
    const before = p.perception;
    p.perception = Math.round(p.perception * (1 - W.reveal[where]) * 10) / 10 || 0;
    // The consensus's view rises as its overrating shrinks, and falls as an underrating does.
    moves.push({ p, move: before - p.perception });
  }
  const byMove = [...moves].sort((a, b) => a.move - b.move || (a.p.player.id < b.p.player.id ? -1 : 1));
  return {
    risers: byMove
      .filter(m => m.move < 0)
      .slice(0, W.headlines)
      .map(m => m.p),
    fallers: byMove
      .filter(m => m.move > 0)
      .reverse()
      .slice(0, W.headlines)
      .map(m => m.p)
  };
}

/** Why a team can't bring a prospect in for a top-30 visit now, or null. */
export function visitProblem(league: League, team: TeamAbbr, id: string): string | null {
  const draft = league.draft;
  if (!draft || !draft.prospects.some(p => p.player.id === id)) return "He isn't in this year's class.";
  if (!draft.prospects.some(p => p.workout)) return 'Visits open after the combine.';
  const visits = draft.scouting[team].visits;
  if (visits.includes(id)) return 'You already brought him in.';
  const most = league.rules.season.draftVisits;
  return visits.length >= most ? `You've made all ${most} of your visits.` : null;
}

/** Brings a prospect in for a top-30 visit, if the team can. Returns the reason it can't, or null. */
export function visit(league: League, team: TeamAbbr, id: string): string | null {
  const problem = visitProblem(league, team, id);
  if (!problem) league.draft?.scouting[team].visits.push(id);
  return problem;
}

/** A team's visits on its own: the prospects it grades highest that it hasn't brought in, up to its limit. */
export function autoVisits(league: League, draft: DraftClass, team: TeamAbbr): void {
  const grades = teamGrades(league, draft, team);
  const order = [...draft.prospects].sort((a, b) => (grades.get(b.player.id)?.value ?? 0) - (grades.get(a.player.id)?.value ?? 0) || (a.player.id < b.player.id ? -1 : 1)); // prettier-ignore
  for (const p of order) if (visit(league, team, p.player.id) && draft.scouting[team].visits.length >= league.rules.season.draftVisits) return; // prettier-ignore
}
