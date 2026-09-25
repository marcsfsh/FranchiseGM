import { describe, expect, it } from 'vitest';
import { capCharge, capHit, releaseImpact, weeksInForce } from '../../src/engine/contracts/cap';
import { minimumContract } from '../../src/engine/contracts/build';
import { decideOption, endContract, restructure, settleIncentives } from '../../src/engine/contracts/moves';
import {
  emptyYear,
  type Contract,
  type ContractEnd,
  type ContractYear
} from '../../src/engine/contracts/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import { DEFAULT_RULES as R } from '../../src/engine/rules/ruleset';

// Golden tests (spec 11.2): every number below is worked by hand. The 2026 league year's regular season has
// 18 weeks and 17 games; a date in the offseason before a league year's season sits in the season before
// (the 2027 league year opens at the 2026 season's free agency).
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });
const year = (y: number, change: Partial<ContractYear> = {}): ContractYear => ({
  ...emptyYear(y),
  ...change
});
const deal = (change: Partial<Contract>): Contract => ({
  id: 'c1',
  playerId: 'p1',
  team: 'MIN',
  signed: at(2025, 'freeAgency'),
  type: 'veteran',
  years: [],
  signingBonus: 0,
  signingBonusYears: null,
  vesting: [],
  noTrade: false,
  fifthYearOption: 'none',
  restructures: [],
  weeklyPay: 0,
  ended: null,
  ...change
});
const release = (c: Contract, date: GameDate, change: Partial<ContractEnd> = {}): Contract =>
  endContract(c, {
    date,
    how: 'released',
    designated: false,
    injured: false,
    terminationPay: false,
    ...change
  });
const hits = (c: Contract, years: number[]) => years.map(y => capHit(c, y, R));

// A four-year deal: $10M signing bonus ($2.5M a year), a 2026 roster bonus, a fully guaranteed 2027 base
// with a workout bonus, a likely incentive in 2028, and an unlikely one in 2029.
const vet = deal({
  signingBonus: 10_000_000,
  years: [
    year(2026, { base: 2_000_000, rosterBonus: 1_000_000 }),
    year(2027, { base: 8_000_000, workoutBonus: 500_000, guaranteedBase: 8_000_000 }),
    year(2028, {
      base: 9_000_000,
      incentives: [{ condition: '10 sacks', amount: 750_000, likely: true, stat: { key: 'sacks', atLeast: 10 }, earned: null }]
    }),
    year(2029, {
      base: 9_500_000,
      incentives: [{ condition: '15 sacks', amount: 1_000_000, likely: false, stat: { key: 'sacks', atLeast: 15 }, earned: null }]
    })
  ]
}); // prettier-ignore

describe('cap hits and proration (spec 11.2)', () => {
  it('counts base, bonuses, likely incentives, and proration in each year', () => {
    // 2026: 2.0 + 1.0 roster + 2.5; 2027: 8.0 + 0.5 workout + 2.5; 2028: 9.0 + 0.75 likely + 2.5;
    // 2029: 9.5 + 2.5 (the unlikely incentive waits); 2030: nothing.
    expect(hits(vet, [2026, 2027, 2028, 2029, 2030])).toEqual([
      5_500_000, 11_000_000, 12_250_000, 12_000_000, 0
    ]);
  });

  it('pays base salary only for the weeks a deal signed in season is in force', () => {
    // Signed before week 10: weeks 10 to 18, 9 of 18, of the $885,000 minimum is $442,500.
    const late = { ...minimumContract(R, { id: 'c2', playerId: 'p2', team: 'MIN' }, 2026, 0), signed: at(2026, 'regularSeason', 10) };
    expect(weeksInForce(late, 2026, R)).toBe(9);
    expect(capHit(late, 2026, R)).toBe(442_500);
  }); // prettier-ignore

  it('accelerates void-year proration into the first void year when the deal voids', () => {
    // Three real years and two void years: $10M over five years is $2M each. 2026 to 2028 carry $3M base
    // plus $2M; 2029 takes both void years' $2M; 2030 has nothing left.
    const voiding = deal({
      signingBonus: 10_000_000,
      years: [2026, 2027, 2028].map(y => year(y, { base: 3_000_000 })).concat([2029, 2030].map(y => year(y, { isVoid: true })))
    }); // prettier-ignore
    expect(hits(voiding, [2026, 2027, 2028, 2029, 2030])).toEqual([
      5_000_000, 5_000_000, 5_000_000, 4_000_000, 0
    ]);
    // Released before June 1 of 2028: 2028's $2M and the void years' $4M, with no base.
    expect(hits(release(voiding, at(2027, 'freeAgency', 2)), [2028, 2029])).toEqual([6_000_000, 0]);
  });

  it('charges per-game roster bonuses for the games he was active', () => {
    // $1.7M over 17 games is $100,000 a game; inactive for 3, he earns 14.
    const perGame = deal({ years: [year(2026, { base: 1_000_000, perGameBonus: 1_700_000 })] });
    expect(capHit(perGame, 2026, R)).toBe(2_700_000);
    expect(capHit(perGame, 2026, R, { inactive: () => 3 })).toBe(2_400_000);
  });
});

describe('dead money and June 1 (spec 11.2)', () => {
  const offseason = at(2026, 'freeAgency', 2); // March 2027: the 2027 league year, before June 1

  it('accelerates everything into the current year on a release before June 1', () => {
    // 2027: no base played; $2.5M proration; the $8M guarantee owed; 2028 and 2029 proration ($5M).
    const cut = release(vet, offseason);
    expect(capCharge(cut, 2027, R)).toEqual({ base: 0, bonuses: 0, proration: 2_500_000, dead: 13_000_000, total: 15_500_000 });
    expect(hits(cut, [2026, 2028, 2029])).toEqual([5_500_000, 0, 0]);
    expect(releaseImpact(vet, offseason, R)).toEqual({
      year: 2027, keep: 11_000_000, release: 15_500_000, savings: -4_500_000, deadNow: 15_500_000, deadNext: 0, split: false
    });
  }); // prettier-ignore

  it('moves later years to the next league year with a June 1 designation', () => {
    // 2027 keeps its own proration and the guarantee ($10.5M); 2028 takes 2028 and 2029 proration ($5M).
    const cut = release(vet, offseason, { designated: true });
    expect(hits(cut, [2027, 2028, 2029])).toEqual([10_500_000, 5_000_000, 0]);
    expect(releaseImpact(vet, offseason, R, { designated: true })).toMatchObject({
      savings: 500_000, deadNow: 10_500_000, deadNext: 5_000_000, split: true
    });
  }); // prettier-ignore

  it('splits a release after June 1 without a designation, after the workout bonus is earned', () => {
    // Training camp, July 2027: 2027 keeps the $0.5M workout bonus, $2.5M proration, and the $8M guarantee.
    const cut = release(vet, at(2026, 'trainingCamp'));
    expect(hits(cut, [2027, 2028])).toEqual([11_000_000, 5_000_000]);
  });

  it('charges base paid through the release in season, and termination pay for a vested veteran', () => {
    // Released before week 10 of 2026: 9 of 18 weeks of the $2M base ($1M), the roster bonus, and 2026's
    // proration. After June 1, so 2027 takes the later proration ($7.5M) and the 2027 guarantee ($8M).
    const cut = release(vet, at(2026, 'regularSeason', 10));
    expect(hits(cut, [2026, 2027, 2028])).toEqual([4_500_000, 15_500_000, 0]);
    // A vested veteran on the week 1 roster is owed the rest of his season's base: $1M more in 2026.
    const vested = release(vet, at(2026, 'regularSeason', 10), { terminationPay: true });
    expect(capHit(vested, 2026, R)).toBe(5_500_000);
  });

  it('leaves the proration with the old team on a trade, and the guarantees with the player', () => {
    // 2027's $2.5M and the later $5M accelerate; the $8M guarantee goes with him.
    const traded = endContract(vet, { date: offseason, how: 'traded', designated: false, injured: false, terminationPay: false });
    expect(hits(traded, [2027, 2028])).toEqual([7_500_000, 0]);
  }); // prettier-ignore
});

describe('guarantees (spec 11.2)', () => {
  it('owes injury guarantees only when he is released hurt', () => {
    const deal2 = deal({ years: [year(2026, { base: 1_000_000 }), year(2027, { base: 6_000_000, injuryGuaranteedBase: 4_000_000 })] });
    expect(capHit(release(deal2, at(2026, 'freeAgency', 2)), 2027, R)).toBe(0);
    expect(capHit(release(deal2, at(2026, 'freeAgency', 2), { injured: true }), 2027, R)).toBe(4_000_000);
  }); // prettier-ignore

  it('owes a guarantee once it vests', () => {
    // $5M of the 2028 base vests when the 2028 league year opens.
    const vesting = deal({
      years: [2026, 2027, 2028].map(y => year(y, { base: 7_000_000 })),
      vesting: [{ year: 2028, date: at(2027, 'freeAgency', 1), amount: 5_000_000 }]
    });
    // Cut in March 2027 (before it vests): nothing owed. Cut in March 2028 (after): $5M.
    expect(capHit(release(vesting, at(2026, 'freeAgency', 2)), 2027, R)).toBe(0);
    expect(capHit(release(vesting, at(2027, 'freeAgency', 2)), 2028, R)).toBe(5_000_000);
  });
});

describe('restructures (spec 11.2)', () => {
  const march = at(2026, 'freeAgency', 2);

  it('converts base salary to a bonus prorated over the remaining years', () => {
    // $6M of the 2027 base over 2027 to 2029: $2M a year. 2027 falls from $11M to $7M.
    const done = restructure(vet, march, 6_000_000, 1_215_000, R);
    if (!done.ok) throw new Error(done.reason);
    expect(hits(done.value, [2026, 2027, 2028, 2029])).toEqual([5_500_000, 7_000_000, 14_250_000, 14_000_000]);
    expect(done.value.years[1]?.guaranteedBase).toBe(2_000_000);
  }); // prettier-ignore

  it('spreads it further with void years, keeping the signing bonus schedule', () => {
    // Two void years: $6M over 2027 to 2031 is $1.2M a year; the void years' $2.4M lands in 2030.
    const done = restructure(vet, march, 6_000_000, 1_215_000, R, 2);
    if (!done.ok) throw new Error(done.reason);
    expect(hits(done.value, [2026, 2027, 2028, 2029, 2030, 2031])).toEqual([
      5_500_000, 6_200_000, 13_450_000, 13_200_000, 2_400_000, 0
    ]);
  });

  it('refuses to convert below the minimum salary or money already paid', () => {
    expect(restructure(vet, march, 7_000_000, 1_215_000, R)).toEqual({
      ok: false,
      reason: 'At most $6,785,000 of the 2027 base salary can convert.'
    });
    // Before week 10 of 2026 half the $2M base is paid, and the minimum caps the rest at $785,000.
    expect(restructure(vet, at(2026, 'regularSeason', 10), 100_000, 1_215_000, R).ok).toBe(true);
    expect(restructure(vet, at(2026, 'regularSeason', 10), 800_000, 1_215_000, R).ok).toBe(false);
  });
});

describe('options and incentives (spec 11.2)', () => {
  // A team option on 2028 with a $3M option bonus; $6M signing bonus over four years ($1.5M each).
  const option = deal({
    signingBonus: 6_000_000,
    years: [
      year(2026, { base: 2_000_000 }),
      year(2027, { base: 4_000_000 }),
      year(2028, { base: 10_000_000, option: 'team', optionBonus: 3_000_000 }),
      year(2029, { base: 11_000_000 })
    ]
  });

  it('prorates an exercised option bonus from its year', () => {
    // $3M over 2028 and 2029: $1.5M each on top of the signing bonus's $1.5M.
    const done = decideOption(option, 2028, true, R);
    if (!done.ok) throw new Error(done.reason);
    expect(hits(done.value, [2027, 2028, 2029])).toEqual([5_500_000, 13_000_000, 14_000_000]);
    expect(decideOption(done.value, 2028, false, R)).toEqual({ ok: false, reason: 'The 2028 option was already decided.' });
  }); // prettier-ignore

  it('ends the deal when an option is declined, accelerating proration into the option year', () => {
    // 2028: its own $1.5M and 2029's $1.5M, with no salary.
    const done = decideOption(option, 2028, false, R);
    if (!done.ok) throw new Error(done.reason);
    expect(hits(done.value, [2027, 2028, 2029])).toEqual([5_500_000, 3_000_000, 0]);
  });

  it('settles incentives: an unlikely one earned is charged next year, a likely one missed is credited', () => {
    // 8 sacks in 2028 misses the likely incentive: 2029 gets a $750,000 credit.
    const missed = settleIncentives(vet, 2028, { sacks: 8 }, R);
    expect(capHit(missed, 2029, R)).toBe(12_000_000 - 750_000);
    // 16 sacks in 2029 earns the unlikely incentive: $1M charged in 2030.
    const earned = settleIncentives(vet, 2029, { sacks: 16 }, R);
    expect(capHit(earned, 2030, R)).toBe(1_000_000);
    expect(capHit(settleIncentives(vet, 2028, { sacks: 12 }, R), 2029, R)).toBe(12_000_000);
  });
});
