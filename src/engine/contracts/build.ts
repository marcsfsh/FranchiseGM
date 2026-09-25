/**
 * Contract builders for generated players (spec 11.3, 11.4). Structures are realistic enough for cap
 * accounting: prorated signing bonuses, rising base salaries, guarantees, and rookie scale deals.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Rng } from '../rng';
import { leagueYear, PHASES, type GameDate, type Phase } from '../model/calendar';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { TUNING } from '../tuning';
import { rookieSigningBonus } from './market';
import { emptyYear, type Contract, type ContractType } from './types';

const roundK = (value: number) => Math.round(value / 1000) * 1000;

interface Base {
  id: string;
  playerId: string;
  team: TeamAbbr;
}

/** A phase's first week in a league year: phases from free agency on fall in the season before. */
const inLeagueYear = (year: number, phase: Phase): GameDate => ({
  season: PHASES.indexOf(phase) >= PHASES.indexOf('freeAgency') ? year - 1 : year,
  phase,
  week: 1
});

const signedAt = (year: number): GameDate => inLeagueYear(year, 'freeAgency');

function contract(base: Base, type: ContractType, signed: GameDate, signingBonus: number): Contract {
  return {
    ...base,
    signed,
    type,
    years: [],
    signingBonus,
    signingBonusYears: null,
    vesting: [],
    noTrade: false,
    fifthYearOption: 'none',
    restructures: [],
    weeklyPay: 0,
    ended: null
  };
}

/**
 * A four-year rookie scale deal (spec 11.4). `credited` is the player's credited seasons at signing.
 * First-round picks carry a fifth-year option and fully guaranteed base salaries.
 */
export function rookieContract(rules: RuleSet, base: Base, draftYear: number, pick: number): Contract {
  const bonus = rookieSigningBonus(rules, pick);
  const firstRound = pick <= 32;
  const c = contract(base, 'rookie', inLeagueYear(draftYear, 'draft'), bonus);
  c.fifthYearOption = firstRound ? 'eligible' : 'none';
  c.years = Array.from({ length: rules.rookieScale.years }, (_, i) => {
    const year = emptyYear(draftYear + i);
    year.base =
      minimumSalary(rules, i) + (firstRound ? roundK(bonus * rules.rookieScale.firstRoundBaseShare) : 0);
    year.guaranteedBase =
      firstRound || (i === 0 && pick <= TUNING.contracts.guaranteedFirstYearThroughPick) ? year.base : 0;
    return year;
  });
  return c;
}

/** An undrafted free agent deal: three minimum-salary years and a small bonus. */
export function udfaContract(rules: RuleSet, base: Base, signedYear: number, bonus: number): Contract {
  const c = contract(base, 'udfa', inLeagueYear(signedYear, 'udfa'), roundK(bonus));
  c.years = Array.from({ length: rules.rookieScale.udfaYears }, (_, i) => ({
    ...emptyYear(signedYear + i),
    base: minimumSalary(rules, i)
  }));
  return c;
}

export interface VeteranTerms {
  /** Average annual value in dollars. */
  apy: number;
  /** Total length in years. */
  length: number;
  /** Years already played before `season`. */
  elapsed: number;
  /** Credited seasons at signing, for minimum salaries. */
  creditedAtSigning: number;
  /** Share of the total paid as a signing bonus. */
  bonusShare: number;
}

/** Picks the tier for an average annual value from a list ordered from the highest minimum down. */
export function tierFor<T extends { minApy: number }>(tiers: readonly T[], apy: number): T {
  return tiers.find(t => apy >= t.minApy) ?? (tiers[tiers.length - 1] as T);
}

/** A typical signing bonus share for a deal of this size. */
export function typicalBonusShare(rng: Rng, apy: number): number {
  const [low, high] = tierFor(TUNING.contracts.bonusShare, apy).range;
  return rng.range(low, high);
}

/**
 * A veteran deal: a prorated signing bonus, base salaries that rise each year, and fully guaranteed
 * base salary in the first years of bigger deals.
 */
export function veteranContract(rules: RuleSet, base: Base, season: number, terms: VeteranTerms): Contract {
  const start = season - terms.elapsed;
  const total = terms.apy * terms.length;
  const signingBonus = roundK(total * terms.bonusShare);
  const weights = Array.from({ length: terms.length }, (_, i) => 1 + TUNING.contracts.baseRaisePerYear * i);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const guaranteedYears = tierFor(TUNING.contracts.guaranteedYears, terms.apy).years;
  const c = contract(
    base,
    terms.apy <= minimumSalary(rules, terms.creditedAtSigning) * TUNING.contracts.minimumBand
      ? 'minimum'
      : 'veteran',
    signedAt(start),
    signingBonus
  );
  c.years = weights.map((w, i) => {
    const year = emptyYear(start + i);
    year.base = Math.max(
      minimumSalary(rules, terms.creditedAtSigning + i),
      roundK(((total - signingBonus) * w) / weightSum)
    );
    year.guaranteedBase = i < guaranteedYears ? year.base : 0;
    return year;
  });
  return c;
}

/** A one-year minimum deal for a veteran with this many credited seasons. */
export function minimumContract(rules: RuleSet, base: Base, season: number, credited: number): Contract {
  const c = contract(base, 'minimum', signedAt(season), 0);
  c.years = [{ ...emptyYear(season), base: minimumSalary(rules, credited) }];
  return c;
}

/** A practice squad deal at the weekly rate for the player's experience (2026 CBA). */
export function practiceSquadContract(
  rules: RuleSet,
  base: Base,
  season: number,
  credited: number,
  rng: Rng
): Contract {
  const c = contract(base, 'practiceSquad', inLeagueYear(season, 'cutdown'), 0);
  const veteran = credited > rules.roster.practiceSquadVeteranSeasons;
  c.weeklyPay = veteran
    ? roundK(
        rng.range(rules.pay.practiceSquadVeteranWeeklyMin, rules.pay.practiceSquadVeteranWeeklyMax) / 10
      ) * 10
    : rules.pay.practiceSquadWeekly;
  c.years = [{ ...emptyYear(season), base: c.weeklyPay * rules.pay.paychecks }];
  return c;
}

/** A free agent offer (spec 19.4): the same base salary each year and a signing bonus. */
export interface Offer {
  years: number;
  salary: number;
  signingBonus: number;
}

/**
 * The contract an offer makes, signed on `date` and running from its league year. Each year's base is the
 * offered salary or the minimum for the player's credited seasons that year, whichever is more.
 */
export function offerContract(
  rules: RuleSet,
  base: Base,
  date: GameDate,
  offer: Offer,
  credited: number
): Contract {
  const start = leagueYear(date);
  const type =
    offer.signingBonus === 0 && offer.salary <= minimumSalary(rules, credited) ? 'minimum' : 'veteran';
  const c = contract(base, type, { ...date }, offer.signingBonus);
  c.years = Array.from({ length: offer.years }, (_, i) => ({
    ...emptyYear(start + i),
    base: Math.max(offer.salary, minimumSalary(rules, credited + i))
  }));
  return c;
}

/** A practice squad deal signed on `date`, at a weekly rate through the rest of the season. */
export function practiceSquadSigning(
  rules: RuleSet,
  base: Base,
  date: GameDate,
  weeklyPay: number
): Contract {
  const c = contract(base, 'practiceSquad', { ...date }, 0);
  c.weeklyPay = weeklyPay;
  c.years = [{ ...emptyYear(leagueYear(date)), base: weeklyPay * rules.pay.paychecks }];
  return c;
}
