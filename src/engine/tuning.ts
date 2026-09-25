/**
 * Tunable numbers for the simulation, AI, economy, and player development.
 *
 * Every constant cites the spec section it tunes. League rules (roster sizes, cap figures, penalty
 * yardage) live in the rule set (spec 16), not here. Calibration runs (spec 23) change these values,
 * and each change is logged in docs/CALIBRATION.md.
 */
export const TUNING = {
  /** Player generation (spec 10.2). */
  generation: {
    /** Awareness and play recognition gained per year of age from 25 (capped at -5 and +6). */
    awarenessPerYear: 1.2,
    /** Speed, acceleration, agility, change of direction, and jumping lost per year past 29. */
    athleticDeclinePerYear: 1.5,
    /** Lowest rating the generator produces. */
    ratingFloor: 12,
    /** Overall points a young player is expected to gain per year until his peak age (potential). */
    growthPerYearMin: 0.8,
    growthPerYearMax: 2.6,
    /** How strongly quality tilts players toward power-conference programs (spec 10.1). */
    collegeTilt: 0.25,
    /** Share of international-hometown players who came through the International Player Pathway. */
    internationalPathwayShare: 0.25,
    /** Draft score below which a generated veteran is listed as undrafted. */
    undraftedBelow: -0.9
  }
} as const;

export type Tuning = typeof TUNING;
