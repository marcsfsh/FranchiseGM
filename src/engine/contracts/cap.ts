/**
 * Cap accounting (spec 11.2): what a contract charges its team's cap in each league year, computed from
 * its structure and never stored. Base salary counts for the regular-season weeks the deal is in force;
 * roster, workout, and per-game roster bonuses count when earned; signing, option, and restructure bonuses
 * prorate over at most `prorationYearsMax` years, void years included, and a deal's void-year proration
 * lands in its first void year when the deal voids. Incentives likely to be earned count in their year;
 * the others count the next year once earned, and likely ones not earned come back as a credit. When a deal
 * ends early, its later years' proration and the guarantees still owed accelerate as dead money, split
 * across two league years after June 1 or with a June 1 designation.
 */
import { calendarDay, compareDates, leagueYear, type GameDate } from '../model/calendar';
import type { RuleSet } from '../rules/ruleset';
import type { Contract, ContractEnd, ContractYear } from './types';

/** What the cap needs to know beyond the contract. */
export interface CapFacts {
  /** Regular-season games of a league year his team played while he was under contract but not active. */
  inactive?: (year: number) => number;
}

/** A contract's charge to its team's cap in one league year, by part. Integer dollars. */
export interface CapCharge {
  /** Base salary for the weeks in force. */
  base: number;
  /** Roster, workout, and per-game roster bonuses, and incentives counted or settled this year. */
  bonuses: number;
  /** This year's share of prorated bonuses. */
  proration: number;
  /**
   * Money a deal that ended charges beyond what he earned: this year's base still owed (guaranteed, or all
   * of it with termination pay), and later years' proration and guarantees moved into this year.
   */
  dead: number;
  total: number;
}

const charge = (base: number, bonuses: number, proration: number, dead: number): CapCharge => ({
  base,
  bonuses,
  proration,
  dead,
  total: base + bonuses + proration + dead
});

/** The first day of a league year: free agency opens. */
export const leagueYearStart = (year: number): GameDate => ({
  season: year - 1,
  phase: 'freeAgency',
  week: 1
});

/**
 * Whether a date falls after June 1 (the rule set's day) of its league year (spec 11.2): from June 2, when
 * releases split their dead money and June 1 designations take effect.
 */
export const afterJune1 = (date: GameDate, rules: RuleSet): boolean =>
  calendarDay(date) > `${leagueYear(date)}-${rules.pay.june1}`;

/**
 * Where a date falls in league year `year`'s regular season, for pay: 1 before the season (or in an earlier
 * league year), the week during it, and weeks + 1 after it (or in a later league year). A move dated in a
 * week comes before that week's game.
 */
export function payWeek(date: GameDate, year: number, rules: RuleSet): number {
  const after = rules.season.weeks + 1;
  const y = leagueYear(date);
  if (y !== year) return y < year ? 1 : after;
  if (date.phase === 'regularSeason') return Math.min(after, Math.max(1, date.week));
  return date.season < year ? 1 : after;
}

/** Regular-season weeks of league year `year` that the deal is (or was) in force. */
export function weeksInForce(c: Contract, year: number, rules: RuleSet): number {
  const start = payWeek(c.signed, year, rules);
  const end = c.ended ? payWeek(c.ended.date, year, rules) : rules.season.weeks + 1;
  return Math.max(0, end - start);
}

/** Spreads an amount evenly over league years; the first year absorbs the rounding. */
function spread(amount: number, years: readonly number[], into: Map<number, number>): void {
  if (!amount || !years.length) return;
  const share = Math.floor(amount / years.length);
  years.forEach((y, i) =>
    into.set(y, (into.get(y) ?? 0) + (i === 0 ? amount - share * (years.length - 1) : share))
  );
}

/** League years the signing bonus prorates over: the deal's first years at signing, void years included. */
export function prorationYears(contract: Contract, rules: RuleSet): number[] {
  return contract.signingBonusYears ?? contract.years.slice(0, rules.pay.prorationYearsMax).map(y => y.year);
}

/**
 * Every prorated bonus by league year: the signing bonus over the deal's first years, each exercised
 * option bonus from its year on, and restructured money over the years named when it was converted.
 */
export function prorationSchedule(c: Contract, rules: RuleSet): Map<number, number> {
  const max = rules.pay.prorationYearsMax;
  const out = new Map<number, number>();
  spread(c.signingBonus, prorationYears(c, rules), out);
  c.years.forEach((y, i) => {
    if (y.optionBonus && y.optionExercised)
      spread(y.optionBonus, y.optionBonusYears ?? c.years.slice(i, i + max).map(z => z.year), out);
  });
  for (const r of c.restructures) spread(r.amount, r.prorationYears, out);
  return out;
}

/** Signing bonus proration charged in a league year. */
export function signingBonusProration(contract: Contract, year: number, rules: RuleSet): number {
  const out = new Map<number, number>();
  spread(contract.signingBonus, prorationYears(contract, rules), out);
  return out.get(year) ?? 0;
}

/** Base salary of a year guaranteed at a date: full and vested guarantees, and injury ones when hurt. */
export function guaranteedAt(c: Contract, entry: ContractYear, at: GameDate, injured: boolean): number {
  const vested = c.vesting
    .filter(v => v.year === entry.year && compareDates(v.date, at) <= 0)
    .reduce((sum, v) => sum + v.amount, 0);
  return Math.min(entry.base, entry.guaranteedBase + vested + (injured ? entry.injuryGuaranteedBase : 0));
}

/** Whether a deal's end accelerates its proration (every end but a replacement). */
const accelerates = (end: ContractEnd): boolean => end.how !== 'replaced';

/** Whether an end splits dead money across two league years: after June 1, or with a designation. */
export const splitsDeadMoney = (end: ContractEnd, rules: RuleSet): boolean =>
  end.designated || afterJune1(end.date, rules);

/**
 * Base salary of a year paid over its pay weeks [from, to). The salary comes in equal installments over the
 * regular season's weeks; a restructure during the season converts part of what's still to come, so the
 * weeks after it pay less (the stored base is the year's salary after every conversion).
 */
export function baseBetween(c: Contract, entry: ContractYear, from: number, to: number, rules: RuleSet): number {
  if (entry.isVoid || to <= from) return 0;
  const weeks = rules.season.weeks;
  const cuts = c.restructures
    .filter(r => leagueYear(r.date) === entry.year)
    .map(r => ({ week: payWeek(r.date, entry.year, rules), amount: r.amount }))
    .filter(r => r.week > 1 && r.week <= weeks)
    .sort((a, b) => a.week - b.week);
  let rate = (entry.base + cuts.reduce((sum, r) => sum + r.amount, 0)) / weeks;
  let week = 1;
  let total = 0;
  const pay = (until: number) => {
    const a = Math.max(week, from);
    const b = Math.min(until, to);
    if (b > a) total += rate * (b - a);
    week = until;
  };
  for (const cut of cuts) {
    pay(cut.week);
    const remaining = weeks + 1 - cut.week;
    rate = (rate * remaining - cut.amount) / remaining;
  }
  pay(weeks + 1);
  return Math.round(total);
} // prettier-ignore

/** Base salary of the year counted for the weeks in force. */
export function paidBase(c: Contract, entry: ContractYear, rules: RuleSet): number {
  const start = payWeek(c.signed, entry.year, rules);
  const end = c.ended ? payWeek(c.ended.date, entry.year, rules) : rules.season.weeks + 1;
  return baseBetween(c, entry, start, end, rules);
}

/** Proration and guarantees of the years after `year` that a deal ending then still owes. */
function laterDeadMoney(c: Contract, end: ContractEnd, year: number, schedule: Map<number, number>): number {
  let dead = 0;
  for (const [y, amount] of schedule) if (y > year) dead += amount;
  if (end.how === 'released')
    for (const entry of c.years)
      if (entry.year > year && !entry.isVoid) dead += guaranteedAt(c, entry, end.date, end.injured);
  return dead;
}

/** Roster, workout, and per-game roster bonuses earned in a year: the ones paid in cash as they're earned. */
export function earnedBonuses(c: Contract, year: number, rules: RuleSet, facts: CapFacts = {}): number {
  const entry = c.years.find(y => y.year === year);
  if (!entry || entry.isVoid) return 0;
  const end = c.ended;
  let bonuses = 0;
  // Roster bonuses fall due when the league year opens (or at signing, later in the year); a deal ended
  // on the first day of the league year doesn't earn it.
  if (!end || compareDates(end.date, leagueYearStart(year)) > 0) bonuses += entry.rosterBonus;
  // Workout bonuses are earned through the offseason program, which ends in June.
  const endYear = end ? leagueYear(end.date) : null;
  if (!end || (endYear ?? year) > year || (endYear === year && afterJune1(end.date, rules)))
    bonuses += entry.workoutBonus;
  // Per-game roster bonuses: each game of the year in force, less the games he was inactive.
  if (entry.perGameBonus) {
    const games = rules.season.games;
    const inForce = Math.round((games * weeksInForce(c, year, rules)) / rules.season.weeks);
    const active = Math.max(0, inForce - (facts.inactive?.(year) ?? 0));
    bonuses += Math.round((entry.perGameBonus * active) / games);
  }
  return bonuses;
}

/** Bonuses earned in a year, and incentives counted or settled in it. */
function bonusesIn(c: Contract, year: number, rules: RuleSet, facts: CapFacts): number {
  const entry = c.years.find(y => y.year === year);
  const end = c.ended;
  let bonuses = earnedBonuses(c, year, rules, facts);
  // Likely incentives count while he can still earn them: the deal lasts the regular season.
  if (entry && !entry.isVoid && (!end || payWeek(end.date, year, rules) > rules.season.weeks))
    bonuses += entry.incentives.filter(i => i.likely).reduce((sum, i) => sum + i.amount, 0);
  // Last year's incentives settle now: unlikely ones earned are charged, likely ones missed are credited.
  const before = c.years.find(y => y.year === year - 1);
  const counted = !end || payWeek(end.date, year - 1, rules) > rules.season.weeks;
  for (const i of before?.incentives ?? []) {
    if (!i.likely && i.earned === true) bonuses += i.amount;
    if (i.likely && i.earned === false && counted) bonuses -= i.amount;
  }
  return bonuses;
}

/** What a contract charges its team's cap in a league year, running or ended (spec 11.2). */
export function capCharge(c: Contract, year: number, rules: RuleSet, facts: CapFacts = {}): CapCharge {
  const schedule = prorationSchedule(c, rules);
  const end = c.ended && accelerates(c.ended) ? c.ended : null;
  const endYear = end ? leagueYear(end.date) : null;
  const bonuses = bonusesIn(c, year, rules, facts);
  if (end && endYear !== null && year > endYear) {
    // After an early end, only split dead money (the year after) and settled incentives land here.
    const dead =
      year === endYear + 1 && splitsDeadMoney(end, rules) ? laterDeadMoney(c, end, endYear, schedule) : 0;
    return charge(0, bonuses, 0, dead);
  }
  let proration = schedule.get(year) ?? 0;
  const voids = c.years.filter(y => y.isVoid).map(y => y.year);
  const firstVoid = voids[0];
  if (!end && firstVoid !== undefined && year >= firstVoid)
    // The deal voids when its first void year opens: all void-year proration accelerates into it.
    proration = year === firstVoid ? voids.reduce((sum, y) => sum + (schedule.get(y) ?? 0), 0) : 0;
  const entry = c.years.find(y => y.year === year);
  const base = entry ? paidBase(c, entry, rules) : 0;
  let dead = 0;
  if (end && year === endYear) {
    if (entry && !entry.isVoid && end.how === 'released') {
      // The rest of this year's base that's owed: all of it with termination pay, else the guarantee.
      const owed = end.terminationPay ? entry.base : guaranteedAt(c, entry, end.date, end.injured);
      dead += Math.max(0, owed - base);
    }
    if (!splitsDeadMoney(end, rules)) dead += laterDeadMoney(c, end, year, schedule);
  }
  return charge(base, bonuses, proration, dead);
}

/** The cap hit in a league year: the whole charge. */
export function capHit(contract: Contract, year: number, rules: RuleSet, facts: CapFacts = {}): number {
  return capCharge(contract, year, rules, facts).total;
}

/** Total cap charges for a set of contracts in a league year. */
export function teamCapTotal(contracts: readonly Contract[], year: number, rules: RuleSet): number {
  return contracts.reduce((sum, c) => sum + capHit(c, year, rules), 0);
}

/** Money the player still receives from this league year on (base and bonuses, not yet-paid proration). */
export function remainingValue(contract: Contract, fromYear: number): number {
  return contract.years
    .filter(y => y.year >= fromYear && !y.isVoid)
    .reduce((sum, y) => sum + y.base + y.rosterBonus + y.workoutBonus + y.perGameBonus, 0);
}

/** A release's effect on the cap, before it happens (spec 11.2, 19.4). */
export interface ReleaseImpact {
  year: number;
  /** Cap hit this league year if he stays, and what stays on the cap if he's released. */
  keep: number;
  release: number;
  /** Space this league year gains: keep minus release. */
  savings: number;
  /** Dead money this league year (his proration and what's owed or accelerated) and next. */
  deadNow: number;
  deadNext: number;
  /** Whether the release splits its dead money (after June 1 or designated). */
  split: boolean;
}

/** What releasing a player on a date would do to the cap, with or without a June 1 designation. */
export function releaseImpact(
  c: Contract,
  date: GameDate,
  rules: RuleSet,
  options: { designated?: boolean; injured?: boolean; terminationPay?: boolean } = {},
  facts: CapFacts = {}
): ReleaseImpact {
  const year = leagueYear(date);
  const released: Contract = {
    ...c,
    ended: {
      date,
      how: 'released',
      designated: options.designated ?? false,
      injured: options.injured ?? false,
      terminationPay: options.terminationPay ?? false
    }
  };
  const keep = capHit(c, year, rules, facts);
  const now = capCharge(released, year, rules, facts);
  return {
    year,
    keep,
    release: now.total,
    savings: keep - now.total,
    deadNow: now.proration + now.dead,
    deadNext: capCharge(released, year + 1, rules, facts).dead,
    split: splitsDeadMoney(released.ended as ContractEnd, rules)
  };
}
