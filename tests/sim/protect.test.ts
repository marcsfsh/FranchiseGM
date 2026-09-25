import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/engine/tuning';
import type { GameResult, GameSetup } from '../../src/engine/sim/types';
import { kickoffStart, runFrom, situationLeague } from '../helpers/situations';

const sum = (games: readonly GameResult[], f: (g: GameResult) => number) =>
  games.reduce((n, g) => n + f(g), 0);

/** Both head coaches at one conservatism level. */
const conservatism =
  (value: number) =>
  (setup: GameSetup): GameSetup => ({
    ...setup,
    home: { ...setup.home, coach: { ...setup.home.coach, conservatism: value } },
    away: { ...setup.away, coach: { ...setup.away.coach, conservatism: value } }
  });

/** Runs with one play-calling constant changed, restoring it afterward. */
function withTuning<T>(
  key: 'preventLate' | 'sticksShift' | 'returnBreakaway' | 'chaseShift',
  value: number,
  run: () => T
): T {
  const calls = TUNING.sim.calls as unknown as Record<string, number>;
  const was = calls[key] as number;
  calls[key] = value;
  try {
    return run();
  } finally {
    calls[key] = was;
  }
}

describe('protecting a lead (spec 8.6 conservatism when leading)', () => {
  // The home team leads by three scores at the start of the second half, and the visitors have the ball.
  const bigLead = {
    quarter: 3,
    clock: 900,
    score: { home: 28, away: 7 },
    offense: 'away' as const,
    ball: 25,
    down: 1,
    distance: 10
  };

  it('runs more and plays soft coverage the more conservative the coach', () => {
    const bold = runFrom(bigLead, 40, { adjust: conservatism(0), seed: 'protect' });
    const careful = runFrom(bigLead, 40, { adjust: conservatism(100), seed: 'protect' });
    const passShare = (games: GameResult[]) =>
      sum(games, g => g.box.home.totals.passAtt) /
      sum(games, g => g.box.home.totals.passAtt + g.box.home.totals.rushAtt);
    expect(passShare(careful)).toBeLessThan(passShare(bold) - 0.05);
    // Against soft coverage the trailing team completes more of its passes.
    const completion = (games: GameResult[]) =>
      sum(games, g => g.box.away.totals.passCmp) / sum(games, g => g.box.away.totals.passAtt);
    expect(completion(careful)).toBeGreaterThan(completion(bold));
    // And the lead shrinks more often.
    const margin = (games: GameResult[]) => sum(games, g => g.score.home - g.score.away) / games.length;
    expect(margin(careful)).toBeLessThan(margin(bold));
  });

  it('plays prevent late in a one-score game', () => {
    const late = { quarter: 4, clock: 240, score: { home: 20, away: 14 }, offense: 'away' as const, ball: 25, down: 1, distance: 10 }; // prettier-ignore
    const noPrevent = withTuning('preventLate', 0, () => runFrom(late, 60, { seed: 'prevent' }));
    const prevent = runFrom(late, 60, { seed: 'prevent' });
    const completion = (games: GameResult[]) =>
      sum(games, g => g.box.away.totals.passCmp) / sum(games, g => g.box.away.totals.passAtt);
    expect(completion(prevent)).toBeGreaterThan(completion(noPrevent));
  });
});

describe('chasing a deficit (game script)', () => {
  it('throws more once behind by more than a field goal', () => {
    // The home team trails by two scores at the start of the second half and has the ball.
    const behind = { quarter: 3, clock: 900, score: { home: 7, away: 21 }, offense: 'home' as const, ball: 25, down: 1, distance: 10 }; // prettier-ignore
    const passShare = (games: GameResult[]) =>
      sum(games, g => g.box.home.totals.passAtt) /
      sum(games, g => g.box.home.totals.passAtt + g.box.home.totals.rushAtt);
    const chasing = runFrom(behind, 40, { seed: 'chase' });
    const steady = withTuning('chaseShift', 0, () => runFrom(behind, 40, { seed: 'chase' }));
    // How much more depends on how often the team already throws; this one gains about 2 points.
    expect(passShare(chasing)).toBeGreaterThan(passShare(steady) + 0.015);
  });
});

const lines = (g: GameResult) => [...Object.values(g.box.home.players), ...Object.values(g.box.away.players)];
const attempts = (games: readonly GameResult[]) =>
  sum(games, g => g.box.home.totals.passAtt + g.box.away.totals.passAtt);
const airPerAttempt = (games: readonly GameResult[]) =>
  sum(games, g => lines(g).reduce((n, l) => n + l.passAirYds, 0)) / attempts(games);

describe('passing game details (spec 8.3 step 5)', () => {
  it('throws past the line to gain more often on third and long', () => {
    const toSticks = withTuning('sticksShift', 1, () => runFrom(kickoffStart, 12, { seed: 'sticks' }));
    const noSticks = withTuning('sticksShift', 0, () => runFrom(kickoffStart, 12, { seed: 'sticks' }));
    expect(airPerAttempt(toSticks)).toBeGreaterThan(airPerAttempt(noSticks));
  });

  it('checks the ball down to the backs', () => {
    const games = runFrom(kickoffStart, 12, { seed: 'checkdowns' });
    const backs = new Set(
      Object.values(situationLeague.players)
        .filter(p => p.position === 'HB' || p.position === 'FB')
        .map(p => p.id)
    );
    let toBacks = 0;
    let all = 0;
    for (const g of games)
      for (const side of ['home', 'away'] as const)
        for (const [id, line] of Object.entries(g.box[side].players)) {
          all += line.targets;
          if (backs.has(id)) toBacks += line.targets;
        }
    expect(toBacks / all).toBeGreaterThan(0.1);
  });

  it('now and then returns a turnover a long way', () => {
    const returns = withTuning('returnBreakaway', 1, () => runFrom(kickoffStart, 12, { seed: 'returns' }));
    const tds = sum(returns, g => g.box.home.totals.defIntTd + g.box.away.totals.defIntTd);
    const ints = sum(returns, g => g.box.home.totals.passInt + g.box.away.totals.passInt);
    // With every return breaking free, a good share of interceptions go the distance.
    expect(tds / ints).toBeGreaterThan(0.2);
  });
});
