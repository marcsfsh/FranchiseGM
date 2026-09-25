/**
 * The typical player at each position: the archetype templates' average ratings at the reference age,
 * the same point the overall formulas' intercepts and scales were set from (spec 7.1). Role ratings are
 * measured from here, so a typical player rates his own overall in every role of his position and fit
 * shows how a player's strengths line up with what the role asks for (spec 7.3).
 */
import { TEMPLATES } from '../generate/archetypes';
import { POSITIONS, type Position } from '../model/positions';
import { RATING_KEYS, type Ratings } from '../model/ratings';
import { HAND_SET_FORMULAS, formulaValue, type OverallFormula } from '../ratings/overall';
import { TUNING } from '../tuning';

export interface PositionReference {
  /** Average ratings of a typical player at the position (unrounded). */
  typical: Ratings;
  /** The overall formula's value for the typical player (unrounded). */
  typicalOvr: number;
  /** How much the overall formula stretches a one-point change in its weighted average. */
  scale: number;
  formula: OverallFormula;
}

function typicalRatings(position: Position): Ratings {
  const template = TEMPLATES[position];
  const G = TUNING.generation;
  const age = TUNING.fit.referenceAge;
  const totalWeight = template.archetypes.reduce((sum, a) => sum + a.weight, 0);
  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    const adjust = totalWeight
      ? template.archetypes.reduce((sum, a) => sum + a.weight * (a.adjust[key] ?? 0), 0) / totalWeight
      : 0;
    let value = template.ratings[key][0] + adjust;
    if (key === 'awr' || key === 'prc')
      value += Math.max(
        G.awarenessRange[0],
        Math.min(G.awarenessRange[1], (age - G.awarenessPivotAge) * G.awarenessPerYear)
      );
    ratings[key] = value;
  }
  return ratings;
}

function build(position: Position): PositionReference {
  const formula = HAND_SET_FORMULAS[position];
  const typical = typicalRatings(position);
  return {
    typical,
    typicalOvr: formulaValue(formula, typical),
    scale: Object.values(formula.coefficients).reduce((sum, c) => sum + (c ?? 0), 0),
    formula
  };
}

export const REFERENCES: Record<Position, PositionReference> = Object.fromEntries(
  POSITIONS.map(p => [p, build(p)])
) as Record<Position, PositionReference>;
