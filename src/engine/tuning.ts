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
  },

  /** Veteran salary market (spec 11.6, 11.7): average annual value by position, overall, and age. */
  market: {
    /** Top of each position's market as a share of the cap (2026: QB $60M of $301.2M). */
    topShare: {
      QB: 0.2,
      HB: 0.06,
      FB: 0.013,
      WR: 0.13,
      TE: 0.06,
      LT: 0.097,
      RT: 0.08,
      LG: 0.073,
      RG: 0.073,
      C: 0.06,
      LE: 0.14,
      RE: 0.14,
      DT: 0.113,
      LOLB: 0.13,
      ROLB: 0.13,
      MLB: 0.063,
      CB: 0.1,
      FS: 0.066,
      SS: 0.066,
      K: 0.02,
      P: 0.015,
      LS: 0.0053
    },
    /** Overall where a player earns half the top of the market, and how quickly pay rises around it. */
    midOverall: 83,
    midOverallQb: 80,
    width: 4,
    /** Pay falls by this share for each year past the position's prime. */
    ageDiscountPerYear: 0.08,
    /** Spread of individual deals around the market value (log scale). */
    noise: 0.15,
    /** No deal exceeds the top of its position's market by more than this share. */
    topOverage: 0.08
  },

  /** The fictional league (spec 10.2 item 4): roster quality by slot, ages, and cap use. */
  league: {
    /** Latent quality of starters, their spread, and the spread of team strength. */
    starterQuality: 0.9,
    specialistQuality: 0.5,
    starterSpread: 0.75,
    /** Some starters are stars: this share of them gets a quality bonus in this range (a longer top tail). */
    starShare: 0.1,
    /** Starting quarterbacks are the most concentrated talent in the league. */
    qbStarterBonus: 0.4,
    starBonus: [0.8, 1.7],
    teamSpread: 0.3,
    /** Quality [mean, sd] for the first, second, and deeper backups at a position. */
    depthQuality: [
      [-0.15, 0.6],
      [-0.75, 0.5],
      [-1.1, 0.5]
    ],
    practiceSquadQuality: [-1.6, 0.45],
    freeAgentQuality: [-1.5, 0.75],
    freeAgents: 300,
    youngFreeAgentShare: 0.6,
    /** Age [mean, sd] by roster slot. */
    age: {
      starter: [27.3, 3.2],
      starterVeteran: [29.5, 4.2],
      backup: [26, 3.5],
      depth: [24.5, 2.5],
      practiceSquad: [23.3, 1.3],
      youngFreeAgent: [23.5, 1.2],
      veteranFreeAgent: [29, 3]
    },
    /** Share of teams without a fullback, and carrying a third quarterback. */
    noFullbackShare: 0.3,
    thirdQbShare: 0.35,
    /** Each team's cap use is drawn in this range, and veteran pay scales within these limits to hit it. */
    capUseMin: 0.9,
    capUseMax: 0.985,
    capScaleMin: 0.35,
    capScaleMax: 1.25
  },

  /** Generated coaches and staff (spec 6.6, 13.1). */
  staff: {
    ratingMean: 62,
    ratingSd: 12,
    /** Share of coordinators who run the head coach's scheme. */
    coordinatorMatchesHead: 0.75,
    /** Age mean and spread by role. */
    age: {
      HC: [52, 8],
      OC: [46, 7],
      DC: [48, 7],
      STC: [47, 8],
      QBC: [44, 9],
      RBC: [44, 9],
      WRC: [43, 9],
      TEC: [44, 9],
      OLC: [50, 9],
      DLC: [48, 9],
      LBC: [45, 9],
      DBC: [44, 9],
      DOS: [48, 8],
      DOP: [50, 8],
      SCOUT: [40, 10],
      GM: [49, 7]
    },
    /** Yearly salary range in dollars by role, from the lowest to the best rated. */
    salary: {
      HC: [4_000_000, 20_000_000],
      OC: [1_200_000, 5_000_000],
      DC: [1_200_000, 5_000_000],
      STC: [700_000, 1_800_000],
      QBC: [400_000, 1_500_000],
      RBC: [300_000, 900_000],
      WRC: [300_000, 1_000_000],
      TEC: [300_000, 900_000],
      OLC: [500_000, 1_600_000],
      DLC: [400_000, 1_300_000],
      LBC: [300_000, 1_000_000],
      DBC: [400_000, 1_200_000],
      DOS: [500_000, 1_500_000],
      DOP: [700_000, 2_000_000],
      SCOUT: [80_000, 180_000],
      GM: [2_500_000, 9_000_000]
    }
  }
} as const;

export type Tuning = typeof TUNING;
