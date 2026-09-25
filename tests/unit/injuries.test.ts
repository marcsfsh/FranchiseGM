import { describe, expect, it } from 'vitest';
import { generateFictionalLeague } from '../../src/engine/generate/league';
import type { League } from '../../src/engine/league/types';
import { stream } from '../../src/engine/rng';
import { DEFAULT_RULES } from '../../src/engine/rules/ruleset';
import {
  applyInjuries,
  cannotPlay,
  designation,
  healWeek,
  hurtEffects,
  type PlayerInjury
} from '../../src/engine/season/injuries';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';

const generated = generateFictionalLeague({ seed: 9, season: 2026, names: nameData(), rules: DEFAULT_RULES });
const leagueOf = (): League =>
  ({
    players: Object.fromEntries(generated.players.map(p => [p.id, structuredClone(p)]))
  }) as unknown as League;
const hurt = (change: Partial<PlayerInjury>): PlayerInjury => ({
  bodyPart: 'knee',
  severity: 'medium',
  weeksOut: 0,
  lingering: 0,
  fragile: 0,
  season: 2026,
  week: 1,
  career: false,
  ...change
});

describe('injuries between games (spec 10.8)', () => {
  it('designates out, doubtful, questionable, and probable as he heals', () => {
    expect(designation(hurt({ weeksOut: 3 }))).toBe('out');
    expect(designation(hurt({ weeksOut: 1 }))).toBe('doubtful');
    expect(designation(hurt({ lingering: 2 }))).toBe('questionable');
    expect(designation(hurt({ lingering: 1 }))).toBe('probable');
    expect(designation(hurt({ fragile: 3 }))).toBeNull();
    expect(designation(null)).toBeNull();
    expect(cannotPlay('doubtful')).toBe(true);
    expect(cannotPlay('questionable')).toBe(false);
  });

  it('costs rating points to play hurt and raises the risk while he is fragile', () => {
    expect(hurtEffects(hurt({ lingering: 2, fragile: 3 }))).toEqual({
      penalty: TUNING.injuries.hurtPenalty.questionable,
      risk: TUNING.injuries.fragileRisk * TUNING.injuries.questionableRisk
    });
    expect(hurtEffects(hurt({ fragile: 1 })).risk).toBe(TUNING.injuries.fragileRisk);
    expect(hurtEffects(null)).toEqual({ penalty: 0, risk: 1 });
  });

  it('heals a week at a time, then the lingering and fragile weeks, then clears', () => {
    const league = leagueOf();
    const player = Object.values(league.players)[0];
    if (!player) throw new Error('no player');
    player.injury = hurt({ weeksOut: 2, lingering: 1, fragile: 2 });
    const seen: (string | null)[] = [];
    for (let week = 0; week < 5; week++) {
      seen.push(designation(player.injury));
      healWeek(league);
    }
    expect(seen).toEqual(['out', 'doubtful', 'probable', null, null]);
    expect(player.injury).toBeNull();
  });

  it('keeps the longer injury and sometimes changes a career for good', () => {
    const league = leagueOf();
    const players = Object.values(league.players)
      .filter(p => p.position === 'HB')
      .slice(0, 60);
    const before = new Map(players.map(p => [p.id, { spd: p.ratings.spd, ovr: p.ovr }]));
    applyInjuries(
      league,
      players.map(p => ({ playerId: p.id, team: 'MIN', quarter: 2, severity: 'season', weeks: 12, bodyPart: 'knee (ACL)' })), // prettier-ignore
      2026,
      3,
      stream(5, 'career')
    );
    const altered = players.filter(p => p.injury?.career);
    expect(altered.length).toBeGreaterThan(0);
    expect(altered.length).toBeLessThan(players.length);
    for (const p of altered) {
      expect(p.ratings.spd).toBeLessThan(before.get(p.id)?.spd ?? 0);
      expect(p.ovr).toBeLessThanOrEqual(before.get(p.id)?.ovr ?? 0);
    }
    // A short injury on top of a season-ending one doesn't shorten it.
    const [first] = players;
    if (!first) throw new Error('no player');
    applyInjuries(league, [{ playerId: first.id, team: 'MIN', quarter: 1, severity: 'short', weeks: 1, bodyPart: 'ankle' }], 2026, 4, stream(6, 'x')); // prettier-ignore
    expect(first.injury?.weeksOut).toBe(12);
  });
});
