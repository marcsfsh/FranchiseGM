import { REFERENCES } from '../../src/engine/fit/reference';
import type { FitContext, FitPlayer } from '../../src/engine/fit/role-rating';
import type { Position } from '../../src/engine/model/positions';
import type { RatingKey, Ratings } from '../../src/engine/model/ratings';
import { DEFAULT_TRAITS, type Traits } from '../../src/engine/model/traits';
import { overall } from '../../src/engine/ratings/overall';
import type { DefenseSchemeId, OffenseSchemeId } from '../../src/engine/schemes/ids';
import { named, resolveDefense, resolveOffense } from '../../src/engine/schemes/resolve';

/** A player with his position's typical ratings, changed by `adjust`. */
export function typicalPlayer(
  position: Position,
  adjust: Partial<Record<RatingKey, number>> = {},
  traits: Partial<Traits> = {},
  abilities: string[] = []
): FitPlayer & { id: string } {
  const ratings = {} as Ratings;
  for (const [key, value] of Object.entries(REFERENCES[position].typical) as [RatingKey, number][])
    ratings[key] = Math.max(0, Math.min(99, Math.round(value) + (adjust[key] ?? 0)));
  return {
    id: `${position}-${JSON.stringify(adjust)}-${abilities.join(',')}`,
    position,
    ratings,
    traits: { ...DEFAULT_TRAITS, ...traits },
    abilities,
    ovr: overall(position, ratings)
  };
}

export function fitContext(
  offense: OffenseSchemeId = 'westCoast',
  defense: DefenseSchemeId = 'fourThreeOver',
  cap = 8
): FitContext {
  return { offense: resolveOffense(named(offense)), defense: resolveDefense(named(defense)), cap };
}
