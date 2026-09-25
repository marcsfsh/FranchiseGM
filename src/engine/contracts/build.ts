/**
 * Contract builders for generated players (spec 11.3, 11.4). Structures are realistic enough for cap
 * accounting: prorated signing bonuses, rising base salaries, guarantees, and rookie scale deals.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Rng } from '../rng';
import type { GameDate } from '../model/calendar';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { rookieSigningBonus } from './market';
import { emptyYear, type Contract, type ContractType } from './types';

const roundK = (value: number) => Math.round(value / 1000) * 1000;

interface Base {
  id: string;
  playerId: string;
  team: TeamAbbr;
}

const signedAt = (season: number): GameDate => ({ season: season - 1, phase: 'freeAgency', week: 1 });

function contract(base: Base, type: ContractType, signed: GameDate, signingBonus: number): Contract {
  return {
    ...base,
    signed,
    type,
    years: [],
    signingBonus,
    vesting: [],
    noTrade: false,
    fifthYearOption: 'none',
    restructures: [],
    weeklyPay: 0
  };
}

/**
 * A four-year rookie scale deal (spec 11.4). `credited` is the player's credited seasons at signing.
 * First-round picks carry a fifth-year option and fully guaranteed base salaries.
 */
export function rookieContract(rules: RuleSet, base: Base, draftYear: number, pick: number): Contract {
  const bonus = rookieSigningBonus(rules, pick);
  const firstRound = pick <= 32;
  const c = contract(base, 'rookie', { season: draftYear, phase: 'draft', week: 1 }, bonus);
  c.fifthYearOption = firstRound ? 'eligible' : 'none';
  c.years = Array.from({ length: rules.rookieScale.years }, (_, i) => {
    const year = emptyYear(draftYear + i);
    year.base =
      minimumSalary(rules, i) + (firstRound ? roundK(bonus * rules.rookieScale.firstRoundBaseShare) : 0);
    year.guaranteedBase = firstRound ? year.base : i === 0 && pick <= 64 ? year.base : 0;
    return year;
  });
  return c;
}

/** An undrafted free agent deal: three minimum-salary years and a small bonus. */
export function udfaContract(rules: RuleSet, base: Base, signedYear: number, bonus: number): Contract {
  const c = contract(base, 'udfa', { season: signedYear, phase: 'udfa', week: 1 }, roundK(bonus));
  c.years = Array.from({ length: 3 }, (_, i) => ({
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

/** A typical signing bonus share for a deal of this size. */
export function typicalBonusShare(rng: Rng, apy: number): number {
  return apy >= 20_000_000
    ? rng.range(0.32, 0.45)
    : apy >= 5_000_000
      ? rng.range(0.18, 0.32)
      : rng.range(0, 0.12);
}

/**
 * A veteran deal: a prorated signing bonus, base salaries that rise each year, and fully guaranteed
 * base salary in the first years of bigger deals.
 */
export function veteranContract(rules: RuleSet, base: Base, season: number, terms: VeteranTerms): Contract {
  const start = season - terms.elapsed;
  const total = terms.apy * terms.length;
  const signingBonus = roundK(total * terms.bonusShare);
  const weights = Array.from({ length: terms.length }, (_, i) => 1 + 0.1 * i);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const guaranteedYears = terms.apy >= 20_000_000 ? 2 : terms.apy >= 8_000_000 ? 1 : 0;
  const c = contract(
    base,
    terms.apy <= minimumSalary(rules, terms.creditedAtSigning) * 1.05 ? 'minimum' : 'veteran',
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
  const c = contract(base, 'practiceSquad', { season, phase: 'cutdown', week: 1 }, 0);
  const veteran = credited > rules.roster.practiceSquadVeteranSeasons;
  c.weeklyPay = veteran
    ? roundK(
        rng.range(rules.pay.practiceSquadVeteranWeeklyMin, rules.pay.practiceSquadVeteranWeeklyMax) / 10
      ) * 10
    : rules.pay.practiceSquadWeekly;
  c.years = [{ ...emptyYear(season), base: c.weeklyPay * rules.pay.paychecks }];
  return c;
}
