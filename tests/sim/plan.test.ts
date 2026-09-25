import { describe, expect, it } from 'vitest';
import { NO_SUBS, type GamePlan, type Rotation } from '../../src/engine/sim/plan';
import { TUNING } from '../../src/engine/tuning';
import type { GameResult, GameSetup, TeamSetup } from '../../src/engine/sim/types';
import { kickoffStart, runFrom } from '../helpers/situations';

const sum = (games: readonly GameResult[], f: (g: GameResult) => number) =>
  games.reduce((n, g) => n + f(g), 0);

/** Changes the home team's plan or rotation (and optionally the visitors'). */
const withPlan =
  (home: Partial<GamePlan>, away: Partial<GamePlan> = {}, rotation: Partial<Rotation> = {}) =>
  (setup: GameSetup): GameSetup => ({
    ...setup,
    home: {
      ...setup.home,
      plan: { ...setup.home.plan, ...home },
      rotation: { ...setup.home.rotation, ...rotation }
    },
    away: { ...setup.away, plan: { ...setup.away.plan, ...away } }
  });

/** The starter at a slot on the depth chart. */
const starter = (team: TeamSetup, slot: keyof TeamSetup['depth']) => team.depth[slot]?.[0] as string;

describe('game plans in the sim (spec 8.7, 12.3)', { timeout: 60_000 }, () => {
  const N = 30;
  const home = (g: GameResult) => g.box.home;

  it('leans the run and pass balance', () => {
    const passShare = (games: GameResult[]) =>
      sum(games, g => home(g).totals.passAtt) /
      sum(games, g => home(g).totals.passAtt + home(g).totals.rushAtt);
    const run = runFrom(kickoffStart, N, { adjust: withPlan({ passLean: -0.15 }), seed: 'lean' });
    const pass = runFrom(kickoffStart, N, { adjust: withPlan({ passLean: 0.15 }), seed: 'lean' });
    expect(passShare(pass)).toBeGreaterThan(passShare(run) + 0.08);
  });

  it('blitzes more, and pressures more, on a blitz-heavy plan', () => {
    // A defense that likes to blitz, so the plan's multiplier moves its blitz rate from 0.3 to 0.9.
    const blitzing = (plan: Partial<GamePlan>) => (setup: GameSetup) => {
      const s = withPlan(plan)(setup);
      const defense = { ...s.home.tendencies.defense, blitz: 0.6 };
      return { ...s, home: { ...s.home, tendencies: { ...s.home.tendencies, defense } } };
    };
    const pressureRate = (games: GameResult[]) =>
      sum(games, g => Object.values(home(g).players).reduce((n, l) => n + l.pressures, 0)) /
      sum(games, g => g.box.away.totals.passAtt + g.box.away.totals.sacked);
    const calm = runFrom(kickoffStart, 60, { adjust: blitzing({ blitz: 0.5 }), seed: 'blitz' });
    const heavy = runFrom(kickoffStart, 60, { adjust: blitzing({ blitz: 1.5 }), seed: 'blitz' });
    expect(pressureRate(heavy)).toBeGreaterThan(pressureRate(calm) + 0.025);
  });

  it('features a player and doubles a receiver', () => {
    let featured = '';
    let doubled = '';
    const targets = (games: GameResult[], id: string, side: 'home' | 'away') =>
      sum(games, g => g.box[side].players[id]?.targets ?? 0);
    const base = runFrom(kickoffStart, 50, {
      adjust: s => {
        featured = starter(s.home, 'TE1');
        doubled = starter(s.away, 'X');
        return s;
      },
      seed: 'focus'
    });
    // A bigger boost than the tuned one, so the test shows the wiring rather than the noise.
    const calls = TUNING.sim.calls as unknown as Record<string, number>;
    const tuned = calls.featureTargets as number;
    calls.featureTargets = 0.5;
    let focused: GameResult[];
    try {
      focused = runFrom(kickoffStart, 50, {
        adjust: s => withPlan({ feature: starter(s.home, 'TE1'), doubleReceiver: starter(s.away, 'X') })(s),
        seed: 'focus'
      });
    } finally {
      calls.featureTargets = tuned;
    }
    expect(targets(focused, featured, 'home')).toBeGreaterThan(targets(base, featured, 'home') * 1.15);
    expect(targets(focused, doubled, 'away')).toBeLessThan(targets(base, doubled, 'away') * 0.92);
  });

  it('spreads the field or goes heavy by the personnel lean', () => {
    let tightEnd = '';
    const heavySnaps = (spread: number) =>
      sum(
        runFrom(kickoffStart, N, {
          adjust: s => {
            tightEnd = starter(s.home, 'TE2');
            return withPlan({ spread })(s);
          },
          seed: 'spread'
        }),
        g => home(g).players[tightEnd]?.snapsOffense ?? 0
      );
    expect(heavySnaps(-0.3)).toBeGreaterThan(heavySnaps(0.3) * 1.2);
  });

  it('spies a quarterback into fewer scrambles', () => {
    // Scrambles show up as quarterback runs on called passes; count every visitor quarterback carry.
    let qb = '';
    const qbRuns = (games: GameResult[]) => sum(games, g => g.box.away.players[qb]?.rushAtt ?? 0);
    const free = runFrom(kickoffStart, N, {
      adjust: s => {
        qb = starter(s.away, 'QB');
        return withPlan({}, {})(s);
      },
      seed: 'spy'
    });
    const spied = runFrom(kickoffStart, N, { adjust: withPlan({ spy: true }), seed: 'spy' });
    expect(qbRuns(spied)).toBeLessThan(qbRuns(free));
  });

  it('splits the backfield by the rotation', () => {
    let lead = '';
    const leadShare = (games: GameResult[]) =>
      sum(games, g => home(g).players[lead]?.rushAtt ?? 0) / sum(games, g => home(g).totals.rushAtt);
    const committee = runFrom(kickoffStart, N, {
      adjust: s => {
        lead = starter(s.home, 'RB1');
        return withPlan({}, {}, { rb1Share: 0.35 })(s);
      },
      seed: 'backs'
    });
    const bellCow = runFrom(kickoffStart, N, { adjust: withPlan({}, {}, { rb1Share: 0.9 }), seed: 'backs' });
    expect(leadShare(bellCow)).toBeGreaterThan(leadShare(committee) + 0.2);
  });
});

describe('rotation plans in the sim (spec 12.3)', { timeout: 60_000 }, () => {
  const N = 20;
  const snaps = (
    games: GameResult[],
    id: string,
    key: 'snapsOffense' | 'snapsDefense',
    side: 'home' | 'away'
  ) => sum(games, g => g.box[side].players[id]?.[key] ?? 0);
  const unit = (games: GameResult[], key: 'plays', side: 'home' | 'away') =>
    sum(games, g => g.box[side].totals[key]);
  const withRotation =
    (change: (s: GameSetup) => Partial<Rotation>) =>
    (setup: GameSetup): GameSetup => ({
      ...setup,
      home: { ...setup.home, rotation: { ...setup.home.rotation, ...change(setup) } }
    });

  it("brings in a third-down back and caps a starter's snaps", () => {
    let backup = '';
    let lead = '';
    const base = runFrom(kickoffStart, N, {
      adjust: s => {
        lead = starter(s.home, 'RB1');
        backup = s.home.depth.RB1?.find(id => id !== lead && id !== starter(s.home, 'RB2')) ?? '';
        return s;
      },
      seed: 'rotation'
    });
    const planned = runFrom(kickoffStart, N, {
      adjust: withRotation(s => ({
        subs: { ...NO_SUBS, thirdDownBack: backup },
        snapLimits: { [starter(s.home, 'LT')]: 0.5 }
      })),
      seed: 'rotation'
    });
    expect(backup).not.toBe('');
    expect(snaps(planned, backup, 'snapsOffense', 'home')).toBeGreaterThan(
      snaps(base, backup, 'snapsOffense', 'home') + 5 * N
    );
    let tackle = '';
    runFrom(kickoffStart, 1, { adjust: s => ((tackle = starter(s.home, 'LT')), s), seed: 'rotation' });
    const share = snaps(planned, tackle, 'snapsOffense', 'home') / unit(planned, 'plays', 'home');
    expect(share).toBeLessThan(0.6);
    expect(share).toBeGreaterThan(0.4);
  });

  it('brings in a goal-line back and a dime linebacker', () => {
    let back = '';
    let backer = '';
    const run = (named: boolean) =>
      runFrom(kickoffStart, N, {
        adjust: s => {
          const starting = new Set(Object.values(s.home.depth).map(order => order?.[0]));
          back = s.home.depth.RB1?.find(id => !starting.has(id)) ?? '';
          backer = s.home.depth.MIKE?.find(id => !starting.has(id)) ?? '';
          // A defense that plays a lot of dime, so the dime linebacker's snaps show.
          const defense = { ...s.home.tendencies.defense, packages: { base: 0.2, nickel: 0.4, dime: 0.4 } };
          const home = { ...s.home, tendencies: { ...s.home.tendencies, defense } };
          const subs = named ? { ...NO_SUBS, goalLineBack: back, dimeBacker: backer } : NO_SUBS;
          return withRotation(() => ({ subs }))({ ...s, home });
        },
        seed: 'short'
      });
    const none = run(false);
    const named = run(true);
    expect(back).not.toBe('');
    expect(backer).not.toBe('');
    expect(snaps(named, back, 'snapsOffense', 'home')).toBeGreaterThan(
      snaps(none, back, 'snapsOffense', 'home') + N
    );
    expect(snaps(named, backer, 'snapsDefense', 'home')).toBeGreaterThan(
      snaps(none, backer, 'snapsDefense', 'home') + 5 * N
    );
  });

  it('plans development snaps for a young backup', () => {
    let young = '';
    const devSnaps = (share: number) =>
      runFrom(kickoffStart, N, {
        adjust: s => {
          young = s.home.depth.CB1?.[1] ?? '';
          return withRotation(() => ({ devSnaps: share ? { [young]: share } : {} }))(s);
        },
        seed: 'develop'
      });
    const none = devSnaps(0);
    const some = devSnaps(0.3);
    expect(snaps(some, young, 'snapsDefense', 'home')).toBeGreaterThan(
      snaps(none, young, 'snapsDefense', 'home') + 5 * N
    );
  });
});
