import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { emptyYear, type Contract } from '../../src/engine/contracts/types';
import {
  answerDemands,
  campDemands,
  clearDemands,
  holdoutChance,
  payShare,
  stepDemands,
  tradeChance
} from '../../src/engine/contracts/holdouts';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream, type Rng } from '../../src/engine/rng';
import { makeMove } from '../../src/engine/roster/moves';
import { rosterCounts } from '../../src/engine/roster/rules';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// Holdouts and trade requests (spec 10.9, 11.9; D-57).
const H = TUNING.holdouts;

/** A stream whose draws all come up `value`: 0 makes every chance happen, 0.999 none. */
function fixed(value: number): Rng {
  const rng = stream(1);
  rng.float = () => value;
  return rng;
}

/** The league as training camp opens in 2026, before the season. */
const atCamp = (): League => {
  const league = structuredClone(situationLeague);
  league.date = { season: 2025, phase: 'trainingCamp', week: 1 };
  return league;
};

/** A team's best player made an underpaid veteran in the last year of a $1,000,000 deal, greedy and disloyal. */
function underpaid(league: League, team: TeamAbbr = 'MIN'): Player {
  const [p] = Object.values(league.players)
    .filter(q => q.team === team && q.status === 'active' && q.position !== 'QB')
    .sort((a, b) => b.ovr - a.ovr);
  if (!p) throw new Error('no player');
  Object.assign(p, { ovr: Math.max(85, p.ovr), experience: 5, accrued: 5, morale: 60 });
  Object.assign(p.personality, { greed: 100, loyalty: 0, leadership: 20 });
  const id = `hold-${p.id}`;
  const deal: Contract = {
    id, playerId: p.id, team, signed: { season: 2024, phase: 'freeAgency', week: 1 }, type: 'veteran',
    years: [{ ...emptyYear(2025), base: 1_000_000 }, { ...emptyYear(2026), base: 1_000_000 }],
    signingBonus: 0, signingBonusYears: null, vesting: [], noTrade: false, fifthYearOption: 'none', restructures: [], weeklyPay: 0, ended: null
  }; // prettier-ignore
  league.contracts[id] = deal;
  p.contractId = id;
  return p;
}

describe('holdouts (spec 11.9)', () => {
  it('come from good players underpaid in the last year of their deals, as often as the setting says', () => {
    const league = atCamp();
    const p = underpaid(league);
    expect(payShare(league, p)).toBeLessThan(H.underpaid);
    const chance = holdoutChance(league, p);
    expect(chance).toBeGreaterThan(0);
    league.settings.drama.holdouts = 2;
    expect(holdoutChance(league, p)).toBeCloseTo(Math.min(1, chance * 2), 6);
    league.settings.drama.holdouts = 0;
    expect(holdoutChance(league, p)).toBe(0);
    league.settings.drama.holdouts = 1;
    // Not in his deal's last year, or paid his worth: no holdout.
    const deal = league.contracts[p.contractId ?? ''] as Contract;
    deal.years.push({ ...emptyYear(2027), base: 1_000_000 });
    expect(holdoutChance(league, p)).toBe(0);
    deal.years.pop();
    for (const y of deal.years) y.base = 60_000_000;
    expect(holdoutChance(league, p)).toBe(0);
  });

  it("keeps him off the active roster, fines him per the CBA, and ends when he reports or signs a new deal", () => {
    const league = atCamp();
    const p = underpaid(league);
    const before = rosterCounts(league, 'MIN').active;
    // Every chance comes up: every eligible player makes his demand.
    const events = campDemands(league, fixed(0));
    expect(events).toContainEqual({ player: p, team: 'MIN', kind: 'holdout' });
    expect(p.status).toBe('holdout');
    const out = events.filter(e => e.team === 'MIN' && e.kind === 'holdout').length;
    expect(rosterCounts(league, 'MIN').active).toBe(before - out);
    // A camp step passes: 21 days at $50,000; he stays out.
    expect(stepDemands(league, 'camp', fixed(0.999))).toEqual([]);
    expect(p.demand?.fines).toBe(21 * 50_000);
    // A preseason week costs a week's pay: $1,000,000 over 18 weeks, $55,556.
    stepDemands(league, 'preseason', fixed(0.999));
    expect(p.demand?.fines).toBe(21 * 50_000 + 55_556);
    // He reports without a deal, grudgingly.
    const reported = stepDemands(league, 'cutdown', fixed(0)).filter(e => e.player === p);
    expect(reported).toEqual([{ player: p, team: 'MIN', kind: 'reported', cost: 21 * 50_000 + 55_556 }]);
    expect(p).toMatchObject({ status: 'active', morale: 60 - H.reportMorale });
    expect(p.demand).toBeUndefined();
    // Another holdout ends with an extension, which lifts his morale.
    campDemands(league, fixed(0));
    expect(p.status).toBe('holdout');
    const done = makeMove(league, { kind: 'extend', team: 'MIN', playerId: p.id, offer: { years: 3, salary: 40_000_000, signingBonus: 0 } }, stream(2));
    expect(done.ok).toBe(true);
    expect(p).toMatchObject({ status: 'active', morale: 60 - H.reportMorale + H.dealMorale });
    expect(p.demand).toBeUndefined();
  }); // prettier-ignore

  it("isn't fined with fines off, but still loses a game's pay", () => {
    const league = atCamp();
    league.settings.drama.fines = false;
    const p = underpaid(league);
    campDemands(league, fixed(0));
    stepDemands(league, 'camp', fixed(0.999));
    expect(p.demand?.fines).toBe(0);
    stepDemands(league, 'game', fixed(0.999));
    expect(p.demand?.fines).toBe(55_556);
  });

  it('are answered by the AI with a deal when he is worth it, and end with the league year', () => {
    const league = atCamp();
    const p = underpaid(league, 'GB');
    campDemands(league, fixed(0));
    expect(p.demand?.kind).toBe('holdout');
    const extended = answerDemands(league, ['GB'], (team, player, offer) => makeMove(league, { kind: 'extend', team, playerId: player.id, offer }, stream(3)).ok);
    expect(extended).toContainEqual({ player: p, team: 'GB', kind: 'extended', ended: 'holdout' });
    expect(p.status).toBe('active');
    // A standing demand ends when the league year does.
    const other = underpaid(league, 'MIN');
    campDemands(league, fixed(0));
    expect(other.status).toBe('holdout');
    clearDemands(league);
    expect(other.status).toBe('active');
    expect(other.demand).toBeUndefined();
  }); // prettier-ignore
});

describe('trade requests (spec 11.9)', () => {
  it('come from the deeply unhappy, and lapse once their morale is back', () => {
    const league = atCamp();
    const [p] = Object.values(league.players).filter(q => q.team === 'DAL' && q.status === 'active').sort((a, b) => b.ovr - a.ovr);
    if (!p) throw new Error('no player');
    Object.assign(p, { morale: 10, experience: 4, ovr: Math.max(80, p.ovr) });
    p.personality.ego = 100;
    // Paid his worth, so he doesn't hold out instead.
    for (const y of league.contracts[p.contractId ?? '']?.years ?? []) y.base = 60_000_000;
    expect(holdoutChance(league, p)).toBe(0);
    expect(tradeChance(league, p)).toBeGreaterThan(tradeChance(league, p, true));
    expect(campDemands(league, fixed(0)).filter(e => e.player === p)).toEqual([{ player: p, team: 'DAL', kind: 'trade' }]);
    expect(p.status).toBe('active');
    expect(stepDemands(league, 'game', fixed(0.999)).filter(e => e.player === p)).toEqual([]);
    p.morale = H.tradeLapse;
    expect(stepDemands(league, 'game', fixed(0.999)).filter(e => e.player === p)).toEqual([{ player: p, team: 'DAL', kind: 'lapsed' }]);
    expect(p.demand).toBeUndefined();
  }); // prettier-ignore
});
