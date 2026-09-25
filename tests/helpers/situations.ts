import { readFileSync } from 'node:fs';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import { stream } from '../../src/engine/rng';
import { DEFAULT_GAME_RULES, type GameRules } from '../../src/engine/rules/ruleset';
import { simulateFrom, type GameState } from '../../src/engine/sim/game';
import { gameSetup } from '../../src/engine/sim/setup';
import type { GameResult, GameSetup } from '../../src/engine/sim/types';
import { nameData } from './base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
export const situationLeague = createLeague({
  id: 'situations',
  name: 'Situations',
  start: defaultStartOptions('MIN', 31),
  gameVersion: 'test',
  names: nameData(),
  schedule,
  fixed: true
});
export const situationGame = situationLeague.schedule[3] as (typeof situationLeague.schedule)[number];

export interface RunOptions {
  playoff?: boolean;
  rules?: Partial<GameRules>;
  /** Changes the setup before each game (sliders, venue). */
  adjust?: (setup: GameSetup) => GameSetup;
  seed?: string;
}

let base: GameSetup | null = null;

/** A fresh setup for the test game (the sim wears players down as it goes, so each run needs its own). */
export function freshSetup(options: RunOptions = {}): GameSetup {
  base ??= gameSetup(situationLeague, situationGame, climate, stream(5, 'setup'));
  const setup = structuredClone(base);
  const rules = { ...DEFAULT_GAME_RULES, ...options.rules };
  const ready = { ...setup, rules, playoff: options.playoff ?? false };
  return options.adjust ? options.adjust(ready) : ready;
}

/** Runs a situation many times with different streams. */
export function runFrom(from: GameState, n: number, options: RunOptions = {}): GameResult[] {
  return Array.from({ length: n }, (_, i) =>
    simulateFrom(freshSetup(options), stream(i, options.seed ?? 'endgame'), from)
  );
}

/** A whole game from the opening kickoff. */
export const kickoffStart: GameState = { quarter: 1, clock: 900, score: { home: 0, away: 0 }, offense: null };
