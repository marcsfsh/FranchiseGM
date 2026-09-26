import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS, type TeamAbbr } from '../../src/data/team-colors';
import { homeStadium } from '../../src/data/teams';
import {
  askingFrom,
  chooseOffer,
  decisionContext,
  demand,
  offerWorth,
  projectedRole,
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
  it('counts money against his market value, years by his need for security, and guarantees', () => {
    const league = fresh();
    const p = agent(league);
    const ctx = neutral(league);
    const value = market(league, p);
    const worth = (years: number, bonus = 0) => offerWorth(league, ctx, p, 'MIN', { years, salary: value - Math.round(bonus / years), signingBonus: bonus }).money; // prettier-ignore
    p.birthDate = bornAt(league, 24);
    expect(worth(1)).toBeCloseTo(1, 1);
    expect(worth(4)).toBeCloseTo(worth(1), 5);
    p.birthDate = bornAt(league, 33);
    const older = market(league, p);
    const years = (n: number) =>
      offerWorth(league, ctx, p, 'MIN', { years: n, salary: older, signingBonus: 0 }).money;
    expect(years(4) - years(1)).toBeCloseTo(D.perYear * 3, 5);
    p.birthDate = bornAt(league, 24);
    expect(worth(2, value)).toBeGreaterThan(worth(2));
  });

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
    const offer = (team: TeamAbbr, share: number) => ({ team, offer: { years: 1, salary: Math.round(value * share), signingBonus: 0 } }); // prettier-ignore
    expect(chooseOffer(league, ctx, p, [offer('MIN', 0.8), offer('GB', 0.85)])).toBeNull();
    expect(chooseOffer(league, ctx, p, [offer('MIN', 1.02), offer('GB', 1.1)])?.team).toBe('GB');
    // He takes less to go home.
    p.hometown = `Anytown, ${homeStadium('DAL').region}`;
    expect(chooseOffer(league, ctx, p, [offer('GB', 1.03), offer('DAL', 1.0)])?.team).toBe('DAL');
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
