/**
 * The game sim's entry point for a league (spec 8.9): each game draws from its own sub-stream of the
 * league's current advance seed, so fixed mode replays it exactly and weighted mode varies it.
 */
import type { ClimateTable } from '../../data/climate';
import type { League } from '../league/types';
import { leagueStream } from '../rng';
import { simulateGame } from './game';
import { gameSetup } from './setup';
import type { GameResult } from './types';

export function simLeagueGame(league: League, gameId: string, climate: ClimateTable | null): GameResult {
  const game = league.schedule.find(g => g.id === gameId);
  if (!game) throw new Error(`No game ${gameId} on the schedule`);
  const rng = leagueStream(league.random, 'game', game.id);
  const setup = gameSetup(league, game, climate, rng.fork('setup'));
  return simulateGame(setup, rng.fork('plays'));
}

export { simulateGame, gameSetup };
export type { GameResult };
