/**
 * Changes to a contract (spec 11.2): ending it, restructuring it, deciding an option, and settling its
 * incentives. Each returns a new contract, or a reason the change can't be made that the UI can show.
 */
import { leagueYear, type GameDate } from '../model/calendar';
import type { RuleSet } from '../rules/ruleset';
import type { SeasonLine } from '../season/news';
import { dollars } from '../text';
import { baseBetween, leagueYearStart, payWeek, prorationYears as signingBonusSchedule } from './cap';
import { emptyYear, type Contract, type ContractEnd } from './types';

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: string): Outcome<T> => ({ ok: false, reason });

/** The deal ended as described. */
export const endContract = (c: Contract, end: ContractEnd): Contract => ({ ...c, ended: end });

/** Base salary of the year still to be paid from a date on, which is all a restructure can convert. */
export function unpaidBase(c: Contract, year: number, date: GameDate, rules: RuleSet): number {
  const entry = c.years.find(y => y.year === year);
  if (!entry || entry.isVoid) return 0;
  const from = Math.max(payWeek(date, year, rules), payWeek(c.signed, year, rules));
  return baseBetween(c, entry, from, rules.season.weeks + 1, rules);
}

/**
 * Base salary of the current league year a restructure can convert: what's still to be paid, above the
 * minimum salary's share of the weeks left.
 */
export function convertible(c: Contract, date: GameDate, minimum: number, rules: RuleSet): number {
  const year = leagueYear(date);
  const from = Math.max(payWeek(date, year, rules), payWeek(c.signed, year, rules));
  const floor = Math.round((minimum * Math.max(0, rules.season.weeks + 1 - from)) / rules.season.weeks);
  return unpaidBase(c, year, date, rules) - floor;
}

/**
 * Converts base salary of the current league year into a bonus prorated over this year and the deal's
 * remaining years, at most `prorationYearsMax` of them, adding void years to spread it further (spec
 * 11.2). The year's base can't fall below `minimum`, the player's minimum salary, and only unpaid base
 * converts; guarantees on the converted money go with it, since a bonus is paid at once.
 */
export function restructure(
  c: Contract,
  date: GameDate,
  amount: number,
  minimum: number,
  rules: RuleSet,
  voidYears = 0
): Outcome<Contract> {
  const year = leagueYear(date);
  const index = c.years.findIndex(y => y.year === year);
  const entry = c.years[index];
  if (c.ended) return refuse('This contract has ended.');
  if (!entry || entry.isVoid) return refuse(`The contract has no ${year} salary to convert.`);
  if (c.type === 'practiceSquad') return refuse("Practice squad contracts can't be restructured.");
  // The CBA bars renegotiating a drafted rookie's deal until his third regular season is over.
  const first = c.years[0]?.year ?? year;
  if (c.type === 'rookie' && year < first + 3)
    return refuse(
      `A drafted rookie's contract can't be renegotiated until after his third season (${first + 2}).`
    );
  if (!Number.isInteger(amount) || amount <= 0) return refuse('Convert a whole-dollar amount above zero.');
  // The weeks still to be paid keep at least the minimum salary's share of them.
  const room = convertible(c, date, minimum, rules);
  if (amount > room)
    return refuse(
      room > 0
        ? `At most ${dollars(room)} of the ${year} base salary can convert.`
        : `The ${year} base salary is already at the minimum or paid.`
    );
  const last = c.years[c.years.length - 1]?.year ?? year;
  const added = Array.from({ length: voidYears }, (_, i) => ({ ...emptyYear(last + 1 + i), isVoid: true }));
  const years = [...c.years, ...added].map((y, i) => {
    if (i !== index) return y;
    const base = y.base - amount;
    return {
      ...y,
      base,
      guaranteedBase: Math.min(y.guaranteedBase, base),
      injuryGuaranteedBase: Math.min(y.injuryGuaranteedBase, base)
    };
  });
  const prorationYears = years.slice(index, index + rules.pay.prorationYearsMax).map(y => y.year);
  if (prorationYears.length < 2)
    return refuse(
      `The contract ends after ${year}, so a restructure saves nothing unless it adds void years.`
    );
  return ok({
    ...c,
    // Void years added now spread only this money: the signing bonus keeps its schedule.
    signingBonusYears: signingBonusSchedule(c, rules),
    years,
    restructures: [...c.restructures, { date, amount, prorationYears }]
  });
}

/**
 * Decides an option year (spec 11.2). Exercising keeps the year and starts its option bonus prorating;
 * declining ends the deal as the option year opens, so the remaining proration accelerates into it.
 */
export function decideOption(
  c: Contract,
  year: number,
  exercise: boolean,
  rules: RuleSet
): Outcome<Contract> {
  const entry = c.years.find(y => y.year === year);
  if (c.ended) return refuse('This contract has ended.');
  if (!entry?.option) return refuse(`The contract has no option for ${year}.`);
  if (entry.optionExercised !== null) return refuse(`The ${year} option was already decided.`);
  const index = c.years.indexOf(entry);
  const bonusYears = c.years.slice(index, index + rules.pay.prorationYearsMax).map(y => y.year);
  const years = c.years.map(y =>
    y.year === year
      ? { ...y, optionExercised: exercise, optionBonusYears: exercise && y.optionBonus ? bonusYears : null }
      : y
  );
  const decided = { ...c, years };
  if (exercise) return ok(decided);
  return ok(
    endContract(decided, {
      date: leagueYearStart(year),
      how: 'declined',
      designated: false,
      injured: false,
      terminationPay: false
    })
  );
}

/**
 * Classifies a year's incentives as the league year opens (the CBA's Article 13): one with a stat mark is
 * likely to be earned when the player's last regular season reached it, and counts on the cap now if so.
 */
export function classifyIncentives(c: Contract, year: number, totals: SeasonLine | undefined): Contract {
  const entry = c.years.find(y => y.year === year);
  if (!entry?.incentives.some(i => i.stat)) return c;
  const incentives = entry.incentives.map(i => (i.stat ? { ...i, likely: (totals?.[i.stat.key] ?? 0) >= i.stat.atLeast } : i));
  return { ...c, years: c.years.map(y => (y.year === year ? { ...y, incentives } : y)) };
} // prettier-ignore

/**
 * Settles a year's incentives when the regular season ends: each is earned if the player's season total
 * reaches its mark (incentives without a stat mark aren't earned). A deal that ended before the season did
 * leaves them unsettled.
 */
export function settleIncentives(
  c: Contract,
  year: number,
  totals: SeasonLine | undefined,
  rules: RuleSet
): Contract {
  const entry = c.years.find(y => y.year === year);
  if (!entry?.incentives.length) return c;
  if (c.ended && payWeek(c.ended.date, year, rules) <= rules.season.weeks) return c;
  const incentives = entry.incentives.map(i => ({
    ...i,
    earned: i.stat !== null && (totals?.[i.stat.key] ?? 0) >= i.stat.atLeast
  }));
  return { ...c, years: c.years.map(y => (y.year === year ? { ...y, incentives } : y)) };
}
