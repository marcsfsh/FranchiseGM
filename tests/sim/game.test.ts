import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import { venueById } from '../../src/data/stadiums';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import type { League } from '../../src/engine/league/types';
import { advanceLeagueRandom, stream } from '../../src/engine/rng';
import { changeRules } from '../../src/engine/rules/ruleset';
import { simLeagueGame } from '../../src/engine/sim';
import { SUMMED, type PlayerLine } from '../../src/engine/sim/stats';
import type { GameResult } from '../../src/engine/sim/types';
import { drawWeather } from '../../src/engine/sim/weather';
import { nameData } from '../helpers/base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const league = (seed = 12, fixed = true): League =>
  createLeague({
    id: `sim-${seed}`,
    name: 'Sim',
    start: defaultStartOptions('MIN', seed),
    gameVersion: 'test',
    names: nameData(),
    schedule,
    fixed
  });
const base = league();
const sim = (l: League, n: number, from = 0): GameResult[] =>
  l.schedule.slice(from, from + n).map(g => simLeagueGame(l, g.id, climate));
const games = sim(base, 40);

const total = (lines: Record<string, PlayerLine>, key: keyof PlayerLine) =>
  Object.values(lines).reduce((sum, l) => sum + l[key], 0);

describe('game results are internally consistent (spec 8.8)', () => {
  it('adds up scores from scoring plays and quarters', () => {
    for (const g of games) {
      for (const side of ['home', 'away'] as const) {
        const abbr = g[side];
        const fromPlays = g.scoring.filter(s => s.team === abbr).reduce((sum, s) => sum + s.points, 0);
        expect(fromPlays, g.id).toBe(g.score[side]);
        expect(
          g.quarters[side].reduce((a, b) => a + b, 0),
          g.id
        ).toBe(g.score[side]);
        expect(g.box[side].totals.points).toBe(g.score[side]);
      }
      const last = g.scoring.at(-1);
      if (last) expect({ home: last.home, away: last.away }).toEqual(g.score);
      expect(g.winner).toBe(
        g.score.home === g.score.away ? null : g.score.home > g.score.away ? g.home : g.away
      );
    }
  });

  it('makes team totals the sum of player lines', () => {
    for (const g of games) {
      for (const side of ['home', 'away'] as const) {
        const { totals, players } = g.box[side];
        for (const key of SUMMED) expect(totals[key], `${g.id} ${side} ${key}`).toBe(total(players, key));
        expect(totals.rushYds).toBe(total(players, 'rushYds'));
        expect(totals.netPassYds).toBe(total(players, 'passYds') - total(players, 'sackYds'));
        expect(totals.plays).toBe(totals.passAtt + totals.sacked + totals.rushAtt);
        expect(totals.passCmp).toBeLessThanOrEqual(totals.passAtt);
        expect(total(players, 'receptions')).toBe(totals.passCmp);
        expect(total(players, 'recYds')).toBe(totals.passYds);
      }
    }
  });

  it('records the spec 9.2 stats so each side of a matchup agrees', () => {
    for (const g of games) {
      for (const [off, def] of [
        ['home', 'away'],
        ['away', 'home']
      ] as const) {
        const o = g.box[off].players;
        const d = g.box[def].players;
        const t = g.box[off].totals;
        // Every sack and pressure has a blocker who allowed it and a rusher who got there.
        expect(total(o, 'sacksAllowed')).toBe(total(d, 'sacks'));
        expect(total(o, 'pressuresAllowed')).toBe(total(d, 'pressures'));
        expect(total(o, 'pressured')).toBe(total(d, 'pressures'));
        expect(total(d, 'qbHits')).toBeGreaterThanOrEqual(total(d, 'sacks'));
        // Coverage allowed matches what the offense caught against it.
        expect(total(d, 'targetsAllowed')).toBeLessThanOrEqual(total(o, 'targets'));
        expect(total(d, 'completionsAllowed')).toBeLessThanOrEqual(t.passCmp);
        expect(total(d, 'yardsAllowed')).toBeLessThanOrEqual(t.passYds + total(o, 'sackYds'));
        // First downs by player add up to the team's passing and rushing first downs.
        expect(total(o, 'passFirstDowns')).toBe(t.firstDownsPass);
        expect(total(o, 'recFirstDowns')).toBe(t.firstDownsPass);
        expect(total(o, 'rushFirstDowns')).toBe(t.firstDownsRush);
        expect(total(o, 'passAirYds')).toBeGreaterThan(0);
        expect(total(o, 'pass20')).toBe(total(o, 'rec20'));
        expect(total(o, 'passDrops')).toBe(total(o, 'drops'));
        expect(total(o, 'rushYac')).toBeLessThanOrEqual(total(o, 'rushYds') + 3 * t.rushAtt);
        expect(total(o, 'runBlockWins')).toBeLessThanOrEqual(total(o, 'runBlockSnaps'));
        // Solo and assisted tackles are the tackles; assists come in pairs across the game.
        expect(total(d, 'soloTackles') + total(d, 'assistedTackles')).toBe(total(d, 'tackles'));
        // Eleven started on offense and eleven on defense.
        expect(total(o, 'started')).toBe(22);
        expect(total(o, 'kickoffs')).toBeGreaterThan(0);
        expect(total(o, 'snapsSpecial')).toBeGreaterThan(50);
      }
      const penaltyRows = g.penalties.length;
      expect(penaltyRows).toBe(g.box.home.totals.penalties + g.box.away.totals.penalties);
    }
  });

  it('scores points only the ways football allows', () => {
    for (const g of games) {
      for (const side of ['home', 'away'] as const) {
        const t = g.box[side].totals;
        const lines = g.box[side].players;
        const tds = t.passTd + t.rushTd + t.defIntTd + t.fumbleReturnTd + t.kickReturnTd + t.puntReturnTd;
        const defensiveTries = g.scoring.filter(s => s.team === g[side] && s.kind === 'defensiveTry').length;
        const points =
          6 * tds +
          t.xpMade +
          2 * total(lines, 'twoPointMade') +
          3 * t.fgMade +
          2 * t.safeties +
          2 * defensiveTries;
        expect(points, `${g.id} ${side}`).toBe(g.score[side]);
      }
    }
  });

  it('plays a full game: drives, a finished clock, and a recap', () => {
    for (const g of games) {
      expect(g.plays).toBeGreaterThan(90);
      expect(g.drives.length).toBeGreaterThan(12);
      expect(g.recap.length).toBeGreaterThanOrEqual(1);
      expect(g.recap.length).toBeLessThanOrEqual(4);
      expect(g.recap.join(' ')).not.toMatch(/undefined|NaN|\d\.\d{3}/);
      for (const d of g.drives) {
        expect(d.seconds).toBeGreaterThanOrEqual(0);
        expect(d.start).toBeGreaterThanOrEqual(1);
        expect(d.start).toBeLessThanOrEqual(99);
      }
      // Every second of the game clock belongs to one team's possession.
      const rules = base.rules.game;
      const regulation = 4 * rules.quarterSeconds;
      const top = g.box.home.totals.timeOfPossession + g.box.away.totals.timeOfPossession;
      if (g.overtime) {
        expect(top).toBeGreaterThan(regulation);
        expect(top).toBeLessThanOrEqual(regulation + rules.overtime.regularSeasonSeconds);
      } else expect(top).toBe(regulation);
    }
  });
});

describe('repeatability (spec 8.9)', () => {
  it('replays a game exactly in fixed mode, even after an advance with different entropy', () => {
    const id = base.schedule[5]?.id as string;
    const a = simLeagueGame(base, id, climate);
    expect(simLeagueGame(base, id, climate)).toStrictEqual(a);
    const moved = (entropy: number) => ({
      ...base,
      random: advanceLeagueRandom(base.random, { actions: 1, entropy })
    });
    expect(simLeagueGame(moved(1), id, climate)).toStrictEqual(simLeagueGame(moved(2), id, climate));
  });

  it('gives similar but not identical results in weighted mode', () => {
    const weighted = league(12, false);
    const moved = (entropy: number) => ({
      ...weighted,
      random: advanceLeagueRandom(weighted.random, { actions: 1, entropy })
    });
    const a = sim(moved(1), 30);
    const b = sim(moved(2), 30);
    expect(a.map(g => g.score)).not.toEqual(b.map(g => g.score));
    const mean = (rs: GameResult[]) =>
      rs.reduce((sum, g) => sum + g.score.home + g.score.away, 0) / rs.length;
    expect(Math.abs(mean(a) - mean(b))).toBeLessThan(8);
  });
});

describe('rules drive the sim (spec 16)', () => {
  it('uses the rule set penalty yardage', () => {
    const penalties = Object.fromEntries(
      Object.entries(base.rules.game.penalties).map(([id, p]) => [id, { ...p, yards: p.spotFoul ? 0 : 15 }])
    ) as typeof base.rules.game.penalties;
    const harsh: League = { ...base, rules: changeRules(base.rules, 'game', { penalties }) };
    const normal = games.slice(0, 30);
    const changed = sim(harsh, 30);
    const perPenalty = (rs: GameResult[]) => {
      let yards = 0;
      let count = 0;
      for (const g of rs)
        for (const side of ['home', 'away'] as const) {
          yards += g.box[side].totals.penaltyYds;
          count += g.box[side].totals.penalties;
        }
      return yards / count;
    };
    expect(perPenalty(changed)).toBeGreaterThan(perPenalty(normal) + 3);
  });

  it('starts drives from the rule set touchback spot', () => {
    const kickoff = { ...base.rules.game.kickoff, touchback: 25 };
    const moved: League = { ...base, rules: changeRules(base.rules, 'game', { kickoff }) };
    const starts = (rs: GameResult[]) => rs.flatMap(g => g.drives.map(d => d.start));
    expect(starts(games).filter(s => s === 35).length).toBeGreaterThan(20);
    const changed = starts(sim(moved, 20));
    expect(changed.filter(s => s === 25).length).toBeGreaterThan(changed.filter(s => s === 35).length);
  });
});

describe('game conditions (spec 17)', () => {
  it('plays domes at room conditions and draws open-air weather from the climate', () => {
    const dome = venueById('MIN');
    expect(drawWeather(stream(1, 'w'), dome, climate.MSP?.[11] ?? null)).toMatchObject({
      indoor: true,
      windMph: 0
    });
    const lambeau = venueById('GB');
    const station = climate[lambeau.climate];
    const december = Array.from({ length: 200 }, (_, i) =>
      drawWeather(stream(i, 'w'), lambeau, station?.[11] ?? null)
    );
    expect(december.every(w => !w.indoor)).toBe(true);
    const mean = december.reduce((sum, w) => sum + w.tempF, 0) / december.length;
    expect(mean).toBeLessThan(40);
    expect(december.some(w => w.precipitation === 'snow')).toBe(true);
  });
});

describe('league-level output (spec 23 targets, checked loosely until M6)', () => {
  it('plays near NFL averages over many games', () => {
    const rs = [...games, ...sim(base, 80, 40)];
    let pts = 0;
    let att = 0;
    let cmp = 0;
    let rushAtt = 0;
    let rushYds = 0;
    let sacks = 0;
    for (const g of rs)
      for (const side of ['home', 'away'] as const) {
        const t = g.box[side].totals;
        pts += t.points;
        att += t.passAtt;
        cmp += t.passCmp;
        rushAtt += t.rushAtt;
        rushYds += t.rushYds;
        sacks += t.sacked;
      }
    const teams = rs.length * 2;
    expect(pts / teams).toBeGreaterThan(18);
    expect(pts / teams).toBeLessThan(28);
    expect(cmp / att).toBeGreaterThan(0.58);
    expect(cmp / att).toBeLessThan(0.71);
    expect(rushYds / rushAtt).toBeGreaterThan(3.7);
    expect(rushYds / rushAtt).toBeLessThan(5);
    expect(sacks / (att + sacks)).toBeGreaterThan(0.04);
    expect(sacks / (att + sacks)).toBeLessThan(0.1);
  });
});

describe('speed (M4 done-when)', () => {
  it('sims a game in well under 100 ms', () => {
    const ids = base.schedule.slice(100, 120).map(g => g.id);
    const started = performance.now();
    for (const id of ids) simLeagueGame(base, id, climate);
    const perGame = (performance.now() - started) / ids.length;
    expect(perGame).toBeLessThan(100);
  });
});
