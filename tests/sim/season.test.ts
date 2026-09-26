import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { team } from '../../src/data/teams';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import { startersOf } from '../../src/engine/league/depth';
import { depthRows, moveInDepth } from '../../src/engine/league/depth-view';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { advanceWeek, gameWeek, weekGames } from '../../src/engine/season/advance';
import { leagueStandings } from '../../src/engine/season/state';
import { NEUTRAL_PLAN } from '../../src/engine/sim/plan';
import { makeMove, type Move } from '../../src/engine/roster/moves';
import { rosterCounts, rosterProblems } from '../../src/engine/roster/rules';
import { askingSalary } from '../../src/engine/contracts/acceptance';
import { stream, type Rng } from '../../src/engine/rng';
import { available } from '../../src/engine/sim/setup';
import { nameData } from '../helpers/base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const league = (): League =>
  createLeague({
    id: 'season',
    name: 'Season',
    start: defaultStartOptions('MIN', 44),
    gameVersion: 'test',
    names: nameData(),
    schedule,
    fixed: true
  });
const input = { actions: 0, entropy: 0 };

/**
 * A legal league after a week (spec 12.1): every roster at or under the active limit (AI teams fill theirs),
 * every active player under contract with his team, and every team that played fielded its core lineup.
 */
const CORE = ['QB', 'RB1', 'X', 'Z', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDGE', 'REDGE', 'DT1', 'MIKE', 'CB1', 'CB2', 'FS', 'SS'] as const; // prettier-ignore

function expectLegal(l: League, played: ReadonlySet<string>): void {
  const limit = l.rules.roster.active;
  for (const abbr of TEAM_ABBRS) {
    // Every roster rule and the cap (spec 12.1, 11.1), for AI teams and the user's alike.
    expect(rosterProblems(l, abbr), abbr).toEqual([]);
    const active = Object.values(l.players).filter(p => p.team === abbr && p.status === 'active');
    if (abbr === l.meta.start.userTeam) expect(active.length).toBeLessThanOrEqual(limit);
    else expect(active.length, abbr).toBe(limit);
    for (const p of active) expect(l.contracts[p.contractId ?? '']?.team, p.id).toBe(abbr);
    // The user's roster moves are the user's (spec 22.7's auto toggle arrives in M20), so only AI teams
    // are sure to keep a full lineup through injuries.
    if (!played.has(abbr) || abbr === l.meta.start.userTeam) continue;
    // A thin group (a lone fullback, say) can be empty for a week; the core of the lineup never is.
    const starters = startersOf(l.teams[abbr].depth.order);
    for (const slot of CORE) expect(starters[slot], `${abbr} ${slot}`).toBeDefined();
    expect(new Set(Object.values(starters)).size).toBe(Object.values(starters).length);
  }
}

// A whole season is the slowest test in the suite.
describe('the season loop (spec 4.2, 5.3)', { timeout: 120_000 }, () => {
  it('replays a week exactly in a fixed-seed league', () => {
    const a = advanceWeek(league(), climate, input);
    const b = advanceWeek(league(), climate, input);
    expect(a.games.map(g => g.result.score)).toEqual(b.games.map(g => g.result.score));
    expect(a.league.date).toEqual({ season: 2026, phase: 'regularSeason', week: 2 });
    expect(a.games).toHaveLength(schedule.filter(g => g.week === 1).length);
    expect(a.games.every(g => g.meta.kind === 'regular' && g.meta.week === 1)).toBe(true);
    // Snaps on offense and defense by player and by team, for the fifth-year option (spec 11.4): each
    // team's are its most-used player's, and special teams snaps don't count.
    const { scrimmage, teamScrimmage } = a.league.season;
    for (const g of a.games)
      for (const [abbr, box] of [[g.result.home, g.result.box.home], [g.result.away, g.result.box.away]] as const) {
        const lines = Object.entries(box.players);
        const team = teamScrimmage[abbr];
        expect(team?.[0]).toBe(Math.max(...lines.map(([, l]) => l.snapsOffense ?? 0)));
        expect(team?.[1]).toBe(Math.max(...lines.map(([, l]) => l.snapsDefense ?? 0)));
        for (const [id, line] of lines) expect(scrimmage[id]).toEqual([line.snapsOffense ?? 0, line.snapsDefense ?? 0]);
      }
    // A game on full pay status for everyone on the active roster, injured reserve, or PUP of a team that
    // played, toward credited and accrued seasons (D-37); none for the practice squad unless elevated.
    const teams = new Set(a.games.flatMap(g => [g.result.home, g.result.away]));
    const elevated = new Set(a.league.season.elevations.map(e => e.playerId));
    for (const p of Object.values(a.league.players)) {
      const onFullPay = !!p.team && teams.has(p.team) && ['active', 'ir', 'pup'].includes(p.status);
      if (onFullPay) expect(a.league.season.fullPay[p.id]).toBe(1);
      else if (!elevated.has(p.id)) expect(a.league.season.fullPay[p.id]).toBeUndefined();
    }
  }); // prettier-ignore

  it('plays week 1 through the Super Bowl: seeds, byes, re-seeding, and one champion', () => {
    const l = league();
    // A starting quarterback's deal with two incentives, settled on his regular-season totals (spec 11.2).
    const qb = Object.values(l.players)
      .filter(p => p.team === 'MIN' && p.position === 'QB' && p.contractId)
      .sort((a, b) => b.ovr - a.ovr)[0];
    const deal = l.contracts[qb?.contractId ?? ''];
    const entry = deal?.years.find(y => y.year === 2026);
    if (!qb || !deal || !entry) throw new Error('no quarterback deal');
    entry.incentives = [
      { condition: '1 passing yard', amount: 100_000, likely: true, stat: { key: 'passYds', atLeast: 1 }, earned: null },
      { condition: '9,000 passing yards', amount: 100_000, likely: false, stat: { key: 'passYds', atLeast: 9000 }, earned: null }
    ]; // prettier-ignore
    const week = () => {
      const played = new Set(weekGames(l).flatMap(g => [g.home, g.away]));
      advanceWeek(l, climate, input);
      expectLegal(l, played);
    };
    while (l.date.phase === 'regularSeason') week();
    expect(Object.values(l.season.results)).toHaveLength(272);
    // AI teams moved long injuries to injured reserve and signed replacements.
    const moves = l.season.transactions;
    expect(moves.some(t => t.kind === 'injuredReserve')).toBe(true);
    expect(moves.some(t => t.kind === 'signed')).toBe(true);
    // Elevations kept within the limits: two a team each game, three a player each season (spec 12.1).
    const count = (keys: string[]) => {
      const counts = new Map<string, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      return Math.max(0, ...counts.values());
    };
    expect(l.season.elevations.length).toBeGreaterThan(0);
    expect(count(l.season.elevations.map(e => `${e.team} ${e.week}`))).toBeLessThanOrEqual(
      l.rules.roster.elevationsPerGame
    );
    expect(count(l.season.elevations.map(e => e.playerId))).toBeLessThanOrEqual(
      l.rules.roster.elevationsPerPlayer
    );
    expect(l.date).toMatchObject({ phase: 'wildCard', week: 1 });
    const settled = l.contracts[deal.id]?.years.find(y => y.year === 2026)?.incentives;
    expect(settled?.map(i => i.earned)).toEqual([true, false]);
    expect(l.season.inactive[qb.id] ?? 0).toBeLessThan(17);
    expect(Object.values(l.season.inactive).some(n => n > 0)).toBe(true);
    const standings = leagueStandings(l);
    for (const conference of ['AFC', 'NFC'] as const) {
      const seeds = l.season.seeds?.[conference] ?? [];
      expect(seeds).toHaveLength(7);
      // The four division winners take the top seeds.
      const winners = standings.divisions.filter(d => d.conference === conference).map(d => d.teams[0]?.abbr);
      expect(seeds.slice(0, 4).sort()).toEqual([...winners].sort());
      expect(seeds.every(abbr => team(abbr).conf === conference)).toBe(true);
    }
    // Wild Card weekend: six games, the higher seed at home, the top seeds resting.
    const wildCard = weekGames(l);
    expect(wildCard).toHaveLength(6);
    expect(gameWeek(l)).toBe(19);
    for (const g of wildCard) {
      const seeds = l.season.seeds?.[team(g.home).conf] ?? [];
      expect(seeds.indexOf(g.home)).toBeLessThan(seeds.indexOf(g.away));
      expect(seeds.indexOf(g.home)).toBeGreaterThan(0);
    }
    while (l.date.phase !== 'staff') week();
    const playoffs = Object.values(l.season.results).filter(g => g.playoff);
    expect(playoffs).toHaveLength(13);
    expect(playoffs.every(g => g.homeScore !== g.awayScore)).toBe(true);
    const final = playoffs.find(g => g.week === 22);
    expect(final).toBeDefined();
    expect(l.season.champion).toBe(final && (final.homeScore > final.awayScore ? final.home : final.away));
    // The Super Bowl is at a neutral site between the conference champions.
    const sb = l.schedule.find(g => g.week === 22);
    expect(sb?.siteType).toBe('neutral');
    expect(team(sb?.home ?? 'MIN').conf).not.toBe(team(sb?.away ?? 'MIN').conf);
  });

  it('keeps players out while they are hurt and lets questionable players be rested', () => {
    const l = league();
    const [a, b] = Object.values(l.players).filter(p => p.team === 'MIN' && p.status === 'active');
    if (!a || !b) throw new Error('no players');
    a.injury = { bodyPart: 'knee', severity: 'medium', weeksOut: 3, lingering: 2, fragile: 4, season: 2026, week: 1, career: false }; // prettier-ignore
    b.injury = { bodyPart: 'ankle', severity: 'short', weeksOut: 0, lingering: 2, fragile: 2, season: 2026, week: 1, career: false }; // prettier-ignore
    expect(available(l, a)).toBe(false);
    expect(available(l, b)).toBe(true);
    l.teams.MIN.resting = [b.id];
    expect(available(l, b)).toBe(false);
    advanceWeek(l, climate, input);
    expect(l.players[a.id]?.injury?.weeksOut).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The user's week of roster moves, through the same checked transactions as the screens (spec 19.4): long
 * injuries to injured reserve, and open spots filled with free agents at their asking price. Returns the
 * moves made.
 */
function userRosterMoves(l: League, rng: Rng): number {
  const user = l.meta.start.userTeam;
  let made = 0;
  const move = (m: Move) => {
    const done = makeMove(l, m, rng).ok;
    if (done) made++;
    return done;
  };
  for (const p of Object.values(l.players))
    if (p.team === user && p.status === 'active' && (p.injury?.weeksOut ?? 0) >= l.rules.roster.irMinGames)
      move({ kind: 'injuredReserve', team: user, playerId: p.id });
  const pool = Object.values(l.players)
    .filter(p => p.status === 'freeAgent')
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  for (const p of pool) {
    if (rosterCounts(l, user).active >= l.rules.roster.active) break;
    move({ kind: 'sign', team: user, playerId: p.id, offer: { years: 1, salary: askingSalary(l, p), signingBonus: 0 } });
  }
  return made;
} // prettier-ignore

describe('a season with the user managing (spec 12.2, 8.7, 19.4)', { timeout: 180_000 }, () => {
  it("keeps the user's starters and plan every week while the AI manages everyone else", () => {
    const l = league();
    const user = l.meta.start.userTeam;
    // Three weeks on auto, then the user takes over: the backup quarterback starts and the plan passes.
    for (let w = 0; w < 3; w++) advanceWeek(l, climate, input);
    const qbs = depthRows(l, user).QB.filter(r => r.available);
    const backup = qbs[1]?.id as string;
    expect(backup).toBeDefined();
    const moved = moveInDepth(l, user, 'QB', backup, 0);
    l.teams[user].depth = { auto: false, order: moved.order };
    l.teams[user].plan = { auto: false, plan: { ...NEUTRAL_PLAN, passLean: 0.15, blitz: 1.5 } };
    let started = 0;
    let ready = 0;
    let games = 0;
    let moves = 0;
    while (l.date.phase !== 'staff') {
      // The user's roster moves before each week, and a release at midseason (never the quarterback).
      if (l.date.phase === 'regularSeason' && l.date.week === 8) {
        const cut = Object.values(l.players)
          .filter(p => p.team === user && p.status === 'active' && p.position !== 'QB')
          .sort((a, b) => a.ovr - b.ovr || (a.id < b.id ? -1 : 1))[0];
        if (cut && makeMove(l, { kind: 'release', team: user, playerId: cut.id }, stream(9)).ok) moves++;
      }
      moves += userRosterMoves(l, stream(1, 'user', l.date.week));
      const healthy = available(l, l.players[backup] as Player);
      const week = advanceWeek(l, climate, input);
      for (const { result } of week.games) {
        const side = result.home === user ? 'home' : result.away === user ? 'away' : null;
        if (!side) continue;
        games++;
        // He starts every game he's healthy for; the user's plan and chart are never overwritten.
        if (healthy) ready++;
        if (healthy && (result.box[side].players[backup]?.started ?? 0) > 0) started++;
      }
      expect(rosterProblems(l, user)).toEqual([]);
      expect(l.teams[user].depth.auto).toBe(false);
      expect(l.teams[user].depth.order.QB?.[0]).toBe(backup);
      expect(l.teams[user].plan.plan.passLean).toBe(0.15);
    }
    expect(games).toBeGreaterThanOrEqual(14);
    expect(ready).toBeGreaterThan(0);
    expect(started).toBe(ready);
    expect(l.season.champion).not.toBeNull();
    // AI teams kept managing; the user's roster moved only by the user's own moves, which kept it legal.
    expect(l.season.transactions.some(t => t.team !== user)).toBe(true);
    expect(moves).toBeGreaterThan(1);
    expect(l.season.transactions.filter(t => t.team === user)).toHaveLength(moves);
    expect(l.inbox.length).toBeGreaterThan(games);
    expect(new Set(l.season.news.map(n => n.week)).size).toBe(22);
  });
});
