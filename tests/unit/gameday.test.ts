import { describe, expect, it } from 'vitest';
import { leagueFitContext } from '../../src/engine/league/fit';
import { POSITION_GROUP } from '../../src/engine/model/positions';
import { depthChart, gameDayActives, simPlayer } from '../../src/engine/sim/setup';
import type { SimPlayer } from '../../src/engine/sim/types';
import { situationLeague } from '../helpers/situations';

describe('game-day actives (spec 12.1)', () => {
  const league = situationLeague;
  const abbr = 'KC' as const;
  const roster = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active');
  const ctx = leagueFitContext(league, abbr);
  const players: Record<string, SimPlayer> = Object.fromEntries(roster.map(p => [p.id, simPlayer(p)]));
  const depth = depthChart(roster, ctx, players);
  const byId = new Map(roster.map(p => [p.id, p]));

  it('dresses 48 with every starter and at least 8 linemen, plus an emergency quarterback', () => {
    const dressed = gameDayActives(roster, depth, league.rules.roster, ctx.offense.tendencies.personnel);
    const qbs = [...dressed].filter(id => byId.get(id)?.position === 'QB').length;
    const third = roster.filter(p => p.position === 'QB').length >= 3;
    expect(dressed.size).toBe(48 + (third ? 1 : 0));
    for (const ids of Object.values(depth)) if (ids[0]) expect(dressed.has(ids[0])).toBe(true);
    const linemen = [...dressed].filter(id => POSITION_GROUP[byId.get(id)?.position ?? 'QB'] === 'OL').length;
    expect(linemen).toBeGreaterThanOrEqual(8);
    expect(qbs).toBeGreaterThanOrEqual(2);
  });

  it('dresses enough tight ends and receivers for the personnel the team uses', () => {
    const heavy = { ...ctx.offense.tendencies.personnel, '13': 0.1, '10': 0.05 };
    const dressed = gameDayActives(roster, depth, league.rules.roster, heavy);
    const count = (group: string) =>
      [...dressed].filter(id => POSITION_GROUP[byId.get(id)?.position ?? 'QB'] === group).length;
    const tightEnds = roster.filter(p => p.position === 'TE').length;
    expect(count('TE')).toBe(Math.min(3, tightEnds));
    expect(count('WR')).toBeGreaterThanOrEqual(5);
  });

  it('dresses the players the rotation plans to use', () => {
    const benchwarmer = [...roster].sort((a, b) => a.ovr - b.ovr)[0];
    const dressed = gameDayActives(roster, depth, league.rules.roster, ctx.offense.tendencies.personnel, [
      benchwarmer?.id ?? ''
    ]);
    expect(dressed.has(benchwarmer?.id ?? '')).toBe(true);
  });
});

describe('depth chart orders (spec 12.2)', () => {
  const league = situationLeague;
  const abbr = 'KC' as const;
  const roster = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active');
  const ctx = leagueFitContext(league, abbr);
  const players = (): Record<string, SimPlayer> => Object.fromEntries(roster.map(p => [p.id, simPlayer(p)]));
  const auto = depthChart(roster, ctx, players());
  const receivers = auto.X ?? [];

  it("follows the user's order for the starter and the backups, then the rest by role rating", () => {
    const [a, b, c] = [receivers[2] as string, receivers[3] as string, receivers[1] as string];
    const depth = depthChart(roster, ctx, players(), { X: [a, b, c] });
    expect(depth.X?.slice(0, 3)).toEqual([a, b, c]);
    expect(new Set(depth.X).size).toBe(depth.X?.length);
    expect(depth.X?.length).toBe(receivers.length);
  });

  it("skips a listed player who can't play: the next in the order starts", () => {
    const [hurt, next] = [receivers[3] as string, receivers[2] as string];
    const healthy = roster.filter(p => p.id !== hurt);
    const depth = depthChart(healthy, ctx, players(), { X: [hurt, next] });
    expect(depth.X?.[0]).toBe(next);
    expect(depth.X).not.toContain(hurt);
  });
});
