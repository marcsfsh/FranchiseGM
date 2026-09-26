import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { capSheet } from '../../src/engine/cap/sheet';
import { askingFrom, contextFor } from '../../src/engine/contracts/decision';
import {
  closeBidding,
  decideWeek,
  firstYearCharge,
  makeOffer,
  offerProblem,
  offersFor,
  pendingFor,
  teamBids,
  withdrawOffer
} from '../../src/engine/contracts/free-agency';
import { draftOrder } from '../../src/engine/generate/rookies';
import { freeAgents } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { advanceOffseason } from '../../src/engine/season/offseason';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// Free agency weeks and bidding (spec 11.8; D-53).
const inFreeAgency = (week = 1): League => {
  const league = structuredClone(situationLeague);
  league.date = { season: 2026, phase: 'freeAgency', week };
  return league;
};
const best = (league: League): Player[] =>
  freeAgents(league).sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
/** Makes room on a team's active roster by releasing its weakest players. */
function room(league: League, team: TeamAbbr, n: number): void {
  const weakest = Object.values(league.players).filter(p => p.team === team && p.status === 'active').sort((a, b) => a.ovr - b.ovr);
  for (const p of weakest.slice(0, n)) Object.assign(p, { team: null, status: 'freeAgent', contractId: null });
} // prettier-ignore

describe('offers (spec 11.8)', () => {
  it('stand only during free agency, and must fit the cap and the roster with the other offers', () => {
    const league = inFreeAgency();
    const [star] = best(league);
    if (!star) throw new Error('no free agent');
    const ask = askingFrom(league, contextFor(league), star, 'MIN');
    const offer = { years: 2, salary: ask, signingBonus: 0 };
    const summer = structuredClone(league);
    summer.date = { season: 2026, phase: 'regularSeason', week: 1 };
    expect(offerProblem(summer, 'MIN', star.id, offer)).toMatch(/^Offers wait for free agency/);
    expect(makeOffer(league, 'MIN', star.id, offer)).toBeNull();
    expect(pendingFor(league, 'MIN')).toEqual({ players: [star.id], charge: firstYearCharge(league, offer) });
    // Changing the offer replaces it.
    expect(makeOffer(league, 'MIN', star.id, { ...offer, salary: ask + 100_000 })).toBeNull();
    expect(offersFor(league, star.id)).toHaveLength(1);
    const space = capSheet(league, 'MIN').space;
    expect(offerProblem(league, 'MIN', star.id, { years: 1, salary: space + 1_000_000, signingBonus: 0 })).toMatch(/would add \$[\d,]+ to your cap if all were taken/);
    withdrawOffer(league, 'MIN', star.id);
    expect(offersFor(league, star.id)).toEqual([]);
  }); // prettier-ignore
});

describe('the AI bidding (spec 11.8)', () => {
  it('offers the free agents who fill holes or start, at least their asking price, within the room it keeps', () => {
    const league = inFreeAgency();
    room(league, 'GB', 6);
    const before = capSheet(league, 'GB').space;
    const offered = teamBids(league, 'GB', draftOrder(league));
    expect(offered.length).toBeGreaterThan(0);
    const ctx = contextFor(league);
    for (const p of offered) {
      const mine = offersFor(league, p.id).find(o => o.team === 'GB');
      expect(mine?.offer.salary).toBeGreaterThanOrEqual(
        askingFrom(league, ctx, p, 'GB', mine?.offer.years ?? 1)
      );
    }
    expect(pendingFor(league, 'GB').charge).toBeLessThanOrEqual(before);
    // A second pass doesn't offer the same players again.
    const again = teamBids(league, 'GB', draftOrder(league));
    expect(again.filter(p => offered.includes(p))).toEqual([]);
  });
});

describe("a week's decisions (spec 11.8)", () => {
  it('signs each free agent with the offer worth most once one meets his demand, and lets the rest wait', () => {
    const league = inFreeAgency();
    room(league, 'MIN', 4);
    room(league, 'GB', 4);
    const [first, second] = best(league);
    if (!first || !second) throw new Error('no free agents');
    const ctx = contextFor(league);
    const ask = (p: Player, team: TeamAbbr) => askingFrom(league, ctx, p, team, 1);
    expect(makeOffer(league, 'MIN', first.id, { years: 1, salary: ask(first, 'MIN'), signingBonus: 0 })).toBeNull();
    expect(makeOffer(league, 'GB', first.id, { years: 1, salary: ask(first, 'GB') + 2_000_000, signingBonus: 0 })).toBeNull();
    // Half his asking price: he waits.
    const low = Math.max(league.rules.pay.minimumSalary[second.experience] ?? 0, Math.round(ask(second, 'MIN') / 2 / 5000) * 5000);
    expect(makeOffer(league, 'MIN', second.id, { years: 1, salary: low, signingBonus: 0 })).toBeNull();
    const signed = decideWeek(league, stream(1));
    expect(signed.map(s => [s.player.id, s.team])).toContainEqual([first.id, 'GB']);
    expect(first).toMatchObject({ team: 'GB', status: 'active' });
    expect(offersFor(league, first.id)).toEqual([]);
    expect(second.status).toBe('freeAgent');
    expect(offersFor(league, second.id)).toHaveLength(1);
    closeBidding(league);
    expect(league.faOffers).toEqual({});
  }); // prettier-ignore

  it('opens with AI offers and signs players as the weeks of free agency pass', () => {
    const league = structuredClone(situationLeague);
    league.date = { season: 2026, phase: 'annualMeeting', week: 1 };
    const open = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(open.league.date).toMatchObject({ phase: 'freeAgency', week: 1 });
    expect(Object.keys(open.league.faOffers).length).toBeGreaterThan(0);
    const before = open.league.season.transactions.filter(t => t.kind === 'signed').length;
    const week = advanceOffseason(open.league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(week.league.season.transactions.filter(t => t.kind === 'signed').length).toBeGreaterThan(before);
  });
});
