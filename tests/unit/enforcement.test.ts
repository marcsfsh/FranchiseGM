import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { makeLegal } from '../../src/engine/ai/decisions/compliance';
import { capSheet } from '../../src/engine/cap/sheet';
import { askingSalary } from '../../src/engine/contracts/acceptance';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import {
  fillFixes,
  gameDayFixes,
  releaseFixes,
  restructureFixes,
  saved,
  type Fix
} from '../../src/engine/roster/fixes';
import { gameDayProblem, leagueHealth, legalityProblems } from '../../src/engine/roster/legality';
import { makeMove, previewMove, type Move } from '../../src/engine/roster/moves';
import { inOffseason } from '../../src/engine/roster/rules';
import { advanceWeek, gameWeek } from '../../src/engine/season/advance';
import { advanceOffseason } from '../../src/engine/season/offseason';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// Enforcing the cap and the roster rules for the user's team as for every AI team (D-22).
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });
const fresh = (date: GameDate): League => {
  const league = structuredClone(situationLeague);
  league.date = date;
  return league;
};
const teamOf = (league: League, abbr: TeamAbbr, status: Player['status'] = 'active') =>
  Object.values(league.players)
    .filter(p => p.team === abbr && p.status === status)
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));

/** Pushes a team $5M over the cap this league year with one player's salary. */
function overTheCap(league: League, abbr: TeamAbbr): Player {
  const year = capSheet(league, abbr).year;
  const player = teamOf(league, abbr).find(p => league.contracts[p.contractId ?? '']?.years.some(y => y.year === year && !y.isVoid)); // prettier-ignore
  const deal = player ? league.contracts[player.contractId ?? '']?.years.find(y => y.year === year && !y.isVoid) : undefined; // prettier-ignore
  if (!player || !deal) throw new Error('no deal this league year');
  deal.base += capSheet(league, abbr).space + 5_000_000;
  return player;
}

/** A one-year deal at his asking price for the free agent who asks least: a minimum-salary signing. */
function minimumSigning(league: League, abbr: TeamAbbr): Move {
  const [player] = Object.values(league.players)
    .filter(p => p.status === 'freeAgent' && !p.team)
    .map(p => ({ p, ask: askingSalary(league, p, abbr) }))
    .sort((a, b) => a.ask - b.ask || a.p.ovr - b.p.ovr || (a.p.id < b.p.id ? -1 : 1));
  if (!player) throw new Error('no free agent');
  return { kind: 'sign', team: abbr, playerId: player.p.id, offer: { years: 1, salary: player.ask, signingBonus: 0 } }; // prettier-ignore
}

describe('the cap for the user (D-22)', () => {
  it('refuses a signing while over the cap at the league year opening, even one outside the top 51', () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const user = league.meta.start.userTeam;
    advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(league.date).toEqual(at(2026, 'freeAgency', 1));
    // An offseason roster: more than 51 deals of $2M or more, so a minimum salary sits outside the 51 that count.
    while (capSheet(league, user).lines.filter(l => l.status).length < 60) {
      const fill = minimumSigning(league, user) as Extract<Move, { kind: 'sign' }>;
      expect(makeMove(league, { ...fill, offer: { ...fill.offer, salary: 2_000_000 } }, stream(1)).ok).toBe(
        true
      );
    }
    overTheCap(league, user);
    expect(capSheet(league, user).space).toBe(-5_000_000);
    const signing = minimumSigning(league, user);
    const preview = previewMove(league, signing);
    expect(preview.ok ? 'allowed' : preview.reason).toBe(
      "You're $5,000,000 over the 2027 cap. Get under it with a release or a restructure before you add to it."
    );
  });
});

/** Puts a team `by` dollars over the cap this league year through its carryover. */
function overBy(league: League, abbr: TeamAbbr, by: number): void {
  league.teams[abbr].carryover -= capSheet(league, abbr).space + by;
}

const OVER =
  /^You're \$[\d,]+ over the \d{4} cap\. Get under it with a release or a restructure before you add to it\.$/;

describe('moves while over the cap (D-46)', () => {
  it('allows only the moves that free space or leave the cap alone', () => {
    const league = fresh(at(2026, 'regularSeason', 5));
    const user = league.meta.start.userTeam;
    // Room on the roster: a hurt player goes to injured reserve, a move that leaves the cap alone.
    const hurt = teamOf(league, user).at(-1) as Player;
    hurt.injury = { bodyPart: 'knee', severity: 'medium', weeksOut: 6, lingering: 2, fragile: 2, season: 2026, week: 4, career: false }; // prettier-ignore
    overBy(league, user, 1_000_000);
    expect(makeMove(league, { kind: 'injuredReserve', team: user, playerId: hurt.id }, stream(1)).ok).toBe(
      true
    );
    const reason = (move: Move) => {
      const p = previewMove(league, move);
      return p.ok ? 'allowed' : p.reason;
    };
    expect(reason(minimumSigning(league, user))).toMatch(OVER);
    const squad = teamOf(league, user, 'practice')[0] as Player;
    expect(reason({ kind: 'promote', team: user, playerId: squad.id })).toMatch(OVER);
    expect(reason({ kind: 'elevate', team: user, playerId: squad.id })).toMatch(OVER);
    // A restructure or a release that frees space is fine while over, and so is one that gets under.
    const restructure = restructureFixes(league, user)[0];
    const release = releaseFixes(league, user)[0];
    expect(restructure && saved(restructure)).toBeGreaterThan(0);
    expect(release && saved(release)).toBeGreaterThan(0);
    expect(makeMove(league, (restructure as Fix).move, stream(2)).ok).toBe(true);
    expect(capSheet(league, user).space).toBeGreaterThan(-1_000_000);
  });

  it("rejects the user's illegal moves in every phase", () => {
    const phases: [Phase, number][] = [['awards', 1], ['freeAgency', 2], ['draft', 1], ['cutdown', 1], ['regularSeason', 9], ['wildCard', 1]]; // prettier-ignore
    for (const [phase, week] of phases) {
      const league = fresh(at(2026, phase, week));
      const user = league.meta.start.userTeam;
      // In season the roster is full: a release opens a spot, so the cap is what stops the signing.
      if (!inOffseason(league.date)) {
        const last = teamOf(league, user).at(-1) as Player;
        expect(
          makeMove(league, { kind: 'release', team: user, playerId: last.id }, stream(6)).ok,
          phase
        ).toBe(true);
      }
      overBy(league, user, 500_000);
      const signing = minimumSigning(league, user);
      const refused = previewMove(league, signing);
      expect(refused.ok ? 'allowed' : refused.reason, phase).toMatch(OVER);
      // Out of season the practice squad isn't open; in season the cap stops a practice squad signing too.
      const young = (signing as Extract<Move, { kind: 'sign' }>).playerId;
      const squad = previewMove(league, { kind: 'signPracticeSquad', team: user, playerId: young });
      expect(squad.ok, phase).toBe(false);
      // And the league doesn't move on until the user's team is legal.
      const before = { ...league.date };
      const blocked = gameWeek(league) !== null ? advanceWeek(league, null, { actions: 0, entropy: 1 }).blocked : advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 }).blocked; // prettier-ignore
      expect(blocked, phase).toMatch(/over the 20\d\d salary cap/);
      expect(league.date, phase).toEqual(before);
    }
  });
});

describe('the advance gate (D-46)', () => {
  it('stops the week for a user short of 53 or unable to dress, until the fixes are made', () => {
    const league = fresh(at(2026, 'regularSeason', 1));
    const user = league.meta.start.userTeam;
    // A kicker who can't play this week, and the roster one short.
    const kicker = teamOf(league, user).find(p => p.position === 'K') as Player;
    kicker.injury = { bodyPart: 'hamstring', severity: 'short', weeksOut: 2, lingering: 1, fragile: 2, season: 2026, week: 1, career: false }; // prettier-ignore
    const cut = teamOf(league, user).find(p => p.position === 'WR') as Player;
    expect(makeMove(league, { kind: 'release', team: user, playerId: cut.id }, stream(3)).ok).toBe(true);
    const problems = legalityProblems(league, user);
    expect(problems.map(p => p.kind)).toEqual(['minimum', 'gameDay']);
    expect(problems[1]?.text).toMatch(
      /^You can't dress a legal game-day roster this week: no healthy kicker\./
    );
    const blocked = advanceWeek(league, null, { actions: 0, entropy: 1 });
    expect(blocked.blocked).toMatch(/teams must carry 53/);
    expect(blocked.games).toHaveLength(0);
    // The fixes the hub offers, made one at a time, clear the way.
    for (let n = 0; n < 6 && legalityProblems(league, user).length; n++) {
      const fix = [...gameDayFixes(league, user, 1), ...fillFixes(league, user, 1)][0];
      expect(fix).toBeDefined();
      expect(makeMove(league, (fix as Fix).move, stream(4, n)).ok).toBe(true);
    }
    expect(legalityProblems(league, user)).toEqual([]);
    expect(advanceWeek(league, null, { actions: 0, entropy: 1 }).blocked).toBeNull();
  });

  it('stops the offseason at the league year opening until the user gets under the cap', () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const user = league.meta.start.userTeam;
    advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    overBy(league, user, 3_000_000);
    const step = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(step.blocked).toMatch(/Teams must be under the cap when the league year opens/);
    expect(league.date).toEqual(at(2026, 'freeAgency', 1));
    for (let n = 0; n < 10 && capSheet(league, user).space < 0; n++) {
      const fix = restructureFixes(league, user)[0] ?? releaseFixes(league, user)[0];
      expect(makeMove(league, (fix as Fix).move, stream(5, n)).ok).toBe(true);
    }
    expect(advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 3 }).blocked).toBeNull();
    expect(league.date).toEqual(at(2026, 'freeAgency', 2));
  });

  it('lets the staff fix it on auto, and lets it be with rule enforcement off, flagged in league health', () => {
    const auto = fresh(at(2026, 'regularSeason', 1));
    const user = auto.meta.start.userTeam;
    overBy(auto, user, 2_000_000);
    auto.settings.auto.roster = true;
    expect(advanceWeek(auto, null, { actions: 0, entropy: 1 }).blocked).toBeNull();
    expect(capSheet(auto, user).space).toBeGreaterThanOrEqual(0);

    const off = fresh(at(2026, 'regularSeason', 1));
    overBy(off, user, 2_000_000);
    off.settings.commissioner.enforceRules = false;
    const signing = minimumSigning(off, user);
    expect(previewMove(off, signing, { enforce: false }).ok).toBe(true);
    expect(previewMove(off, signing).ok).toBe(false);
    expect(leagueHealth(off)).toEqual([{ team: user, problems: [expect.objectContaining({ kind: 'cap' })] }]);
    const week = advanceWeek(off, null, { actions: 0, entropy: 1 });
    expect(week.blocked).toBeNull();
    expect(week.illegal.map(t => t.team)).toEqual([user]);
  });
});

describe('the staff keeps its team legal (D-46)', () => {
  const hurt = (p: Player, weeksOut: number) => {
    p.injury = { bodyPart: 'knee', severity: 'short', weeksOut, lingering: 1, fragile: 2, season: 2026, week: 1, career: false }; // prettier-ignore
  };

  it('releases the player the cutdown would let go next to sign a punter onto a full roster', () => {
    const league = fresh(at(2026, 'regularSeason', 1));
    const team: TeamAbbr = 'GB';
    for (const p of Object.values(league.players)) if (p.team === team) p.injury = null;
    for (const p of teamOf(league, team).filter(q => q.position === 'P'))
      expect(makeMove(league, { kind: 'release', team, playerId: p.id }, stream(1)).ok).toBe(true);
    const [squad] = teamOf(league, team, 'practice').filter(p => p.position !== 'P');
    expect(makeMove(league, { kind: 'promote', team, playerId: (squad as Player).id }, stream(2)).ok).toBe(
      true
    );
    for (const p of teamOf(league, team, 'practice').filter(q => q.position === 'P'))
      expect(makeMove(league, { kind: 'release', team, playerId: p.id }, stream(3)).ok).toBe(true);
    expect(teamOf(league, team)).toHaveLength(league.rules.roster.active);
    expect(gameDayProblem(league, team)?.fact).toBe("Can't dress a game-day roster: no healthy punter");
    makeLegal(league, team, stream(4));
    expect(gameDayProblem(league, team)).toBeNull();
    expect(teamOf(league, team)).toHaveLength(league.rules.roster.active);
    expect(teamOf(league, team).filter(p => p.position === 'P')).toHaveLength(1);
    expect(league.season.transactions.some(t => t.team === team && t.kind === 'released' && t.reason === 'to open a roster spot')).toBe(true); // prettier-ignore
  });

  it('fills back to the minimum after moving injured players to reserve to dress for the game', () => {
    const league = fresh(at(2026, 'regularSeason', 1));
    const team: TeamAbbr = 'GB';
    for (const p of Object.values(league.players)) if (p.team === team) p.injury = null;
    for (const p of teamOf(league, team, 'practice').filter(q => q.position === 'QB'))
      expect(makeMove(league, { kind: 'release', team, playerId: p.id }, stream(1)).ok).toBe(true);
    // Every quarterback hurt, two others out longer, and no room under the cap for a signing until the
    // staff restructures: dressing moves all of them to reserve before a quarterback joins.
    for (const p of teamOf(league, team).filter(q => q.position === 'QB')) hurt(p, 3);
    const others = teamOf(league, team)
      .filter(q => q.position === 'WR')
      .slice(0, 2);
    for (const p of others) hurt(p, 8);
    overBy(league, team, -100_000);
    makeLegal(league, team, stream(2));
    expect(gameDayProblem(league, team)).toBeNull();
    expect(others.every(p => p.status === 'ir')).toBe(true);
    expect(teamOf(league, team)).toHaveLength(league.rules.roster.active);
    expect(capSheet(league, team).space).toBeGreaterThanOrEqual(0);
  });
});
