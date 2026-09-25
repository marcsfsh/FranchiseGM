import { describe, expect, it } from 'vitest';
import { capSheet } from '../../src/engine/cap/sheet';
import { endContract } from '../../src/engine/contracts/moves';
import type { League } from '../../src/engine/league/types';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);

describe('the team cap sheet (spec 11.1, 11.2)', () => {
  it('counts every current deal in season and leaves the rest as space', () => {
    const league = fresh();
    const sheet = capSheet(league, 'MIN');
    const players = Object.values(league.players).filter(p => p.team === 'MIN' && p.contractId);
    expect(sheet.year).toBe(2026);
    expect(sheet.offseason).toBe(false);
    expect(sheet.lines.filter(l => l.status)).toHaveLength(players.length);
    expect(sheet.lines.every(l => l.counts)).toBe(true);
    expect(sheet.used).toBe(sheet.lines.reduce((sum, l) => sum + l.charge.total, 0));
    expect(sheet.space).toBe(sheet.cap + sheet.carryover - sheet.used);
    expect(sheet.space).toBeGreaterThan(0);
  });

  it('counts only the 51 largest roster charges from the league year opening to the season', () => {
    const league = fresh();
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    const sheet = capSheet(league, 'MIN');
    expect(sheet.year).toBe(2027);
    expect(sheet.offseason).toBe(true);
    const roster = sheet.lines.filter(l => l.status);
    const counted = roster.filter(l => l.counts);
    expect(counted).toHaveLength(Math.min(51, roster.length));
    const smallestCounted = Math.min(...counted.map(l => l.charge.total));
    expect(roster.filter(l => !l.counts).every(l => l.charge.total <= smallestCounted)).toBe(true);
    expect(sheet.roster).toBe(counted.reduce((sum, l) => sum + l.charge.total, 0));
  });

  it('moves a released player to dead money', () => {
    const league = fresh();
    const player = Object.values(league.players)
      .filter(p => p.team === 'MIN' && p.contractId)
      .sort((a, b) => (league.contracts[b.contractId ?? '']?.signingBonus ?? 0) - (league.contracts[a.contractId ?? '']?.signingBonus ?? 0))[0];
    if (!player?.contractId) throw new Error('no player');
    const contract = league.contracts[player.contractId];
    if (!contract) throw new Error('no contract');
    const before = capSheet(league, 'MIN');
    league.contracts[contract.id] = endContract(contract, {
      date: { ...league.date },
      how: 'released',
      designated: false,
      injured: false,
      terminationPay: false
    });
    player.contractId = null;
    player.team = null;
    player.status = 'freeAgent';
    const after = capSheet(league, 'MIN');
    const dead = after.lines.find(l => l.contractId === contract.id);
    expect(dead?.status).toBeNull();
    expect(after.dead).toBe(dead?.charge.total);
    expect(dead?.charge.proration).toBeGreaterThan(0);
    expect(after.lines.filter(l => l.status)).toHaveLength(before.lines.filter(l => l.status).length - 1);
  }); // prettier-ignore
});
