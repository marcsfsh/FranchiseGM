/**
 * Game sim and stat sliders (spec 22.3). Every slider is a multiplier around 1 (neutral); gameplay and
 * penalty sliders have separate values for the user's team and AI teams. The sim reads them at the step
 * each one names; the settings screen arrives in M9.
 */

export const GAMEPLAY_SLIDERS = [
  'qbAccuracy', 'passBlocking', 'wrCatching', 'runBlocking', 'fumbles', 'passDefenseReaction', 'interceptions',
  'passCoverage', 'tackling', 'fgPower', 'fgAccuracy', 'puntPower', 'puntAccuracy', 'kickoffPower'
] as const; // prettier-ignore

export const PENALTY_SLIDERS = [
  'offside', 'falseStart', 'offensiveHolding', 'defensiveHolding', 'facemask', 'defensivePassInterference',
  'offensivePassInterference', 'illegalBlockInBack', 'roughingThePasser', 'intentionalGrounding',
  'kickCatchInterference'
] as const; // prettier-ignore

export const OUTPUT_SLIDERS = [
  'passingVolume', 'passingEfficiency', 'rushingVolume', 'rushingEfficiency', 'turnovers', 'penalties', 'scoring'
] as const; // prettier-ignore

export type GameplaySlider = (typeof GAMEPLAY_SLIDERS)[number];
export type PenaltySlider = (typeof PENALTY_SLIDERS)[number];
export type OutputSlider = (typeof OUTPUT_SLIDERS)[number];

/** A slider with separate values for the user's team and AI teams. */
export interface SideSlider {
  user: number;
  ai: number;
}

export interface SimSliders {
  general: {
    upsets: number;
    homeField: number;
    injuryFrequency: number;
    injurySeverity: number;
    weatherImpact: number;
    fitEffect: number;
    cohesionEffect: number;
  };
  gameplay: Record<GameplaySlider, SideSlider>;
  penalties: Record<PenaltySlider, SideSlider>;
  output: Record<OutputSlider, number>;
}

/** Slider values are kept in this range. */
export const SLIDER_RANGE = { min: 0, max: 2 } as const;

const sides = <K extends string>(keys: readonly K[]): Record<K, SideSlider> =>
  Object.fromEntries(keys.map(k => [k, { user: 1, ai: 1 }])) as Record<K, SideSlider>;

export function defaultSliders(): SimSliders {
  return {
    general: {
      upsets: 1,
      homeField: 1,
      injuryFrequency: 1,
      injurySeverity: 1,
      weatherImpact: 1,
      fitEffect: 1,
      cohesionEffect: 1
    },
    gameplay: sides(GAMEPLAY_SLIDERS),
    penalties: sides(PENALTY_SLIDERS),
    output: Object.fromEntries(OUTPUT_SLIDERS.map(k => [k, 1])) as Record<OutputSlider, number>
  };
}
