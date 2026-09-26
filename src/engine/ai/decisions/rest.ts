/**
 * Questionable players (spec 10.8 playing hurt): the head coach plays each one hurt or rests him for the
 * week, weighing how much the lineup needs him against the chance of making it worse and the game's
 * stakes. His risk tolerance sets how much the risk weighs, and nobody rests when his group would be left
 * short of a lineup's worth.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { chosenLineup, type LineupPlayer } from '../../fit/cohesion';
import { recipeFor, roleRating } from '../../fit/role-rating';
import { startersOf } from '../../league/depth';
import { leagueFitContext } from '../../league/fit';
import type { League } from '../../league/types';
import { fullName, type Player } from '../../model/player';
import type { Rng } from '../../rng';
import { designation, hurtEffects } from '../../season/injuries';
import { TUNING } from '../../tuning';
import { needed, reinjury, stakes, type RestOption } from '../considerations/lineup';
import { decide, type DecisionLog } from '../framework';
import { competence, staffIn } from '../profile';
import { NEED_GROUP } from './roster-moves';

const R = TUNING.ai.rest;

/** How many points better he is than the man who plays if he rests, at the slot he'd start. */
function edgeOverBackup(league: League, abbr: TeamAbbr, roster: readonly Player[], player: Player): number {
  const ctx = leagueFitContext(league, abbr);
  const ids = new Set(roster.map(p => p.id));
  const starters = startersOf(league.teams[abbr].depth.order, id => ids.has(id));
  const lineup = chosenLineup(roster as readonly LineupPlayer[], ctx, starters);
  const slot = [...lineup].find(([, e]) => e.player.id === player.id)?.[0];
  if (!slot) return R.benchEdge;
  const starting = new Set([...lineup.values()].map(e => e.player.id));
  const eligible = recipeFor(ctx, slot).eligible;
  const rate = (p: Player) => roleRating(p, slot, ctx).rating - hurtEffects(p.injury).penalty;
  const behind = roster
    .filter(p => p.id !== player.id && !starting.has(p.id) && eligible.includes(p.position))
    .map(rate);
  // Nobody behind him at the slot: the lineup needs him as much as it can.
  return behind.length ? rate(player) - Math.max(...behind) : R.edgeSpan[1];
}

export interface RestChoice {
  resting: string[];
  logs: DecisionLog[];
}

/** Rest or play for each questionable player on a roster of the players who can dress this week. */
export function decideRest(
  league: League,
  abbr: TeamAbbr,
  roster: readonly Player[],
  playoff: boolean,
  rng: Rng
): RestChoice {
  const hc = staffIn(league, abbr, 'HC');
  const tolerance = hc?.personality.riskTolerance ?? 50;
  const weights = { needed: 1, reinjury: R.riskWeight * (1 - tolerance / 100), stakes: R.stakesWeight };
  const resting: string[] = [];
  const logs: DecisionLog[] = [];
  for (const player of roster) {
    if (designation(player.injury) !== 'questionable') continue;
    const base = {
      edge: edgeOverBackup(league, abbr, roster, player),
      risk: hurtEffects(player.injury).risk,
      stakes: playoff ? 1 : R.regularStakes
    };
    const options: RestOption[] = [
      { play: true, ...base },
      { play: false, ...base }
    ];
    const decision = decide(
      `Questionable: ${fullName(player)}`,
      `${abbr} head coach`,
      options,
      [needed(), reinjury(), stakes()],
      weights,
      competence(hc),
      rng,
      o => (o.play ? 'Play him' : 'Rest him')
    );
    if (!decision) continue;
    // Resting him can't leave his group short of a lineup's worth: with both quarterbacks questionable,
    // one of them plays (D-46).
    const group = NEED_GROUP[player.position];
    const others = roster.filter(p => p.id !== player.id && !resting.includes(p.id) && NEED_GROUP[p.position] === group).length; // prettier-ignore
    if (!decision.chosen.play && others >= (TUNING.ai.signing.minHealthy[group] ?? 0))
      resting.push(player.id);
    logs.push(decision.log);
  }
  return { resting, logs };
}
