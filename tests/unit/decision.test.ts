import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS, type TeamAbbr } from '../../src/data/team-colors';
import { homeStadium } from '../../src/data/teams';
import type { Offer } from '../../src/engine/contracts/build';
import {
  activeShare,
  askingFrom,
  chooseOffer,
  decisionContext,
  demand,
  offerWorth,
  preferredYears,
  projectedRole,
  proneness,
  type DecisionContext
} from '../../src/engine/contracts/decision';
import { marketValue } from '../../src/engine/contracts/market';
import type { League } from '../../src/engine/league/types';
import { calendarDay } from '../../src/engine/model/calendar';
import { ageOn, type Player } from '../../src/engine/model/player';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// The player decision model (spec 11.7; D-52).
const D = TUNING.contracts.decision;

const fresh = (): League => structuredClone(situationLeague);
/** A free agent with middling traits and no ties to any team. */
function agent(league: League): Player {
  const p = Object.values(league.players).find(
    q => q.status === 'freeAgent' && q.position === 'WR' && q.ovr >= 60
  );
  if (!p) throw new Error('no free agent');
  Object.assign(p.personality, { competitiveness: 50, ego: 50, loyalty: 50, greed: 50 });
  Object.assign(p, { hometown: 'Nowhere, ZZ', lastTeam: null });
  return p;
}
const market = (league: League, p: Player) =>
  marketValue(league.rules, p.position, p.ovr, ageOn(p.birthDate, calendarDay(league.date)), p.experience);
/** A context where every team is middling and has room at every position. */
const neutral = (league: League): DecisionContext => ({
  ...decisionContext(league),
  contenders: new Map(TEAM_ABBRS.map(t => [t, 0])),
  depth: new Map()
});
const bornAt = (league: League, age: number) => `${league.date.season - age}-01-01`;

describe('what an offer is worth (spec 11.7)', () => {
  it('counts money against his market value, and a deal the length he wants: short while rising, long when older or fragile', () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    Object.assign(p, { potential: p.ovr, injury: null }, { ratings: { ...p.ratings, inj: 95 } });
    const money = (years: number) => offerWorth(league, ctx, p, 'MIN', { years, salary: market(league, p), signingBonus: 0 }).money; // prettier-ignore
    p.birthDate = bornAt(league, 27);
    expect(preferredYears(27, p)).toBe(D.length.prime);
    expect(money(D.length.prime)).toBeCloseTo(1, 5);
    expect(money(D.length.prime) - money(1)).toBeCloseTo(D.length.miss * (D.length.prime - 1), 5);
    // Young and still rising, he bets on himself with a short deal.
    p.birthDate = bornAt(league, 23);
    p.potential = p.ovr + D.length.risingBy;
    expect(preferredYears(23, p)).toBe(D.length.rising);
    expect(money(D.length.rising)).toBeGreaterThan(money(5));
    // Older, or fragile, he wants every year he can get.
    p.potential = p.ovr;
    p.birthDate = bornAt(league, 33);
    expect(money(5) - money(1)).toBeCloseTo(D.length.miss * 4, 5);
    p.birthDate = bornAt(league, 27);
    p.ratings.inj = D.injury.fragile;
    expect(proneness(p)).toBe(1);
    expect(preferredYears(27, p)).toBe(5);
  }); // prettier-ignore

  it('values guaranteed money more when older or fragile, a signing bonus by his taste for cash up front, and incentives at their odds', () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    // Each offer pays his market value now, whatever his age.
    const worth = (offer: Partial<Offer>) => offerWorth(league, ctx, p, 'MIN', { years: 3, salary: market(league, p), signingBonus: 0, ...offer }).money; // prettier-ignore
    Object.assign(p, { potential: p.ovr, injury: null }, { ratings: { ...p.ratings, inj: 95 } });
    p.dealStyle.upFront = 0;
    p.birthDate = bornAt(league, 24);
    const young = worth({ guaranteedYears: 3 }) - worth({});
    expect(young).toBeCloseTo(D.guarantee, 5);
    p.birthDate = bornAt(league, 33);
    const older = worth({ guaranteedYears: 3 }) - worth({});
    expect(older).toBeCloseTo(D.guarantee * (1 + D.guaranteeAge), 5);
    p.ratings.inj = D.injury.fragile;
    expect(worth({ guaranteedYears: 3 }) - worth({})).toBeCloseTo(D.guarantee * (1 + D.guaranteeAge + D.guaranteeInjury), 5);
    // The same money as a signing bonus: guaranteed, and more to him the more he likes cash up front.
    p.birthDate = bornAt(league, 24);
    Object.assign(p.ratings, { inj: 95 });
    const value = market(league, p);
    const asBonus = { salary: value - Math.round(value / 3), signingBonus: value };
    const plain = worth(asBonus);
    p.dealStyle.upFront = 100;
    expect(worth(asBonus) - plain).toBeCloseTo(D.upFront / 3, 3);
    // A per-game bonus counts at his odds of being active; an incentive at his odds of reaching its mark.
    expect(projectedRole(ctx, p, 'MIN')).toBe(1);
    expect(worth({ perGameBonus: 1_000_000 }) - worth({})).toBeCloseTo((1_000_000 * activeShare(1, 0)) / value, 5);
    expect(activeShare(-1, 0)).toBeLessThan(activeShare(1, 0));
    expect(activeShare(1, 1)).toBeLessThan(activeShare(1, 0));
    // Through the offseason, his last season is what he goes by.
    league.date = { ...league.date, phase: 'freeAgency', week: 1 };
    league.season.results = { g: {} as League['season']['results'][string] };
    league.season.totals = { [p.id]: { recYds: 1_200 } };
    const reach = (atLeast: number) => worth({ incentive: { key: 'recYds', atLeast, amount: 1_000_000 } }) - worth({});
    expect(reach(600)).toBeGreaterThan(reach(1_200));
    expect(reach(1_200)).toBeCloseTo(0.5 * (1_000_000 / value), 5);
    expect(reach(2_400)).toBeLessThan(0.05 * (1_000_000 / value));
  }); // prettier-ignore

  it('weighs a contender by competitiveness and age, a starting job by ego, home, loyalty, and fit', () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    const offer = { years: 1, salary: market(league, p), signingBonus: 0 };
    const worth = (team: TeamAbbr, c: DecisionContext = ctx) => offerWorth(league, c, p, team, offer);
    const strong = { ...ctx, contenders: new Map(TEAM_ABBRS.map(t => [t, t === 'KC' ? 1 : 0])) };
    p.personality.competitiveness = 100;
    const keen = worth('KC', strong).contender;
    p.personality.competitiveness = 0;
    expect(keen).toBeGreaterThan(worth('KC', strong).contender * 2.5);
    // A crowded room of better receivers makes him a backup; an empty one a starter.
    const crowded = { ...ctx, depth: new Map([['GB|WR', [99, 99, 99, 99, 99]]]) };
    expect(projectedRole(crowded, p, 'GB')).toBe(-1);
    expect(projectedRole(ctx, p, 'GB')).toBe(1);
    p.personality.ego = 100;
    expect(worth('GB').role - worth('GB', crowded).role).toBeCloseTo(2 * D.role * 1.5, 5);
    p.hometown = `Anytown, ${homeStadium('DAL').region}`;
    expect(worth('DAL').home).toBe(D.home);
    expect(worth('MIN').home).toBe(0);
    p.lastTeam = 'MIN';
    p.personality.loyalty = 100;
    expect(worth('MIN').loyalty).toBeCloseTo(D.loyalty);
    expect(worth('GB').loyalty).toBe(0);
    expect(Math.abs(worth('MIN').fit)).toBeLessThanOrEqual(D.fit);
  });
});

describe('his demand and his choice (spec 11.7)', () => {
  it('asks more of the greedy, and less each week of free agency', () => {
    const league = fresh();
    const p = agent(league);
    league.date = { season: league.date.season, phase: 'freeAgency', week: 1 };
    p.personality.greed = 100;
    const greedy = demand(league, p);
    p.personality.greed = 0;
    expect(greedy).toBeCloseTo(D.demand[1]);
    expect(demand(league, p)).toBeCloseTo(D.demand[0]);
    league.date.week = 3;
    expect(demand(league, p)).toBeCloseTo(D.demand[0] * (1 - 2 * D.softening));
  });

  it('takes the offer worth most once it meets his demand, and waits when none does', () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    league.date = { season: league.date.season, phase: 'freeAgency', week: 1 };
    const value = market(league, p);
    // Shares of his market value around his demand, which counts what a typical offer adds (D-60).
    const need = demand(league, p);
    const offer = (team: TeamAbbr, share: number) => ({ team, offer: { years: 1, salary: Math.round(value * (need + share)), signingBonus: 0 } }); // prettier-ignore
    expect(chooseOffer(league, ctx, p, [offer('MIN', -0.2), offer('GB', -0.15)])).toBeNull();
    expect(chooseOffer(league, ctx, p, [offer('MIN', 0.02), offer('GB', 0.1)])?.team).toBe('GB');
    // He takes less to go home.
    p.hometown = `Anytown, ${homeStadium('DAL').region}`;
    expect(chooseOffer(league, ctx, p, [offer('GB', 0.03), offer('DAL', 0)])?.team).toBe('DAL');
  });

  it("asks each team the least it can pay for an offer worth his demand", () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    const strong = { ...ctx, contenders: new Map(TEAM_ABBRS.map(t => [t, t === 'KC' ? 1 : t === 'NYJ' ? -1 : 0])) };
    const step = TUNING.market.quoteStep;
    for (const team of ['KC', 'NYJ', 'MIN'] as const) {
      const ask = askingFrom(league, strong, p, team);
      const worth = (salary: number) => offerWorth(league, strong, p, team, { years: 1, salary, signingBonus: 0 }).total;
      expect(worth(ask)).toBeGreaterThanOrEqual(demand(league, p) - 1e-9);
      expect(worth(ask - step)).toBeLessThan(demand(league, p));
    }
    expect(askingFrom(league, strong, p, 'KC')).toBeLessThan(askingFrom(league, strong, p, 'NYJ'));
  }); // prettier-ignore
});
