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
    /** Staff morale when the league starts, 0 to 100 (spec 7.6 coordinator mismatch lowers it). */
    startMorale: 70,
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
  },

  /**
   * Estimated situation profiles (spec 7.5): the share of each role's snaps in each trigger situation,
   * estimated from scheme tendencies until M4 measures them by running the sim. League figures are
   * 2021-2025 NFL averages from nflverse play-by-play.
   */
  situations: {
    /** Offensive snaps by down and distance (short is 3 yards or fewer to go). */
    downMix: { first: 0.45, secondShort: 0.13, secondLong: 0.19, thirdShort: 0.09, thirdLong: 0.14 },
    /** Game contexts as shares of snaps: inside the 20, two-minute drill, one-score games late, bad weather. */
    redZone: 0.13,
    twoMinute: 0.09,
    lateAndClose: 0.1,
    badWeather: 0.12,
    /** League averages the other side of the ball faces. */
    leaguePass: 0.58,
    leagueBlitz: 0.28,
    leagueMan: 0.35,
    leagueDeep: 0.11,
    leagueInside: 0.62,
    leaguePlayAction: 0.22,
    /** Passes between 10 and 19 air yards; short passes are the rest after deep shots. */
    intermediateShare: 0.25,
    /** Dropbacks that end in a pass attempt (the rest are sacks and scrambles). */
    attemptShare: 0.9,
    contestedShare: 0.14,
    /** The lead back's share of running back snaps. */
    rb1Share: 0.7,
    /** Carries by the back on the field when a back runs it (the fullback gets the rest). */
    backCarryShare: 0.95,
    fullbackCarryShare: 0.05,
    /** Share of pass snaps each slot runs a route (the rest it blocks). */
    routeShare: { X: 1, Z: 1, SLOT: 1, TE1: 0.7, TE2: 0.4, RB1: 0.45, RB2: 0.5, FB: 0.3 },
    /** How much more (or less) often each receiving slot draws deep and short targets than average. */
    deepBias: { X: 1.4, Z: 1.4, SLOT: 0.6, TE1: 0.5, TE2: 0.4, RB1: 0.1, RB2: 0.1, FB: 0.1 },
    shortBias: { X: 0.9, Z: 0.9, SLOT: 1.15, TE1: 1.1, TE2: 1.1, RB1: 1.3, RB2: 1.3, FB: 1.3 },
    /** Catches that turn into open-field runs, and runs that reach the open field (more on outside runs). */
    catchOpenField: 0.5,
    openFieldBase: 0.12,
    openFieldOutside: 0.12,
    /** Carries met at or behind the line (more on gap runs). */
    contactBase: 0.35,
    contactGap: 0.2,
    /** Quarterback throws outside the pocket: base, per unit of play action (bootlegs), per unit of scramble. */
    outsidePocketBase: 0.05,
    outsidePocketPlayAction: 0.35,
    outsidePocketScramble: 0.08,
    /** Counters count half inside, half outside; linemen release downfield on this share of screens. */
    counterInside: 0.5,
    screenRelease: 0.5,
    /** Extra contested catches per unit of deep-target share. */
    contestedDeep: 0.3,
    /**
     * Defensive groups against a league-average offense. rush: share of pass plays rushing with a 4-man and
     * a 3-man front, plus per unit of blitz and simulated-pressure rate. deep: how often the group is the
     * deep defender relative to average, plus per unit of single-high and two-high shells. The rest are
     * relative involvement in short coverage, contested catches, open-field tackles, inside and outside
     * runs, and contact at the line (plus per unit of penetrating run fits).
     */
    // prettier-ignore
    defenseGroups: {
      edge:     { rush4: 0.9,  rush3: 0.8, blitz: 0.2,  sim: 0,    deep: 0,   single: 0,    two: 0,   short: 0.3, contested: 0,   openField: 0.15, inside: 0.6, outside: 1,   atLine: 0.7,  penetration: 0.3 },
      interior: { rush4: 1,    rush3: 1,   blitz: 0,    sim: -0.3, deep: 0,   single: 0,    two: 0,   short: 0,   contested: 0,   openField: 0.05, inside: 1,   outside: 0.4, atLine: 0.7,  penetration: 0.3 },
      flex:     { rush4: 0,    rush3: 1,   blitz: 0.35, sim: 0,    deep: 0.05, single: 0,   two: 0,   short: 1,   contested: 0.3, openField: 0.3,  inside: 0.8, outside: 0.8, atLine: 0.5,  penetration: 0.3 },
      mike:     { rush4: 0,    rush3: 0,   blitz: 0.45, sim: 0.3,  deep: 0.1, single: 0,    two: 0,   short: 1.2, contested: 0.4, openField: 0.35, inside: 1,   outside: 0.8, atLine: 0.5,  penetration: 0 },
      will:     { rush4: 0,    rush3: 0,   blitz: 0.35, sim: 0.2,  deep: 0.15, single: 0,   two: 0,   short: 1.2, contested: 0.5, openField: 0.4,  inside: 0.8, outside: 1,   atLine: 0.4,  penetration: 0 },
      corner:   { rush4: 0,    rush3: 0,   blitz: 0.05, sim: 0,    deep: 0.8, single: 0.45, two: 0.3, short: 0.8, contested: 1.2, openField: 0.3,  inside: 0.2, outside: 0.8, atLine: 0.1,  penetration: 0 },
      nickel:   { rush4: 0,    rush3: 0,   blitz: 0.15, sim: 0.1,  deep: 0.3, single: 0,    two: 0,   short: 1.2, contested: 1,   openField: 0.35, inside: 0.4, outside: 0.7, atLine: 0.2,  penetration: 0 },
      dime:     { rush4: 0,    rush3: 0,   blitz: 0.2,  sim: 0,    deep: 0.4, single: 0,    two: 0,   short: 1,   contested: 0.9, openField: 0.35, inside: 0.4, outside: 0.6, atLine: 0.15, penetration: 0 },
      free:     { rush4: 0,    rush3: 0,   blitz: 0.03, sim: 0,    deep: 1,   single: 0.8,  two: 0,   short: 0.4, contested: 0.8, openField: 0.45, inside: 0.4, outside: 0.6, atLine: 0.1,  penetration: 0 },
      strong:   { rush4: 0,    rush3: 0,   blitz: 0.15, sim: 0.1,  deep: 0.6, single: 0,    two: 0.6, short: 0.9, contested: 0.8, openField: 0.4,  inside: 0.7, outside: 0.8, atLine: 0.3,  penetration: 0 }
    },
    /** A defender's share of the coverage on a short pass or contested catch (about one in four). */
    defenderShare: 0.25,
    /** Open-field tackles per pass play (after the catch), relative to per run play; and the scale of both. */
    openFieldPass: 0.1,
    openFieldScale: 0.5,
    /** Special teams: open-field and contact shares of return snaps, and gunners in space. */
    special: {
      kickReturnOpenField: 0.6,
      kickReturnContact: 0.3,
      puntReturnOpenField: 0.5,
      puntReturnContested: 0.2,
      gunnerOpenField: 0.8
    }
  },

  /** Abilities (spec 7.4). */
  abilities: {
    /** Role rating points an ability adds in a scheme that triggers it as often as the named-scheme average. */
    tierPoints: [0, 1, 2, 3],
    /** A scheme can make an ability worth at most this multiple of its tier points. */
    maxFrequencyRatio: 2,
    /** Generated players (spec 10.2): abilities by development trait, and the overall a Star needs for one. */
    count: { Normal: 0, Star: 1, Superstar: 2, 'X-Factor': 3 },
    starMinOverall: 80,
    /** Generated coaches (spec 13.1): one ability at this overall, two at the second threshold. */
    coachOneAt: 72,
    coachTwoAt: 84
  },

  /** Role ratings and fit (spec 7.3). */
  fit: {
    /** Default fit cap in points; leagues can change it (setting). */
    cap: 8,
    /** Age of the typical player that role ratings are measured from (the overall formulas' reference). */
    referenceAge: 27,
    /** The fit breakdown names up to this many ratings, and calls a scheme's trigger rate "often" or "rarely"
     * past these multiples of the named-scheme average. */
    namedRatings: 2,
    oftenRatio: 1.15,
    rarelyRatio: 0.85,
    /** Fit at least this far from zero is a good or poor fit; closer is fair. */
    clearFit: 3,
    /** A rating must move the role rating at least this many points to be named in the breakdown. */
    namedMinPoints: 0.5
  },

  /** Scheme cohesion and coaching (spec 7.6). */
  cohesion: {
    /** Cohesion is clamped to this many points either way. */
    limit: 10,
    /** Execution bonus per point of cohesion (fewer negative plays, penalties, and blown assignments). */
    executionPerPoint: 0.004,
    /** How far the most flexible head coach bends tendencies toward the roster's strengths. */
    maxBend: 0.35,
    /** Share of a positive cohesion bonus a fully flexible coach gives up. */
    flexibilityCost: 0.5,
    /** Softmax temperature, in fit points, when weighing which named scheme suits the roster. */
    rosterTemperature: 1.5
  },

  /**
   * Game simulation (spec 8). Base rates are 2021-2025 NFL averages (nflverse play-by-play); matchups move
   * them on the log-odds scale by rating differences measured from typical players, so an average matchup
   * plays at league rates. Calibration (M6) tunes these against calibration/targets.json.
   */
  sim: {
    /** Log-odds per rating point of matchup difference, for each resolution. */
    // prettier-ignore
    edge: { pressure: 0.045, sack: 0.04, completion: 0.035, separation: 0.04, interception: 0.04, stuff: 0.04, breakaway: 0.045, fumble: 0.03, kick: 0.03 },
    /** Rating points per point of fit (spec 7.3), per unit of cohesion execution, and for team form sd. */
    fitPoints: 0.5,
    formSd: 0.8,
    /** Pass protection: pressure base rate, blitz and simulated pressure boosts (log-odds). */
    pressureBase: 0.31,
    blitzPressure: 0.45,
    simPressure: 0.2,
    sackGivenPressure: 0.18,
    scrambleGivenPressure: 0.13,
    scrambleTendency: 0.25,
    throwAwayGivenPressure: 0.06,
    throwAwayTrait: 0.07,
    groundingGivenThrowAway: 0.05,
    /** Completion by depth (short, intermediate, deep, screen), and the pressure penalty (log-odds). */
    completion: { short: 0.745, intermediate: 0.585, deep: 0.37, screen: 0.86 },
    pressureCompletion: -0.75,
    dropShare: 0.075,
    /** Interceptions per attempt by depth, and log-odds shifts. */
    interception: { short: 0.013, intermediate: 0.022, deep: 0.04, screen: 0.003 },
    interceptionPressure: 0.45,
    interceptionAggressive: 0.25,
    /** Air yards: short mean above 1, intermediate span, deep mean past 20. */
    airShortMean: 4.2,
    airDeepMean: 11,
    screenAir: [-3, 1],
    /** Yards after catch means by depth, and the broken-tackle chance and extra yards. */
    yac: { short: 4.5, intermediate: 3, deep: 4.5, screen: 6 },
    brokenTackle: 0.07,
    brokenTackleYards: 11,
    /** Runs: stuff rate, stuff depth, gain shape and mean, breakaway chance and extra yards. */
    stuff: 0.17,
    stuffYards: 3,
    runGainMean: 4.4,
    runGainShape: 1.6,
    breakaway: 0.065,
    breakawayYards: 14,
    /** Rating points of run block edge worth one yard of mean gain; defenders in the box change it. */
    blockYardsPerPoint: 0.06,
    lightBox: 0.35,
    /** Fumbles per carry and per catch, share lost, and rain or snow log-odds. */
    fumbleCarry: 0.011,
    fumbleCatch: 0.004,
    fumbleLost: 0.5,
    fumbleWet: 0.35,
    /** Scrambles and designed quarterback runs. */
    scrambleMean: 6.5,
    /** Clock: seconds a play takes, the runoff between snaps (normal, hurry-up, and milking), and out of
     * bounds shares. */
    playSeconds: [4, 8],
    runoff: { normal: 31, hurry: 14, milk: 39 },
    outOfBoundsRun: 0.12,
    outOfBoundsCatch: 0.25,
    /** Fourth downs: go rates by yards to go (1, 2, 3 to 5, 6 or more) in plus territory, and at midfield. */
    goRate: [0.62, 0.42, 0.22, 0.06],
    goRateOwnHalf: [0.22, 0.1, 0.03, 0.005],
    /** Two-point tries: base rate of touchdowns and success rate. */
    twoPointBase: 0.04,
    twoPointSuccess: 0.48,
    /** Field goals: log-odds at 25 yards and per yard beyond, the longest try, and weather. */
    fgLogit25: 4.2,
    fgPerYard: -0.12,
    fgMaxDistance: 62,
    fgCold: -0.25,
    fgWet: -0.35,
    fgWindPerMph: -0.03,
    fgAltitude: 0.35,
    /** Kickoffs: shares of returnable kicks, touchbacks, and short kicks; landing depth; return yards. */
    kickoffReturnable: 0.66,
    kickoffShort: 0.015,
    kickoffLandingRollTouchback: 0.03,
    kickoffLanding: [1, 14],
    kickReturnMean: 23,
    kickReturnSd: 7,
    returnTouchdown: 0.004,
    onsideRecovery: 0.12,
    /** Punts: gross mean and spread, fair catches, returns, and return yards. */
    puntMean: 46.5,
    puntSd: 6,
    puntFairCatch: 0.28,
    puntReturned: 0.44,
    puntReturnMean: 9.5,
    puntBlocked: 0.004,
    /** Penalties per play (offense or defense snap), before discipline, crowd, and slider multipliers. */
    // prettier-ignore
    penaltyRates: {
      falseStart: 0.0194, delayOfGame: 0.0049, illegalFormation: 0.0065, offensiveHoldingRun: 0.0179,
      offensiveHoldingPass: 0.0259, offensivePassInterference: 0.0065, offside: 0.013, defensiveHolding: 0.0114,
      illegalContact: 0.0049, defensivePassInterference: 0.0179, roughingThePasser: 0.013, unnecessaryRoughness: 0.0082,
      facemask: 0.0056, illegalUseOfHands: 0.0065, unsportsmanlikeConduct: 0.0024, illegalBlockInBack: 0.06,
      kickCatchInterference: 0.0049, runningIntoKicker: 0.0065
    },
    /** Discipline multipliers by penalty trait, and the crowd's effect on visiting false starts. */
    discipline: { disciplined: 0.75, normal: 1, undisciplined: 1.45 },
    crowdFalseStart: 0.6,
    /** In-game injuries per involvement, and the severity mix (minor, 1-2 weeks, 3-6 weeks, season). */
    injuryRate: 0.0018,
    injurySeverity: [0.55, 0.25, 0.12, 0.08],
    /** Fatigue: energy spent per snap by position group, recovery per snap off the field, the energy
     * where ratings start to suffer, rating points lost per energy point, and substitution thresholds. */
    fatigue: { QB: 0.5, RB: 2.6, WR: 1.4, TE: 1.7, OL: 0.9, DL: 3.1, LB: 2.1, DB: 1.5, ST: 0.3 },
    recovery: 3.5,
    tiredAt: 85,
    tiredPoints: 0.15,
    subAt: { QB: 20, RB: 62, WR: 52, TE: 58, OL: 35, DL: 68, LB: 58, DB: 52, ST: 10 },
    /** Home field (spec 17.3): rating points for the home team from the crowd, travel per time zone, and
     * rest; the combined effect is about 1.5 to 2.5 points a game. */
    homeCrowd: 0.5,
    travelPerZone: 0.2,
    shortWeek: 0.6,
    afterBye: 0.4,
    /** Days between games that count as a short week, and as rest after a bye. */
    shortWeekDays: 5,
    byeWeekDays: 13,
    /** Game weather draws (spec 17.2): retractable roofs close below roofClosesBelowF or in rain; game
     * time sits gameTimeShare of the way from the day's low to its high; wet games follow monthly
     * precipitation; wind draws around the monthly mean with occasional gusts. */
    weather: {
      roofClosesBelowF: 55,
      gameTimeShare: 0.65,
      tempSd: 7,
      wetPerInch: 1 / 22,
      wetMax: 0.35,
      snowBelowF: 34,
      snowFloor: 0.5,
      snowPerPrecip: 3,
      windLow: 0.45,
      windSpread: 1.1,
      gustChance: 0.08,
      gustMph: 8,
      /** "Bad weather" for abilities: precipitation, this much wind, or this cold. */
      badWindMph: 15,
      badColdF: 25
    },
    /** Play calling, decisions, and resolution details (spec 8.3, 8.6). */
    calls: {
      // Situations and play calling
      goalLineYards: 3,
      goalLineHeavy: 2.5,
      passingDownHeavy: 0.5,
      /** Defensive package weights (base, nickel, dime) by the offense's wide receivers (1 to 4). */
      // prettier-ignore
      packageByReceivers: { 1: [3, 0.5, 0.1], 2: [1.8, 0.8, 0.3], 3: [0.35, 1.35, 1.4], 4: [0.1, 1.2, 2.2] },
      lateTrailingSeconds: 420,
      lateTrailingPass: 0.82,
      leadingRunShift: 0.62,
      twoMinutePass: 0.8,
      goalLinePass: 0.72,
      wetPassShift: 0.9,
      windyMph: 15,
      windyPassShift: 0.95,
      deepLateBoost: 1.35,
      deepShortYardage: 0.5,
      screenThirdLong: 0.5,
      blitzThirdDown: 1.25,
      hurrySeconds: 240,
      hurryHalfSeconds: 120,
      milkSeconds: 480,
      // Decisions
      desperationSeconds: 240,
      endHalfFgSeconds: 30,
      lastSecondsFg: 5,
      leadingGoFactor: 0.6,
      goalLineGo: 0.45,
      minFgGoal: 2,
      /** Field goal tries up to this distance are routine; longer ones fade by fgFadePerYard, helped by a
       * strong leg (fgPowerShare per rating point of kick power). */
      fgRoutine: 52,
      fgFadePerYard: 0.08,
      fgPowerShare: 0.02,
      fgSnapYards: 17,
      rangePerPoint: 0.15,
      altitudeRange: 4,
      windRangeLoss: 5,
      kneelHalfSeconds: 40,
      timeoutHalfSeconds: 90,
      timeoutHalfFromBall: 35,
      timeoutGameSeconds: 150,
      defenseTimeoutSeconds: 180,
      /** Leads after a late touchdown (before the try) where coaches go for two. */
      goForTwoLate: [-2, -5, -10, 1, 5, -9, -12, -16],
      twoPointPerPoint: 0.01,
      defensiveTry: 0.01,
      onsideSeconds: 180,
      onsideMaxDeficit: 16,
      onsideChance: 0.9,
      onsideYards: 12,
      // Protection and passing
      blitzRushers: 5,
      blitzPickup: 1.5,
      cohesionLogit: 10,
      sliderLogit: 1,
      sliderPoints: 5,
      screenPressure: 0.35,
      playActionPressure: 1.1,
      senseSack: { paranoid: -0.3, triggerHappy: -0.1, ideal: -0.2, average: 0, oblivious: 0.35 },
      scramblerFactor: 1.8,
      pocketFactor: 0.5,
      paranoidThrowAway: 0.06,
      creditSpread: 6,
      sackYards: [4, 9],
      stripSack: 0.11,
      stripLost: 0.55,
      scrambleMin: 3,
      scrambleBurst: 0.08,
      scrambleFloor: -1,
      scrambleOutOfBounds: 0.35,
      minTargetShare: 0.02,
      uncovered: 12,
      pressWeight: 0.5,
      playActionSeparation: 2.5,
      blitzSeparation: 2.5,
      cohesionSeparation: 20,
      /** How much target choice follows separation, per rating point. */
      openness: 0.06,
      // prettier-ignore
      deepFavor: { X: 1.5, Z: 1.5, SLOT: 0.7, EXTRA: 0.8, TE1: 0.5, TE2: 0.3, RB1: 0.1, RB2: 0.1, FB: 0.05 },
      // prettier-ignore
      screenFavor: { X: 0.8, Z: 0.6, SLOT: 1.3, EXTRA: 0.6, TE1: 0.6, TE2: 0.3, RB1: 3, RB2: 3, FB: 0.5 },
      poiseWeight: 0.4,
      calmMph: 10,
      playsBallLogit: 0.15,
      intSeparation: 0.02,
      contestedSep: -3,
      handsWeight: 0.02,
      playActionLogit: 0.15,
      /** Inside the 20 the field compresses: harder completions and more stuffed runs near the goal. */
      redZoneCompletion: -0.45,
      goalLineStuff: 0.6,
      dropsTrait: 2.5,
      wetDrops: 1.5,
      breakupShare: 0.35,
      yacFloor: 1,
      yacPerPoint: 0.025,
      yacTrait: 1.12,
      openFieldYards: 8,
      stripsLogit: 0.35,
      intReturnMean: 9,
      // Running
      leadWeight: 0.5,
      teBlockWeight: 0.6,
      safetyBoxWeight: 0.5,
      penetrationLogit: 0.4,
      runMeanFloor: 1.5,
      carrierYardsPerPoint: 0.05,
      efficiencyYards: 3,
      breakawayStart: 6,
      coversBall: { never: 0.55, onBigHits: 0, onMediumHits: -0.15, forAllHits: -0.3, always: -0.45 },
      // Kicking
      longKick: 40,
      coldF: 35,
      puntWind: 0.5,
      puntPerPoint: 0.25,
      puntAltitude: 3,
      blockedPuntLoss: 8,
      returnPerPoint: 0.25,
      returnTdPunt: 0.004,
      kickoffPowerShift: 0.004,
      kickoffSliderShift: 0.3,
      freeKickLanding: 45,
      // Penalties and injuries
      cohesionPenalty: 15,
      linemenExposed: 2,
      injuryWeeks: { minor: [0, 0], short: [1, 2], medium: [3, 6], season: [8, 17] },
      minorOutPlays: [4, 20]
    },
    /** The game clock (spec 8.3 step 8): seconds for plays and between snaps, and limits. */
    clock: {
      twoMinute: 120,
      fiveMinutes: 300,
      playSeconds: [5, 8],
      runoff: { normal: 34, hurry: 13, milk: 39 },
      tempoSpread: 14,
      clockWaste: 6,
      kneelSeconds: 40,
      kneelPlaySeconds: 2,
      kickSeconds: 5,
      returnSeconds: 6,
      penaltySeconds: 0,
      hurryDelay: 1.5,
      hurryFatigue: 0.25,
      heatAboveF: 80,
      heatScale: 20,
      altitudeFt: 5000,
      subMargin: 8,
      /** A safety valve against endless loops; a real game has about 160 snaps and kicks. */
      maxPlays: 600
    },
    /** Weather (spec 17.2): wind, rain, snow, heat, and altitude effects. */
    heatFatigue: 0.25,
    altitudeFatigue: 0.2,
    wetPassLogit: -0.15,
    windDeepLogitPerMph: -0.02,
    wetRunShift: 0.06
  },

  /**
   * Coordinator mismatch (spec 7.6): penalties per unit of scheme distance. Named schemes sit 0.1 to 0.36
   * apart, so the most different pair costs about 18% of play calling and development and 18 morale.
   */
  coordinators: {
    playCallingPenalty: 0.5,
    developmentPenalty: 0.5,
    moraleDrop: 50
  }
} as const;

export type Tuning = typeof TUNING;
