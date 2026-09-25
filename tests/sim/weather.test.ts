import { describe, expect, it } from 'vitest';
import type { GameResult, GameSetup, GameWeather } from '../../src/engine/sim/types';
import { kickoffStart, runFrom } from '../helpers/situations';

/** Outdoor weather at 60°F, calm and dry unless changed. */
const weather =
  (change: Partial<GameWeather>) =>
  (setup: GameSetup): GameSetup => ({
    ...setup,
    weather: { ...setup.weather, indoor: false, tempF: 60, windMph: 0, precipitation: 'none', ...change }
  });

const completion = (games: readonly GameResult[]): number => {
  let cmp = 0;
  let att = 0;
  for (const g of games)
    for (const side of ['home', 'away'] as const) {
      cmp += g.box[side].totals.passCmp;
      att += g.box[side].totals.passAtt;
    }
  return cmp / att;
};

describe('weather and the passing game (spec 17.2)', { timeout: 30_000 }, () => {
  // The same streams in every condition, so the differences come from the weather.
  const run = (change: Partial<GameWeather>) =>
    completion(runFrom(kickoffStart, 30, { adjust: weather(change), seed: 'weather' }));

  it('completes fewer passes in the wind and more indoors', () => {
    const calm = run({});
    const windy = run({ windMph: 25 });
    expect(windy).toBeLessThan(calm - 0.03);
    expect(run({ windMph: 40 })).toBeLessThan(windy);
    expect(run({ indoor: true })).toBeGreaterThan(calm);
    expect(run({ precipitation: 'rain' })).toBeLessThan(calm);
  });
});
