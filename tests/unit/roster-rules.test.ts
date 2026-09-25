import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { capCharge, prorationSchedule } from '../../src/engine/contracts/cap';
import { endContract } from '../../src/engine/contracts/moves';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { activeLimit, isElevated, rosterCounts, rosterProblems } from '../../src/engine/roster/rules';
import {
  claimProblem,
  placeOnWaivers,
  processWaivers,
  subjectToWaivers,
  waiverOrder
} from '../../src/engine/roster/waivers';
import { available } from '../../src/engine/sim/setup';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);
const mine = (league: League, abbr: TeamAbbr, status: Player['status']) =>
  Object.values(league.players).filter(p => p.team === abbr && p.status === status);

/** Releases a player's deal the way a release does, and puts him on waivers. */
function waive(league: League, player: Player): void {
  const team = player.team as TeamAbbr;
  const contract = league.contracts[player.contractId ?? ''];
  if (!contract) throw new Error('no contract');
  league.contracts[contract.id] = endContract(contract, {
    date: { ...league.date },
    how: 'released',
    designated: false,
    injured: false,
    terminationPay: false
  });
  placeOnWaivers(league, player, team, contract.id);
}

describe('roster limits (spec 12.1)', () => {
  it('starts every team legal, with 53 active in season and 90 allowed in the offseason', () => {
    const league = fresh();
    for (const abbr of ['MIN', 'KC', 'DAL'] as const) expect(rosterProblems(league, abbr)).toEqual([]);
    expect(activeLimit(league)).toBe(53);
    expect(rosterCounts(league, 'MIN').active).toBeLessThanOrEqual(53);
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    expect(activeLimit(league)).toBe(90);
  });

  it('names each broken limit: the active roster, the practice squad, its veterans, and the cap', () => {
    const league = fresh();
    const free = Object.values(league.players).filter(p => p.status === 'freeAgent');
    const extra = 54 - rosterCounts(league, 'MIN').active;
    for (const p of free.slice(0, extra)) Object.assign(p, { team: 'MIN', status: 'active' });
    expect(rosterProblems(league, 'MIN')).toContain('54 players on the active roster; the limit is 53.');
    const squad = mine(league, 'MIN', 'practice');
    for (const p of free.slice(extra, extra + 17 - squad.length)) Object.assign(p, { team: 'MIN', status: 'practice' });
    expect(rosterProblems(league, 'MIN')).toContain('17 players on the practice squad; the limit is 16.');
    for (const p of mine(league, 'MIN', 'practice')) p.experience = 5;
    expect(rosterProblems(league, 'MIN')).toContain(
      '17 veterans on the practice squad; at most 6 may have more than 2 accrued seasons.'
    );
    league.teams.MIN.carryover = -400_000_000;
    expect(rosterProblems(league, 'MIN').some(p => / over the cap\.$/.test(p))).toBe(true);
  }); // prettier-ignore
});

describe('practice squad elevations (spec 12.1)', () => {
  it('lets an elevated player dress for this week only, two a game and three a season each', () => {
    const league = fresh();
    const [a, b, c] = mine(league, 'MIN', 'practice');
    if (!a || !b || !c) throw new Error('no practice squad');
    expect(available(league, a)).toBe(false);
    league.season.elevations.push({ playerId: a.id, team: 'MIN', week: 1 });
    expect(isElevated(league, a)).toBe(true);
    expect(available(league, a)).toBe(true);
    league.date = { ...league.date, week: 2 };
    expect(available(league, a)).toBe(false);
    league.season.elevations.push(
      { playerId: a.id, team: 'MIN', week: 2 },
      { playerId: b.id, team: 'MIN', week: 2 },
      { playerId: c.id, team: 'MIN', week: 2 }
    );
    expect(rosterProblems(league, 'MIN')).toContain('3 players elevated this week; the limit is 2.');
    league.season.elevations = [1, 2, 3, 4].map(week => ({ playerId: a.id, team: 'MIN' as const, week }));
    league.date = { ...league.date, week: 4 };
    expect(rosterProblems(league, 'MIN')).toContain('A player was elevated more than 3 times this season.');
  });
});

describe('waivers (spec 12.1)', () => {
  it('sends young players and, after the trade deadline, everyone through waivers', () => {
    const league = fresh();
    const [young, vested] = mine(league, 'MIN', 'active');
    const [squad] = mine(league, 'MIN', 'practice');
    if (!young || !vested || !squad) throw new Error('no players');
    young.experience = 2;
    vested.experience = 6;
    expect(subjectToWaivers(league, young)).toBe(true);
    expect(subjectToWaivers(league, vested)).toBe(false);
    expect(subjectToWaivers(league, squad)).toBe(false);
    league.date = { ...league.date, week: 10 };
    expect(subjectToWaivers(league, vested)).toBe(true);
  });

  it('orders claims by a fixed draft stand-in early, then by the standings, worst first', () => {
    const league = fresh();
    expect(waiverOrder(league)).toEqual(waiverOrder(fresh()));
    expect(new Set(waiverOrder(league)).size).toBe(32);
    // By week 5 KC has lost all four of its games and everyone else is 0-0 or better.
    league.date = { ...league.date, week: 5 };
    ['BUF', 'DEN', 'LV', 'LAC'].forEach((opp, i) => {
      league.season.results[`g${i}`] = {
        id: `g${i}`, week: i + 1, home: opp as TeamAbbr, away: 'KC', homeScore: 21, awayScore: 14, homeTd: 3,
        awayTd: 2, playoff: false, overtime: false
      }; // prettier-ignore
    });
    expect(waiverOrder(league)[0]).toBe('KC');
  });

  it('awards a claimed player to the first claimant in priority, who takes over his deal', () => {
    const league = fresh();
    const player = mine(league, 'MIN', 'active')
      .filter(p => (league.contracts[p.contractId ?? '']?.years.length ?? 0) > 1)
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (!player) throw new Error('no player');
    const oldId = player.contractId as string;
    waive(league, player);
    expect(player.status).toBe('waivers');
    const order = waiverOrder(league).filter(abbr => abbr !== 'MIN');
    const first = order[3] as TeamAbbr;
    const second = order[1] as TeamAbbr;
    // Both claimants make room: a player each goes on injured reserve.
    for (const abbr of [first, second]) {
      const hurt = mine(league, abbr, 'active')[0];
      if (hurt) hurt.status = 'ir';
    }
    league.waivers[0]?.claims.push(first);
    const results = processWaivers(league, stream(1), () => [second]);
    // The earlier team in priority wins.
    expect(results).toEqual([
      { playerId: player.id, from: 'MIN', claimedBy: second, claims: [first, second] }
    ]);
    expect(player).toMatchObject({ team: second, status: 'active' });
    const taken = league.contracts[player.contractId ?? ''];
    expect(taken?.signingBonus).toBe(0);
    expect(taken?.years[0]?.year).toBe(2026);
    // The old deal leaves MIN only its proration: this year's now, the rest next year (after June 1), and
    // none of the guarantees.
    const old = league.contracts[oldId];
    if (!old) throw new Error('no old contract');
    expect(old.ended?.how).toBe('claimed');
    const schedule = prorationSchedule(old, league.rules);
    const later = [...schedule].filter(([y]) => y > 2026).reduce((sum, [, amount]) => sum + amount, 0);
    expect(capCharge(old, 2026, league.rules)).toMatchObject({
      base: 0,
      dead: 0,
      proration: schedule.get(2026) ?? 0
    });
    expect(capCharge(old, 2027, league.rules).dead).toBe(later);
    expect(league.waivers).toEqual([]);
    expect(league.season.transactions.at(-1)).toMatchObject({ kind: 'claimed', team: second });
  });

  it('frees an unclaimed player, and refuses claims without roster room', () => {
    const league = fresh();
    const [player] = mine(league, 'MIN', 'active');
    if (!player) throw new Error('no player');
    waive(league, player);
    const entry = league.waivers[0];
    if (!entry) throw new Error('no entry');
    expect(claimProblem(league, 'MIN', entry)).toBe("A team can't claim a player it released.");
    const free = Object.values(league.players).filter(p => p.status === 'freeAgent');
    const room = 53 - rosterCounts(league, 'KC').active;
    for (const p of free.slice(0, room)) Object.assign(p, { team: 'KC', status: 'active' });
    expect(claimProblem(league, 'KC', entry)).toBe('The active roster is full.');
    // The user's claim needs room; KC's is refused, and he clears to free agency.
    entry.claims.push('KC');
    const kept = structuredClone(league);
    expect(processWaivers(league, stream(1))).toEqual([
      { playerId: player.id, from: 'MIN', claimedBy: null, claims: ['KC'] }
    ]);
    expect(player).toMatchObject({ team: null, status: 'freeAgent' });
    // An AI claimant cuts someone before its next game, so a full roster doesn't stop it.
    expect(processWaivers(kept, stream(1), () => ['KC'])[0]?.claimedBy).toBe('KC');
  });
});
