/**
 * The auto depth chart (spec 12.2): the head coach picks a starter for every offensive and defensive slot,
 * the most-played slots first, weighing merit against his style. Each slot is one decision on the
 * framework (spec 14.1) with its own log entry. Special teams keep the best role ratings.
 *
 * The stream should stay the same all season: each slot draws from its own fork, so a coach who misjudges
 * two close players keeps misjudging them the same way until the options change, and lineups don't churn.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { capHit } from '../../contracts/cap';
import { recipeFor, roleRating } from '../../fit/role-rating';
import { startersOf } from '../../league/depth';
import { leagueFitContext } from '../../league/fit';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, fullName, type Player } from '../../model/player';
import type { Rng } from '../../rng';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  defenseSnapShares,
  offenseSnapShares,
  type Slot
} from '../../schemes/slots';
import { hurtEffects } from '../../season/injuries';
import { TUNING } from '../../tuning';
import { experience, incumbent, merit, salary, upside, type StarterOption } from '../considerations/lineup';
import { decide, type DecisionLog } from '../framework';
import { coachProfile, competence, staffIn, type CoachProfile } from '../profile';

const D = TUNING.ai.depth;

/** Consideration weights from a coach's profile: merit weighs 1, each style its share. */
export function depthWeights(profile: CoachProfile): Record<string, number> {
  return {
    merit: 1,
    experience: D.styleScale * profile.veteran,
    upside: D.styleScale * profile.developer,
    incumbent: D.continuity + D.styleScale * profile.loyalist,
    salary: D.styleScale * profile.contract
  };
}

export interface DepthChoice {
  starters: Partial<Record<Slot, string>>;
  logs: DecisionLog[];
}

/** The head coach's starters from the players available this week. */
export function decideDepthChart(
  league: League,
  abbr: TeamAbbr,
  roster: readonly Player[],
  rng: Rng
): DepthChoice {
  const team = league.teams[abbr];
  const ctx = leagueFitContext(league, abbr);
  const hc = staffIn(league, abbr, 'HC');
  const weights = depthWeights(coachProfile(hc));
  const skill = competence(hc);
  const today = calendarDay(league.date);
  const season = league.date.season;
  const hit = (p: Player): number => {
    const contract = p.contractId ? league.contracts[p.contractId] : undefined;
    return contract ? capHit(contract, season, league.rules) : 0;
  };
  const snaps: Partial<Record<Slot, number>> = {
    ...offenseSnapShares(ctx.offense.tendencies, team.rotation.rb1Share),
    ...defenseSnapShares(ctx.defense.tendencies)
  };
  const order = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS].sort((a, b) => (snaps[b] ?? 0) - (snaps[a] ?? 0));
  const previous = startersOf(team.depth.order);
  const used = new Set<string>();
  const starters: Partial<Record<Slot, string>> = {};
  const logs: DecisionLog[] = [];
  for (const slot of order) {
    const slotRng = rng.fork(slot);
    const eligible = recipeFor(ctx, slot).eligible;
    const options: StarterOption[] = roster
      .filter(p => !used.has(p.id) && eligible.includes(p.position))
      .map(p => ({
        id: p.id,
        name: fullName(p),
        rating: roleRating(p, slot, ctx).rating - hurtEffects(p.injury).penalty,
        experience: p.experience,
        age: ageOn(p.birthDate, today),
        upside: p.potential - p.ovr,
        capHit: hit(p)
      }));
    if (!options.length) continue;
    const best = Math.max(...options.map(o => o.rating));
    const maxHit = Math.max(...options.map(o => o.capHit));
    const decision = decide(
      `Depth chart: ${slot}`,
      `${abbr} head coach`,
      options,
      [merit(best), experience(), upside(), incumbent(previous[slot]), salary(maxHit)],
      weights,
      skill,
      slotRng,
      o => o.name
    );
    if (!decision) continue;
    starters[slot] = decision.chosen.id;
    used.add(decision.chosen.id);
    logs.push(decision.log);
  }
  // A slot the choices left empty, when nobody left can play it, takes a starter who can move over, his
  // own slot filled by the best player left who can play that one.
  for (const slot of order) {
    if (starters[slot]) continue;
    const eligible = recipeFor(ctx, slot).eligible;
    for (const [other, id] of Object.entries(starters) as [Slot, string][]) {
      const mover = roster.find(p => p.id === id);
      if (!mover || !eligible.includes(mover.position)) continue;
      const fits = recipeFor(ctx, other).eligible;
      const [bench] = roster
        .filter(p => !used.has(p.id) && fits.includes(p.position))
        .sort(
          (a, b) =>
            roleRating(b, other, ctx).rating - roleRating(a, other, ctx).rating || (a.id < b.id ? -1 : 1)
        );
      if (!bench) continue;
      starters[slot] = mover.id;
      starters[other] = bench.id;
      used.add(bench.id);
      break;
    }
  }
  return { starters, logs };
}
