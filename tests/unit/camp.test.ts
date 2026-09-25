import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import type { League } from '../../src/engine/league/types';
import type { GameDate } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import {
  campInjuries,
  playPreseasonWeek,
  positionBattles,
  preseasonSchedule,
  restingStarters
} from '../../src/engine/season/camp';
import { advanceOffseason } from '../../src/engine/season/offseason';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// Training camp and the preseason (spec 4.1): position battles, camp injuries, and games that don't count.
const at = (phase: GameDate['phase'], week = 1): GameDate => ({ season: 2026, phase, week });
const fresh = (phase: GameDate['phase'], week = 1): League => {
  const league = structuredClone(situationLeague);
  league.date = at(phase, week);
  return league;
};
const qbs = (league: League, abbr: string): Player[] =>
  Object.values(league.players)
    .filter(p => p.team === abbr && p.position === 'QB' && p.status === 'active')
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));

describe('position battles (spec 4.1)', () => {
  it('pits close starters against their backups, and the winner takes first-team snaps', () => {
    const league = fresh('trainingCamp');
    const [starter, backup] = qbs(league, 'MIN') as [Player, Player];
    backup.ratings = { ...starter.ratings };
    backup.ovr = starter.ovr;
    const battles = positionBattles(league, stream(1, 'battles'));
    const qb = battles.find(b => b.team === 'MIN' && b.position === 'QB');
    expect(qb).toBeDefined();
    expect([starter.id, backup.id].sort()).toEqual([qb?.winner.id, qb?.loser.id].sort());
    expect(qb?.change?.cause).toBe('camp');
    expect(qb?.change?.drivers[0]?.id).toBe('battle');
    // A starter far ahead has no battle.
    const far = fresh('trainingCamp');
    const [top, next] = qbs(far, 'MIN') as [Player, Player];
    next.ovr = top.ovr - TUNING.camp.battleGap - 1;
    expect(positionBattles(far, stream(1, 'battles')).some(b => b.team === 'MIN' && b.position === 'QB')).toBe(false);
  }); // prettier-ignore

  it('lets the backup win about half the even battles', () => {
    // One league: each time, the two quarterbacks start even again and the camp draws its own stream.
    const league = fresh('trainingCamp');
    const [starter, backup] = qbs(league, 'MIN') as [Player, Player];
    const even = { ...starter.ratings };
    const ovr = starter.ovr;
    let upsets = 0;
    for (let i = 0; i < 200; i++) {
      for (const p of [starter, backup]) Object.assign(p, { ratings: { ...even }, ovr });
      const qb = positionBattles(league, stream(i, 'battles')).find(b => b.team === 'MIN' && b.position === 'QB');
      if (qb?.upset) upsets++;
    }
    expect(upsets).toBeGreaterThan(70);
    expect(upsets).toBeLessThan(130);
  }); // prettier-ignore
});

describe('camp injuries (spec 4.1, 10.8)', () => {
  it('hurts a few players a team, for weeks, more with the injury slider', () => {
    const league = fresh('trainingCamp');
    const events = campInjuries(league, stream(2, 'camp'));
    const perTeam = events.length / TEAM_ABBRS.length;
    expect(perTeam).toBeGreaterThan(1);
    expect(perTeam).toBeLessThan(5);
    expect(events.every(e => e.weeks >= 1 && e.severity !== 'minor')).toBe(true);
    league.settings.sim.general.injuryFrequency = 2;
    expect(campInjuries(league, stream(2, 'camp')).length).toBeGreaterThan(events.length * 1.5);
  });
});

describe('the preseason (spec 4.1)', () => {
  it('schedules three weeks: everyone plays each week, never the same team twice, hosting once or twice', () => {
    const games = preseasonSchedule(2026, 3, stream(3, 'preseason'));
    expect(games).toHaveLength(48);
    const hosted = new Map<string, number>();
    const met = new Set<string>();
    for (let week = 1; week <= 3; week++) {
      const teams = games.filter(g => g.week === week).flatMap(g => [g.home, g.away]);
      expect(new Set(teams).size).toBe(32);
    }
    for (const g of games) {
      const key = [g.home, g.away].sort().join('-');
      expect(met.has(key)).toBe(false);
      met.add(key);
      hosted.set(g.home, (hosted.get(g.home) ?? 0) + 1);
      expect(g).toMatchObject({ season: 2027, siteType: 'home' });
      expect(g.date.startsWith('2027-08')).toBe(true);
    }
    expect(TEAM_ABBRS.every(t => [1, 2].includes(hosted.get(t) ?? 0))).toBe(true);
  });

  it('rests the projected starters and plays the backups, lines kept as preseason', () => {
    const league = fresh('preseason');
    league.preseason = { games: preseasonSchedule(2026, 3, stream(4, 'preseason')), results: {} };
    const resting = restingStarters(league);
    const [starter] = qbs(league, 'MIN') as [Player];
    expect(resting.has(starter.id)).toBe(true);
    const played = playPreseasonWeek(league, 1, null, stream(5, 'preseason'));
    expect(played).toHaveLength(16);
    expect(played.every(g => g.meta.kind === 'preseason' && g.meta.season === 2027 && g.meta.week === 1)).toBe(true);
    const lines = played.flatMap(g => [...Object.keys(g.result.box.home.players), ...Object.keys(g.result.box.away.players)]);
    expect(lines.some(id => resting.has(id))).toBe(false);
  }); // prettier-ignore

  it('plays through camp and the preseason into the cutdown, with results and messages', () => {
    const league = fresh('otas');
    league.settings.auto.roster = true;
    const games: unknown[] = [];
    for (let i = 0; league.date.phase !== 'cutdown'; i++) {
      const step = advanceOffseason(league, { names: nameData(), climate: null }, { actions: 0, entropy: i });
      games.push(...step.games);
    }
    expect(games).toHaveLength(48);
    expect(Object.keys(league.preseason?.results ?? {})).toHaveLength(48);
    expect(league.inbox.some(m => m.title.startsWith('Preseason, week 1:'))).toBe(true);
  }, 120_000);
});
