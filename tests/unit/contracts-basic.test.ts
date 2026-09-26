import { describe, expect, it } from 'vitest';
import { capHit, signingBonusProration, teamCapTotal } from '../../src/engine/contracts/cap';
import {
  minimumContract,
  practiceSquadContract,
  rookieContract,
  typicalBonusShare,
  udfaContract,
  veteranContract
} from '../../src/engine/contracts/build';
import { marketValue, rookieSigningBonus } from '../../src/engine/contracts/market';
import { emptyYear, type Contract } from '../../src/engine/contracts/types';
import { DEFAULT_RULES as R } from '../../src/engine/rules/ruleset';
import { Rng } from '../../src/engine/rng';

const base = { id: 'c1', playerId: 'p1', team: 'MIN' as const };

// Golden tests: every number below is checked by hand (spec 11.2).
describe('cap hit golden tests', () => {
  const deal: Contract = {
    ...base,
    signed: { season: 2025, phase: 'freeAgency', week: 1 },
    type: 'veteran',
    signingBonus: 10_000_000,
    years: [
      { ...emptyYear(2026), base: 2_000_000, rosterBonus: 1_000_000 },
      { ...emptyYear(2027), base: 8_000_000, workoutBonus: 500_000 },
      {
        ...emptyYear(2028),
        base: 9_000_000,
        incentives: [{ condition: '10 sacks', amount: 750_000, likely: true, stat: null, earned: null }]
      },
      {
        ...emptyYear(2029),
        base: 9_500_000,
        incentives: [{ condition: 'Pro Bowl', amount: 1_000_000, likely: false, stat: null, earned: null }]
      }
    ],
    vesting: [],
    noTrade: false,
    fifthYearOption: 'none',
    restructures: [],
    weeklyPay: 0,
    signingBonusYears: null,
    ended: null
  };

  it('prorates a signing bonus evenly over the contract years', () => {
    // $10M over 4 years = $2.5M a year.
    expect([2026, 2027, 2028, 2029].map(y => signingBonusProration(deal, y, R))).toEqual([
      2_500_000, 2_500_000, 2_500_000, 2_500_000
    ]);
    expect(signingBonusProration(deal, 2030, R)).toBe(0);
  });

  it('caps proration at five years and puts rounding in the first year', () => {
    const long = {
      ...deal,
      signingBonus: 7_000_001,
      years: [2026, 2027, 2028, 2029, 2030, 2031].map(emptyYear)
    };
    // Five proration years: $1,400,000 each, with the extra $1 in 2026. The sixth year gets none.
    expect([2026, 2027, 2028, 2029, 2030, 2031].map(y => signingBonusProration(long, y, R))).toEqual([
      1_400_001, 1_400_000, 1_400_000, 1_400_000, 1_400_000, 0
    ]);
  });

  it('adds base, roster, workout, and likely incentives in the year earned', () => {
    expect(capHit(deal, 2026, R)).toBe(2_000_000 + 1_000_000 + 2_500_000); // 5,500,000
    expect(capHit(deal, 2027, R)).toBe(8_000_000 + 500_000 + 2_500_000); // 11,000,000
    expect(capHit(deal, 2028, R)).toBe(9_000_000 + 750_000 + 2_500_000); // 12,250,000
    expect(capHit(deal, 2029, R)).toBe(9_500_000 + 2_500_000); // unlikely incentive excluded: 12,000,000
  });

  it('charges only proration in a void year', () => {
    const voided = { ...deal, years: [...deal.years, { ...emptyYear(2030), isVoid: true, base: 5_000_000 }] };
    // Five proration years now: $2M each; the void year carries proration only.
    expect(capHit(voided, 2030, R)).toBe(2_000_000);
    expect(capHit(voided, 2026, R)).toBe(2_000_000 + 1_000_000 + 2_000_000);
  });

  it('charges practice squad pay for the full season', () => {
    const ps = practiceSquadContract(R, base, 2026, 1, new Rng(1));
    expect(ps.weeklyPay).toBe(13_750);
    expect(capHit(ps, 2026, R)).toBe(247_500); // 18 x $13,750
  });

  it('sums a team', () => {
    expect(teamCapTotal([deal, minimumContract(R, { ...base, id: 'c2' }, 2026, 7)], 2026, R)).toBe(
      5_500_000 + 1_300_000
    );
  });
});

describe('contract builders', () => {
  it('builds rookie scale deals by pick', () => {
    expect(rookieSigningBonus(R, 1)).toBe(33_000_000);
    expect(rookieSigningBonus(R, 32)).toBeGreaterThan(6_000_000);
    expect(rookieSigningBonus(R, 32)).toBeLessThan(6_600_000);
    expect(rookieSigningBonus(R, 64)).toBeGreaterThan(2_400_000);
    expect(rookieSigningBonus(R, 64)).toBeLessThan(2_800_000);
    expect(rookieSigningBonus(R, 250)).toBe(80_000);
    const first = rookieContract(R, base, 2026, 1);
    expect(first.years).toHaveLength(4);
    expect(first.fifthYearOption).toBe('eligible');
    expect(first.years.every(y => y.guaranteedBase === y.base)).toBe(true);
    const late = rookieContract(R, base, 2024, 200);
    expect(late.years[0]?.base).toBe(885_000);
    expect(late.years[2]?.year).toBe(2026);
    expect(capHit(late, 2026, R)).toBe(1_075_000 + 20_000); // minimum for 2 seasons + $80K / 4
  });

  it('builds veteran deals that respect minimums and rise over time', () => {
    const rng = new Rng(3);
    const vet = veteranContract(R, base, 2026, {
      apy: 25_000_000,
      length: 4,
      elapsed: 1,
      creditedAtSigning: 5,
      bonusShare: typicalBonusShare(rng, 25_000_000)
    });
    expect(vet.years.map(y => y.year)).toEqual([2025, 2026, 2027, 2028]);
    const total = vet.signingBonus + vet.years.reduce((a, y) => a + y.base, 0);
    expect(Math.abs(total - 100_000_000)).toBeLessThan(20_000);
    for (let i = 1; i < 4; i++)
      expect(vet.years[i]?.base).toBeGreaterThanOrEqual(vet.years[i - 1]?.base ?? 0);
    expect(vet.years[0]?.guaranteedBase).toBeGreaterThan(0);
    const udfa = udfaContract(R, base, 2025, 10_000);
    expect(udfa.years).toHaveLength(3);
  });

  it('prices the market by position, overall, and age', () => {
    // A star quarterback earns near the top of his market: the record, 23.5% of the cap.
    const qbStar = marketValue(R, 'QB', 92, 28, 6);
    expect(qbStar).toBeGreaterThan(0.2 * R.cap.amount);
    expect(qbStar).toBeLessThanOrEqual(0.235 * R.cap.amount);
    expect(marketValue(R, 'WR', 90, 27, 5)).toBeGreaterThan(marketValue(R, 'HB', 90, 27, 5));
    expect(marketValue(R, 'CB', 70, 26, 4)).toBeLessThan(5_000_000);
    expect(marketValue(R, 'LT', 88, 34, 12)).toBeLessThan(marketValue(R, 'LT', 88, 28, 6));
    // A long snapper at 60 earns about his minimum.
    expect(marketValue(R, 'LS', 60, 30, 8)).toBeGreaterThanOrEqual(1_300_000);
    expect(marketValue(R, 'LS', 60, 30, 8)).toBeLessThan(1_325_000);
  });
});
