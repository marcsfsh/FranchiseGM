import { describe, expect, it } from 'vitest';
import { capCasualties, resignDecisions } from '../../src/engine/ai/decisions/resign';
import { marketValue, primeAge } from '../../src/engine/contracts/market';
import { expectedNextCap } from '../../src/engine/cap/growth';
import { dealCost, dealValue, roomPremium, worthIt } from '../../src/engine/contracts/value';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { expectedChange, projectedOverall } from '../../src/engine/progression/develop';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// What a deal is worth to a team (D-38): projected overall from the age curves, priced by the market.
const inWindow = (): League => {
  const league = structuredClone(situationLeague);
  league.date = { season: 2026, phase: 'resign', week: 1 };
  return league;
};
/** A player made `age` at the window, with `ovr` and potential `potential`, a normal developer. */
function shaped(league: League, player: Player, age: number, ovr: number, potential = ovr): Player {
  Object.assign(player, { birthDate: `${2027 - age}-01-15`, ovr, potential, dev: 'Normal' });
  player.personality.workEthic = 50;
  return player;
}
const anyone = (league: League, position: Player['position'] = 'WR'): Player => {
  const p = Object.values(league.players).find(q => q.position === position && q.team);
  if (!p) throw new Error('no player');
  return p;
};

describe('projected overall (D-38)', () => {
  it('rises for a young player with room to grow, and falls with age', () => {
    const league = inWindow();
    const young = shaped(league, anyone(league), 22, 70, 88);
    const rising = projectedOverall(league, young, 4);
    expect(rising[3]).toBeGreaterThan(rising[0] as number);
    expect(rising[0]).toBeGreaterThan(70);
    const old = shaped(league, anyone(league), 34, 85);
    const falling = projectedOverall(league, old, 3);
    expect(falling[2]).toBeLessThan(falling[0] as number);
    expect(falling[0]).toBeLessThan(85);
    // The development settings' decline table scales it.
    const slower = structuredClone(league);
    slower.settings.development.regressionByAge.fill(0.5);
    expect(expectedChange(slower, old, 34, 85)).toBeGreaterThan(expectedChange(league, old, 34, 85));
  });
});

describe('a deal worth its cost (D-38)', () => {
  it("prices each projected season by the market as a player in his prime, at that season's expected cap, never under the market's price for him (D-60)", () => {
    const league = inWindow();
    const young = shaped(league, anyone(league), 23, 76, 90);
    const old = shaped(league, anyone(league, 'CB'), 30, 84);
    const growth = expectedNextCap(league.rules) / league.rules.cap.amount;
    const at = (i: number) => ({ ...league.rules, cap: { ...league.rules.cap, amount: league.rules.cap.amount * growth ** i } });
    // The young player's projection rises past his overall now, so it prices his seasons.
    const rising = projectedOverall(league, young, 2);
    expect(dealValue(league, young, 2)).toBe(rising.reduce((sum, ovr, i) => sum + marketValue(at(i), young.position, ovr, primeAge(young.position), young.experience + i + 1), 0));
    // A veteran's projected decline, made steep here, would price him under the market, which prices him by
    // his age instead.
    league.settings.development.regressionByAge.fill(4);
    const now = marketValue(at(0), old.position, 84, 30, old.experience + 1) + marketValue(at(1), old.position, 84, 31, old.experience + 2);
    expect(dealValue(league, old, 2)).toBe(now);
    const offer = { years: 2, salary: 5_000_000, signingBonus: 2_000_000, perGameBonus: 100_000 };
    expect(dealCost(offer)).toBe(12_200_000);
    expect(worthIt(league, old, { ...offer, salary: Math.floor(now / 2) - 1_100_000 })).toBe(true);
    expect(worthIt(league, old, { ...offer, salary: Math.floor(now / 2) })).toBe(false);
    // A team with room pays more than its value (D-60).
    expect(worthIt(league, old, { ...offer, salary: Math.floor(now / 2) }, roomPremium(league, league.rules.cap.amount * 0.2))).toBe(true);
    expect(roomPremium(league, 0)).toBe(1);
  }); // prettier-ignore

  it('lets the AI keep a star past 30 when a new deal is worth what he asks', () => {
    const league = inWindow();
    for (const c of Object.values(league.contracts)) c.years = c.years.filter(y => y.year <= 2026);
    const [star] = Object.values(league.players)
      .filter(p => p.team === 'KC' && p.status === 'active' && p.position !== 'QB' && p.position !== 'K' && p.position !== 'P')
      .sort((a, b) => b.ovr - a.ovr);
    if (!star) throw new Error('no star');
    shaped(league, star, 31, Math.max(84, star.ovr));
    Object.assign(star.personality, { greed: 0, loyalty: 100 });
    resignDecisions(league, 'KC', stream(7));
    expect(star.nextContractId).toBeDefined();
  }); // prettier-ignore
});

describe('cap casualties (D-60)', () => {
  it('release the veterans paid well more than they are worth, when it saves room, and keep the rest', () => {
    const league = structuredClone(situationLeague);
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    const year = 2027;
    const vets = Object.values(league.players).filter(p => {
      const c =
        p.team === 'KC' && p.status === 'active' && p.contractId ? league.contracts[p.contractId] : undefined;
      return c?.type === 'veteran' && c.years.some(y => y.year > year);
    });
    const [overpaid, fair] = vets;
    if (!overpaid || !fair) throw new Error('no veterans');
    // An aging backup paid like a star for three more years, nothing guaranteed and no bonus to accelerate.
    shaped(league, overpaid, 33, 62);
    const c = league.contracts[overpaid.contractId as string];
    if (!c) throw new Error('no contract');
    Object.assign(c, { signingBonus: 0, years: [year, year + 1, year + 2].map(y => ({ ...(c.years[0] as (typeof c.years)[number]), year: y, base: 30_000_000, guaranteedBase: 0, isVoid: false })) }); // prettier-ignore
    const cut = capCasualties(league, 'KC', stream(3));
    expect(cut).toContain(overpaid);
    expect(overpaid.team).toBeNull();
    expect(cut).not.toContain(fair);
    expect(cut.length).toBeLessThanOrEqual(TUNING.resign.cutsPerTeam);
    expect(league.season.transactions.at(-1)).toMatchObject({
      kind: 'released',
      reason: 'a cap casualty, paid more than he is worth'
    });
  });
});
