import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_RULES } from '../../src/engine/rules/ruleset';
import type { GameState } from '../../src/engine/sim/game';
import type { GameSetup } from '../../src/engine/sim/types';
import { runFrom as run, situationGame as game } from '../helpers/situations';

const overtimeStart: GameState = { quarter: 5, clock: 600, score: { home: 17, away: 17 }, offense: null };
const regular = run(overtimeStart, 160);

describe('overtime (spec 16 rules)', () => {
  it('gives both teams the ball before a winner, unless the defense scores', () => {
    const decided = regular.filter(g => g.winner);
    expect(decided.length).toBeGreaterThan(100);
    for (const g of decided) {
      const teams = new Set(g.drives.map(d => d.team));
      const last = g.scoring.at(-1);
      const lastDrive = g.drives.at(-1);
      const defensive =
        last?.kind === 'safety' ||
        (lastDrive !== undefined && lastDrive.team !== g.winner && lastDrive.result !== 'touchdown');
      expect(teams.size === 2 || defensive, JSON.stringify(g.scoring)).toBe(true);
    }
  });

  it('pads both line scores to five entries and ends regular-season games tied when time runs out', () => {
    for (const g of regular) {
      expect(g.quarters.home).toHaveLength(5);
      expect(g.quarters.away).toHaveLength(5);
      expect(g.overtime).toBe(true);
    }
    const ties = regular.filter(g => !g.winner);
    for (const g of ties) expect(g.score.home).toBe(g.score.away);
  });

  it('keeps playing after a first-possession field goal is answered with one', () => {
    const from: GameState = {
      quarter: 5,
      clock: 420,
      score: { home: 20, away: 17 },
      offense: 'away',
      ball: 88,
      down: 4,
      distance: 8,
      overtimePossessions: { home: 1, away: 0 }
    };
    const answered = run(from, 40).filter(g => g.scoring[0]?.kind === 'fieldGoal');
    expect(answered.length).toBeGreaterThan(25);
    for (const g of answered) {
      expect(g.drives.length, JSON.stringify(g.drives)).toBeGreaterThan(1);
      expect(g.scoring.length > 1 || g.winner === null).toBe(true);
    }
  });

  it('gives a touchdown that only ties or trails its try', () => {
    const from: GameState = {
      quarter: 5,
      clock: 420,
      score: { home: 24, away: 17 },
      offense: 'away',
      ball: 99,
      down: 1,
      distance: 1,
      overtimePossessions: { home: 1, away: 0 }
    };
    const scored = run(from, 40).filter(g => g.scoring[0]?.kind === 'touchdown');
    expect(scored.length).toBeGreaterThan(15);
    for (const g of scored) {
      const tries = g.box.away.totals.xpAtt + g.box.away.totals.twoPointAtt;
      expect(tries, JSON.stringify(g.scoring)).toBeGreaterThanOrEqual(1);
    }
  });

  it('never ends a playoff game tied, and lets rule sets turn off regular-season ties', () => {
    for (const g of run(overtimeStart, 40, { playoff: true })) expect(g.winner).not.toBeNull();
    const overtime = { ...DEFAULT_GAME_RULES.overtime, regularSeasonTies: false };
    for (const g of run(overtimeStart, 40, { rules: { overtime } })) expect(g.winner).not.toBeNull();
  });

  it('ends at once on an opening touchdown under the old both-teams-possess rule', () => {
    const overtime = { ...DEFAULT_GAME_RULES.overtime, bothTeamsPossess: false };
    const games = run(overtimeStart, 80, { rules: { overtime } });
    const opening = games.filter(
      g => g.scoring[0]?.kind === 'touchdown' && g.drives[0]?.result === 'touchdown'
    );
    expect(opening.length).toBeGreaterThan(5);
    for (const g of opening) expect(g.scoring).toHaveLength(1);
    // An opening field goal doesn't: the other team gets the ball.
    const kicked = games.filter(
      g => g.scoring[0]?.kind === 'fieldGoal' && g.drives[0]?.result === 'fieldGoal'
    );
    expect(kicked.length).toBeGreaterThan(5);
    for (const g of kicked) expect(g.drives[1]?.team).not.toBe(g.drives[0]?.team);
  });

  it('carries the drive through the first playoff overtime period and kicks off after the second', () => {
    const tied = { home: 20, away: 20 };
    const first = run({ quarter: 5, clock: 4, score: tied, offense: 'home', ball: 30 }, 30, {
      playoff: true
    });
    for (const g of first) {
      expect(g.drives[0]?.result).not.toBe('endOfHalf');
      expect(g.winner).not.toBeNull();
    }
    const second = run(
      {
        quarter: 6,
        clock: 4,
        score: tied,
        offense: 'home',
        ball: 30,
        overtimePossessions: { home: 1, away: 1 }
      },
      30,
      { playoff: true }
    ).filter(g => g.drives[0]?.result === 'endOfHalf');
    expect(second.length).toBeGreaterThan(20);
    for (const g of second) {
      expect(g.drives[1]?.quarter).toBe(7);
      expect(g.drives[1]?.clock).toBeGreaterThan(880);
    }
  });
});

describe('clock management (spec 8.3 step 8, 8.6)', () => {
  it('kneels out the clock with the lead when the defense cannot stop it', () => {
    const from: GameState = {
      quarter: 4,
      clock: 110,
      score: { home: 20, away: 17 },
      offense: 'home',
      ball: 30,
      timeouts: { home: 3, away: 0 },
      running: true
    };
    for (const g of run(from, 20)) {
      expect(g.scoring).toEqual([]);
      expect(g.winner).toBe(g.home);
      expect(g.drives).toHaveLength(1);
      expect(g.drives[0]?.result).toBe('endOfGame');
    }
  });

  it("doesn't kneel when timeouts or the two-minute warning would give the ball back", () => {
    const lead = { home: 20, away: 17 };
    const onlyKneels = (g: (typeof regular)[number]) => {
      const t = g.box.home.totals;
      return t.passAtt === 0 && t.rushYds === -t.rushAtt;
    };
    // 1:30 left, one defensive timeout: four kneels leave about 4 seconds for the defense.
    const timeout = run(
      {
        quarter: 4,
        clock: 90,
        score: lead,
        offense: 'home',
        ball: 30,
        timeouts: { home: 3, away: 1 },
        running: true
      },
      20
    );
    expect(timeout.filter(onlyKneels).length).toBeLessThan(3);
    // 2:05 left, no timeouts, but the two-minute warning will stop the clock.
    const warning = run(
      {
        quarter: 4,
        clock: 125,
        score: lead,
        offense: 'home',
        ball: 30,
        timeouts: { home: 3, away: 0 },
        running: true
      },
      20
    );
    expect(warning.filter(onlyKneels).length).toBeLessThan(3);
  });

  it("plays an untimed down after a defensive foul on the half's last play", () => {
    const fouls = (setup: GameSetup): GameSetup => {
      const sliders = structuredClone(setup.sliders);
      sliders.output.penalties = 2;
      for (const key of [
        'defensiveHolding',
        'defensivePassInterference',
        'facemask',
        'roughingThePasser'
      ] as const)
        sliders.penalties[key] = { user: 2, ai: 2 };
      return { ...setup, sliders };
    };
    const games = run({ quarter: 2, clock: 3, score: { home: 7, away: 7 }, offense: 'home', ball: 50 }, 200, {
      adjust: fouls
    });
    const extended = games.filter(g => (g.drives[0]?.plays ?? 0) >= 2 && g.drives[0]?.quarter === 2);
    expect(extended.length).toBeGreaterThan(3);
    // Only a defensive foul extends the half.
    for (const g of extended) expect(g.box.away.totals.penalties).toBeGreaterThan(0);
  });

  it('kicks off once when a tying touchdown ends regulation', () => {
    // Down 7 at the 1 with 2 seconds left: a touchdown and the extra point send it to overtime.
    const games = run(
      { quarter: 4, clock: 2, score: { home: 10, away: 17 }, offense: 'home', ball: 99, distance: 1 },
      200
    ).filter(g => g.overtime);
    expect(games.length).toBeGreaterThan(40);
    // Overtime starts with the coin toss's kickoff, not a second kickoff by the team that scored.
    const firstOvertimeDrive = games.map(g => g.drives.find(d => d.quarter === 5)?.team);
    expect(firstOvertimeDrive.filter(t => t === game.home).length).toBeGreaterThan(10);
    expect(firstOvertimeDrive.filter(t => t === game.away).length).toBeGreaterThan(10);
  });

  it('spikes or kicks to get the field goal off before the half ends', () => {
    const from: GameState = {
      quarter: 2,
      clock: 20,
      score: { home: 7, away: 3 },
      offense: 'home',
      ball: 75,
      down: 2,
      distance: 6,
      timeouts: { home: 0, away: 2 },
      running: true
    };
    const kicked = run(from, 40).filter(g => g.box.home.totals.fgAtt > 0);
    expect(kicked.length).toBeGreaterThanOrEqual(39);
  });

  it('plays for the tying or winning field goal at the end of the game', () => {
    const from: GameState = {
      quarter: 4,
      clock: 40,
      score: { home: 17, away: 19 },
      offense: 'home',
      ball: 70,
      down: 1,
      distance: 10,
      timeouts: { home: 0, away: 1 },
      running: true
    };
    const results = run(from, 60);
    const tried = results.filter(
      g => g.box.home.totals.fgAtt > 0 || g.box.home.totals.passTd + g.box.home.totals.rushTd > 0
    );
    expect(tried.length / results.length).toBeGreaterThan(0.85);
  });

  it('puts onside kicks at the kicking team 47, whoever recovers', () => {
    // The home team trails late, so when it kicks it tries an onside kick.
    const from: GameState = { quarter: 4, clock: 100, score: { home: 10, away: 17 }, offense: null };
    const first = run(from, 120).flatMap(g => g.drives.slice(0, 1));
    const home = first.filter(d => d.team === game.home).map(d => d.start);
    const away = first.filter(d => d.team === game.away).map(d => d.start);
    expect(home).toContain(47);
    expect(away).toContain(53);
    expect(home).not.toContain(53);
  });
});
