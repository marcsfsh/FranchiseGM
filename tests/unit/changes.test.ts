import { describe, expect, it } from 'vitest';
import { rosterMoves } from '../../src/engine/ai/decisions/roster-moves';
import { manageWeek } from '../../src/engine/ai/weekly';
import { depthChanges, startersByTeam } from '../../src/engine/league/depth-changes';
import { startersOf } from '../../src/engine/league/depth';
import type { League } from '../../src/engine/league/types';
import { changeRatings } from '../../src/engine/progression/change';
import { stream } from '../../src/engine/rng';
import { applyInjuries } from '../../src/engine/season/injuries';
import type { InjuryEvent } from '../../src/engine/sim/types';
import { situationLeague } from '../helpers/situations';

// Changes with causes (post-M23 section 1.1, post-M42 section 1.1).
const fresh = (): League => structuredClone(situationLeague);
const player = (league: League, team: string, position: string) => {
  const p = Object.values(league.players)
    .filter(q => q.team === team && q.status === 'active' && q.position === position)
    .sort((a, b) => b.ovr - a.ovr)[0];
  if (!p) throw new Error(`no ${position}`);
  return p;
};

describe('rating changes', () => {
  it('moves ratings by whole points within 0 to 99, recomputes the overall, and records why', () => {
    const league = fresh();
    const qb = player(league, 'MIN', 'QB');
    const before = { ...qb.ratings };
    const ovr = qb.ovr;
    const change = changeRatings(qb, { thp: 200, acc: -2, spd: 0 }, 'weekly', league.date, [
      { id: 'age', amount: -0.4 },
      { id: 'snaps', amount: 1.2 },
      { id: 'coach', amount: 0.3 },
      { id: 'fit', amount: 0.1 }
    ]);
    expect(qb.ratings.thp).toBe(99);
    expect(qb.ratings.acc).toBe(before.acc - 2);
    expect(change).toMatchObject({
      playerId: qb.id,
      cause: 'weekly',
      deltas: { thp: 99 - before.thp, acc: -2 },
      ovr: { before: ovr, after: qb.ovr },
      date: league.date
    });
    // The largest three contributions, biggest first.
    expect(change?.drivers.map(d => d.id)).toEqual(['snaps', 'age', 'coach']);
    // Nothing to move is no change at all.
    expect(changeRatings(qb, { thp: 5 }, 'weekly', league.date)).toBeNull();
  });

  it('records a career-altering injury as an injury change', () => {
    const league = fresh();
    const rb = player(league, 'MIN', 'HB');
    const event: InjuryEvent = { playerId: rb.id, team: 'MIN', bodyPart: 'knee (ACL)', severity: 'season', weeks: 17, quarter: 2 } as InjuryEvent;
    // Seeds differ in whether the injury alters his career; find one that does.
    const changes = Array.from({ length: 40 }, (_, seed) => applyInjuries(structuredClone(league), [event], 2026, 3, stream(seed, 'hurt'))).find(c => c.length);
    expect(changes?.[0]).toMatchObject({ playerId: rb.id, cause: 'injury' });
    expect(Object.values(changes?.[0]?.deltas ?? {}).every(d => d < 0)).toBe(true);
  }); // prettier-ignore
});

describe('roster and depth chart changes with reasons', () => {
  it('logs why the AI moved a player', () => {
    const league = fresh();
    const wr = player(league, 'KC', 'WR');
    wr.injury = { bodyPart: 'knee', severity: 'medium', weeksOut: 6, lingering: 2, fragile: 3, season: 2026, week: 1, career: false }; // prettier-ignore
    rosterMoves(league, 'KC', stream(4));
    const moves = league.season.transactions.filter(t => t.team === 'KC');
    expect(moves.find(t => t.kind === 'injuredReserve')).toMatchObject({ playerId: wr.id, reason: 'a knee injury, out 6 weeks' });
    expect(moves.find(t => t.kind === 'signed' || t.kind === 'promoted')?.reason).toBe('needed at receiver');
  }); // prettier-ignore

  it('reports a starter replaced because he was hurt, and one moved by the coach', () => {
    const league = fresh();
    manageWeek(league, stream(1, 'week'), stream(1, 'season'));
    const before = startersByTeam(league);
    const qb = before.KC.QB;
    if (!qb) throw new Error('no starter');
    const hurt = league.players[qb];
    if (!hurt) throw new Error('no player');
    hurt.injury = { bodyPart: 'ankle', severity: 'short', weeksOut: 2, lingering: 1, fragile: 1, season: 2026, week: 1, career: false }; // prettier-ignore
    manageWeek(league, stream(2, 'week'), stream(1, 'season'));
    const changes = depthChanges(league, before);
    const kc = changes.find(c => c.team === 'KC' && c.slot === 'QB');
    expect(kc).toMatchObject({
      replaced: qb,
      reason: 'injury',
      playerId: startersOf(league.teams.KC.depth.order).QB
    });
    expect(kc?.playerId).not.toBe(qb);
    // A change the coach makes with everyone healthy is his decision.
    const user = league.meta.start.userTeam;
    const again = startersByTeam(league);
    const starter = again[user].QB;
    const backup = Object.values(league.players).find(
      p => p.team === user && p.status === 'active' && p.position === 'QB' && p.id !== starter && !p.injury
    );
    if (!backup) throw new Error('no backup');
    league.teams[user].depth.order = { ...league.teams[user].depth.order, QB: [backup.id] };
    expect(depthChanges(league, again).find(c => c.team === user && c.slot === 'QB')).toMatchObject({
      playerId: backup.id,
      replaced: starter,
      reason: 'coach'
    });
  });
});
