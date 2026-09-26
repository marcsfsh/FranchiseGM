/**
 * The league's rule set (spec 16): a versioned data object. Cap, roster, contract, draft, and on-field
 * code read rules only from here, never from hard-coded constants. Defaults follow the 2026 NFL rules
 * and CBA (spec 12.1, 11.1, 22.2); items marked "default, review" in the spec are noted.
 */

export interface CapRules {
  /** Salary cap for the current league year, integer dollars. 2026: $301.2M (D-2). */
  amount: number;
  /** Cap growth blend (spec 11.1): newCap = oldCap x (1 + w x fixedRate + (1 - w) x revenueGrowth). */
  growthFixedRate: number;
  growthFixedWeight: number;
  /** Bounds on one year's change, as fractions. */
  growthFloor: number;
  growthCeiling: number;
  /** Unused cap space carries over to the next league year. */
  rollover: boolean;
  /** Salary floor: minimum cash spending as a share of the cap over a rolling window (default, review). */
  salaryFloorShare: number;
  salaryFloorYears: number;
  /** From the league year's start to the regular season only this many of the largest charges count. */
  offseasonCount: number;
}

export interface RosterRules {
  /** Active roster limit in season and in the offseason (spec 12.1, default, review). */
  active: number;
  offseason: number;
  /**
   * The fewest players on the active roster from the final cutdown through the Super Bowl, checked before
   * every advance; the offseason has none (D-46).
   */
  activeMin: number;
  /** Game-day actives: 48 with at least 8 offensive linemen, otherwise 47. */
  gameDayActives: number;
  gameDayActivesShortOl: number;
  gameDayMinOl: number;
  /** Offensive linemen a game-day roster needs to line up (D-46). */
  gameDayLine: number;
  emergencyThirdQb: boolean;
  practiceSquad: number;
  /** Extra practice squad spot for an international pathway player. */
  practiceSquadInternational: number;
  /** Players with more than `practiceSquadVeteranSeasons` accrued seasons, at most this many. */
  practiceSquadVeterans: number;
  practiceSquadVeteranSeasons: number;
  elevationsPerGame: number;
  elevationsPerPlayer: number;
  /** Injured reserve: minimum games out, and designated-to-return activations per season. */
  irMinGames: number;
  irReturns: number;
  /**
   * Accrued seasons that make a vested veteran: his season's salary is owed once he's on the week 1 roster,
   * and he skips waivers when released before the trade deadline.
   */
  vestedVeteranSeasons: number;
  /**
   * Regular-season games on full pay status (the active roster, injured reserve, or PUP) that earn a
   * credited season, for minimum salaries, and an accrued season, for free agency and veteran status.
   */
  creditedSeasonGames: number;
  accruedSeasonGames: number;
  /** Games a player on the reserve PUP or NFI list must miss. */
  pupMinGames: number;
  /** Through this regular-season week the waiver order follows the draft order, then the standings. */
  waiverDraftOrderWeeks: number;
}

export interface PayRules {
  /** Minimum base salary by credited seasons; the last entry covers that many seasons and more. */
  minimumSalary: number[];
  /** Minimums rise with the cap after the CBA schedule ends. */
  minimumGrowsWithCap: boolean;
  /** Practice squad weekly pay: the minimum, and the range for veterans (2026 CBA). */
  practiceSquadWeekly: number;
  practiceSquadVeteranWeeklyMin: number;
  practiceSquadVeteranWeeklyMax: number;
  /** Weekly paychecks in a regular season. */
  paychecks: number;
  /** Signing bonuses prorate over the contract, at most this many years. */
  prorationYearsMax: number;
  /** June 1 release designations allowed per league year. */
  june1Designations: number;
  /**
   * June 1, as MM-DD (spec 11.2): a release after it splits its dead money across two league years, and a
   * designated release before it keeps the player's cap hit on the books until the day after it.
   */
  june1: string;
  /**
   * A holdout's fine for each day of training camp he misses (spec 11.9; CBA Article 42): the veterans',
   * and the lower one for players on rookie deals.
   */
  holdoutFineDaily: number;
  holdoutFineDailyRookie: number;
}

export interface RookieScaleRules {
  /** Rookie contract length (spec 11.4). */
  years: number;
  /** Signing bonus of the first overall pick. The scale grows with the cap. */
  topSigningBonus: number;
  /** First-round bonuses fall as pick ^ -decay. */
  firstRoundDecay: number;
  /** After the first round, bonuses fall by a factor of e every this many picks. */
  laterPickScale: number;
  minimumSigningBonus: number;
  /** First-round base salaries add this share of the signing bonus in each year. */
  firstRoundBaseShare: number;
  /** Undrafted rookie contracts run this many years. */
  udfaYears: number;
  /** Signing bonus money each team may offer its undrafted rookies in a league year (D-49); it grows with the cap. */
  udfaBonusPool: number;
}

/** Tags, tenders, and fifth-year options (spec 11.4, 11.5, default, review). */
export interface TagRules {
  /** A franchise tag pays the average of this many top cap hits at the position, or this share of his last salary. */
  franchiseTop: number;
  priorSalaryShare: number;
  /** A transition tag pays the average of this many top cap hits at the position. */
  transitionTop: number;
  /** A second straight tag costs this share of the last one; a third this share, or the quarterback tag if more. */
  secondTag: number;
  thirdTag: number;
  /** Restricted free agents have exactly this many accrued seasons; players with fewer have exclusive rights. */
  rfaSeasons: number;
  /** Restricted free agent tenders by level; the original-round level is also the right-of-first-refusal amount. */
  tenders: { firstRound: number; secondRound: number; originalRound: number };
  /** A tender pays at least this share of his last base salary. */
  tenderPriorShare: number;
  /** Fifth-year option salary without Pro Bowls: the average of the cap hits ranked in these ranges at the position. */
  optionPlayingTime: [number, number];
  optionBasic: [number, number];
  /** The playing-time level needs this share of his team's snaps. */
  optionSnapShare: number;
}

export interface SeasonRules {
  /** Fixed and not votable (spec 16). */
  games: number;
  weeks: number;
  playoffTeamsPerConference: number;
  /** Week of the trade deadline (spec 22.2). */
  tradeDeadlineWeek: number;
  draftRounds: number;
  /** Drafts ahead that teams hold picks in, this one included: picks trade up to this many drafts out (D-42). */
  draftPickYears: number;
  /** Prospects each team may bring in for top-30 visits before a draft (D-44). */
  draftVisits: number;
  /**
   * Compensatory picks (spec 11.8): at most `compensatoryPicks` a draft, in rounds `compensatoryRounds`
   * (first and last), and `compensatoryPerTeam` for a team.
   */
  compensatoryPicks: number;
  compensatoryRounds: [number, number];
  compensatoryPerTeam: number;
  /** Wild card ties use common games only when every tied club played at least this many (spec 5.3). */
  commonGamesMin: number;
}

export const PENALTY_IDS = [
  'falseStart', 'delayOfGame', 'illegalFormation', 'offensiveHolding', 'offensivePassInterference',
  'intentionalGrounding', 'illegalBlockInBack', 'offside', 'defensiveHolding', 'illegalContact',
  'defensivePassInterference', 'roughingThePasser', 'unnecessaryRoughness', 'facemask', 'illegalUseOfHands',
  'unsportsmanlikeConduct', 'kickCatchInterference', 'runningIntoKicker'
] as const; // prettier-ignore
export type PenaltyId = (typeof PENALTY_IDS)[number];

/** A foul as the rules define it (spec 16: yardage, automatic first downs, ejection). */
export interface PenaltyRule {
  name: string;
  /** Yards; a spot foul with 0 here moves the ball to the spot of the foul. */
  yards: number;
  /** Spot fouls (defensive pass interference) place the ball where the foul happened. */
  spotFoul: boolean;
  /** A defensive foul that gives the offense a first down. */
  automaticFirstDown: boolean;
  /** An offensive foul that also costs the down. */
  lossOfDown: boolean;
  /** Called before the snap (dead-ball fouls); the play doesn't happen. */
  preSnap: boolean;
  /** Flagrant versions can get the player ejected. */
  ejectionEligible: boolean;
}

/** On-field rules (spec 16): the clock, overtime, kickoffs, tries, and penalties. */
export interface GameRules {
  quarterSeconds: number;
  timeoutsPerHalf: number;
  twoMinuteWarning: boolean;
  /** Seconds on the play clock between snaps. */
  playClock: number;
  overtime: {
    regularSeasonSeconds: number;
    playoffSeconds: number;
    /** Timeouts per team in a regular-season overtime period. */
    timeouts: number;
    /** Timeouts per team in each pair of playoff overtime periods. */
    playoffTimeouts: number;
    /** Both teams get a possession before sudden death, even after an opening touchdown. */
    bothTeamsPossess: boolean;
    /** Regular-season games tied after one overtime period end tied. */
    regularSeasonTies: boolean;
  };
  kickoff: {
    /** Yard line the kicking team kicks from. */
    spot: number;
    /** Receiving team's yard line after a touchback. */
    touchback: number;
    /** Receiving team's yard line after a kick lands in the landing zone and rolls into the end zone. */
    landingZoneTouchback: number;
    /** Depth of the landing zone, measured from the receiving team's goal line. */
    landingZone: number;
    /** Receiving team's yard line when the kick lands short of the landing zone. */
    shortSpot: number;
    /** Only a trailing team may declare an onside kick. */
    onsideOnlyWhenTrailing: boolean;
    /** Onside kicks only in the fourth quarter (the 2024 rule; 2025 allows any quarter). */
    onsideFourthQuarterOnly: boolean;
  };
  /** Points for each way to score; a defensive return on a try scores defensiveTryPoints. */
  points: { touchdown: number; fieldGoal: number; safety: number; extraPoint: number; twoPoint: number };
  /** Yards a team must gain for a first down. */
  yardsToGain: number;
  /** Line of scrimmage for extra-point kicks and two-point tries. */
  extraPointSpot: number;
  twoPointSpot: number;
  /** Points for a defensive return on a try. */
  defensiveTryPoints: number;
  puntFairCatch: boolean;
  /** Yard line after a touchback on a punt or a turnover in the end zone (kickoffs have their own). */
  touchback: number;
  /** Yard line a team free kicks from after conceding a safety. */
  safetyKickSpot: number;
  /** After a missed field goal the defense takes over at the spot of the kick, or this yard line if farther. */
  missedFieldGoalSpot: number;
  penalties: Record<PenaltyId, PenaltyRule>;
}

export interface RuleSet {
  /** Increases with every change, so saves and history can say which rules applied. */
  version: number;
  season: SeasonRules;
  cap: CapRules;
  roster: RosterRules;
  pay: PayRules;
  rookieScale: RookieScaleRules;
  tags: TagRules;
  game: GameRules;
}

const foul = (
  name: string,
  yards: number,
  flags: Partial<Omit<PenaltyRule, 'name' | 'yards'>> = {}
): PenaltyRule => ({
  name,
  yards,
  spotFoul: false,
  automaticFirstDown: false,
  lossOfDown: false,
  preSnap: false,
  ejectionEligible: false,
  ...flags
});

/** The 2025 NFL playing rules, which carry into 2026 until the rules committee changes them. */
export const DEFAULT_GAME_RULES: GameRules = {
  quarterSeconds: 900,
  timeoutsPerHalf: 3,
  twoMinuteWarning: true,
  playClock: 40,
  overtime: {
    regularSeasonSeconds: 600,
    playoffSeconds: 900,
    timeouts: 2,
    playoffTimeouts: 3,
    bothTeamsPossess: true,
    regularSeasonTies: true
  },
  kickoff: {
    spot: 35,
    touchback: 35,
    landingZoneTouchback: 20,
    landingZone: 20,
    shortSpot: 40,
    onsideOnlyWhenTrailing: true,
    onsideFourthQuarterOnly: false
  },
  points: { touchdown: 6, fieldGoal: 3, safety: 2, extraPoint: 1, twoPoint: 2 },
  yardsToGain: 10,
  extraPointSpot: 15,
  twoPointSpot: 2,
  defensiveTryPoints: 2,
  puntFairCatch: true,
  touchback: 20,
  safetyKickSpot: 20,
  missedFieldGoalSpot: 20,
  penalties: {
    falseStart: foul('False start', 5, { preSnap: true }),
    delayOfGame: foul('Delay of game', 5, { preSnap: true }),
    illegalFormation: foul('Illegal formation', 5),
    offensiveHolding: foul('Offensive holding', 10),
    offensivePassInterference: foul('Offensive pass interference', 10),
    intentionalGrounding: foul('Intentional grounding', 10, { lossOfDown: true }),
    illegalBlockInBack: foul('Illegal block in the back', 10),
    offside: foul('Offside', 5, { preSnap: true }),
    defensiveHolding: foul('Defensive holding', 5, { automaticFirstDown: true }),
    illegalContact: foul('Illegal contact', 5, { automaticFirstDown: true }),
    defensivePassInterference: foul('Defensive pass interference', 0, {
      spotFoul: true,
      automaticFirstDown: true
    }),
    roughingThePasser: foul('Roughing the passer', 15, { automaticFirstDown: true, ejectionEligible: true }),
    unnecessaryRoughness: foul('Unnecessary roughness', 15, {
      automaticFirstDown: true,
      ejectionEligible: true
    }),
    facemask: foul('Face mask', 15, { automaticFirstDown: true }),
    illegalUseOfHands: foul('Illegal use of hands', 5, { automaticFirstDown: true }),
    unsportsmanlikeConduct: foul('Unsportsmanlike conduct', 15, {
      automaticFirstDown: true,
      ejectionEligible: true
    }),
    kickCatchInterference: foul('Kick catch interference', 15),
    runningIntoKicker: foul('Running into the kicker', 5)
  }
};

export const DEFAULT_RULES: RuleSet = {
  version: 1,
  season: {
    games: 17,
    weeks: 18,
    playoffTeamsPerConference: 7,
    tradeDeadlineWeek: 9,
    draftRounds: 7,
    draftPickYears: 3,
    draftVisits: 30,
    compensatoryPicks: 32,
    compensatoryRounds: [3, 7],
    compensatoryPerTeam: 4,
    commonGamesMin: 4
  },
  cap: {
    amount: 301_200_000,
    growthFixedRate: 0.07,
    growthFixedWeight: 0.5,
    growthFloor: 0,
    growthCeiling: 0.1,
    rollover: true,
    salaryFloorShare: 0.89,
    salaryFloorYears: 4,
    offseasonCount: 51
  },
  roster: {
    active: 53,
    offseason: 90,
    activeMin: 53,
    gameDayActives: 48,
    gameDayActivesShortOl: 47,
    gameDayMinOl: 8,
    gameDayLine: 5,
    emergencyThirdQb: true,
    practiceSquad: 16,
    practiceSquadInternational: 1,
    practiceSquadVeterans: 6,
    practiceSquadVeteranSeasons: 2,
    elevationsPerGame: 2,
    elevationsPerPlayer: 3,
    irMinGames: 4,
    irReturns: 8,
    vestedVeteranSeasons: 4,
    creditedSeasonGames: 3,
    accruedSeasonGames: 6,
    pupMinGames: 4,
    waiverDraftOrderWeeks: 3
  },
  pay: {
    // 2026 CBA minimums for 0, 1, 2, 3, 4-6, and 7+ credited seasons.
    minimumSalary: [885_000, 1_005_000, 1_075_000, 1_145_000, 1_215_000, 1_215_000, 1_215_000, 1_300_000],
    minimumGrowsWithCap: true,
    practiceSquadWeekly: 13_750,
    practiceSquadVeteranWeeklyMin: 18_350,
    practiceSquadVeteranWeeklyMax: 22_850,
    paychecks: 18,
    prorationYearsMax: 5,
    june1Designations: 2,
    june1: '06-01',
    // 2020 CBA Article 42: $50,000 a day of camp missed, $40,000 on a rookie contract.
    holdoutFineDaily: 50_000,
    holdoutFineDailyRookie: 40_000
  },
  rookieScale: {
    // Fitted to recent slot values: about $33M for the first pick, $6.3M at pick 32, $2.6M at 64.
    years: 4,
    topSigningBonus: 33_000_000,
    firstRoundDecay: 0.48,
    laterPickScale: 36,
    minimumSigningBonus: 80_000,
    firstRoundBaseShare: 0.12,
    udfaYears: 3,
    udfaBonusPool: 200_000
  },
  tags: {
    franchiseTop: 5,
    priorSalaryShare: 1.2,
    transitionTop: 10,
    secondTag: 1.2,
    thirdTag: 1.44,
    rfaSeasons: 3,
    // The 2025 tenders ($7,458,000, $5,346,000, $3,263,000) grown with the 2026 cap; review against the
    // 2026 figures (spec 24).
    tenders: { firstRound: 8_046_000, secondRound: 5_767_000, originalRound: 3_520_000 },
    tenderPriorShare: 1.1,
    optionPlayingTime: [3, 20],
    optionBasic: [3, 25],
    optionSnapShare: 0.75
  },
  game: DEFAULT_GAME_RULES
};

/** The league minimum base salary for a player with this many credited seasons. */
export function minimumSalary(rules: RuleSet, creditedSeasons: number): number {
  const table = rules.pay.minimumSalary;
  const index = Math.max(0, Math.min(table.length - 1, Math.floor(creditedSeasons)));
  return table[index] as number;
}

/** Problems with a rule set, as messages the UI can show. Empty when the rules are usable. */
export function validateRules(rules: RuleSet): string[] {
  const problems: string[] = [];
  const whole = (value: number, name: string, min = 0) => {
    if (!Number.isInteger(value) || value < min)
      problems.push(`${name} must be a whole number of at least ${min}.`);
  };
  whole(rules.cap.amount, 'The salary cap', 1);
  whole(rules.roster.active, 'The active roster limit', 1);
  whole(rules.roster.offseason, 'The offseason roster limit', 1);
  whole(rules.roster.practiceSquad, 'The practice squad size');
  whole(rules.roster.gameDayActives, 'Game-day actives', 1);
  whole(rules.cap.offseasonCount, 'The offseason cap count', 1);
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(rules.pay.june1))
    problems.push('The June 1 date must be MM-DD.');
  whole(rules.roster.vestedVeteranSeasons, 'Seasons for a vested veteran', 1);
  whole(rules.roster.creditedSeasonGames, 'Games for a credited season', 1);
  whole(rules.roster.accruedSeasonGames, 'Games for an accrued season', 1);
  whole(rules.roster.pupMinGames, 'Games on the reserve PUP list');
  whole(rules.roster.waiverDraftOrderWeeks, 'Weeks of waivers in draft order');
  if (rules.roster.gameDayActives > rules.roster.active)
    problems.push('Game-day actives exceed the active roster.');
  if (rules.roster.offseason < rules.roster.active)
    problems.push('The offseason limit is below the active roster.');
  if (rules.cap.growthFloor > rules.cap.growthCeiling)
    problems.push('Cap growth floor is above the ceiling.');
  if (rules.cap.growthFixedWeight < 0 || rules.cap.growthFixedWeight > 1)
    problems.push('Cap growth weight must be 0 to 1.');
  if (rules.pay.minimumSalary.length === 0) problems.push('The minimum salary table is empty.');
  rules.pay.minimumSalary.forEach((v, i) => whole(v, `Minimum salary for ${i} seasons`, 1));
  if (rules.pay.minimumSalary.some((v, i, a) => i > 0 && v < (a[i - 1] as number))) {
    problems.push('Minimum salaries must not fall with experience.');
  }
  whole(rules.pay.prorationYearsMax, 'The proration limit', 1);
  whole(rules.rookieScale.years, 'Rookie contract length', 1);
  whole(rules.rookieScale.topSigningBonus, 'The top rookie signing bonus', 0);
  whole(rules.rookieScale.udfaBonusPool, "The undrafted rookies' bonus pool", 0);
  whole(rules.season.draftRounds, 'Draft rounds', 1);
  whole(rules.season.draftPickYears, 'Drafts teams hold picks in', 1);
  whole(rules.season.draftVisits, 'Top-30 visits');
  for (const [level, amount] of Object.entries(rules.tags.tenders)) whole(amount, `The ${level} tender`, 1);
  whole(rules.tags.franchiseTop, 'Players averaged for the franchise tag', 1);
  whole(rules.tags.transitionTop, 'Players averaged for the transition tag', 1);
  if (rules.season.games !== 17 || rules.season.playoffTeamsPerConference !== 7) {
    problems.push('The season format (17 games, 14-team playoffs) is fixed.');
  }
  const g = rules.game;
  whole(g.quarterSeconds, 'Quarter length', 60);
  whole(g.timeoutsPerHalf, 'Timeouts per half');
  whole(g.overtime.regularSeasonSeconds, 'Regular-season overtime length', 60);
  whole(g.overtime.playoffSeconds, 'Playoff overtime length', 60);
  whole(g.overtime.timeouts, 'Overtime timeouts');
  whole(g.overtime.playoffTimeouts, 'Playoff overtime timeouts');
  for (const [kind, value] of Object.entries(g.points)) whole(value, `Points for a ${kind}`, 1);
  whole(g.yardsToGain, 'Yards to gain', 1);
  if (g.yardsToGain > 30) problems.push('Yards to gain must be 30 or fewer.');
  whole(g.playClock, 'The play clock', 10);
  for (const [name, spot] of [
    ['The kickoff spot', g.kickoff.spot],
    ['The kickoff touchback spot', g.kickoff.touchback],
    ['The extra-point spot', g.extraPointSpot],
    ['The two-point spot', g.twoPointSpot],
    ['The touchback spot', g.touchback],
    ['The safety free kick spot', g.safetyKickSpot],
    ['The missed field goal spot', g.missedFieldGoalSpot]
  ] as const) {
    if (!Number.isInteger(spot) || spot < 1 || spot > 50)
      problems.push(`${name} must be a yard line from 1 to 50.`);
  }
  for (const [id, penalty] of Object.entries(g.penalties)) {
    if (!Number.isInteger(penalty.yards) || penalty.yards < 0 || penalty.yards > 30)
      problems.push(`${penalty.name || id} yardage must be 0 to 30.`);
    if (penalty.spotFoul === false && penalty.yards === 0)
      problems.push(`${penalty.name || id} moves the ball nowhere.`);
  }
  return problems;
}

type Section = Exclude<keyof RuleSet, 'version'>;

/** Returns new rules with one section changed and the version bumped. Throws if the result is invalid. */
export function changeRules<S extends Section>(
  rules: RuleSet,
  section: S,
  patch: Partial<RuleSet[S]>
): RuleSet {
  const next = {
    ...rules,
    version: rules.version + 1,
    [section]: { ...rules[section], ...patch }
  } as RuleSet;
  const problems = validateRules(next);
  if (problems.length) throw new Error(problems.join(' '));
  return next;
}
