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
}

export interface RosterRules {
  /** Active roster limit in season and in the offseason (spec 12.1, default, review). */
  active: number;
  offseason: number;
  /** Game-day actives: 48 with at least 8 offensive linemen, otherwise 47. */
  gameDayActives: number;
  gameDayActivesShortOl: number;
  gameDayMinOl: number;
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
}

export interface SeasonRules {
  /** Fixed and not votable (spec 16). */
  games: number;
  weeks: number;
  playoffTeamsPerConference: number;
  /** Week of the trade deadline (spec 22.2). */
  tradeDeadlineWeek: number;
  draftRounds: number;
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
    timeouts: number;
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
  /** Line of scrimmage for extra-point kicks and two-point tries. */
  extraPointSpot: number;
  twoPointSpot: number;
  /** Points for a defensive return on a try. */
  defensiveTryPoints: number;
  puntFairCatch: boolean;
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
  extraPointSpot: 15,
  twoPointSpot: 2,
  defensiveTryPoints: 2,
  puntFairCatch: true,
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
    draftRounds: 7
  },
  cap: {
    amount: 301_200_000,
    growthFixedRate: 0.07,
    growthFixedWeight: 0.5,
    growthFloor: 0,
    growthCeiling: 0.1,
    rollover: true,
    salaryFloorShare: 0.89,
    salaryFloorYears: 4
  },
  roster: {
    active: 53,
    offseason: 90,
    gameDayActives: 48,
    gameDayActivesShortOl: 47,
    gameDayMinOl: 8,
    emergencyThirdQb: true,
    practiceSquad: 16,
    practiceSquadInternational: 1,
    practiceSquadVeterans: 6,
    practiceSquadVeteranSeasons: 2,
    elevationsPerGame: 2,
    elevationsPerPlayer: 3,
    irMinGames: 4,
    irReturns: 8
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
    june1Designations: 2
  },
  rookieScale: {
    // Fitted to recent slot values: about $33M for the first pick, $6.3M at pick 32, $2.6M at 64.
    years: 4,
    topSigningBonus: 33_000_000,
    firstRoundDecay: 0.48,
    laterPickScale: 36,
    minimumSigningBonus: 80_000,
    firstRoundBaseShare: 0.12,
    udfaYears: 3
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
  if (rules.season.games !== 17 || rules.season.playoffTeamsPerConference !== 7) {
    problems.push('The season format (17 games, 14-team playoffs) is fixed.');
  }
  const g = rules.game;
  whole(g.quarterSeconds, 'Quarter length', 60);
  whole(g.timeoutsPerHalf, 'Timeouts per half');
  whole(g.overtime.regularSeasonSeconds, 'Regular-season overtime length', 60);
  for (const [name, spot] of [
    ['The kickoff spot', g.kickoff.spot],
    ['The kickoff touchback spot', g.kickoff.touchback],
    ['The extra-point spot', g.extraPointSpot],
    ['The two-point spot', g.twoPointSpot]
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
