/**
 * Tunable numbers for the simulation, AI, economy, and player development.
 *
 * Every constant cites the spec section it tunes. League rules (roster sizes, cap figures, penalty
 * yardage) live in the rule set (spec 16), not here. Calibration runs (spec 23) change these values,
 * and each change is logged in docs/CALIBRATION.md.
 */
import type { StatKey } from './sim/stats';

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

  /**
   * Players of the week (spec 18.4): game score weights per stat. Offense counts yards, scores, catches, and
   * turnovers; defense counts stops and takeaways; special teams count kicks, returns, and pinned punts,
   * less missedKick per missed field goal. A player on a winning team scores winnerEdge times as much.
   */
  awards: {
    offense: {
      passYds: 0.04, passTd: 4, passInt: -3, rushYds: 0.1, rushTd: 6, recYds: 0.1, recTd: 6, receptions: 0.5,
      fumblesLost: -3
    },
    defense: {
      tackles: 1, tacklesForLoss: 1.5, sacks: 4, qbHits: 1, defInt: 5, defIntTd: 6, forcedFumbles: 3,
      fumbleRecoveries: 2, fumbleReturnTd: 6, passesDefended: 1.5, safeties: 4
    },
    special: {
      fgMade: 3, fgMade50: 2, xpMade: 0.5, kickReturnYds: 0.05, kickReturnTd: 8, puntReturnYds: 0.08,
      puntReturnTd: 8, puntsIn20: 1.5
    },
    missedKick: 3,
    winnerEdge: 1.1
  } as {
    offense: Partial<Record<StatKey, number>>;
    defense: Partial<Record<StatKey, number>>;
    special: Partial<Record<StatKey, number>>;
    missedKick: number;
    winnerEdge: number;
  }, // prettier-ignore

  /**
   * The news feed (spec 18.1). Newsworthiness: a result scores `result` (tie `tie`), plus perUpsetPoint per
   * point the loser's best 22 out-rate the winner's from upsetGap up, `overtime`, and blowoutBonus from a
   * `blowout` margin; playoff games multiply by playoffStakes and the Super Bowl by superBowlStakes. A big
   * game scores `performance` times how far past its mark (bigGame) it went; a season milestone scores
   * `milestone` times its rank among the stat's marks; an injury scores `injury` per week out, up to
   * injuryWeeksCap, and seasonEnding more for the season, for players rated injuryFrom or more; a signing
   * of a player rated signingFrom or more scores `transaction`; a player of the week scores `award`.
   * Players add perOverall per overall point above prominentFrom. The feed keeps perWeek items a week,
   * and a team sees a template once in templateWeeks weeks.
   */
  news: {
    result: 3, tie: 6, upsetGap: 2, perUpsetPoint: 3, overtime: 3, blowout: 21, blowoutBonus: 1,
    playoffStakes: 3, superBowlStakes: 6, performance: 6, milestone: 4, injury: 1, injuryWeeksCap: 6,
    seasonEnding: 3, injuryFrom: 72, signingFrom: 68, transaction: 1, award: 4, prominentFrom: 70, perOverall: 0.3,
    perWeek: 12, templateWeeks: 4,
    bigGame: { passYds: 400, passTd: 5, rushYds: 175, recYds: 175, sacks: 3, defInt: 2 },
    milestones: {
      passYds: [3000, 4000, 5000], rushYds: [1000, 1500, 2000], recYds: [1000, 1500], sacks: [10, 15, 20],
      passTd: [30, 40], defInt: [6, 9]
    },
    milestoneWords: {
      passYds: 'passing yard', rushYds: 'rushing yard', recYds: 'receiving yard', sacks: 'sack',
      passTd: 'touchdown pass', defInt: 'interception'
    }
  } as const, // prettier-ignore

  /** The AI decision framework (spec 14.1, 14.5). */
  ai: {
    /** Softmax temperature at competence 100 and 0: how far a decision-maker wanders from the best option. */
    temperature: [0.01, 0.08],
    /** Options the softmax chooses among, and rejected options kept in the log. */
    topOptions: 5,
    loggedRejections: 3,
    /** A consideration score of 0 counts as this, so the geometric mean stays defined (still a veto). */
    floor: 0.001,
    /**
     * Auto depth charts (spec 12.2). Merit scores 1 for the best role rating and 0 at meritSpan points
     * behind it. Each style consideration scores from styleFloor to 1 and weighs styleScale times the
     * coach's share of that style, merit weighing 1: a coach who is half developer starts a young
     * high-potential player about 4 points worse than the best, a typical coach about 1. Every coach also
     * weighs last week's starter by `continuity` (about 2 points), so lineups don't churn on noise. A meritocrat's share
     * starts at meritBase and grows with his analytics lean. Experience scores fully at experienceYears
     * seasons, and upside (potential over current rating) at upsideSpan points for players youngAge or under.
     */
    depth: {
      meritSpan: 20,
      styleFloor: 0.6,
      styleScale: 0.9,
      continuity: 0.2,
      meritBase: 0.5,
      experienceYears: 6,
      youngAge: 25,
      upsideSpan: 12,
      /** Loyalty and rigidity (0 to 100, averaged) above this start the loyalist share. */
      loyalFrom: 40,
      /** Personnel power (0 to 100) below this starts the contract-minded share. */
      contractFrom: 60
    },
    /**
     * Playing a questionable player or resting him (spec 10.8). Playing him scores 0 when he's
     * edgeSpan[0] points or less better than his backup and 1 from edgeSpan[1]; his injury risk multiplier
     * scores 1 at riskSpan[1] and 0 at riskSpan[0], weighed by riskWeight at a risk tolerance of 0 and
     * nothing at 100. Stakes (1 in the playoffs, regularStakes before) push toward playing.
     */
    rest: {
      edgeSpan: [-2, 8],
      riskSpan: [2.5, 1],
      riskWeight: 1.5,
      regularStakes: 0.5,
      stakesWeight: 0.5,
      /** A player who isn't starting counts as this many points worse than the man ahead of him. */
      benchEdge: -5
    },
    /**
     * Opponent game plans (spec 8.7, 14.11). The staff reads the scouting report with noise of readNoise
     * points at competence 0 and none at 100. Ideal settings: passLean moves leanPerPoint per point that the
     * passing matchup beats the running matchup; blitz rises blitzPerPoint per point their protection
     * trails our rush and falls poisePerPoint per point of their quarterback's poise; man and press move
     * coverPerPoint per point that man coverage beats zone and pressPerPoint per point our corners out-rate
     * their receivers off the line; nickel moves nickelPerShare per share of three-receiver personnel above
     * spreadShare. Each dial's options are scored by how close they sit to the ideal, and by how close to
     * the scheme's normal (weight: the head coach's rigidity out of 100).
     */
    plan: {
      readNoise: 6,
      leanPerPoint: 0.005,
      blitzPerPoint: 0.04,
      poisePerPoint: 0.02,
      coverPerPoint: 0.03,
      pressPerPoint: 0.03,
      nickelPerShare: 1,
      /** Personnel lean per unit of pass lean, and two-high shells per point of their deep passing threat. */
      spreadPerLean: 2,
      twoHighPerPoint: 0.03,
      spreadShare: 0.55,
      /** Options per dial, evenly spaced across its limits. */
      steps: 5,
      /**
       * Player focus: a playmaker featureFrom points better than our other receivers, a receiver
       * shadowFrom or doubleFrom points better than theirs (a shadow also needs our best corner cornerFrom
       * points better than our others in man coverage), a rusher chipFrom points better than our line
       * blocks, and a quarterback whose escape rating is spyFrom above the reference. A case scores 0.5 at
       * its threshold, over a logistic width of focusWidth points; going without scores 0.5. Measured on
       * generated leagues, the thresholds sit near the 70th (chip), 75th (shadow), 85th (feature, double),
       * and 90th (spy) percentiles.
       */
      featureFrom: 12,
      shadowFrom: 10.5,
      cornerFrom: 3,
      doubleFrom: 12,
      chipFrom: 10,
      spyFrom: 8,
      focusWidth: 2
    },
    /**
     * Rotations on auto (spec 12.3). The lead back's share is the scheme default (situations.rb1Share) when
     * his role rating beats the second back's by backfieldGap, the median in generated leagues, and moves
     * backfieldPerPoint per point either way, on a dial of backfieldSteps settings across backfieldRange. The line rotates fully when its best backups are within
     * lineCloseGap overall points of the starters and not at all from lineFarGap points behind. A
     * situational sub needs subFrom points over the man he replaces at the job: a back's receiving and
     * blocking, a rusher's pass rush, a target's contested catching. Players back from an injury play at
     * most returnLimit of their unit's snaps. A young backup (youngAge or under, devUpsideFrom points of
     * upside) gets devSnapScale times the coach's developer share of his slot's snaps.
     */
    rotation: {
      backfieldGap: 8,
      backfieldPerPoint: 0.005,
      backfieldRange: [0.45, 0.75],
      backfieldSteps: 7,
      lineCloseGap: 2,
      lineFarGap: 10,
      subFrom: 3,
      returnLimit: { questionable: 0.6, probable: 0.8 },
      devUpsideFrom: 8,
      devSnapScale: 0.6
    },
    /**
     * Injury signings (spec 14.11 in season): need counts the players missing from a position group
     * against the standard roster; quality scores 0 at qualitySpan[0] overall and 1 at qualitySpan[1]; youth
     * scores from youthFloor at youthSpan[0] years old to 1 at youthSpan[1]. The GM looks at the best
     * candidatesPerGroup free agents in each group and every player on his own practice squad.
     */
    signing: {
      needWeight: 2,
      needFloor: 0.05,
      qualitySpan: [35, 75],
      youthSpan: [34, 24],
      youthFloor: 0.7,
      youthWeight: 0.3,
      candidatesPerGroup: 3,
      /** A free agent's score on familiarity; the team's own practice squad players score 1. */
      strangerScore: 0.9,
      /**
       * Healthy players a team keeps in each group even through short injuries, signing someone for the
       * week when it falls short: a starting lineup's worth, with the line's groups at full strength.
       */
      minHealthy: {
        QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DE: 1, DT: 1, OLB: 1, MLB: 1, CB: 2, S: 2, K: 1, P: 1, LS: 1
      } as Record<string, number> // prettier-ignore
    }
  },
  /** Injuries between games (spec 10.8). */
  injuries: {
    /** Weeks he plays at reduced ratings after returning, by severity (lingering effects). */
    lingering: { minor: 0, short: 1, medium: 2, season: 2 },
    /** Weeks of raised re-injury risk after returning, by severity. */
    fragile: { minor: 1, short: 2, medium: 4, season: 6 },
    /** Rating points off every composite while he plays hurt, by designation. */
    hurtPenalty: { questionable: 4, probable: 1.5 },
    /** Injury risk multipliers: in his fragile weeks, and more when he plays questionable. */
    fragileRisk: 1.6,
    questionableRisk: 1.3,
    /** A season-ending injury changes a career this often, costing the body part's ratings this many points. */
    careerChance: 0.12,
    careerLoss: [3, 8],
    /** Ratings a career-altering injury takes, by body part. */
    careerRatings: {
      'knee (ACL)': ['spd', 'acc', 'agi', 'cod'],
      Achilles: ['spd', 'acc', 'jmp'],
      'foot (Lisfranc)': ['acc', 'agi', 'cod'],
      shoulder: ['str', 'thp'],
      ankle: ['agi', 'cod']
    }
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
    /**
     * Cap parity (D-19): a roster's starters more than balanceFrom above or below typical (average latent
     * quality, the quarterback counting balanceQbWeight times) keep only balanceKeep of the excess.
     */
    balanceFrom: 0.1,
    balanceKeep: 0.2,
    balanceQbWeight: 4,
    starBonus: [0.8, 1.7],
    /** The sd of a uniform team strength offset. */
    teamSpread: 0.2,
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
    rb1Share: 0.6,
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
    edge: { pressure: 0.045, sack: 0.04, completion: 0.035, separation: 0.04, interception: 0.015, stuff: 0.04, breakaway: 0.045, fumble: 0.03, kick: 0.03 },
    /** Rating points per point of fit (spec 7.3), per unit of cohesion execution, and for team form sd. */
    fitPoints: 0.7,
    /** Adaptive play calling (spec 7.6): the largest pass-rate shift, reached at this many rating points of
     * pass-over-run edge with a fully flexible coach. */
    leanMax: 0.02,
    leanScale: 6,
    /** Added to every scheme's pass rate: the league-wide calibration of pass volume (spec 23.3). */
    passRateShift: -0.02,
    /** Halftime adjustments (spec 8.6): the largest pass-rate shift toward what worked, at full skill, and
     * the yards-per-play gap between passing and running that counts as neutral. */
    halftimeShift: 0.02,
    halftimeNeutralGap: 1.5,
    halftimeScale: 4,
    formSd: 2.0,
    /** Halftime adjustments need at least this many dropbacks and runs to judge by. */
    halftimeMinPlays: 5,
    /**
     * Pass protection: pressure base rate, blitz and simulated pressure boosts (log-odds). The rush is rated
     * by its best four, so a blitz adds pressure through blitzPressure: about 9 points more pressure on a
     * blitz than on a four-man rush, near the NFL's gap (C-16).
     */
    pressureBase: 0.3,
    blitzPressure: 0.3,
    simPressure: 0.2,
    sackGivenPressure: 0.2,
    scrambleGivenPressure: 0.08,
    scrambleTendency: 0.12,
    throwAwayGivenPressure: 0.06,
    throwAwayTrait: 0.07,
    groundingGivenThrowAway: 0.05,
    /** Completion by depth (short, intermediate, deep, screen), and the pressure penalty (log-odds). */
    completion: { short: 0.7763, intermediate: 0.6241, deep: 0.3981, screen: 0.8743 },
    pressureCompletion: -0.75,
    dropShare: 0.075,
    /** Interceptions per attempt by depth, and log-odds shifts. */
    interception: { short: 0.0136, intermediate: 0.0232, deep: 0.042, screen: 0.0032 },
    interceptionPressure: 0.45,
    interceptionAggressive: 0.25,
    /** Air yards: short mean above 1, intermediate span, deep mean past 20. */
    airShortMean: 4.2,
    airDeepMean: 11,
    screenAir: [-3, 1],
    /** Yards after catch means by depth, and the broken-tackle chance and extra yards. */
    yac: { short: 3.9, intermediate: 2.55, deep: 3.9, screen: 5.2 },
    brokenTackle: 0.065,
    brokenTackleYards: 11,
    /** Runs: stuff rate, stuff depth, gain shape and mean, breakaway chance and extra yards. */
    stuff: 0.17,
    stuffYards: 3,
    runGainMean: 4.62,
    runGainShape: 1.6,
    breakaway: 0.06,
    breakawayYards: 14,
    /** Yards of mean gain per rating point of run block edge. */
    blockYardsPerPoint: 0.06,
    /** Fumbles per carry and per catch, share lost, and rain or snow log-odds. */
    fumbleCarry: 0.016,
    fumbleCatch: 0.007,
    fumbleLost: 0.5,
    fumbleWet: 0.35,
    /** Scrambles and designed quarterback runs. */
    scrambleMean: 6.5,
    /** Shares of runs and catches that end out of bounds. */
    outOfBoundsRun: 0.12,
    outOfBoundsCatch: 0.25,
    /** Fourth downs: go rates by yards to go (1, 2, 3 to 5, 6 or more) in plus territory, and at midfield. */
    goRate: [0.95, 0.75, 0.36, 0.08],
    goRateOwnHalf: [0.42, 0.2, 0.055, 0.007],
    /** Two-point tries: base rate of touchdowns and success rate. */
    twoPointBase: 0.04,
    twoPointSuccess: 0.48,
    /**
     * Field goals: log-odds at 25 yards, per yard out to fgKnee, per yard beyond it (long tries fall off
     * more slowly: the kickers who try them have the legs), the longest try, and weather.
     */
    fgLogit25: 4.2,
    fgPerYard: -0.155,
    fgKnee: 45,
    fgPerYardLong: -0.04,
    fgMaxDistance: 62,
    fgCold: -0.25,
    fgWet: -0.35,
    fgWindPerMph: -0.06,
    fgAltitude: 0.35,
    /** Kickoffs: shares of returnable kicks, touchbacks, and short kicks; landing depth; return yards. */
    kickoffReturnable: 0.78,
    kickoffShort: 0.015,
    kickoffLandingRollTouchback: 0.03,
    kickoffLanding: [0, 10],
    kickReturnMean: 24,
    kickReturnSd: 7,
    returnTouchdown: 0.007,
    onsideRecovery: 0.12,
    /** Punts: gross mean and spread, fair catches, returns, and return yards. */
    puntMean: 52.2,
    puntSd: 6,
    puntFairCatch: 0.28,
    puntReturned: 0.44,
    puntReturnMean: 7.5,
    puntBlocked: 0.004,
    /** Penalties per play (offense or defense snap), before discipline, crowd, and slider multipliers. */
    // prettier-ignore
    penaltyRates: {
      falseStart: 0.0194, delayOfGame: 0.0049, illegalFormation: 0.0065, offensiveHoldingRun: 0.0179,
      offensiveHoldingPass: 0.0259, offensivePassInterference: 0.0065, offside: 0.013, defensiveHolding: 0.0114,
      illegalContact: 0.0049, defensivePassInterference: 0.021, roughingThePasser: 0.0145, unnecessaryRoughness: 0.0095,
      facemask: 0.0056, illegalUseOfHands: 0.0065, unsportsmanlikeConduct: 0.0024, illegalBlockInBack: 0.06,
      kickCatchInterference: 0.0049, runningIntoKicker: 0.0065
    },
    /** Discipline multipliers by penalty trait, and the crowd's effect on visiting false starts. */
    discipline: { disciplined: 0.75, normal: 1, undisciplined: 1.45 },
    crowdFalseStart: 0.6,
    /** In-game injuries per involvement, and the severity mix (minor, 1-2 weeks, 3-6 weeks, season). */
    injuryRate: 0.009,
    injurySeverity: [0.4, 0.33, 0.17, 0.1],
    /** Fatigue: energy spent per snap by position group, recovery per snap off the field, the energy
     * where ratings start to suffer, rating points lost per energy point, and substitution thresholds. */
    fatigue: { QB: 0.5, RB: 2.6, WR: 1.4, TE: 1.7, OL: 0.9, DL: 3.1, LB: 2.1, DB: 1.5, ST: 0.3 },
    /** A snap costs (staminaBase - stamina / 100) times the group's fatigue. */
    staminaBase: 1.5,
    recovery: 3.5,
    tiredAt: 85,
    tiredPoints: 0.15,
    subAt: { QB: 20, RB: 62, WR: 52, TE: 58, OL: 35, DL: 68, LB: 58, DB: 52, ST: 10 },
    /** Game-day actives (spec 12.1): defensive groups dressed at least, for a rotating line and dime with backups. */
    dressDefense: { DL: 6, LB: 4, DB: 8 },
    /** Home field (spec 17.3): rating points for the home team from the crowd, travel per time zone, and
     * rest; the combined effect is about 1.5 to 2.5 points a game. */
    homeCrowd: 0.65,
    travelPerZone: 0.2,
    shortWeek: 0.6,
    afterBye: 0.4,
    /** Days between games that count as a short week, and as rest after a bye. */
    shortWeekDays: 5,
    byeWeekDays: 13,
    /** Division games: the visitors know the building and the opponent, which trims the home edge. */
    divisionFamiliarity: 0.3,
    /** A team traveling east for a kickoff before this hour on its body clock loses earlyEastbound points. */
    earlyEastbound: 0.4,
    earlyBodyClockHour: 11,
    /** Dome and retractable-roof teams lose domeCold points playing outdoors below domeColdF (spec 17.2). */
    domeCold: 0.5,
    domeColdF: 40,
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
      /** The red zone: inside the opponent's 20 (spec 9.2 red zone trips). */
      redZoneYards: 20,
      /** Deep shots need this much field in front of the offense. */
      deepShotRoom: 20,
      /** A standard pass rush brings four; blitzes bring blitzRushers. */
      baseRushers: 4,
      /** Third and this many or fewer is short yardage; this many or more is long. */
      shortYardage: 4,
      longYardage: 7,
      goalLineHeavy: 2.5,
      passingDownHeavy: 0.5,
      /** Defensive package weights (base, nickel, dime) by the offense's wide receivers (1 to 4). */
      // prettier-ignore
      packageByReceivers: { 1: [3, 0.5, 0.1], 2: [1.8, 0.8, 0.3], 3: [0.35, 1.35, 1.4], 4: [0.1, 1.2, 2.2] },
      lateTrailingSeconds: 420,
      lateTrailingPass: 0.82,
      leadingRunShift: 0.62,
      /**
       * Protecting a lead (spec 8.6 conservatism when leading): from leads past protectFrom points, full at
       * protectFrom + protectRamp; protectEarly of the effect at the start of the second half, all of it by
       * the end. At full strength the offense cuts its pass rate by protectPassCut and lets the play clock
       * run, and the defense plays soft: short passes gain softShortLogit, deep ones lose softDeepLogit,
       * yards after the catch shrink by softYac, and a lighter rush loses softPressureLogit.
       */
      protectFrom: 5,
      protectRamp: 12,
      protectEarly: 0.6,
      protectPassCut: 0.4,
      softShortLogit: 1.2,
      softDeepLogit: 0.3,
      softYac: 0.1,
      softPressureLogit: 1.5,
      /** In the last preventSeconds, a lead of any size is protected at least this hard. */
      preventSeconds: 300,
      preventLate: 1,
      /**
       * Chasing a deficit (game script, spec 8.6): from deficits past chaseFrom points, full at chaseFrom +
       * chaseRamp; chaseEarly of the effect at the start of the second quarter, all of it by the end of the
       * game. At full strength the offense closes chaseShift of the gap between its pass rate and always
       * passing.
       */
      chaseFrom: 3,
      chaseRamp: 14,
      chaseEarly: 0.3,
      chaseShift: 0.25,
      twoMinutePass: 0.8,
      goalLinePass: 0.72,
      wetPassShift: 0.9,
      windyMph: 15,
      windyPassShift: 0.95,
      deepLateBoost: 1.35,
      deepShortYardage: 0.5,
      screenThirdLong: 0.5,
      /**
       * Game plan effects (spec 8.7, 12.3). At full rotation the defensive line subs out lineRotationSpread / 2
       * energy sooner, and that much later when it rides its starters. A featured player's target share grows
       * by featureTargets, and a featured back's share of the backfield by featureCarries. A doubled receiver
       * loses doubleSeparation points of separation and every other receiver gains doubleOthers; a chipped
       * pass rusher loses chipRush points and the chipping backs lose chipRoute. A spy costs the rush
       * spyPressure (logit) and cuts scrambles to spyScramble of their rate.
       */
      lineRotationSpread: 20,
      /**
       * Rotation plans (spec 12.3): snap limits apply once a unit has played snapLimitFrom snaps; a
       * pass-rush specialist comes in on second and passRushDown.second or more, and on third or fourth and
       * passRushDown.third or more.
       */
      snapLimitFrom: 10,
      passRushDown: { second: 9, third: 5 },
      featureTargets: 0.1,
      featureCarries: 0.1,
      doubleSeparation: 10,
      doubleOthers: 1.5,
      chipRush: 4,
      chipRoute: 3,
      spyPressure: 0.12,
      spyScramble: 0.6,
      /**
       * Throwing to the sticks: on third and fourth down from sticksFrom yards to go, the intermediate share
       * grows by up to sticksShift, all of it by sticksFrom + sticksRamp - 1 yards.
       */
      sticksFrom: 5,
      sticksRamp: 5,
      sticksShift: 0.25,
      blitzThirdDown: 1.05,
      hurrySeconds: 240,
      hurryHalfSeconds: 120,
      milkSeconds: 480,
      // Decisions
      desperationSeconds: 240,
      /** More than one score behind with desperationYards or less to go, a trailing team goes for it. */
      desperationYards: 5,
      endHalfFgSeconds: 30,
      /** End of a half: with the clock stopped and this little time left, an offense in range kicks now;
       * with it running and no timeouts, it spikes the ball inside spikeSeconds to set up the kick. */
      fgNowSeconds: 18,
      spikeSeconds: 25,
      leadingGoFactor: 0.6,
      /** Fourth-down go rates scale from goAggressionBase for the most timid coach, plus goAggressionSpread
       * at aggressiveness 100. */
      goAggressionBase: 0.6,
      goAggressionSpread: 0.8,
      /** Fourth and goal from inside goalLineGoYards: coaches go for it at least goalLineGo of the time. */
      goalLineGo: 0.45,
      goalLineGoYards: 2,
      /** Field goal tries up to this distance are routine; longer ones fade by fgFadePerYard, helped by a
       * strong leg (fgPowerShare per rating point of kick power). */
      fgRoutine: 52,
      fgFadePerYard: 0.08,
      fgPowerShare: 0.02,
      fgLongTry: [0.05, 0.95],
      /** A field goal's distance adds the 10-yard end zone and the 7-yard hold to the line of scrimmage. */
      fgSnapYards: 17,
      fgHoldYards: 7,
      rangePerPoint: 0.15,
      altitudeRange: 4,
      /** Wind this strong takes windRangeLoss yards off a kicker's range. */
      windRangeMph: 20,
      windRangeLoss: 5,
      kneelHalfSeconds: 40,
      timeoutHalfSeconds: 90,
      timeoutHalfFromBall: 35,
      timeoutGameSeconds: 150,
      defenseTimeoutSeconds: 180,
      /** A defense behind by this much or less (or tied) spends its timeouts late to get the ball back. */
      defenseTimeoutMaxDeficit: 16,
      /** Leads after a late touchdown (before the try) where coaches go for two. */
      goForTwoLate: [-2, -5, -10, 1, 5, -9, -12, -16],
      twoPointPerPoint: 0.01,
      /** Two-point success moves by this much log-odds per yard the try is snapped beyond the 2, within
       * twoPointRange. */
      twoPointPerYard: -0.1,
      twoPointRange: [0.2, 0.8],
      /** Extra points are held a yard deeper than field goals: the try from the 15 is a 33-yard kick. */
      xpExtraYards: 1,
      defensiveTry: 0.01,
      /** Fake punts and field goals: a chance on fourth down with fakeMaxDistance or less to go (scaled by
       * the coach's aggressiveness), how often they convert, and the mean extra yards. */
      fakePunt: 0.02,
      fakeFieldGoal: 0.012,
      fakeMaxDistance: 5,
      fakeSuccess: 0.55,
      fakeExtraYards: 4,
      /** Share of goal-line snaps against heavy personnel where the defense brings its goal-line package. */
      goalLinePackage: 0.8,
      /** Share of non-sack pressures that hit the quarterback (sacks always count as hits). */
      hitShare: 0.35,
      /** Share of tackles two defenders share, each credited with an assist (spec 9.2). */
      assistShare: 0.21,
      /** Stat definitions (spec 9.2): runs of 10+ yards and completions of 20+. */
      bigRun: 10,
      bigPlay: 20,
      /** Yards before first contact on a run average contactYards, plus contactPerPoint per point of net
       * blocking edge; the rest are yards after contact. */
      contactYards: 2.4,
      contactPerPoint: 0.05,
      /** A blocker wins his run block this often at an even matchup (spec 9.2 run block win rate). */
      runBlockWin: 0.7,
      /** Runs of pancakeYards or more credit a winning blocker with a pancake pancakeShare of the time. */
      pancakeYards: 6,
      pancakeShare: 0.25,
      /** Share of ejection-eligible fouls flagrant enough to eject the player (spec 16). */
      ejectionShare: 0.03,
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
      creditSpread: 21,
      /** Rating points of tackle edge that multiply a pursuer's share of tackles by e. */
      tackleSpread: 18,
      sackYards: [4, 9],
      sackSpread: 1,
      stripSack: 0.15,
      stripLost: 0.55,
      scrambleMin: 3,
      scrambleBurst: 0.08,
      scrambleFloor: -1,
      scrambleSpread: 2,
      scrambleOutOfBounds: 0.35,
      minTargetShare: 0.005,
      uncovered: 12,
      /** Backs run checkdowns into open space: rating points of separation on their routes. */
      backfieldSeparation: 18,
      /** A pressured quarterback favors his backs by this factor when choosing a target. */
      checkdownFavor: 2.6,
      pressWeight: 0.05,
      playActionSeparation: 2.5,
      blitzSeparation: 2.5,
      cohesionSeparation: 20,
      /** How much target choice follows separation, per rating point. */
      openness: 0.03,
      // prettier-ignore
      deepFavor: { X: 2, Z: 2, SLOT: 0.7, EXTRA: 0.8, TE1: 0.5, TE2: 0.3, RB1: 0.1, RB2: 0.1, FB: 0.05 },
      // prettier-ignore
      screenFavor: { X: 0.8, Z: 0.6, SLOT: 1.3, EXTRA: 0.6, TE1: 0.6, TE2: 0.3, RB1: 3, RB2: 3, FB: 0.5 },
      poiseWeight: 0.4,
      calmMph: 10,
      /** Wind's effect on completions by pass depth, relative to intermediate throws. */
      windDepth: { screen: 0.3, short: 0.7, intermediate: 1, deep: 1.5 },
      playsBallLogit: 0.1,
      intSeparation: 0.02,
      contestedSep: -3,
      handsWeight: 0.02,
      playActionLogit: 0.15,
      /** Share of play-action passes thrown on a bootleg, outside the pocket: more in offenses that run
       * outside zone, whose action the boot comes off. */
      bootlegShare: 0.2,
      bootlegPerOutsideZone: 0.6,
      /** Inside the 20 the field compresses: harder completions, and more stuffed runs inside
       * goalLineStuffYards. */
      redZoneCompletion: -1.3,
      goalLineStuff: 1.2,
      goalLineStuffYards: 5,
      dropsTrait: 2.5,
      wetDrops: 1.5,
      breakupShare: 0.35,
      /** Air yards where intermediate and deep throws begin. */
      airBands: { intermediate: 10, deep: 20 },
      yacFloor: 1,
      yacPerPoint: 0.025,
      yacTrait: 1.12,
      openFieldYards: 8,
      stripsLogit: 0.35,
      intReturnMean: 7,
      /**
       * Turnover returns: this share breaks free for a long return with this mean (pick-sixes and scoop and
       * scores); other fumble recoveries go a few yards.
       */
      returnBreakaway: 0.14,
      returnBreakawayMean: 55,
      fumbleReturnMean: 3,
      // Running
      leadWeight: 0.5,
      teBlockWeight: 0.6,
      safetyBoxWeight: 0.5,
      /** Rating points of run blocking edge for each defensive back replacing a box defender. */
      lightBoxPoints: 0.58,
      penetrationLogit: 0.4,
      runMeanFloor: 1.5,
      carrierYardsPerPoint: 0.05,
      efficiencyYards: 3,
      breakawayStart: 6,
      /** Outside runs break away a little more often, and reach the open field once they gain edgeYards. */
      outsideBreakaway: 0.2,
      edgeYards: 6,
      /** Zone runs gaining this little met contact at the line (situation profiles). */
      contactAtLineYards: 2,
      /** Outside runs go out of bounds more often than inside runs. */
      outOfBoundsInside: 0.5,
      outOfBoundsOutside: 1.6,
      /** Artificial turf is a little faster (rating points of burst and elusiveness) and a little riskier. */
      turfSpeed: 1.5,
      turfInjury: 1.08,
      coversBall: { never: 0.55, onBigHits: 0, onMediumHits: -0.15, forAllHits: -0.3, always: -0.45 },
      // Kicking
      longKick: 40,
      coldF: 35,
      puntWind: 0.5,
      puntPerPoint: 0.25,
      puntAltitude: 3,
      blockedPuntLoss: 8,
      /** Punts landing inside this yard line aren't returned. */
      puntDownedInside: 10,
      /** With room to spare, punters aim for the receiving team's puntAim yard line with an error of
       * puntAimSd yards, tightened by puntAimPerPoint per point of accuracy edge. */
      puntAim: 12,
      puntAimSd: 9,
      puntAimPerPoint: 0.02,
      puntReturnFloor: 2,
      /** A block in the back on a return can't cost more than this many yards behind the catch. */
      returnFoulFloor: 5,
      returnPerPoint: 0.25,
      returnTdPunt: 0.004,
      kickoffPowerShift: 0.004,
      kickoffSliderShift: 0.3,
      freeKickLanding: 45,
      /** Free kicks after a safety are returned for this share of a kickoff return. */
      freeKickReturnShare: 0.5,
      // Penalties and injuries
      cohesionPenalty: 15,
      linemenExposed: 2,
      /** Injury risk: (injuryProne - injury / 99) x (toughnessBase - toughness / toughnessScale), rising
       * as energy falls below injuryTiredBelow. */
      injuryProne: 1.6,
      toughnessBase: 1.3,
      toughnessScale: 200,
      injuryTiredBelow: 70,
      injuryWeeks: { minor: [0, 0], short: [1, 2], medium: [3, 6], season: [8, 17] },
      minorOutPlays: [4, 20]
    },
    /** The game clock (spec 8.3 step 8): seconds for plays and between snaps, and limits. */
    clock: {
      twoMinute: 120,
      fiveMinutes: 300,
      playSeconds: [5, 8],
      /** Seconds between snaps: normal and hurry-up; a team running the clock snaps with playClockMargin
       * seconds left on the play clock (rule set), and one hurrying to spike takes spikeRunoff. */
      runoff: { normal: 31, hurry: 13 },
      playClockMargin: 1,
      spikeRunoff: 7,
      spikePlaySeconds: 1,
      tempoSpread: 14,
      clockWaste: 6,
      kneelPlaySeconds: 2,
      kickSeconds: 5,
      returnSeconds: 6,
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
    /** Domes and closed roofs: dry ball, still air, and a fast track (spec 17.2). */
    indoorPassLogit: 0.15,
    windPassLogitPerMph: -0.03
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
