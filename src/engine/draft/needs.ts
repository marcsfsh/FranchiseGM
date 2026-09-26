/**
 * The AI's simple need-and-value model for the draft (spec 10.4; D-45), until M14's AI brain: a prospect's
 * worth to a team is its grade on him plus a bonus for how much the team needs his position, which grows as
 * its starters there fall short of a good starter and when it has fewer players there than a standard
 * roster carries. The mock drafts and the draft itself pick by it.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { ACTIVE_ROSTER, STARTERS } from '../generate/league';
import type { League } from '../league/types';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import { TUNING } from '../tuning';
import type { DraftClass, Prospect } from './class';
import { teamGrades } from './scouting';

const N = TUNING.draft.needs;
const ROSTER_COUNT = new Map<Position, number>(ACTIVE_ROSTER.map(([p, n]) => [p, n]));
const ON_ROSTER = new Set<Player['status']>([
  'active',
  'practice',
  'ir',
  'pup',
  'nfi',
  'suspended',
  'holdout'
]);

/** How much a team needs a position, from 0 to 1, from its players' overalls there, best first. */
function needFrom(position: Position, overalls: readonly number[]): number {
  const starters = STARTERS[position];
  const best = overalls.slice(0, starters);
  while (best.length < starters) best.push(N.missingStarter);
  const quality = best.reduce((a, b) => a + b, 0) / starters;
  const gap = Math.max(0, Math.min(1, (N.goodStarter - quality) / N.span));
  const short = overalls.length < (ROSTER_COUNT.get(position) ?? 0) ? N.shortBonus : 0;
  return Math.min(1, gap + short);
}

/** Every position's need for a team. */
export function needs(league: League, team: TeamAbbr): Map<Position, number> {
  const overalls = new Map<Position, number[]>();
  for (const p of Object.values(league.players))
    if (p.team === team && ON_ROSTER.has(p.status)) overalls.set(p.position, [...(overalls.get(p.position) ?? []), p.ovr]); // prettier-ignore
  return new Map(
    [...ROSTER_COUNT.keys()].map(p => [
      p,
      needFrom(
        p,
        (overalls.get(p) ?? []).sort((a, b) => b - a)
      )
    ])
  );
}

/** How much a team needs a position, from 0 to 1. */
export const need = (league: League, team: TeamAbbr, position: Position): number =>
  needs(league, team).get(position) ?? 0;

/** A prospect's worth to a team: its grade on him and its need at his position. */
export const draftWorth = (grade: number, needAt: number): number => grade + N.weight * needAt;

/** The prospect a team takes: the one worth most to it by its own grades and needs, of those not `taken`. */
export function aiChoice(
  league: League,
  draft: DraftClass,
  team: TeamAbbr,
  taken: ReadonlySet<string> = new Set()
): Prospect | null {
  const grades = teamGrades(league, draft, team);
  const needAt = needs(league, team);
  let best: Prospect | null = null;
  let bestWorth = -Infinity;
  for (const p of draft.prospects) {
    if (taken.has(p.player.id)) continue;
    const worth = draftWorth(grades.get(p.player.id)?.value ?? 0, needAt.get(p.player.position) ?? 0);
    if (worth > bestWorth) [best, bestWorth] = [p, worth];
  }
  return best;
}
