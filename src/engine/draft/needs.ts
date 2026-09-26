/**
 * The AI's simple need-and-value model for the draft (spec 10.4; D-45), until M14's AI brain: a prospect's
 * worth to a team is its grade on him plus a bonus for how much the team needs his position, which grows as
 * its starters there fall short of a good starter and when it has fewer players there than a standard
 * roster carries.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { ACTIVE_ROSTER, STARTERS } from '../generate/league';
import type { League } from '../league/types';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import { TUNING } from '../tuning';

const N = TUNING.draft.needs;
const ROSTER_COUNT = new Map<Position, number>(ACTIVE_ROSTER.map(([p, n]) => [p, n]));
const ON_ROSTER = new Set<Player['status']>(['active', 'practice', 'ir', 'pup', 'nfi', 'suspended']);

/** How much a team needs a position, from 0 to 1. */
export function need(league: League, team: TeamAbbr, position: Position): number {
  const players = Object.values(league.players)
    .filter(p => p.team === team && p.position === position && ON_ROSTER.has(p.status))
    .sort((a, b) => b.ovr - a.ovr);
  const starters = STARTERS[position];
  const best = players.slice(0, starters).map(p => p.ovr);
  while (best.length < starters) best.push(N.missingStarter);
  const quality = best.reduce((a, b) => a + b, 0) / starters;
  const gap = Math.max(0, Math.min(1, (N.goodStarter - quality) / N.span));
  const short = players.length < (ROSTER_COUNT.get(position) ?? 0) ? N.shortBonus : 0;
  return Math.min(1, gap + short);
}

/** Every position's need for a team. */
export function needs(league: League, team: TeamAbbr): Map<Position, number> {
  return new Map([...ROSTER_COUNT.keys()].map(p => [p, need(league, team, p)]));
}

/** A prospect's worth to a team: its grade on him and its need at his position. */
export const draftWorth = (grade: number, needAt: number): number => grade + N.weight * needAt;
