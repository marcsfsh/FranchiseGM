/**
 * Tunable numbers for the simulation, AI, economy, and player development.
 *
 * Every constant cites the spec section it tunes. League rules (roster sizes, cap figures, penalty
 * yardage) live in the rule set (spec 16), not here. Calibration runs (spec 23) change these values,
 * and each change is logged in docs/CALIBRATION.md.
 */
import type { PositionGroup } from './model/positions';
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

  /**
   * How players go about a deal (spec 11.6, 11.7), hidden, drawn at generation as [mean, sd] on 0 to 100: how
   * hard his agent bargains, and how much he values money paid up front. How front offices misread him is
   * drawn evenly from 0 to 100 (D-63).
   */
  dealStyle: {
    agent: [50, 22] as readonly [number, number],
    upFront: [45, 25] as readonly [number, number]
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
   * Morale and the locker room (spec 10.9; D-51), in morale points a game week. Morale moves `drift` of the
   * way to `baseline`, then a win or a loss moves it `result`; a player who'd start on ratings (`benchedBy`
   * or more over his group's weakest starter) but doesn't loses `benched`, and a starter gains `starting`;
   * a player past his rookie deal paid under `underpaid` of his market value loses `pay`. A starter's own
   * game moves it `performance` when its game score is `standout` standard deviations or more over or under
   * the mean of the week's starters at his position. Competitiveness scales the result and the game, ego
   * the bench, and greed the pay, from `traitScale[0]` (0) to `traitScale[1]` (100). Each leader
   * (leadership `leaderAt` or more with `leaderSeasons` credited seasons) lifts his teammates `leader`, and
   * each disruptive player (morale under `disruptiveBelow`, ego and volatility averaging `disruptiveAt` or
   * more) costs them `disruptive`, counting `voices` of each at most. Releasing a leader who's been with the
   * team `popularSeasons` costs his teammates `releaseLeader` at once, and a lowball offer to him in talks
   * `lowballLeader`. A new league year moves every morale `offseasonReset` of the way back to the baseline.
   * In games, a roster's average morale `moraleSpan` over or under the baseline is worth `moralePoints` of
   * cohesion on both sides of the ball, and a unit's time together (its starters' average league years with
   * the team, `chemistryTypical` for none, `chemistrySpan` more or less for all) `chemistryPoints`: the
   * offensive line's on offense, the secondary's on defense.
   */
  lockerRoom: {
    baseline: 70,
    drift: 0.1,
    result: 1.5,
    benched: 2,
    benchedBy: 3,
    starting: 0.3,
    pay: 1,
    underpaid: 0.75,
    performance: 1.5,
    standout: 1.28,
    traitScale: [0.5, 1.5] as readonly [number, number],
    leaderAt: 75,
    leaderSeasons: 4,
    leader: 0.3,
    disruptiveBelow: 40,
    disruptiveAt: 65,
    disruptive: 0.4,
    voices: 3,
    popularSeasons: 3,
    releaseLeader: 3,
    lowballLeader: 2,
    offseasonReset: 0.5,
    /** The user learns a player's character after this many game weeks on the user's team. */
    revealWeek: 9,
    moraleSpan: 15,
    moralePoints: 1.2,
    chemistryTypical: 2.5,
    chemistrySpan: 2.5,
    chemistryPoints: 0.8
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
    /**
     * Top of each position's market as a share of the cap. A quarterback's is the record against the cap it
     * was signed under, since deals are priced when signed: Dak Prescott's $60M, 23.5% of the 2024 cap of
     * $255.4M (D-65).
     */
    topShare: {
      QB: 0.235,
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
    /**
     * Overall where a player earns half the top of the market, and how quickly pay rises around it. Set so
     * that chained leagues' teams spend near the cap, as NFL teams do, paying players about their market
     * value (D-60, D-65).
     */
    midOverall: 79.75,
    midOverallQb: 76.75,
    width: 4.5,
    /** Pay falls by this share for each year past the position's prime. */
    ageDiscountPerYear: 0.08,
    /** Spread of individual deals around the market value (log scale). */
    noise: 0.15,
    /** No deal exceeds the top of its position's market by more than this share. */
    topOverage: 0.08,
    /** Salaries are quoted in steps of this many dollars. */
    quoteStep: 5000,
    /**
     * Teams with room pay more, as NFL teams with cap space do (D-60, D-65): the most the AI pays for a deal
     * is its value of it times 1 plus `perShare` for each share of the cap its room runs past `from`, at most
     * `most` times it, and in free agency it wants players up to `depthPoints` overall under its weakest
     * starter for each 1 of it past 1.
     */
    roomPremium: { from: 0.04, perShare: 3, most: 1.6, depthPoints: 10 }
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
    /**
     * Void years the AI adds to its offers to spread the signing bonus, up to the proration limit (D-60):
     * NFL clubs add them to big deals, and the bonus left when a deal runs out is dead money.
     */
    voidYears: [
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
    udfaBonus: [0, 25_000],
    /**
     * Free agents' simple acceptance (M8; the full decision model is M12's). A free agent asks for his
     * market value (spec 11.6) times `offseasonDemand` in the offseason, `inSeasonDemand` in the first week
     * of the regular season, falling in a straight line to `lateSeasonDemand` by its last week and in the
     * playoffs, as the unsigned lower their price; never less than his minimum salary. He signs for up to
     * `maxYears` when the offer's yearly value (salary plus the bonus spread over the years) reaches it.
     */
    acceptance: { offseasonDemand: 1, inSeasonDemand: 0.6, lateSeasonDemand: 0.3, maxYears: 5 },
    /**
     * The player decision model (spec 11.7; D-52, D-64). An offer's worth to a player is counted in his
     * market value. Its money is its yearly value (salary, the signing bonus spread over the years, the
     * per-game roster bonus he expects to earn, and a performance incentive at the odds he gives himself)
     * over his market value, with premiums on top: a guaranteed dollar (the bonus and fully guaranteed salary)
     * is worth `guarantee` more, up to `guaranteeAge` times that more by his need for security (none at
     * `securityFrom` years old, all by `securityFull`) and `guaranteeInjury` times more by his injury risk;
     * a bonus dollar `upFront` more at his taste for money up front. His injury risk runs from 0 at an
     * injury rating of `injury.durable` to 1 at `injury.fragile`, `injury.hurtNow` more while he's hurt. He
     * wants a deal of `length.rising` years while rising (through `length.risingThrough` years old, with
     * `length.risingBy` points of potential still to reach), every year he can get from `length.securityFrom`
     * years old or at an injury risk of `length.fragileAt`, and `length.prime` otherwise, and loses
     * `length.miss` for each year off it. He counts on `active` [backup, rotation, starter] of a per-game
     * bonus by his role, less `active.injury` times his injury risk; an incentive's odds follow his pace
     * against its mark on a logistic `incentive.spread` wide, or `incentive.unknown` before any games. On
     * top, as shares of his market value, up to: `contender` for the strongest team over the middle one
     * (weighted by competitiveness, and `ringPerYear` more for each year of age past `ringFrom`), `role` for a
     * starting job over a rotation spot (weighted by ego; a backup's loses as much), `home` for a team in
     * his home state, `loyalty` for his own team at loyalty 100, and `fit` for his best role at the fit cap.
     * He takes the offer worth most once it's worth his demand: `demand` [greed 0, greed 100] of his market
     * value, times the date's share, falling `softening` a week of free agency. The demand counts what a
     * typical deal's structure, role, and loyalty add on top of its money, so the money a deal settles for
     * centers on his market value (D-60, D-65).
     */
    decision: {
      securityFrom: 26,
      securityFull: 32,
      guarantee: 0.1,
      guaranteeAge: 1,
      guaranteeInjury: 1,
      upFront: 0.15,
      injury: { durable: 85, fragile: 65, hurtNow: 0.3 },
      length: {
        rising: 2,
        risingThrough: 26,
        risingBy: 4,
        prime: 4,
        securityFrom: 30,
        fragileAt: 0.6,
        miss: 0.015
      },
      active: { backup: 0.55, rotation: 0.8, starter: 0.92, injury: 0.3 },
      incentive: { spread: 0.15, unknown: 0.25 },
      contender: 0.12,
      ringFrom: 28,
      ringPerYear: 0.1,
      role: 0.1,
      home: 0.05,
      loyalty: 0.1,
      fit: 0.05,
      demand: [1.2, 1.4] as readonly [number, number],
      softening: 0.05,
      /** Starters by position group, for his projected role; specialists count within their position. */
      starters: { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, ST: 1 } as Record<
        PositionGroup,
        number
      >
    },
    /**
     * Negotiation (spec 11.6; D-54). A player's agent opens over his demand by `opening` [agent 0, agent
     * 100] of it, by how hard he bargains, and in talks comes down evenly with each offer he turns down,
     * until his patience runs out after `patience` [volatility 100, volatility 0] of them and he breaks off
     * talks until the calendar advances. A team's front office expects him to sign for a range of salaries
     * `estimate` [GM negotiation 0, 100] of its read of him wide, the least he'd take sitting `within` [read
     * 0, read 100] of the way up it by how front offices misread him. A team's GM settles at once, as far
     * under the opening as his negotiation rating reaches. An offer worth less than `lowball` of
     * his demand costs his interest in the team `lowballInterest` of his market value for the league year,
     * and `lowballMorale` morale. A take-it-or-leave-it offer is taken when it's worth his demand plus his
     * greed's share of the rest of his ask. A counter names guaranteed money or a longer deal as what matters
     * most when more of it could add `matters` of his market value to the offer's worth, and money each year
     * otherwise.
     */
    negotiation: {
      opening: [0.03, 0.15] as readonly [number, number],
      estimate: [0.3, 0.08] as readonly [number, number],
      within: [0.2, 0.8] as readonly [number, number],
      patience: [2, 5] as readonly [number, number],
      lowball: 0.85,
      lowballInterest: 0.03,
      lowballMorale: 5,
      matters: 0.02
    }
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
   * `blowout` margin (a `close` margin or less reads as a close game); playoff games multiply by playoffStakes and the Super Bowl by superBowlStakes. A big
   * game scores `performance` times how far past its mark (bigGame) it went; a season milestone scores
   * `milestone` times its rank among the stat's marks; an injury scores `injury` per week out, up to
   * injuryWeeksCap, and seasonEnding more for the season, for players rated injuryFrom or more; a signing
   * of a player rated signingFrom or more scores `transaction`; a player of the week scores `award`.
   * Players add perOverall per overall point above prominentFrom. The feed keeps perWeek items a week,
   * and a team sees a template once in templateWeeks weeks.
   */
  news: {
    result: 3, tie: 6, upsetGap: 2, perUpsetPoint: 3, overtime: 3, blowout: 21, blowoutBonus: 1, close: 3,
    playoffStakes: 3, superBowlStakes: 6, performance: 6, milestone: 4, injury: 1, injuryWeeksCap: 6,
    seasonEnding: 3, injuryFrom: 72, signingFrom: 68, freeAgentFrom: 78, transaction: 1, award: 4, prominentFrom: 70, perOverall: 0.3,
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

  /**
   * Game plans and rotations (spec 8.7, 12.3): the limits the user and the AI plan within. Plan dials add
   * to the scheme's rates (blitz multiplies them); rotation shares are of a unit's snaps.
   */
  gamePlan: {
    limits: {
      passLean: [-0.15, 0.15],
      /** A situation's lean on top of the overall balance (spec 8.7). */
      situation: [-0.15, 0.15],
      blitz: [0.5, 1.5],
      man: [-0.3, 0.3],
      press: [-0.3, 0.3],
      nickel: [-0.2, 0.2],
      spread: [-0.3, 0.3],
      twoHigh: [-0.3, 0.3],
      rb1Share: [0.35, 0.9],
      lineRotation: [0, 1],
      snapLimit: [0.3, 1],
      devSnaps: [0, 0.5]
    }
  } as const,

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
      /** Stakes shade the choice from this floor up; they never veto it. */
      stakesFloor: 0.5,
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
     * spreadShare. Each dial's options are scored by how close they sit to the ideal (1 on it, 0 exploitSpan
     * of the dial away), and by how close to the scheme's normal (1 on it, comfortFloor comfortSpan of the dial
     * away; weight: the head coach's rigidity out of 100).
     */
    plan: {
      exploitSpan: 0.5,
      comfortFloor: 0.3,
      comfortSpan: 1,
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
      /** Free agents tried per signing when the first choices want more than the cap allows. */
      signingTries: 4,
      /** A waiver claim for a player this many points better than the team's weakest at his position. */
      claimMargin: 5,
      /** The practice squad refills with free agents this age or younger (spec 12.1). */
      practiceSquadAge: 25,
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
  /**
   * Progression and regression (spec 10.5). Each rating belongs to a class with its own age curve, in rating
   * points a year by years from the position group's curve peak (`peakAge`): growth of `growth` that fades
   * past `growthEnd`, and decline of up to `decline` that builds past `declineStart`, both through a
   * logistic of width `curveWidth`. Speed fades first, the mind keeps growing longest.
   */
  progression: {
    /** Each position group's curve peak; the aging calibration (spec 23.3) sets them. */
    peakAge: { QB: 27, RB: 25, WR: 26, TE: 26, OL: 27, DL: 27, LB: 26, DB: 26, ST: 30 },
    curves: {
      speed: { growth: 2, growthEnd: -3, decline: 3, declineStart: 2.5 },
      body: { growth: 2.5, growthEnd: -2, decline: 2.5, declineStart: 4 },
      mind: { growth: 3.5, growthEnd: 1, decline: 1.5, declineStart: 7 },
      skill: { growth: 3, growthEnd: -1, decline: 2, declineStart: 5 },
      kick: { growth: 1.5, growthEnd: 0, decline: 2, declineStart: 7 }
    },
    curveWidth: 1.2,
    /** Ratings by class; every rating not listed is a skill. */
    classes: {
      speed: ['spd', 'acc', 'agi', 'cod', 'jmp', 'ret'],
      body: ['str', 'sta', 'tgh', 'inj', 'thp'],
      mind: ['awr', 'prc'],
      kick: ['kpw', 'kac', 'lsp']
    },
    /** The share of a year's change that comes at training camp; the rest comes week by week in season. */
    campShare: 0.75,
    /** Random spread per rating at camp, in points (weekly steps scale it by their share). */
    noise: 1,
    /** Growth scales with the room left to potential: full at this many points, within these bounds. */
    potentialRoom: 12,
    potentialBounds: [0, 1.5],
    /**
     * Development variance (spec 10.3): a young player's potential drifts at each of his first `camps`
     * training camps after his draft, by draws that add up to sd `sd` points over them. The draft class
     * settings scale it by position group; with the scouts' misjudgment, it makes busts and gems.
     */
    potentialDrift: { sd: 3, camps: 4 },
    /** Development traits (spec 10.6) speed growth and slow decline. */
    devGrowth: { Normal: 1, Star: 1.25, Superstar: 1.5, 'X-Factor': 1.75 },
    devDecline: { Normal: 1, Star: 0.92, Superstar: 0.86, 'X-Factor': 0.8 },
    /** Playing time: growth x (base + span x share of a full game's snaps), a season's worth at camp. */
    snapBase: 0.85,
    snapSpan: 0.3,
    fullGameSnaps: 60,
    /** Coaching: growth x (1 + coaching x (the position coach's and coordinator's development - 50) / 50). */
    coaching: 0.15,
    /** Scheme fit: growth x (1 + fit x role fit / the fit cap), at camp. */
    fit: 0.1,
    /** Work ethic: growth x (1 + workEthic x (w - 50) / 50); decline x (1 - workEthicDecline x (w - 50) / 50). */
    workEthic: 0.2,
    workEthicDecline: 0.1,
    /** An injury: growth x (1 - injury x the share of `injuryWeeks` he is out). */
    injury: 0.5,
    injuryWeeks: 8,
    /** Free agents train on their own: growth x this. */
    unsignedGrowth: 0.5,
    /**
     * Mentors (spec 10.9): a player with `mentorYoung` credited seasons or fewer grows x (1 + mentor x
     * (leadership - 50) / 50) from his team's best mentor at his position group, a teammate with
     * `mentorSeasons` credited seasons and leadership over 50.
     */
    mentor: 0.15,
    mentorYoung: 2,
    mentorSeasons: 6,
    training: {
      /** A focus adds this share of growth to its ratings and costs the rest this share. */
      focusBonus: 1,
      focusCost: 0.1,
      /** A program does the same at camp, and slows its ratings' decline by this share. */
      programBonus: 0.3,
      programCost: 0.05,
      programDecline: 0.25,
      /** Auto: each unit's focus looks at its best this many players; players through this age with this much room get their own. */
      unitStarters: 11,
      individualAge: 24,
      individualRoom: 5,
      /** Auto programs: technique for a roster this young or younger on average, strength this old or older. */
      youngTeam: 25.5,
      oldTeam: 27.5
    }
  },
  /** The new league year (spec 11.1). */
  leagueYear: {
    /**
     * League revenue growth for the cap formula, drawn each year until M16 models revenue: mean and spread
     * around the NFL's recent cap growth (7% a year from 2014 to 2026, leaving out 2021).
     */
    revenueGrowth: [0.07, 0.025],
    /** Rounding for the cap, and for the salaries and weekly pay that grow with it. */
    capRound: 100_000,
    salaryRound: 5_000,
    weeklyRound: 50
  },
  /**
   * Retirement (spec 10.7): chance = sigmoid(logit), where the logit is (age - usual age) / spread plus the
   * terms below; younger players also retire by surprise at a small flat rate.
   */
  retirement: {
    /** Usual retirement age by position group, before the retirement-age setting. */
    age: { QB: 37, RB: 30.5, WR: 32.5, TE: 32.5, OL: 33.5, DL: 32.5, LB: 31.5, DB: 31.5, ST: 38 },
    ageSpread: 1.6,
    /** Per 10 overall points below his peak (his potential), a sign of decline. */
    decline: 0.8,
    /** A career-altering injury, or one that still has this many weeks to heal. */
    injury: 1,
    longInjuryWeeks: 8,
    /** No contract: nobody wants him. Under contract past this league year: he stays. */
    unsigned: 1.6,
    underContract: -0.6,
    /** Going out on top after a title. */
    champion: 0.5,
    /** At competitiveness 0 this much is added, at 100 subtracted (0 at 50). */
    competitiveness: 0.5,
    /** Players younger than this retire by surprise at this rate. */
    surpriseBefore: 30,
    surprise: 0.003
  },
  /**
   * Free agency's bidding (spec 11.8; D-53, D-65). As each week opens an AI team offers up to
   * `offersPerWeek` free agents who'd fill a hole at their group (`needPoints` of want for each open spot of
   * the standard roster) or start over its weakest player there by more than `upgradeBy`, keeping its draft
   * class's room and `buffer` of the cap free. It adds up to `premium` over his asking price for the ones it
   * wants most, in full at `premiumAt` points of want, and raises a standing offer he passed on by `raise`
   * while it's still worth it to the team. As a week ends a player holds out for better offers than his
   * demand by up to `hope` of it (weighted 0.5 to 1.5 by greed), all of it in the first week and none by the
   * last, so prices run highest as the market opens.
   */
  freeAgency: {
    offersPerWeek: 12,
    needPoints: 6,
    upgradeBy: 2,
    buffer: 0.02,
    premium: 0.1,
    premiumAt: 12,
    raise: 0.05,
    hope: 0.08
  },

  /** The AI's offseason roster work (D-27): contract lengths, room for undrafted rookies, and the cutdown. */
  offseason: {
    /** Contract years the AI offers by age (up to the age, years; older players sign for 1). */
    termByAge: [
      [26, 3],
      [29, 2]
    ],
    /** Undrafted rookies each team keeps cap room for through free agency. */
    udfaPerTeam: 8,
    /** In the cutdown, young players are kept for this share of the gap to their potential. */
    cutPotentialWeight: 0.5,
    cutYoungAge: 25,
    /**
     * A draft pick in his first `cutDraftSeasons` seasons is worth this many more points to keep, by round:
     * the team's investment in him (NFL teams keep nearly every pick from the first four rounds).
     */
    cutDraftBonus: [16, 14, 12, 10, 9, 8, 7],
    /** An undrafted rookie the team signed, in the same seasons. */
    cutUndraftedBonus: 6,
    cutDraftSeasons: 2
  },
  /**
   * Draft classes (spec 10.3, 22.4; D-41). `classSize` prospects (the spec's default) aged `classAge` at
   * their first season, with latent quality `classQuality` [mean, sd], moved by position group so each
   * group's league average holds over the seasons (spec 23.3, D-32). Each class draws a strength shift with
   * sd `strengthSd`, and each position group one with sd `groupStrengthSd`; a strength mean setting of 1
   * moves them `strengthMax`. Draft value blends `valuePotential` of a prospect's ceiling with his overall
   * now, plus his position's worth; the consensus misjudges it with sd `perceptionSd` points, and a bust
   * (`bustRate` of prospects) or a gem (`gemRate`) by a further `misjudgedBy` points. Generated names don't
   * repeat within `nameWindow` years (spec 10.1).
   */
  draft: {
    classSize: 450,
    classAge: [21, 23],
    classQuality: [-1.2, 0.8],
    classQualityByGroup: {
      QB: -0.8,
      RB: 0.6,
      WR: 0,
      TE: -0.3,
      OL: 0.2,
      DL: 0,
      LB: 0,
      DB: 0.2,
      ST: 0
    } as Record<PositionGroup, number>,
    strengthMax: 0.4,
    strengthSd: 0.12,
    groupStrengthSd: 0.2,
    valuePotential: 0.6,
    /**
     * A position's worth in the draft, in points of draft value: `positionWeight` times the log of its top
     * pay's share of the cap (market.topShare) over `positionReference`, so teams draft the positions they
     * pay for, quarterbacks and pass rushers first and specialists last. At 10, a first round holds about 3
     * quarterbacks and almost never a specialist, as the NFL's did from 2015 to 2024 (D-47).
     */
    positionWeight: 10,
    positionReference: 0.08,
    perceptionSd: 3,
    bustRate: 0.12,
    gemRate: 0.06,
    misjudgedBy: [5, 12],
    nameWindow: 20,
    /**
     * Scouting (spec 10.4; D-43): a team's own error on a grade, sd `teamSd` points before any scouting;
     * `fullPoints` points make a full workup, which cuts that error by `pointsCut` and sees through
     * `consensusCut` of the consensus misjudgment. A director of scouting rated 99 on accuracy shrinks the
     * error by `directorEffect` (one rated 1 grows it as much). A week brings a scout `scoutPoints` and the
     * director `directorPoints` [rated 0, rated 99]; a scout sent national earns `nationalShare` of his, for
     * any prospect. Teams on auto spend `spendEach` points at a time on their best-graded prospects and place
     * scouts by their top `placeFrom`; `traitsAt` points reveal a prospect's traits and `abilitiesAt` his
     * abilities.
     */
    /**
     * Workouts (spec 10.4; D-44): the combine invites `invites` prospects by the consensus view and pro days
     * take the next `proDays`. Each drill is `[a, b, sd]`: a + b x the rating it tests, with noise of sd `sd`
     * (b below 0 for the runs, where faster is lower), set so a typical wide receiver runs the 40 in about
     * 4.45 seconds and a typical lineman in about 5.25. Working out narrows the consensus misjudgment by
     * `reveal`, and the `headlines` biggest risers and fallers make the news.
     */
    workout: {
      invites: 330,
      proDays: 150,
      forty: [6.4, -0.0222, 0.04],
      bench: [-21.4, 0.59, 2],
      vertical: [8, 0.33, 1.5],
      broad: [60, 0.72, 3],
      cone: [9.67, -0.032, 0.08],
      shuttle: [5.78, -0.018, 0.06],
      reveal: { combine: 0.3, proDay: 0.15 },
      headlines: 3
    },
    /**
     * The AI's need-and-value model (spec 10.4; D-45): a team needs a position as its starters' average
     * overall falls below `goodStarter`, fully `span` points below it (a missing starter counts as
     * `missingStarter`), plus `shortBonus` when it has fewer players there than a standard roster; a
     * prospect's worth is its grade plus `weight` points of need.
     */
    needs: { goodStarter: 78, span: 20, missingStarter: 40, shortBonus: 0.2, weight: 4 },
    /**
     * The media's grades after the draft (spec 10.4; D-48). A class scores the chart value of the media's
     * board places of the players a team took over the chart value of the picks it used; the chart halves
     * every `halfEvery` picks. `letters` are [least score, letter], best first, set so a draft's 32 grades
     * spread about as the media's do: 2 A's, 3 A-'s, 6 B+'s, 8 B's, 6 B-'s, 4 C+'s, 2 C's, and a D. A pick is
     * value when the player's board place is at most `valueShare` of the pick's number and `valueBy` or more
     * ahead of it, and a reach when it's at least `reachShare` of the number and `reachBy` or more behind.
     */
    grades: {
      halfEvery: 24,
      letters: [
        [1.6, 'A'],
        [1.36, 'A-'],
        [1.12, 'B+'],
        [0.88, 'B'],
        [0.72, 'B-'],
        [0.51, 'C+'],
        [0.32, 'C'],
        [0, 'D']
      ] as readonly (readonly [number, string])[],
      valueShare: 0.7,
      valueBy: 5,
      reachShare: 1.5,
      reachBy: 10
    },
    /**
     * The UDFA scramble (spec 10.4, 11.7; D-49): out of its bonus pool (the rule set's), a team offers each
     * undrafted rookie up to `maxBonus` in steps of `step`. A rookie weighs a bonus against `maxBonus` by
     * `moneyWeight` [greed 0, greed 100] and his chance to make the roster by `opportunityWeight`. The AI
     * offers to up to `offersPerTeam` rookies, the first `topShare` of its pool and each next one `shrink` of
     * the one before, choosing them with noise of sd `noise` points of draft value.
     */
    udfa: {
      maxBonus: 100_000,
      step: 5_000,
      moneyWeight: [0.2, 0.6] as readonly [number, number],
      opportunityWeight: 1,
      offersPerTeam: 12,
      topShare: 0.25,
      shrink: 0.8,
      noise: 2
    },
    /**
     * Media (spec 10.4; D-45): from week `hypeFrom` of the season, `hypePerWeek` of the media's top
     * `hypeAmong` prospects make a headline each week, moving the media's board by `hypeBy` points, up or,
     * at `fallShare`, down (an off-field incident for a volatile one). Mock drafts of the first round come
     * out weekly from week `mocksFrom` through the draft.
     */
    media: {
      hypeFrom: 4,
      hypePerWeek: 1,
      hypeAmong: 60,
      hypeBy: [1, 4],
      fallShare: 0.4,
      volatile: 75,
      mocksFrom: 9
    },
    scouting: {
      teamSd: 6,
      fullPoints: 60,
      pointsCut: 0.75,
      consensusCut: 0.5,
      directorEffect: 0.3,
      scoutPoints: [6, 18],
      directorPoints: [4, 10],
      nationalShare: 0.6,
      spendEach: 15,
      placeFrom: 150,
      traitsAt: 30,
      abilitiesAt: 60,
      /**
       * A strength draw that stands out, in quality units: a class's makes it strong or weak, a position
       * group's deep or thin there (spec 10.3).
       */
      standsOut: 0.15
    }
  },
  /**
   * Off-field events (spec 10.9; D-59), while the setting is on. Each regular-season week, each player on an
   * active roster draws a suspension under the drug policy at `ped` and one under the conduct policy, of
   * `conductGames` [fewest, most] games, at `conduct` x his volatility weight. Each player on a roster or a
   * practice squad draws a legal matter in the news at `legal` x his volatility weight, and charity work at
   * `charity` x his leadership and social activity weights. The news covers players rated `newsFrom` or more.
   */
  offField: {
    ped: 0.00025,
    conduct: 0.00013,
    conductGames: [2, 6] as readonly [number, number],
    legal: 0.0002,
    charity: 0.001,
    newsFrom: 75
  },
  /**
   * Compensatory picks (spec 11.8; D-58), after Over the Cap's account of the NFL's formula. A free agent
   * qualifies when his new deal's yearly value ranks in the top share of the league's deals that `rounds`
   * lists last; `rounds` gives his round by the smallest top share he ranks in, a round better with `starter`
   * or more of his new team's snaps last season and a round worse under `partTime`. A team that lost as many
   * as it signed gets a net value pick when its losses are worth `netValueRounds` or more rounds more than
   * its signings (a third-round loss is worth 5, a seventh-round one 1).
   */
  compPicks: {
    rounds: [
      [0.05, 3],
      [0.1, 4],
      [0.15, 5],
      [0.25, 6],
      [0.35, 7]
    ] as readonly (readonly [number, number])[],
    starter: 0.75,
    partTime: 0.25,
    netValueRounds: 2
  },
  /**
   * Holdouts and trade demands (spec 10.9, 11.9; D-57). As training camp opens, a player in the last year
   * of his deal rated `minOvr` or more, with `minSeasons` credited seasons and paid under `underpaid` of
   * his market value, holds out when a draw falls under `rate` x the frequency setting x his greed weight
   * x (1 - `loyaltyDamp` x loyalty / 100) x how far under the line he's paid. At each later step (a week of
   * the preseason, the cutdown, a game week) he reports with chance `report` x `reportGreed` (from its first
   * number at greed 0 to its second at greed 100), plus `fined` while fines are on. A player whose morale is `tradeBelow` or less, with `tradeSeasons` credited
   * seasons and rated `tradeOvr` or more, asks for a trade at camp with chance `tradeRate` x the frequency
   * x his ego weight, and in a game week with `tradeWeekly` of that; the request lapses once his morale is
   * back to `tradeLapse`. A new deal ends a demand with `dealMorale` more morale; reporting without one
   * costs `reportMorale`, and a leader's holdout costs his teammates `leaderRoom`. Camp is `campDays` days;
   * the news covers players rated `newsFrom` or more.
   */
  holdouts: {
    minOvr: 78,
    minSeasons: 3,
    underpaid: 0.7,
    rate: 0.35,
    loyaltyDamp: 0.6,
    report: 0.3,
    reportGreed: [1.5, 0.5] as readonly [number, number],
    fined: 0.1,
    tradeBelow: 60,
    tradeSeasons: 2,
    tradeOvr: 70,
    tradeRate: 0.15,
    tradeWeekly: 0.1,
    tradeLapse: 70,
    dealMorale: 10,
    reportMorale: 8,
    leaderRoom: 2,
    campDays: 21,
    newsFrom: 78
  },
  /**
   * The AI in the re-sign window (spec 11.4, 11.5; D-29 stand-in until M14, value-based since D-38): an
   * option is exercised when his asking price reaches this share of it; next year's cap keeps this share
   * free for free agency beyond the draft class; the franchise tag goes only to players of this overall or
   * better.
   */
  resign: {
    optionValue: 0.9,
    freeAgencyRoom: 0.04,
    tagOvr: 80,
    /**
     * Cap casualties (D-60): as a league year opens, a team releases a veteran worth less than `cutValue`
     * of the salary a release saves over his deal's years left, at most `cutsPerTeam` of them.
     */
    cutValue: 0.85,
    cutsPerTeam: 4
  },
  /**
   * Training camp and the preseason (spec 4.1; D-30). A battle is a depth chart starter no more than
   * `battleGap` role rating points ahead of the best player not starting; the challenger wins at
   * `battleOdds` less `battleEdge` for each point he trails by, and the winner's first-team snaps add
   * `battleBump` to his position's `battleRatings` most important ratings. Camp injuries come at `injuryRate`
   * a player times the in-game proneness terms. Preseason pairings are tried up to `pairingTries` times a
   * week, with kickoff at `kickoff` Eastern. After the cutdown an AI team claims at most `cutdownClaims`
   * players off waivers.
   */
  camp: {
    battleGap: 2,
    battleOdds: 0.5,
    battleEdge: 0.12,
    battleBump: 1,
    battleRatings: 2,
    injuryRate: 0.05,
    pairingTries: 50,
    kickoff: '19:00',
    cutdownClaims: 2
  },
  /** Generated schedules (spec 5.2). */
  schedule: {
    /** Most road games in a row; a bye doesn't end the run. */
    maxRoadStreak: 3,
    /** Fewest weeks between a division rival's two games. */
    rematchGap: 3,
    /** Fewest days between a team's games: a Thursday night game after a Sunday, never after a Monday. */
    minRestDays: 4,
    /**
     * Prime-time picks: the two teams' winning percentages last season, plus up to this much at random,
     * less this much for each prime-time game either team already has this season.
     */
    primeJitter: 0.3,
    primeRepeat: 0.15
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
     * Cap parity (D-19, D-40): a roster's starters more than balanceFrom above or below typical (average latent
     * quality, the quarterback counting balanceQbWeight times) keep only balanceKeep of the excess.
     */
    balanceFrom: 0.1,
    balanceKeep: 0.4,
    balanceQbWeight: 4,
    starBonus: [0.8, 1.7],
    /**
     * Team strength tiers (C-20, D-40): each league draws its number of contenders and of rebuilding teams
     * evenly from these ranges, and the middle tier takes the rest. Contenders center `tierGap` above
     * average and rebuilding teams as far below it; within a tier, teams are evenly spaced across
     * `tierWidth`. More teams sit near the tiers' centers and fewer at the extremes than a single spread
     * with the same sd would put there.
     */
    tierSizes: [
      [8, 12],
      [8, 12]
    ] as [number, number][],
    tierGap: 0.31,
    tierWidth: 0.2,
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
    yac: { short: 3.74, intermediate: 2.45, deep: 3.74, screen: 4.99 },
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
    /**
     * Game-day actives (spec 12.1): quarterbacks dressed, backs and receivers dressed beyond the most the
     * team's personnel puts on the field, and defensive groups dressed at least, for a rotating line and dime
     * with backups.
     */
    dress: { QB: 2, spare: { RB: 1, WR: 1 }, defense: { DL: 6, LB: 4, DB: 8 } },
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
      protectPassCut: 0.5,
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
       * passRushDown.third or more; the goal-line back comes in inside goalLineYards of the end zone and on
       * third or fourth and shortYardageBack or less.
       */
      snapLimitFrom: 10,
      passRushDown: { second: 9, third: 5 },
      shortYardageBack: 2,
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
      checkdownFavor: 3.4,
      pressWeight: 0.05,
      playActionSeparation: 2.5,
      blitzSeparation: 2.5,
      cohesionSeparation: 20,
      /** How much target choice follows separation, per rating point. */
      openness: 0.03,
      // prettier-ignore
      deepFavor: { X: 2.4, Z: 2.4, SLOT: 0.7, EXTRA: 0.8, TE1: 0.5, TE2: 0.3, RB1: 0.1, RB2: 0.1, FB: 0.05 },
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
  },

  /**
   * Leaderboard minimums for rate stats (spec 19.3), after the NFL's: per team game in a season, and in
   * total for a career. Passing rates need attempts, rushing and receiving averages carries and catches,
   * kicking rates attempts, and return and punt averages returns and punts.
   */
  leaders: {
    perTeamGame: {
      passAtt: 14,
      rushAtt: 6.25,
      receptions: 1.875,
      targets: 3,
      fgAtt: 1,
      punts: 2.5,
      kickReturns: 1.25,
      puntReturns: 0.875
    },
    career: {
      passAtt: 1500,
      rushAtt: 750,
      receptions: 200,
      targets: 300,
      fgAtt: 100,
      punts: 250,
      kickReturns: 75,
      puntReturns: 75
    }
  }
} as const;

export type Tuning = typeof TUNING;
