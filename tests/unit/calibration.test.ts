import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import type { TeamAbbr } from '../../src/data/team-colors';
import { FIT_GROUP_IDS } from '../../src/engine/calibration/experiment';
import { computeMetrics, fitRatings, METRICS, type RunSample } from '../../src/engine/calibration/metrics';
import {
  calibrationLeague,
  replaySeason,
  trailedLate,
  type CalibrationData,
  type GameFact,
  type ReplayFacts,
  type TeamFact
} from '../../src/engine/calibration/replay';
import { LoopSeason, loopLeague } from '../../src/engine/calibration/loop';
import { formatValue, reportMarkdown, summaryLines } from '../../src/engine/calibration/report';
import { defaultExperiments, finishRun, planJobs, sharedLeague } from '../../src/engine/calibration/run';
import { checkTargets, evaluate, type TargetsFile } from '../../src/engine/calibration/targets';
import { stream } from '../../src/engine/rng';
import { emptyTotals } from '../../src/engine/sim/stats';
import type { GameWeather } from '../../src/engine/sim/types';
import { nameData } from '../helpers/base-data';

const data: CalibrationData = {
  names: nameData(),
  schedule: parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026),
  climate: parseClimate(readFileSync('data-raw/climate.csv', 'utf8'))
};
const targets = JSON.parse(readFileSync('calibration/targets.json', 'utf8')) as TargetsFile;

// The first two weeks keep replays quick.
const league = calibrationLeague(data, 17);
const short = { ...league, schedule: league.schedule.filter(g => g.week <= 2) };

// Replays are the slowest unit tests; the suite runs files in parallel.
describe('calibration replays (spec 23.1)', { timeout: 30_000 }, () => {
  it('replays exactly from the same stream and yields facts that agree with each other', () => {
    const a = replaySeason(short, data.climate, stream(3, 'replay'));
    expect(replaySeason(short, data.climate, stream(3, 'replay'))).toStrictEqual(a);
    expect(replaySeason(short, data.climate, stream(4, 'replay'))).not.toStrictEqual(a);
    expect(a.games).toHaveLength(short.schedule.length);
    const games = a.teams.reduce((n, t) => n + t.wins + t.losses + t.ties, 0);
    expect(games).toBe(2 * a.games.length);
    const points = a.games.reduce((n, g) => n + g.homeScore + g.awayScore, 0);
    expect(a.teams.reduce((n, t) => n + t.pointsFor, 0)).toBe(points);
    expect(a.teams.reduce((n, t) => n + t.totals.points, 0)).toBe(points);
    // Player totals add up to team totals.
    const passYds = a.teams.reduce((n, t) => n + t.totals.passYds, 0);
    expect(a.players.reduce((n, p) => n + p.line.passYds, 0)).toBe(passYds);
    expect(a.fit).toBeUndefined();
  });

  it('keeps players hurt for weeks out of the games they miss', () => {
    const facts = replaySeason(short, data.climate, stream(5, 'replay'));
    const hurt = facts.teams.reduce((n, t) => n + t.injuries.missed, 0);
    expect(facts.teams.reduce((n, t) => n + t.injuries.all, 0)).toBeGreaterThanOrEqual(hurt);
    // Week 2 injuries can't cost week 1 games, so a two-week replay loses at most one game per injury.
    expect(facts.teams.reduce((n, t) => n + t.injuries.gamesLost, 0)).toBeLessThanOrEqual(hurt);
    // Every game an injury costs is a game the player sat out.
    expect(facts.teams.reduce((n, t) => n + t.injuries.absences, 0)).toBeGreaterThan(0);
    for (const t of facts.teams) expect(t.injuries.absences, t.team).toBe(t.injuries.gamesLost);
  });

  it('runs the fit experiment: every measured starter plays at his best or worst fit', () => {
    const facts = replaySeason(short, data.climate, stream(6, 'replay'), { fitExperiment: true });
    const fit = facts.fit;
    if (!fit) throw new Error('no fit sample');
    for (const group of FIT_GROUP_IDS) {
      expect(fit[group].best.games).toBeGreaterThan(0);
      expect(fit[group].worst.games).toBeGreaterThan(0);
      // Best arms carry more fit than worst arms, player-game for player-game.
      expect(fit[group].best.fit / fit[group].best.games).toBeGreaterThan(
        fit[group].worst.fit / fit[group].worst.games
      );
    }
  });

  it('plays weeks through the weekly advance with every club on auto, collecting the same facts', () => {
    const loop = loopLeague(data, 23);
    expect(loop.settings.auto.roster).toBe(true);
    const season = new LoopSeason(loop, data.climate);
    expect(season.done).toBe(false);
    season.playWeek();
    season.playWeek();
    expect(loop.date).toMatchObject({ phase: 'regularSeason', week: 3 });
    const facts = season.facts();
    const played = Object.values(loop.season.results);
    expect(facts.games).toHaveLength(played.length);
    expect(facts.teams.reduce((n, t) => n + t.wins + t.losses + t.ties, 0)).toBe(2 * played.length);
    const points = played.reduce((n, g) => n + g.homeScore + g.awayScore, 0);
    expect(facts.games.reduce((n, g) => n + g.homeScore + g.awayScore, 0)).toBe(points);
    expect(facts.teams.reduce((n, t) => n + t.pointsFor, 0)).toBe(points);
    const passYds = facts.teams.reduce((n, t) => n + t.totals.passYds, 0);
    expect(facts.players.reduce((n, p) => n + p.line.passYds, 0)).toBe(passYds);
  });

  it('marks fourth-quarter and overtime comebacks by the winner', () => {
    const play = (quarter: number, home: number, away: number) => ({ quarter, home, away });
    const game = (scoring: ReturnType<typeof play>[], home: number, away: number) => ({
      score: { home, away },
      scoring: scoring.map(s => ({ ...s, clock: 0, team: 'MIN' as const, kind: 'touchdown' as const, points: 7, description: '' }))
    }); // prettier-ignore
    expect(trailedLate(game([play(1, 7, 0), play(4, 7, 3), play(4, 7, 10)], 7, 10))).toBe(true);
    // Trailing only before the fourth quarter doesn't count.
    expect(trailedLate(game([play(2, 0, 7), play(3, 14, 7)], 14, 7))).toBe(false);
    // Trailing entering the fourth counts once the winner scores in it.
    expect(trailedLate(game([play(3, 0, 3), play(4, 7, 3)], 7, 3))).toBe(true);
    expect(trailedLate(game([play(4, 3, 0), play(5, 3, 3)], 3, 3))).toBe(false);
  });
});

const weather: GameWeather = { indoor: false, tempF: 60, windMph: 5, precipitation: 'none', altitudeFt: 0 };
const fact = (home: TeamAbbr, away: TeamAbbr, homeScore: number, awayScore: number): GameFact => ({
  week: 1, home, away, homeScore, awayScore, overtime: false, neutral: false, comeback: false, weather,
  passAtt: 60, passCmp: 40, fgAtt: 3, fgMade: 3
}); // prettier-ignore

describe('calibration metrics (spec 23.3)', () => {
  it('fits team ratings and the home edge from margins', () => {
    const truth: Partial<Record<TeamAbbr, number>> = { MIN: 6, GB: 0, CHI: -2, DET: -4 };
    const teams = Object.keys(truth) as TeamAbbr[];
    const games: GameFact[] = [];
    for (const home of teams)
      for (const away of teams)
        if (home !== away) {
          const margin = (truth[home] ?? 0) - (truth[away] ?? 0) + 2;
          games.push(fact(home, away, 20 + Math.max(0, margin), 20 + Math.max(0, -margin)));
        }
    const { ratings, home } = fitRatings(games);
    expect(home).toBeCloseTo(2, 5);
    for (const t of teams) expect(ratings.get(t)).toBeCloseTo(truth[t] ?? 0, 5);
  });

  it('computes game, season, and stat metrics from facts', () => {
    const team = (abbr: TeamAbbr, wins: number): TeamFact => ({
      team: abbr, wins, losses: 2 - wins, ties: 0, pointsFor: 40, pointsAgainst: 40,
      totals: { ...emptyTotals(), passAtt: 60, passCmp: 39, passYds: 420, thirdDownAtt: 20, thirdDownConv: 8 },
      lines: { kickoffs: 8, kickoffTouchbacks: 2, kickReturns: 6, kickReturnYds: 150, puntReturns: 4,
        puntReturnYds: 40, puntYds: 0, puntNetYds: 0, fgAtt40: 0, fgMade40: 0, fgAtt50: 0, fgMade50: 0,
        targets: 50, receptions: 39 },
      injuries: { all: 4, missed: 2, gamesLost: 5, seasonEnding: 0, absences: 5 }
    }); // prettier-ignore
    const facts: ReplayFacts = {
      games: [fact('MIN', 'GB', 24, 21), fact('GB', 'MIN', 30, 10)],
      teams: [team('MIN', 1), team('GB', 1)],
      players: []
    };
    const m = computeMetrics([{ league: 0, replay: 0, facts }]);
    expect(m.get('games.homeWinRate')?.value).toBe(1);
    expect(m.get('games.homeMargin')?.value).toBe(11.5);
    expect(m.get('games.oneScoreShare')?.value).toBe(0.5);
    expect(m.get('games.blowoutShare')?.value).toBe(0.5);
    expect(m.get('stats.cmpPct')?.value).toBeCloseTo(0.65, 10);
    expect(m.get('stats.thirdDownPct')?.value).toBeCloseTo(0.4, 10);
    expect(m.get('stats.kickoffReturnRate')?.value).toBeCloseTo(0.75, 10);
    expect(m.get('injuries.gamesLost')?.value).toBe(5);
    // Nothing measures the fit experiment without experiment replays.
    expect(m.get('effects.fit')?.value).toBeNull();
    expect(m.get('effects.cohesion')?.value).toBeNull();
  });
});

describe('calibration targets and reports (spec 23.2)', { timeout: 30_000 }, () => {
  it('has a sourced band for known metrics only, with nested bands', () => {
    expect(checkTargets(targets)).toEqual([]);
    expect(
      checkTargets({
        version: 1,
        targets: { 'games.nope': { pass: [0, 1], warn: [0, 1], source: 'x', note: 'y' } }
      })
    ).toEqual(['games.nope: no such metric']);
    // Spec 23.2: every target has a band, a source, and a note.
    expect(
      checkTargets({
        version: 1,
        targets: { 'games.tieRate': { pass: [0, 1], warn: [0, 1], source: 'x', note: ' ' } }
      })
    ).toEqual(['games.tieRate: no note']);
    const ids = new Set(METRICS.map(m => m.id));
    expect(Object.keys(targets.targets).every(id => ids.has(id))).toBe(true);
  });

  it('marks each metric pass, warn, fail, info, or pending, and checks only the CI subset in CI', () => {
    const file: TargetsFile = {
      version: 1,
      targets: {
        'games.homeWinRate': {
          pass: [0.52, 0.58],
          warn: [0.5, 0.6],
          ci: [0.45, 0.65],
          source: 's',
          note: 'n'
        },
        'games.pointsPerTeam': { pass: [21, 23], warn: [20, 24], source: 's', note: 'n' },
        'stats.ypa': { pass: [6.8, 7.3], warn: [6.6, 7.5], source: 's', note: 'n' }
      }
    };
    const values = new Map([
      ['games.homeWinRate', { value: 0.59, n: 1 }],
      ['games.pointsPerTeam', { value: 25, n: 1 }],
      ['stats.ypa', { value: 7, n: 1 }],
      ['stats.cmpPct', { value: 0.64, n: 1 }]
    ]);
    const none = new Map<string, { value: number; n: number }>();
    const full = new Map(evaluate({ replays: values, loop: none }, file, 'full').map(r => [r.id, r.status]));
    expect(full.get('games.homeWinRate')).toBe('warn');
    expect(full.get('games.pointsPerTeam')).toBe('fail');
    expect(full.get('stats.ypa')).toBe('pass');
    expect(full.get('stats.cmpPct')).toBe('info');
    expect(full.get('games.overtimeRate')).toBe('pending');
    const ci = evaluate({ replays: values, loop: none }, file, 'ci');
    expect(ci.map(r => [r.id, r.status])).toEqual([['games.homeWinRate', 'pass']]);
  });

  it('judges season records on the weekly loop and everything else on the replays', () => {
    const file: TargetsFile = {
      version: 1,
      targets: {
        'seasons.winSd': { pass: [2.8, 3.5], warn: [2.5, 3.8], source: 's', note: 'n' },
        'games.homeWinRate': { pass: [0.52, 0.58], warn: [0.5, 0.6], source: 's', note: 'n' }
      }
    };
    const replays = new Map([
      ['seasons.winSd', { value: 3.1, n: 3200 }],
      ['games.homeWinRate', { value: 0.55, n: 27200 }]
    ]);
    const loop = new Map([
      ['seasons.winSd', { value: 2.66, n: 640 }],
      ['games.homeWinRate', { value: 0.7, n: 5440 }]
    ]);
    const results = new Map(evaluate({ replays, loop }, file, 'full').map(r => [r.id, r]));
    const winSd = results.get('seasons.winSd');
    expect(winSd).toMatchObject({ status: 'warn', value: 2.66, n: 640, decidedBy: 'loop' });
    expect(winSd?.replays.value).toBe(3.1);
    const home = results.get('games.homeWinRate');
    expect(home).toMatchObject({ status: 'pass', value: 0.55, decidedBy: 'replays' });
    expect(home?.loop.value).toBe(0.7);
    // Without weekly-loop seasons, season records go unmeasured.
    const alone = evaluate({ replays, loop: new Map() }, file, 'full');
    expect(alone.find(r => r.id === 'seasons.winSd')?.status).toBe('pending');
  });

  it('plans replays across leagues and writes a readable report', () => {
    const plan = { seed: 1, seasons: 25, perLeague: 10, experiments: defaultExperiments(25), loopSeasons: 4 };
    const jobs = planJobs(plan);
    // Weekly-loop seasons, the longest jobs, come first, each in a league of its own.
    expect(jobs.slice(0, 4).map(j => [j.kind, j.league, sharedLeague(j)])).toEqual([
      ['loop', 0, null],
      ['loop', 1, null],
      ['loop', 2, null],
      ['loop', 3, null]
    ]);
    const replays = jobs.filter(j => j.kind !== 'loop');
    expect(replays.filter(j => j.kind === 'replay')).toHaveLength(25);
    expect(replays.filter(j => j.kind === 'experiment')).toHaveLength(3);
    expect(new Set(replays.map(j => `${j.league}-${j.replay}`)).size).toBe(replays.length);
    expect(Math.max(...replays.map(j => j.league))).toBe(2);

    const facts = replaySeason(short, data.climate, stream(7, 'replay'));
    const samples: RunSample[] = [{ league: 0, replay: 0, facts }];
    const report = finishRun(
      { ...plan, seasons: 1, experiments: 0, loopSeasons: 0 },
      samples,
      targets,
      'full',
      '2026-09-25',
      3
    );
    expect(
      report.counts.pass +
        report.counts.warn +
        report.counts.fail +
        report.counts.info +
        report.counts.pending
    ).toBe(report.results.length);
    const markdown = reportMarkdown(report);
    expect(markdown).toContain('# Calibration report');
    expect(markdown).toContain(
      '- Replays: 1 season (1 generated league, up to 10 replays each) and 0 fit experiment seasons, with rosters as generated.'
    );
    expect(markdown).toContain('- Weekly loop: 0 seasons through the weekly advance');
    expect(markdown).toContain('| Metric | Replays | Weekly loop | Target | Status | Sample |');
    expect(markdown).toContain('## Targets and sources');
    expect(summaryLines(report)[0]).toMatch(
      /^Calibration \(full, 1 replay season and 0 weekly-loop seasons, seed 1\): \d+ pass/
    );
    expect(summaryLines(report)).toContain('Decided by the weekly loop (replays, weekly loop, status):');
    expect(formatValue(0.6512, 'pct')).toBe('65.1%');
    expect(formatValue(-0.031, 'pctPoints')).toBe('−3.1 pts');
    expect(formatValue(5316.4, 'int')).toBe('5,316');
    expect(formatValue(1.84, 'signed1')).toBe('+1.8');
    expect(formatValue(null, 'dec1')).toBe('—');
  });
});
