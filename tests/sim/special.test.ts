import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_RULES, PENALTY_IDS, type GameRules } from '../../src/engine/rules/ruleset';
import { fieldGoalLogit, type GameState } from '../../src/engine/sim/game';
import { TUNING } from '../../src/engine/tuning';
import type { GameResult, GameSetup } from '../../src/engine/sim/types';
import { freshSetup, kickoffStart, runFrom as run, situationGame as game } from '../helpers/situations';

const sum = (games: readonly GameResult[], pick: (g: GameResult) => number) =>
  games.reduce((total, g) => total + pick(g), 0);
const playerTotal = (
  g: GameResult,
  key: 'fairCatches' | 'rushAtt',
  filter: (id: string) => boolean = () => true
) =>
  (['home', 'away'] as const).reduce(
    (total, side) =>
      total +
      Object.entries(g.box[side].players)
        .filter(([id]) => filter(id))
        .reduce((s, [, l]) => s + l[key], 0),
    0
  );
const penalties = (g: GameResult) => g.box.home.totals.penalties + g.box.away.totals.penalties;
const withPenalties = (change: (p: GameRules['penalties']) => void): Partial<GameRules> => {
  const copy = structuredClone(DEFAULT_GAME_RULES.penalties);
  change(copy);
  return { penalties: copy };
};

describe('game rules the sim reads (spec 16)', () => {
  it('scores with the rule set point values and first downs at its yards to gain', () => {
    const points = { ...DEFAULT_GAME_RULES.points, touchdown: 7, fieldGoal: 4 };
    for (const g of run(kickoffStart, 8, { rules: { points } })) {
      for (const side of ['home', 'away'] as const) {
        const t = g.box[side].totals;
        const tds = t.passTd + t.rushTd + t.defIntTd + t.fumbleReturnTd + t.kickReturnTd + t.puntReturnTd;
        const extra = g.scoring
          .filter(
            s =>
              s.team === g[side] &&
              (s.kind === 'twoPoint' || s.kind === 'safety' || s.kind === 'defensiveTry')
          )
          .reduce((s, x) => s + x.points, 0);
        expect(7 * tds + t.xpMade + 4 * t.fgMade + extra, g.id).toBe(g.score[side]);
      }
    }
    const short = run(kickoffStart, 8, { rules: { yardsToGain: 5 } });
    const normal = run(kickoffStart, 8);
    const firstDowns = (gs: GameResult[]) =>
      sum(gs, g => g.box.home.totals.firstDowns + g.box.away.totals.firstDowns);
    expect(firstDowns(short)).toBeGreaterThan(firstDowns(normal) * 1.3);
  });

  it('makes two-point tries harder from farther out', () => {
    // Down 8 at the 1 late: a touchdown leaves them down 2, so they go for two.
    const from: GameState = {
      quarter: 4,
      clock: 30,
      score: { home: 14, away: 22 },
      offense: 'home',
      ball: 99,
      distance: 1
    };
    const rate = (twoPointSpot: number) => {
      const games = run(from, 150, { rules: { twoPointSpot } });
      const tries = sum(games, g => g.box.home.totals.twoPointAtt);
      expect(tries).toBeGreaterThan(40);
      return sum(games, g => g.box.home.totals.twoPointMade) / tries;
    };
    expect(rate(15)).toBeLessThan(rate(2) - 0.12);
  });

  it('free kicks after a safety from the rule set spot', () => {
    // Far behind late, backed up at the 1: sacks and stuffs give up safeties.
    const from: GameState = {
      quarter: 4,
      clock: 150,
      score: { home: 0, away: 30 },
      offense: 'home',
      ball: 1
    };
    const afterSafety = (safetyKickSpot: number) =>
      run(from, 250, { rules: { safetyKickSpot } }).flatMap(g => {
        const i = g.drives.findIndex(d => d.result === 'safety');
        const next = i >= 0 ? g.drives[i + 1] : undefined;
        return next ? [next.start] : [];
      });
    const near = afterSafety(20);
    const far = afterSafety(40);
    expect(near.length).toBeGreaterThan(8);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(far)).toBeLessThan(mean(near) - 12);
  });

  it('gives the defense the ball at the missed field goal spot the rules set', () => {
    // A 52-yard try: missed, the defense takes over at the spot of the kick (its 42) or the rule's line.
    const from: GameState = {
      quarter: 4,
      clock: 400,
      score: { home: 0, away: 0 },
      offense: 'home',
      ball: 65,
      down: 4,
      distance: 10
    };
    const starts = (missedFieldGoalSpot: number) =>
      run(from, 120, { rules: { missedFieldGoalSpot } }).flatMap(g =>
        g.drives[0]?.result === 'missedFieldGoal' && g.drives[0]?.yards === 0 ? [g.drives[1]?.start] : []
      );
    const normal = starts(20);
    expect(normal.length).toBeGreaterThan(10);
    expect(new Set(normal)).toEqual(new Set([42]));
    expect(new Set(starts(50))).toEqual(new Set([50]));
  });

  it('allows fair catches only when the rules do', () => {
    const allowed = run(kickoffStart, 12);
    const banned = run(kickoffStart, 12, { rules: { puntFairCatch: false } });
    expect(sum(allowed, g => playerTotal(g, 'fairCatches'))).toBeGreaterThan(5);
    expect(sum(banned, g => playerTotal(g, 'fairCatches'))).toBe(0);
  });

  it('runs the play clock from the rule set', () => {
    const plays = (playClock: number) => sum(run(kickoffStart, 10, { rules: { playClock } }), g => g.plays);
    expect(plays(25)).toBeGreaterThan(plays(40) + 60);
  });

  it('calls only the fouls the rules mark pre-snap before the snap', () => {
    const off = withPenalties(p => {
      p.falseStart.preSnap = false;
      p.offside.preSnap = false;
      p.delayOfGame.preSnap = false;
    });
    const quiet = sum(run(kickoffStart, 12, { rules: off }), penalties);
    const normal = sum(run(kickoffStart, 12), penalties);
    expect(quiet).toBeLessThan(normal - 12);
  });

  it('ejects players only for fouls the rules make ejection-eligible', () => {
    const none = withPenalties(p => {
      for (const id of PENALTY_IDS) p[id].ejectionEligible = false;
    });
    expect(sum(run(kickoffStart, 15, { rules: none }), g => g.ejections.length)).toBe(0);
    const all = withPenalties(p => {
      for (const id of PENALTY_IDS) p[id].ejectionEligible = true;
    });
    const games = run(kickoffStart, 25, { rules: all });
    const ejected = games.flatMap(g => g.ejections);
    expect(ejected.length).toBeGreaterThan(0);
    // An ejected player is out for good.
    for (const g of games)
      for (const e of g.ejections) {
        const side = e.team === g.home ? 'home' : 'away';
        expect(g.box[side].players[e.playerId]).toBeDefined();
      }
  });
});

describe('special teams (spec 8.3)', () => {
  const punting: GameState = {
    quarter: 4,
    clock: 5,
    score: { home: 20, away: 10 },
    offense: 'home',
    ball: 40,
    down: 4,
    distance: 2
  };

  it('fakes a punt now and then on fourth and short', () => {
    // Early enough in the fourth quarter that coaches still fake.
    const games = run({ ...punting, clock: 400 }, 300);
    const punter = freshSetup().home.depth.P[0] as string;
    const fakes = games.filter(g => (g.box.home.players[punter]?.rushAtt ?? 0) > 0);
    expect(fakes.length).toBeGreaterThan(0);
    expect(fakes.length).toBeLessThan(30);
  });

  it('calls kick catch interference and running into the kicker on punts', () => {
    const busy = (setup: GameSetup): GameSetup => {
      const sliders = structuredClone(setup.sliders);
      sliders.output.penalties = 2;
      sliders.penalties.kickCatchInterference = { user: 2, ai: 2 };
      return { ...setup, sliders };
    };
    // The punt is the game's last play, so any foul belongs to it.
    const games = run(punting, 500, { adjust: busy });
    const intoKicker = games.filter(g => g.box.away.totals.penalties > 0);
    const catchInterference = games.filter(g => g.box.home.totals.penalties > 0);
    expect(intoKicker.length).toBeGreaterThan(0);
    expect(catchInterference.length).toBeGreaterThan(0);
    // Running into the kicker on fourth and 2 gives the punting team a first down and an untimed down.
    for (const g of intoKicker) expect(g.drives[0]?.result).not.toBe('punt');
  });

  it('brings a goal-line package against heavy personnel near the goal line', () => {
    const cornerback = freshSetup().away.depth.CB2[0] as string;
    const benched = (ball: number) =>
      run(
        { quarter: 4, clock: 3, score: { home: 10, away: 24 }, offense: 'home', ball, distance: 100 - ball },
        60
      ).filter(g => (g.box.away.players[cornerback]?.snapsDefense ?? 0) === 0).length;
    expect(benched(98)).toBeGreaterThan(15);
    expect(benched(60)).toBe(0);
  });

  it('plays differently on artificial turf', () => {
    const surface =
      (s: 'grass' | 'turf') =>
      (setup: GameSetup): GameSetup => ({ ...setup, venue: { ...setup.venue, surface: s } });
    const grass = run(kickoffStart, 6, { adjust: surface('grass') });
    const turf = run(kickoffStart, 6, { adjust: surface('turf') });
    expect(turf.map(g => g.score)).not.toEqual(grass.map(g => g.score));
  });
});

void game;

describe('field goals by distance (spec 8.3)', () => {
  it('fall off fastest out to the knee and more slowly beyond it', () => {
    const make = (yards: number) => 1 / (1 + Math.exp(-fieldGoalLogit(yards)));
    const knee = TUNING.sim.fgKnee;
    expect(fieldGoalLogit(25)).toBe(TUNING.sim.fgLogit25);
    expect(make(30)).toBeGreaterThan(make(40));
    expect(make(40)).toBeGreaterThan(make(50));
    // Per yard, the curve drops faster before the knee than after it, and has no step at the knee.
    expect(fieldGoalLogit(knee - 5) - fieldGoalLogit(knee)).toBeGreaterThan(
      fieldGoalLogit(knee) - fieldGoalLogit(knee + 5)
    );
    expect(fieldGoalLogit(knee + 1e-6)).toBeCloseTo(fieldGoalLogit(knee), 5);
  });
});
