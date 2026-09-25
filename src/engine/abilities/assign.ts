/**
 * Abilities for generated players and coaches (spec 10.2, 13.1). Players get abilities by development
 * trait, chosen among the ones their position and ratings qualify for, favoring the ones they clear by
 * the most. Development earns and loses abilities later (spec 10.6, M10).
 */
import type { Player } from '../model/player';
import type { RatingKey, Ratings } from '../model/ratings';
import type { StaffMember } from '../model/staff';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { ABILITIES, type Ability } from './catalog';
import { COACH_ABILITIES } from './coaches';

/** How far a player's ratings clear an ability's requirements, or -1 if they don't. */
export function qualifies(ability: Ability, ratings: Ratings): number {
  let margin = 0;
  for (const [key, min] of Object.entries(ability.requires) as [RatingKey, number][]) {
    const over = ratings[key] - min;
    if (over < 0) return -1;
    margin += over;
  }
  return margin;
}

export function pickAbilities(
  rng: Rng,
  player: Pick<Player, 'position' | 'ratings' | 'dev' | 'ovr'>
): string[] {
  const A = TUNING.abilities;
  const count = player.dev === 'Star' && player.ovr < A.starMinOverall ? 0 : A.count[player.dev];
  if (count === 0) return [];
  const pool = ABILITIES.map(a => ({ a: a as Ability, margin: qualifies(a, player.ratings) })).filter(
    c => c.margin >= 0 && c.a.positions.includes(player.position)
  );
  const chosen: string[] = [];
  while (chosen.length < count && pool.length) {
    const i = rng.weightedIndex(pool.map(c => 1 + c.margin));
    chosen.push((pool[i] as { a: Ability }).a.id);
    pool.splice(i, 1);
  }
  return chosen;
}

export function pickCoachAbilities(rng: Rng, member: Pick<StaffMember, 'role' | 'overall'>): string[] {
  const A = TUNING.abilities;
  const count = member.overall >= A.coachTwoAt ? 2 : member.overall >= A.coachOneAt ? 1 : 0;
  const pool = COACH_ABILITIES.filter(a => a.roles.includes(member.role));
  const chosen: string[] = [];
  while (chosen.length < count && pool.length) {
    const i = Math.floor(rng.float() * pool.length);
    chosen.push((pool[i] as { id: string }).id);
    pool.splice(i, 1);
  }
  return chosen;
}
