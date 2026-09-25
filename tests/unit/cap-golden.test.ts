import { describe, expect, it } from 'vitest';
import { capCharge, capHit, releaseImpact, weeksInForce } from '../../src/engine/contracts/cap';
import { minimumContract } from '../../src/engine/contracts/build';
import { decideOption, endContract, restructure, settleIncentives } from '../../src/engine/contracts/moves';
import { contractSummary, contractView } from '../../src/engine/contracts/view';
import {
  emptyYear,
  type Contract,
  type ContractEnd,
  type ContractYear
} from '../../src/engine/contracts/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import { DEFAULT_RULES as R } from '../../src/engine/rules/ruleset';
import { claimedContract } from '../../src/engine/roster/waivers';

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

describe('waiver claims (spec 11.2, 12.1)', () => {
  // 2027 has a $1M roster bonus and a $250,000 workout bonus; the 2028 team option's $2M bonus, once
  // exercised, is prorated over 2028 and 2029 ($1M each).
  const claimable = decideOption(
    deal({
      years: [
        year(2026, { base: 2_000_000 }),
        year(2027, { base: 3_000_000, rosterBonus: 1_000_000, workoutBonus: 250_000 }),
        year(2028, { base: 4_000_000, option: 'team', optionBonus: 2_000_000 }),
        year(2029, { base: 5_000_000 })
      ]
    }),
    2028,
    true,
    R
  );
  if (!claimable.ok) throw new Error(claimable.reason);
  const claim = (date: GameDate) => {
    const old = endContract(claimable.value, { date, how: 'claimed', designated: false, injured: false, terminationPay: false });
    return { old, taken: claimedContract(old, 'KC', 'c2', date, R) };
  }; // prettier-ignore

  it('leaves the bonuses the old deal earned with the team that released him', () => {
    // Claimed in camp, July 2027: the old team earned the roster and workout bonuses ($1.25M in 2027), and
    // the option bonus's proration lands in 2028 ($2M). The claiming team pays salary only.
    const { old, taken } = claim(at(2026, 'trainingCamp'));
    expect(hits(old, [2027, 2028, 2029])).toEqual([1_250_000, 2_000_000, 0]);
    expect(hits(taken, [2027, 2028, 2029])).toEqual([3_000_000, 4_000_000, 5_000_000]);
  });

  it('passes on the bonuses not yet earned', () => {
    // Claimed as the 2027 league year opens: the roster bonus isn't due yet, nor the workout bonus.
    const { old, taken } = claim(at(2026, 'freeAgency', 1));
    expect(hits(old, [2027, 2028])).toEqual([2_000_000, 0]);
    expect(hits(taken, [2027, 2028])).toEqual([4_250_000, 4_000_000]);
  });
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

  it('converts only salary still to come in season, and pays the weeks after it less', () => {
    // $300,000 of the 2026 base at week 10, over 2026 to 2029: $75,000 a year. Weeks 1 to 9 paid $111,111
    // each ($1M); weeks 10 to 18 pay what's left of the other $1M, $77,778 each ($700,000).
    const done = restructure(vet, at(2026, 'regularSeason', 10), 300_000, 1_215_000, R);
    if (!done.ok) throw new Error(done.reason);
    expect(capCharge(done.value, 2026, R)).toMatchObject({ base: 1_700_000, proration: 2_575_000, total: 5_275_000 });
    // Released before week 14: 9 weeks at the old rate and 4 at the new ($1,311,111), and the rest of the
    // proration moves to 2027 with the 2027 guarantee.
    const cut = release(done.value, at(2026, 'regularSeason', 14));
    expect(capCharge(cut, 2026, R)).toMatchObject({ base: 1_311_111, total: 1_311_111 + 1_000_000 + 2_575_000 });
    expect(capHit(cut, 2027, R)).toBe(7_500_000 + 225_000 + 8_000_000);
    // A deal signed before week 15 pays 4 weeks of its $18M base ($4M), so no more than that can convert.
    const late = deal({ signed: at(2026, 'regularSeason', 15), years: [year(2026, { base: 18_000_000 }), year(2027, { base: 18_000_000 })] });
    expect(restructure(late, at(2026, 'regularSeason', 15), 16_800_000, 1_215_000, R).ok).toBe(false);
    expect(restructure(late, at(2026, 'regularSeason', 15), 3_700_000, 1_215_000, R).ok).toBe(true);
  }); // prettier-ignore

  it("won't renegotiate a drafted rookie's deal before his fourth league year", () => {
    const rookie = deal({
      type: 'rookie',
      years: [2026, 2027, 2028, 2029].map(y => year(y, { base: 3_000_000 }))
    });
    expect(restructure(rookie, at(2027, 'freeAgency', 2), 1_000_000, 885_000, R)).toEqual({
      ok: false,
      reason: "A drafted rookie's contract can't be renegotiated until after his third season (2028)."
    });
    // In 2029, his fourth league year and the deal's last, a void year gives the money somewhere to go.
    expect(restructure(rookie, at(2028, 'freeAgency', 2), 1_000_000, 885_000, R, 1).ok).toBe(true);
  });

  it('refuses to convert below the minimum salary or money already paid', () => {
    expect(restructure(vet, march, 7_000_000, 1_215_000, R)).toEqual({
      ok: false,
      reason: 'At most $6,785,000 of the 2027 base salary can convert.'
    });
    // Before week 10 of 2026, 9 of 18 weeks ($1M) are paid; the other $1M, less the minimum's share of
    // those 9 weeks ($607,500), leaves $392,500 to convert.
    expect(restructure(vet, at(2026, 'regularSeason', 10), 100_000, 1_215_000, R).ok).toBe(true);
    expect(restructure(vet, at(2026, 'regularSeason', 10), 800_000, 1_215_000, R).ok).toBe(false);
    // In its last year, only void years give the money somewhere to go.
    const lastYear = at(2028, 'freeAgency', 2);
    expect(restructure(vet, lastYear, 1_000_000, 1_215_000, R)).toEqual({
      ok: false,
      reason: 'The contract ends after 2029, so a restructure saves nothing unless it adds void years.'
    });
    expect(restructure(vet, lastYear, 1_000_000, 1_215_000, R, 1).ok).toBe(true);
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

describe('the contract view (spec 11.2)', () => {
  it('shows each remaining year with its cash and what a release before and after June 1 would do', () => {
    // In March 2027 (the 2027 league year, before June 1).
    const rows = contractView(vet, at(2026, 'freeAgency', 2), R);
    expect(rows.map(r => [r.year, r.capHit, r.cash])).toEqual([
      [2027, 11_000_000, 8_500_000],
      [2028, 12_250_000, 9_000_000],
      [2029, 12_000_000, 9_500_000]
    ]);
    // 2027: cut now, everything accelerates ($15.5M, costing $4.5M of space); designated, $10.5M now and $5M next.
    expect(rows[0]?.cutEarly).toEqual({ deadNow: 15_500_000, deadNext: 0, savings: -4_500_000 });
    expect(rows[0]?.cutLate).toEqual({ deadNow: 10_500_000, deadNext: 5_000_000, savings: 500_000 });
    // 2028: cut as the year opens, 2028 and 2029 proration ($5M); in camp, $2.5M now and $2.5M next.
    expect(rows[1]?.cutEarly).toEqual({ deadNow: 5_000_000, deadNext: 0, savings: 7_250_000 });
    expect(rows[1]?.cutLate).toEqual({ deadNow: 2_500_000, deadNext: 2_500_000, savings: 9_750_000 });
    expect(rows[2]?.cutEarly).toEqual({ deadNow: 2_500_000, deadNext: 0, savings: 9_500_000 });
    // In season only the after-June 1 release is left for the current year.
    const season = contractView(vet, at(2026, 'regularSeason', 5), R);
    expect(season[0]?.cutEarly).toBeNull();
    expect(season[0]?.cutLate?.deadNext).toBe(7_500_000 + 8_000_000);
    // Signing bonus year: the $10M bonus is 2026 cash.
    expect(season[0]?.cash).toBe(2_000_000 + 1_000_000 + 10_000_000);
    // A minimum deal signed before week 10 pays 9 of 18 weeks.
    const late = {
      ...minimumContract(R, { id: 'c2', playerId: 'p2', team: 'MIN' }, 2026, 0),
      signed: at(2026, 'regularSeason', 10)
    };
    expect(contractView(late, at(2026, 'regularSeason', 10), R)[0]?.cash).toBe(442_500);
    expect(contractSummary(vet, at(2026, 'regularSeason', 5))).toEqual({
      total: 10_000_000 + 2_000_000 + 1_000_000 + 8_000_000 + 500_000 + 9_000_000 + 9_500_000,
      years: 4,
      apy: 10_000_000,
      guaranteed: 10_000_000 + 8_000_000,
      remaining: 4
    });
  });
});
