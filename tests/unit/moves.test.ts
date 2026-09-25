import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { capSheet } from '../../src/engine/cap/sheet';
import { askingSalary, offerProblem } from '../../src/engine/contracts/acceptance';
import { releaseImpact } from '../../src/engine/contracts/cap';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import type { PlayerInjury } from '../../src/engine/season/injuries';
import { stream } from '../../src/engine/rng';
import { makeMove, previewMove, type Move } from '../../src/engine/roster/moves';
import { rosterCounts, rosterProblems } from '../../src/engine/roster/rules';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);
const rng = stream(3);
const players = (league: League, abbr: TeamAbbr | null, status: Player['status']) =>
  Object.values(league.players)
    .filter(p => p.team === abbr && p.status === status)
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
const reason = (league: League, move: Move) => {
  const p = previewMove(league, move);
  return p.ok ? null : p.reason;
};
const hurt = (weeksOut: number): PlayerInjury => ({
  bodyPart: 'knee', severity: 'medium', weeksOut, lingering: 2, fragile: 2, season: 2026, week: 1, career: false
}); // prettier-ignore

/** Frees a roster spot on MIN by moving a player to injured reserve. */
function makeRoom(league: League): void {
  const p = players(league, 'MIN', 'active').at(-1);
  if (!p) throw new Error('no player');
  p.injury = hurt(6);
  expect(makeMove(league, { kind: 'injuredReserve', team: 'MIN', playerId: p.id }, rng).ok).toBe(true);
}

describe('signing free agents (spec 19.4, simple acceptance)', () => {
  it('asks for less as the season goes on, never under the minimum', () => {
    const league = fresh();
    const best = players(league, null, 'freeAgent')[0];
    if (!best) throw new Error('no free agent');
    const early = askingSalary(league, best);
    league.date = { ...league.date, week: 18 };
    expect(askingSalary(league, best)).toBeLessThanOrEqual(early);
    expect(askingSalary(league, best)).toBeGreaterThanOrEqual(league.rules.pay.minimumSalary[0] ?? 0);
  });

  it('signs a free agent who takes the offer, and refuses what he or the rules will not allow', () => {
    const league = fresh();
    const player = players(league, null, 'freeAgent')[0];
    if (!player) throw new Error('no free agent');
    const ask = askingSalary(league, player);
    const offer = { years: 2, salary: ask, signingBonus: 0 };
    // Every team starts with a full active roster.
    expect(reason(league, { kind: 'sign', team: 'MIN', playerId: player.id, offer })).toMatch(/active roster is full/);
    makeRoom(league);
    const low = { ...offer, salary: ask - 50_000 };
    if (low.salary >= (league.rules.pay.minimumSalary[player.experience] ?? Infinity))
      expect(offerProblem(league, player, low)).toMatch(/^He wants at least \$[\d,]+ a year\.$/);
    const before = capSheet(league, 'MIN').space;
    const done = makeMove(league, { kind: 'sign', team: 'MIN', playerId: player.id, offer }, rng);
    if (!done.ok) throw new Error(done.reason);
    expect(player).toMatchObject({ team: 'MIN', status: 'active' });
    const contract = league.contracts[player.contractId ?? ''];
    expect(contract?.years.map(y => y.year)).toEqual([2026, 2027]);
    expect(capSheet(league, 'MIN').space).toBe(done.value.spaceAfter);
    expect(done.value.spaceBefore).toBe(before);
    expect(rosterProblems(league, 'MIN')).toEqual([]);
    // Over the cap: refused with the numbers.
    const other = players(league, null, 'freeAgent')[0];
    if (!other) throw new Error('no free agent');
    makeRoom(league);
    league.teams.MIN.carryover = -capSheet(league, 'MIN').cap;
    expect(
      reason(league, { kind: 'sign', team: 'MIN', playerId: other.id, offer: { years: 1, salary: askingSalary(league, other), signingBonus: 0 } })
    ).toMatch(/^His 2026 cap hit of \$[\d,]+ is more than your \$0 of cap space\.$/);
  }); // prettier-ignore

  it('fills the practice squad within its size and veteran limits', () => {
    const league = fresh();
    const squad = players(league, 'MIN', 'practice');
    const young = players(league, null, 'freeAgent').find(p => p.experience <= 2);
    if (!young) throw new Error('no young free agent');
    const open = league.rules.roster.practiceSquad - squad.length;
    if (open === 0) expect(reason(league, { kind: 'signPracticeSquad', team: 'MIN', playerId: young.id })).toMatch(/full/);
    else {
      expect(makeMove(league, { kind: 'signPracticeSquad', team: 'MIN', playerId: young.id }, rng).ok).toBe(true);
      expect(league.contracts[young.contractId ?? '']?.weeklyPay).toBe(league.rules.pay.practiceSquadWeekly);
    }
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    const another = players(league, null, 'freeAgent')[0];
    expect(reason(league, { kind: 'signPracticeSquad', team: 'MIN', playerId: another?.id ?? '' })).toBe(
      'Practice squads form after the final cutdown.'
    );
  }); // prettier-ignore
});

describe('releases (spec 11.2, 12.1)', () => {
  it('previews the dead money, sends a young player to waivers, and frees a vested veteran', () => {
    const league = fresh();
    const [young, vested] = players(league, 'MIN', 'active').filter(p => (league.contracts[p.contractId ?? '']?.signingBonus ?? 0) > 0);
    if (!young || !vested) throw new Error('no players');
    young.experience = 1;
    vested.experience = 7;
    const contract = league.contracts[young.contractId ?? ''];
    if (!contract) throw new Error('no contract');
    const impact = releaseImpact(contract, league.date, league.rules);
    const preview = previewMove(league, { kind: 'release', team: 'MIN', playerId: young.id });
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.value).toMatchObject({ deadNow: impact.deadNow, deadNext: impact.deadNext, active: 52 });
    expect(preview.value.spaceAfter - preview.value.spaceBefore).toBe(impact.savings);
    expect(preview.value.notes[0]).toMatch(/goes on waivers/);
    expect(makeMove(league, { kind: 'release', team: 'MIN', playerId: young.id }, rng).ok).toBe(true);
    expect(young.status).toBe('waivers');
    expect(league.contracts[contract.id]?.ended?.how).toBe('released');
    expect(makeMove(league, { kind: 'release', team: 'MIN', playerId: vested.id }, rng).ok).toBe(true);
    expect(vested).toMatchObject({ status: 'freeAgent', team: null });
  }); // prettier-ignore

  it('allows a June 1 designation only before June 1, two a league year', () => {
    const league = fresh();
    const [a, b, c] = players(league, 'MIN', 'active');
    if (!a || !b || !c) throw new Error('no players');
    expect(reason(league, { kind: 'release', team: 'MIN', playerId: a.id, designated: true })).toBe(
      'After June 1 every release splits its dead money already.'
    );
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    for (const p of [a, b]) expect(makeMove(league, { kind: 'release', team: 'MIN', playerId: p.id, designated: true }, rng).ok).toBe(true);
    expect(reason(league, { kind: 'release', team: 'MIN', playerId: c.id, designated: true })).toBe(
      "You've used your 2 June 1 designations this league year."
    );
  }); // prettier-ignore

  it('owes a vested veteran the rest of his season after week 1', () => {
    const league = fresh();
    league.date = { ...league.date, week: 5 };
    const vet = players(league, 'MIN', 'active').find(p => p.experience >= 4);
    if (!vet) throw new Error('no veteran');
    const preview = previewMove(league, { kind: 'release', team: 'MIN', playerId: vet.id });
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.value.notes.some(n => /vested veteran/.test(n))).toBe(true);
  });
});

describe('reserve lists, promotions, elevations, claims, and restructures (spec 12.1, 19.4)', () => {
  it('puts only a player too hurt to play on injured reserve, and brings him back after four games', () => {
    const league = fresh();
    const [player] = players(league, 'MIN', 'active');
    if (!player) throw new Error('no player');
    expect(reason(league, { kind: 'injuredReserve', team: 'MIN', playerId: player.id })).toBe(
      'Only a player too hurt to play can go on injured reserve.'
    );
    player.injury = hurt(5);
    expect(makeMove(league, { kind: 'injuredReserve', team: 'MIN', playerId: player.id }, rng).ok).toBe(true);
    player.injury = null;
    expect(reason(league, { kind: 'activate', team: 'MIN', playerId: player.id })).toMatch(
      /has missed 0 of the 4 games injured reserve requires\.$/
    );
    // Four MIN games later he can come back, taking the spot his team left open.
    for (let week = 1; week <= 4; week++)
      league.season.results[`m${week}`] = {
        id: `m${week}`, week, home: 'MIN', away: 'GB', homeScore: 20, awayScore: 10, homeTd: 2, awayTd: 1,
        playoff: false, overtime: false
      }; // prettier-ignore
    league.date = { ...league.date, week: 5 };
    expect(makeMove(league, { kind: 'activate', team: 'MIN', playerId: player.id }, rng).ok).toBe(true);
    expect(player.status).toBe('active');
  });

  it('promotes from the practice squad onto a minimum deal and elevates two a game', () => {
    const league = fresh();
    const [a, b, c] = players(league, 'MIN', 'practice');
    if (!a || !b || !c) throw new Error('no practice squad');
    for (const p of [a, b]) expect(makeMove(league, { kind: 'elevate', team: 'MIN', playerId: p.id }, rng).ok).toBe(true);
    expect(reason(league, { kind: 'elevate', team: 'MIN', playerId: c.id })).toBe('You can elevate 2 players a game.');
    expect(reason(league, { kind: 'promote', team: 'MIN', playerId: c.id })).toMatch(/active roster is full/);
    makeRoom(league);
    const old = c.contractId ?? '';
    expect(makeMove(league, { kind: 'promote', team: 'MIN', playerId: c.id }, rng).ok).toBe(true);
    expect(c.status).toBe('active');
    expect(league.contracts[old]?.ended?.how).toBe('replaced');
    expect(league.contracts[c.contractId ?? '']?.years[0]?.base).toBe(
      league.rules.pay.minimumSalary[Math.min(c.experience, 7)]
    );
    expect(rosterCounts(league, 'MIN').elevated).toBe(2);
  }); // prettier-ignore

  it('puts in a waiver claim and restructures to open cap space', () => {
    const league = fresh();
    const cut = players(league, 'KC', 'active').at(-1);
    if (!cut) throw new Error('no player');
    cut.experience = 1;
    expect(makeMove(league, { kind: 'release', team: 'KC', playerId: cut.id }, rng).ok).toBe(true);
    expect(reason(league, { kind: 'claim', team: 'MIN', playerId: cut.id })).toBe('The active roster is full.');
    makeRoom(league);
    expect(makeMove(league, { kind: 'claim', team: 'MIN', playerId: cut.id }, rng).ok).toBe(true);
    expect(league.waivers[0]?.claims).toEqual(['MIN']);
    // A big 2026 base salary converts to a bonus spread over the remaining years.
    const rich = players(league, 'MIN', 'active')
      .map(p => ({ p, c: league.contracts[p.contractId ?? ''] }))
      .filter(x => x.c && x.c.years.some(y => y.year === 2028) && (x.c.years.find(y => y.year === 2026)?.base ?? 0) > 5_000_000)[0];
    if (!rich) throw new Error('no big contract');
    const done = makeMove(league, { kind: 'restructure', team: 'MIN', playerId: rich.p.id, amount: 2_000_000 }, rng);
    if (!done.ok) throw new Error(done.reason);
    expect(done.value.spaceAfter).toBeGreaterThan(done.value.spaceBefore);
    expect(capSheet(league, 'MIN').space).toBe(done.value.spaceAfter);
  }); // prettier-ignore
});
