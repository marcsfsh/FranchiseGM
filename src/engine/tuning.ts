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
    /** Awareness and play recognition gained per year of age from the pivot age, within the range. */
    awarenessPerYear: 1.2,
    awarenessPivotAge: 25,
    awarenessRange: [-5, 6],
    /** Speed, acceleration, agility, change of direction, and jumping lost per year past the decline age;
     * stamina and kicking decline later. */
    athleticDeclinePerYear: 1.5,
    athleticDeclineAge: 29,
    staminaDeclineAge: 31,
    kickingDeclineAge: 35,
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
    undraftedBelow: -0.9,
    /** Draft score = quality x weight + noise; round = ceil((base - score) x scale), clamped to 1-7. */
    draftScoreQualityWeight: 0.8,
    draftScoreNoise: 0.8,
    draftRoundBase: 1.6,
    draftRoundScale: 2.2,
    /** Players enter the league at this age; this share started a year later (one fewer credited season). */
    entryAge: 22,
    lateStartShare: 0.25,
    /** Age where ratings stop rising, by position group (spec 10.5 builds on the same curve). */
    peakAge: { QB: 30, RB: 25, WR: 26, TE: 27, OL: 27, DL: 27, LB: 27, DB: 26, ST: 30 },
    /** Share of left-handed quarterbacks, and of left-footed kickers and punters. */
    leftHandedQb: 0.07,
    leftFootedKicker: 0.12,
    /** Body limits (inches, pounds) and pounds per inch of height above the position mean. */
    heightRange: [66, 82],
    weightRange: [160, 380],
    weightPerInch: 4,
    ageRange: [21, 40],
    potentialNoise: 2,
    /** Morale at generation, 0 to 100: mean, spread, and bounds. */
    morale: [70, 8, 30, 95]
  },

  /** Traits conditional on ratings (spec 10.2): chance = scale x sigmoid((value - center) / spread). */
  traits: {
    throwAway: { center: 72, spread: 6, scale: 1 },
    tightSpiral: { center: 160, spread: 8, scale: 1 },
    fightForYards: { center: 140, spread: 10, scale: 1 },
    feetInBounds: { center: 160, spread: 8, scale: 1 },
    dropsOpenPasses: { center: 60, spread: 6, scale: 1 },
    possessionCatch: { center: 75, spread: 6, scale: 1 },
    aggressiveCatch: { center: 75, spread: 6, scale: 1 },
    yacCatch: { center: 175, spread: 6, scale: 1 },
    highMotor: { center: 160, spread: 10, scale: 1 },
    bigHitter: { center: 75, spread: 6, scale: 1 },
    stripsBall: { center: 160, spread: 10, scale: 0.6 },
    dlSwim: { center: 75, spread: 6, scale: 0.7 },
    dlSpin: { center: 78, spread: 6, scale: 0.5 },
    dlBullRush: { center: 75, spread: 6, scale: 0.7 },
    clutch: { center: 80, spread: 5, scale: 0.12, base: 0.08 },
    predictable: { center: 55, spread: 6, scale: 0.3 },
    /** Awareness bands for sense pressure, forcing passes, and penalties; carrying bands for covering the ball. */
    smartQbAwareness: 80,
    averageQbAwareness: 65,
    idealForcesAwareness: 78,
    aggressiveForcesThrowPower: 90,
    disciplinedAwareness: 80,
    undisciplinedAwareness: 58,
    coversBall: [85, 75, 60]
  },

  /** Player personality at generation (spec 10.9): [mean, sd] plus how ratings and age shift the mean. */
  personality: {
    /** Overall and age that the shifts below are measured from. */
    averageOverall: 70,
    leadershipPivotAge: 26,
    ego: [45, 17],
    egoPerOverall: 0.6,
    loyalty: [50, 20],
    workEthic: [60, 17],
    leadership: [45, 17],
    leadershipPerAwareness: 0.4,
    leadershipPerYear: 1.5,
    competitiveness: [62, 15],
    greed: [48, 19],
    greedPerOverall: 0.3,
    volatility: [38, 18],
    mediaStyle: [50, 20],
    socialActivity: [50, 22]
  },

  /**
   * Development traits (spec 10.6). Odds weights relative to Normal (1): scale x sigmoid((potential -
   * center) / spread) x youth + base, where youth favors players still growing.
   */
  development: {
    star: { center: 78, spread: 4, scale: 0.55, base: 0.08 },
    superstar: { center: 84, spread: 3, scale: 0.7, base: 0.01 },
    xFactor: { center: 90, spread: 2, scale: 0.5, base: 0 },
    youth: { throughAge25: 1, throughAge29: 0.85, older: 0.7 }
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

  /** Contract structure for generated deals (spec 11.3, 6.5). Tiers are by average annual value. */
  contracts: {
    /** Signing bonus share of the total value. */
    bonusShare: [
      { minApy: 20_000_000, range: [0.32, 0.45] },
      { minApy: 5_000_000, range: [0.18, 0.32] },
      { minApy: 0, range: [0, 0.12] }
    ],
    /** Years of fully guaranteed base salary at signing. */
    guaranteedYears: [
      { minApy: 20_000_000, years: 2 },
      { minApy: 8_000_000, years: 1 },
      { minApy: 0, years: 0 }
    ],
    /** Length range in years. */
    length: [
      { minApy: 20_000_000, years: [3, 5] },
      { minApy: 6_000_000, years: [2, 4] },
      { minApy: 0, years: [1, 2] }
    ],
    /** Each year's base salary weight rises by this share of the first year's. */
    baseRaisePerYear: 0.1,
    /** A deal within this multiple of the minimum is labeled a minimum contract. */
    minimumBand: 1.05,
    /** A generated veteran priced within this multiple of the minimum signs a one-year minimum deal. */
    minimumDealBand: 1.1,
    /** Picks through this number get a guaranteed first-year base salary. */
    guaranteedFirstYearThroughPick: 64,
    /** Signing bonus range for undrafted free agents, dollars. */
    udfaBonus: [0, 25_000]
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
    /** Practice squads share this much of their team's strength. */
    practiceSquadTeamShare: 0.5,
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
    /** Share of teams without a fullback, carrying a third quarterback, and shifting one more spot. */
    noFullbackShare: 0.3,
    thirdQbShare: 0.35,
    extraSwapShare: 0.4,
    /** Oldest generated player, and the oldest at the positions that last longest (QB, K, P, LS). */
    maxAge: 36,
    maxAgeLongCareer: 40,
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
    /** How much one staff member's ratings share a common quality (the rest is independent). */
    ratingLoading: 0.7,
    ageRange: [28, 75],
    /** Contract length ranges: head coach and coordinators, then everyone else. */
    coachContractYears: [1, 5],
    staffContractYears: [1, 3],
    /** Seasons in the role before the league began: up to (age - 30) / divisor. */
    firstJobAge: 30,
    coachTenureDivisor: 2.5,
    staffTenureDivisor: 1.5,
    /** Personality [mean, sd] for coaches and staff (spec 14.3), and head coach tendencies. */
    personality: {
      riskTolerance: [50, 18],
      patience: [50, 18],
      loyalty: [50, 18],
      analyticsLean: [50, 20],
      ambition: [55, 18]
    },
    tendencies: {
      aggressiveness: [50, 18],
      passLean: [55, 15],
      clockManagement: [55, 15],
      youthLean: [50, 20],
      rigidity: [50, 18],
      playerRelationships: [55, 16],
      personnelPower: [45, 20]
    },
    /** Owners (spec 14.8): age, wealth tier weights for tiers 1 to 5, and personality. */
    ownerAge: [66, 11],
    ownerAgeRange: [35, 92],
    ownerWealthWeights: [10, 25, 30, 25, 10],
    owner: {
      patience: [50, 20],
      meddling: [40, 20],
      spending: [55, 18],
      relocationAppetite: [20, 15],
      tradition: [55, 20],
      competitiveness: [60, 18]
    },
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
