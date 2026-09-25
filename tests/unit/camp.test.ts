import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { startersOf } from '../../src/engine/league/depth';
import type { DepthChange } from '../../src/engine/league/depth-changes';
import type { League } from '../../src/engine/league/types';
import type { GameDate } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import {
  campInjuries,
  playPreseasonWeek,
  positionBattles,
  preseasonSchedule,
  restingStarters,
  setDepthCharts
} from '../../src/engine/season/camp';
import { advanceOffseason } from '../../src/engine/season/offseason';
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
  /** Kansas City at camp with its two best quarterbacks even, and its chart set by its coach. */
  const evenQbs = () => {
    const league = fresh('trainingCamp');
    const [starter, backup] = qbs(league, 'KC') as [Player, Player];
    Object.assign(backup, { ratings: { ...starter.ratings }, ovr: starter.ovr });
    setDepthCharts(league, stream(league.random.baseSeed, 'ai', 2027));
    return { league, starter, backup };
  };

  it('pits a starter against the best player not starting, and the winner takes the job', () => {
    const { league, starter, backup } = evenQbs();
    const qb = positionBattles(league, stream(1, 'battles'), ['KC']).find(b => b.slot === 'QB');
    expect(qb).toBeDefined();
    expect([qb?.winner.id, qb?.loser.id].sort()).toEqual([starter.id, backup.id].sort());
    expect(startersOf(league.teams.KC.depth.order).QB).toBe(qb?.winner.id);
    expect(qb?.change).toMatchObject({ cause: 'camp', drivers: [{ id: 'battle' }] });
    // A starter well ahead has no battle.
    const far = evenQbs();
    for (const k of Object.keys(far.backup.ratings) as (keyof Player['ratings'])[]) far.backup.ratings[k] = Math.max(0, far.backup.ratings[k] - 15);
    expect(positionBattles(far.league, stream(1, 'battles'), ['KC']).some(b => b.slot === 'QB')).toBe(false);
  }); // prettier-ignore

  it('lets the challenger win about half the even battles', () => {
    // One league: each time, the quarterbacks start even and the chart as the coach set it.
    const { league, starter, backup } = evenQbs();
    const even = { ...starter.ratings };
    const { ovr } = starter;
    const order = structuredClone(league.teams.KC.depth.order);
    let upsets = 0;
    for (let i = 0; i < 200; i++) {
      for (const p of [starter, backup]) Object.assign(p, { ratings: { ...even }, ovr });
      league.teams.KC.depth.order = structuredClone(order);
      if (positionBattles(league, stream(i, 'battles'), ['KC']).find(b => b.slot === 'QB')?.upset) upsets++;
    }
    expect(upsets).toBeGreaterThan(70);
    expect(upsets).toBeLessThan(130);
  });

  it("leaves the user's own chart alone", () => {
    const league = fresh('trainingCamp');
    const user = league.meta.start.userTeam;
    league.teams[user].depth.auto = false;
    const order = structuredClone(league.teams[user].depth.order);
    positionBattles(league, stream(2, 'battles'), [user]);
    expect(league.teams[user].depth.order).toEqual(order);
  });
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
    const won: DepthChange[] = [];
    for (let i = 0; league.date.phase !== 'cutdown'; i++) {
      const step = advanceOffseason(league, { names: nameData(), climate: null }, { actions: 0, entropy: i });
      games.push(...step.games);
      if (league.date.phase === 'trainingCamp') won.push(...step.depth.filter(c => c.reason === 'camp'));
    }
    // Camp battles the challengers won are depth chart changes, and the winners start.
    expect(won.length).toBeGreaterThan(0);
    for (const c of won) expect(startersOf(league.teams[c.team].depth.order)[c.slot]).toBe(c.playerId);
    expect(games).toHaveLength(48);
    expect(Object.keys(league.preseason?.results ?? {})).toHaveLength(48);
    expect(league.inbox.some(m => m.title.startsWith('Preseason, week 1:'))).toBe(true);
  }, 120_000);
});
