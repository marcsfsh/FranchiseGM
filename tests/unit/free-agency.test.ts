import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { capSheet } from '../../src/engine/cap/sheet';
import { offerAav } from '../../src/engine/contracts/build';
import {
  askingFrom,
  chooseOffer,
  contextFor,
  demand,
  offerWorth,
  reachable
} from '../../src/engine/contracts/decision';
import {
  agentCounter,
  closeBidding,
  decideWeek,
  firstYearCharge,
  hopeOf,
  makeOffer,
  offerProblem,
  offersFor,
  pendingFor,
  raiseBids,
  standing,
  teamBids,
  weighingWords,
  withdrawOffer
} from '../../src/engine/contracts/free-agency';
import { askOf, floorEstimate } from '../../src/engine/contracts/negotiation';
import { draftOrder } from '../../src/engine/generate/rookies';
import { freeAgents } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { dollars } from '../../src/engine/text';
import { TUNING } from '../../src/engine/tuning';
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

  it("reads an offer by the front office's range, never the least he'd take or other teams' terms (spec 11.6)", () => {
    const league = inFreeAgency();
    const [star] = best(league);
    if (!star) throw new Error('no free agent');
    const least = askingFrom(league, contextFor(league), star, 'MIN', 2);
    const { low, high } = floorEstimate(league, 'MIN', star, { years: 2, signingBonus: 0 });
    const read = (salary: number) => standing(league, 'MIN', star, { years: 2, salary, signingBonus: 0 });
    expect(read(high)).toMatch(/^Your front office expects this to be enough for him: it expects him to sign for \$[\d,]+ to \$[\d,]+ a year on these terms\. No other team has made him an offer yet\.$/);
    if (low > league.rules.pay.minimumSalary[star.experience]!) expect(read(low - 5_000)).toMatch(/^Your front office expects him to want more/);
    expect(read(Math.round((low + high) / 2 / 5_000) * 5_000)).toMatch(/^Your front office can't tell whether this is enough for him/);
    // Neither the least he'd take nor a rival's terms show; that a rival is bidding does.
    expect(makeOffer(league, 'GB', star.id, { years: 3, salary: high * 2, signingBonus: 0 })).toBeNull();
    expect(read(high)).toMatch(/He's weighing offers from 1 other team too; you can't see their terms\.$/);
    for (const salary of [low, high]) expect(read(salary)).not.toContain(dollars(least));
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
    // Each is built as NFL deals are (D-60), and is worth at least the least he'd take to him (D-65).
    for (const p of offered) {
      const mine = offersFor(league, p.id).find(o => o.team === 'GB');
      if (!mine) throw new Error('no offer');
      const need = reachable(league, ctx, p, 'GB', mine.offer.years, demand(league, p));
      expect(offerWorth(league, ctx, p, 'GB', mine.offer).total).toBeGreaterThanOrEqual(need);
      if (offerAav(mine.offer) >= 5_000_000) expect(mine.offer.signingBonus).toBeGreaterThan(0);
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

  it('holds out for more than his demand as the market opens, less each week, until the last (D-65)', () => {
    const league = inFreeAgency();
    room(league, 'GB', 4);
    const [p] = best(league);
    if (!p) throw new Error('no free agent');
    p.personality.greed = 100;
    expect(hopeOf(league, p)).toBeCloseTo(TUNING.freeAgency.hope * 1.5, 6);
    const atDemand = {
      years: 1,
      salary: askingFrom(league, contextFor(league), p, 'GB', 1),
      signingBonus: 0
    };
    expect(makeOffer(league, 'GB', p.id, atDemand)).toBeNull();
    decideWeek(league, stream(1));
    expect(p.status).toBe('freeAgent');
    league.date = { ...league.date, week: 4 };
    expect(hopeOf(league, p)).toBe(0);
    decideWeek(league, stream(2));
    expect(p.team).toBe('GB');
  });

  it("signs at his agent's ask with no rival offers, since the agent asks over what he holds out for (D-65)", () => {
    const league = inFreeAgency();
    room(league, 'MIN', 4);
    league.teams.MIN.carryover = 200_000_000;
    const [p] = best(league);
    if (!p) throw new Error('no free agent');
    // The greediest player holds out for the most in the first week, and the softest agent opens the least over it.
    p.personality.greed = 100;
    p.dealStyle.agent = 0;
    const ask = askOf(league, p, 'MIN', 1);
    expect(makeOffer(league, 'MIN', p.id, { years: 1, salary: ask, signingBonus: 0 })).toBeNull();
    decideWeek(league, stream(1));
    expect(p).toMatchObject({ team: 'MIN', status: 'active' });
  });

  it("raises a team's offer he passed on while he's worth it, and tells a team who else is bidding without their terms", () => {
    const league = inFreeAgency();
    room(league, 'GB', 4);
    const [p] = best(league);
    if (!p) throw new Error('no free agent');
    const low = { years: 1, salary: Math.round((askingFrom(league, contextFor(league), p, 'GB', 1) * 0.6) / 5000) * 5000, signingBonus: 0 };
    expect(makeOffer(league, 'GB', p.id, low)).toBeNull();
    expect(makeOffer(league, 'KC', p.id, { ...low, salary: low.salary + 1_000_000 })).toBeNull();
    decideWeek(league, stream(1));
    expect(p.status).toBe('freeAgent');
    league.date = { ...league.date, week: 2 };
    expect(raiseBids(league, 'GB', draftOrder(league))).toBe(1);
    const raised = offersFor(league, p.id).find(o => o.team === 'GB')?.offer;
    if (!raised) throw new Error('no offer');
    expect(offerAav(raised)).toBe(Math.round((low.salary * (1 + TUNING.freeAgency.raise)) / 5000) * 5000);
    const words = weighingWords(league, 'GB', p);
    expect(words).toMatch(/^weighing 1 other offer too; his agent wants \$[\d,]+ a year on your terms$/);
    expect(words).not.toContain(dollars(low.salary + 1_000_000));
    // The counter keeps the offer's terms at a salary worth his agent's ask: more than the least he'd take.
    const counter = agentCounter(league, 'GB', p, raised);
    expect({ ...counter, salary: 0 }).toEqual({ ...raised, salary: 0, final: false });
    expect(chooseOffer(league, contextFor(league), p, [{ team: 'GB', offer: counter }])?.offer).toEqual(counter);
    expect(counter.salary).toBeGreaterThan(raised.salary);
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
