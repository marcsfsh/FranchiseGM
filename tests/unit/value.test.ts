import { describe, expect, it } from 'vitest';
import { resignDecisions } from '../../src/engine/ai/decisions/resign';
import { marketValue, primeAge } from '../../src/engine/contracts/market';
import { dealCost, dealValue, worthIt } from '../../src/engine/contracts/value';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { expectedChange, projectedOverall } from '../../src/engine/progression/develop';
import { stream } from '../../src/engine/rng';
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
  it('prices each projected season by the market as a player in his prime', () => {
    const league = inWindow();
    const p = shaped(league, anyone(league), 30, 84);
    const seasons = projectedOverall(league, p, 2);
    const priced = seasons.reduce((sum, ovr, i) => sum + marketValue(league.rules, p.position, ovr, primeAge(p.position), p.experience + i + 1), 0);
    expect(dealValue(league, p, 2)).toBe(priced);
    const offer = { years: 2, salary: 5_000_000, signingBonus: 2_000_000, perGameBonus: 100_000 };
    expect(dealCost(offer)).toBe(12_200_000);
    expect(worthIt(league, p, { ...offer, salary: Math.floor(priced / 2) - 1_100_000 })).toBe(true);
    expect(worthIt(league, p, { ...offer, salary: Math.floor(priced / 2) })).toBe(false);
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
