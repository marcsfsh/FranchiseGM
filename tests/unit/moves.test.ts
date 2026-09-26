import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { capSheet, elevationCost } from '../../src/engine/cap/sheet';
import { askingSalary, offerProblem } from '../../src/engine/contracts/acceptance';
import { capHit, releaseImpact } from '../../src/engine/contracts/cap';
import { askingFrom, contextFor } from '../../src/engine/contracts/decision';
import { irReturnsUsed, recordTransaction } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import { fullName, type Player } from '../../src/engine/model/player';
import type { PlayerInjury } from '../../src/engine/season/injuries';
import { stream } from '../../src/engine/rng';
import { makeMove, previewMove, type Move } from '../../src/engine/roster/moves';
import { rosterCounts, rosterProblems } from '../../src/engine/roster/rules';
import { claimedContract } from '../../src/engine/roster/waivers';
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

/** MIN's four home games against GB in weeks 1 to 4, played. */
function playFourGames(league: League): void {
  for (let week = 1; week <= 4; week++)
    league.season.results[`m${week}`] = {
      id: `m${week}`, week, home: 'MIN', away: 'GB', homeScore: 20, awayScore: 10, homeTd: 2, awayTd: 1,
      playoff: false, overtime: false
    }; // prettier-ignore
}

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
    const ask = askingSalary(league, player, 'MIN');
    const offer = { years: 2, salary: ask, signingBonus: 0 };
    // Every team starts with a full active roster.
    expect(reason(league, { kind: 'sign', team: 'MIN', playerId: player.id, offer })).toMatch(/active roster is full/);
    makeRoom(league);
    // Under what he'd take at the market, he says what he wants; the GM's price is above it.
    const floor = askingFrom(league, contextFor(league), player, 'MIN', 2);
    expect(ask).toBeGreaterThanOrEqual(floor);
    const low = { ...offer, salary: floor - 50_000 };
    if (low.salary >= (league.rules.pay.minimumSalary[player.experience] ?? Infinity))
      expect(offerProblem(league, player, low, 'MIN')).toMatch(/^He wants at least \$[\d,]+ a year from you\.$/);
    const before = capSheet(league, 'MIN').space;
    const done = makeMove(league, { kind: 'sign', team: 'MIN', playerId: player.id, offer }, rng);
    if (!done.ok) throw new Error(done.reason);
    expect(player).toMatchObject({ team: 'MIN', status: 'active', joined: 2026 });
    const contract = league.contracts[player.contractId ?? ''];
    expect(contract?.years.map(y => y.year)).toEqual([2026, 2027]);
    expect(capSheet(league, 'MIN').space).toBe(done.value.spaceAfter);
    expect(done.value.spaceBefore).toBe(before);
    expect(rosterProblems(league, 'MIN')).toEqual([]);
    // Short of room, or over the cap already: refused with the numbers (D-46).
    const other = players(league, null, 'freeAgent')[0];
    if (!other) throw new Error('no free agent');
    makeRoom(league);
    const signing: Move = { kind: 'sign', team: 'MIN', playerId: other.id, offer: { years: 1, salary: askingSalary(league, other, 'MIN'), signingBonus: 0 } };
    league.teams.MIN.carryover -= capSheet(league, 'MIN').space - 100_000;
    expect(reason(league, signing)).toMatch(/^His 2026 cap hit of \$[\d,]+ is more than your \$100,000 of cap space\.$/);
    league.teams.MIN.carryover -= 1_100_000;
    expect(reason(league, signing)).toBe("You're $1,000,000 over the 2026 cap. Get under it with a release or a restructure before you add to it.");
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
    young.accrued = 1;
    vested.accrued = 7;
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

  it('keeps a June 1 release on the cap in full until June 2, then splits it', () => {
    const league = fresh();
    league.date = { season: 2026, phase: 'freeAgency', week: 2 };
    // A deal with proration after 2027, so the designation moves some of it to 2028.
    const player = players(league, 'MIN', 'active').find(p => {
      const c = league.contracts[p.contractId ?? ''];
      return !!c && c.signingBonus > 0 && c.years.some(y => y.year === 2028 && !y.isVoid);
    });
    const id = player?.contractId ?? '';
    const contract = league.contracts[id];
    if (!player || !contract) throw new Error('no player');
    const charge = capSheet(league, 'MIN').lines.find(l => l.contractId === id)?.charge.total;
    const impact = releaseImpact(contract, league.date, league.rules, { designated: true });
    const move: Move = { kind: 'release', team: 'MIN', playerId: player.id, designated: true };
    const preview = previewMove(league, move);
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.value.notes.some(n => /stays on your 2027 cap until June 2/.test(n))).toBe(true);
    expect(makeMove(league, move, rng).ok).toBe(true);
    const held = capSheet(league, 'MIN');
    expect(held.space).toBe(preview.value.spaceAfter);
    const line = held.lines.find(l => l.contractId === id);
    expect(line).toMatchObject({ status: null, held: true });
    expect(line?.charge.total).toBe(charge);
    // In training camp, after June 1: 2027 keeps its part, and the rest waits for 2028.
    league.date = { season: 2026, phase: 'trainingCamp', week: 1 };
    const split = capSheet(league, 'MIN').lines.find(l => l.contractId === id);
    expect(split?.held).toBe(false);
    expect(split?.charge.total).toBe(impact.release);
    expect(capSheet(league, 'MIN', 2028).lines.find(l => l.contractId === id)?.charge.dead).toBe(impact.deadNext);
  }); // prettier-ignore

  it('refuses a release that would put the team over the cap', () => {
    const league = fresh();
    // Before June 1 a release brings every later year's proration into this one.
    league.date = { season: 2026, phase: 'freeAgency', week: 2 };
    const costly = players(league, 'MIN', 'active').find(p => {
      const c = league.contracts[p.contractId ?? ''];
      return !!c && releaseImpact(c, league.date, league.rules).savings < 0;
    });
    if (!costly) throw new Error('no costly release');
    league.teams.MIN.carryover -= capSheet(league, 'MIN').space;
    expect(capSheet(league, 'MIN').space).toBe(0);
    expect(reason(league, { kind: 'release', team: 'MIN', playerId: costly.id })).toMatch(
      /^Releasing him now leaves \$[\d,]+ more on this year's cap, which would put you over it\./
    );
  });

  it('owes a vested veteran the rest of his season after week 1', () => {
    const league = fresh();
    league.date = { ...league.date, week: 5 };
    const vet = players(league, 'MIN', 'active').find(p => p.accrued >= 4);
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
    playFourGames(league);
    league.date = { ...league.date, week: 5 };
    expect(makeMove(league, { kind: 'activate', team: 'MIN', playerId: player.id }, rng).ok).toBe(true);
    expect(player.status).toBe('active');
  });

  it('promotes from the practice squad onto a minimum deal and elevates two a game', () => {
    const league = fresh();
    const [a, b, c] = players(league, 'MIN', 'practice');
    if (!a || !b || !c) throw new Error('no practice squad');
    // An elevated player earns the active minimum's week for the game, less his practice squad pay.
    const elevation = previewMove(league, { kind: 'elevate', team: 'MIN', playerId: a.id });
    if (!elevation.ok) throw new Error(elevation.reason);
    expect(elevationCost(league, a.id)).toBeGreaterThan(0);
    expect(elevation.value.spaceBefore - elevation.value.spaceAfter).toBe(elevationCost(league, a.id));
    for (const p of [a, b]) expect(makeMove(league, { kind: 'elevate', team: 'MIN', playerId: p.id }, rng).ok).toBe(true);
    expect(capSheet(league, 'MIN').space).toBe(elevation.value.spaceAfter - elevationCost(league, b.id));
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
    cut.accrued = 1;
    expect(makeMove(league, { kind: 'release', team: 'KC', playerId: cut.id }, rng).ok).toBe(true);
    expect(reason(league, { kind: 'claim', team: 'MIN', playerId: cut.id })).toBe('The active roster is full.');
    makeRoom(league);
    // The preview shows the space he'd leave if he's awarded to MIN.
    const old = league.contracts[league.waivers[0]?.contractId ?? ''];
    if (!old) throw new Error('no contract');
    const claim = previewMove(league, { kind: 'claim', team: 'MIN', playerId: cut.id });
    if (!claim.ok) throw new Error(claim.reason);
    const hit = capHit(claimedContract(old, 'MIN', 'x', league.date, league.rules), 2026, league.rules);
    expect(claim.value.spaceBefore - claim.value.spaceAfter).toBe(hit);
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

  it('refuses a fourth elevation and an elevation with no game this week', () => {
    const league = fresh();
    const [a, b] = players(league, 'MIN', 'practice');
    if (!a || !b) throw new Error('no practice squad');
    const games = new Set(league.schedule.filter(g => g.home === 'MIN' || g.away === 'MIN').map(g => g.week));
    const bye = Array.from({ length: 18 }, (_, i) => i + 1).find(w => !games.has(w));
    const later = [...games].filter(w => w > 3).sort((x, y) => x - y)[0];
    if (!bye || !later) throw new Error('no bye');
    for (const week of [1, 2, 3]) league.season.elevations.push({ playerId: a.id, team: 'MIN', week });
    league.date = { ...league.date, week: later };
    expect(reason(league, { kind: 'elevate', team: 'MIN', playerId: a.id })).toBe(
      `${fullName(a)} has been elevated 3 times this season; sign him to the roster instead.`
    );
    league.date = { ...league.date, week: bye };
    expect(reason(league, { kind: 'elevate', team: 'MIN', playerId: b.id })).toBe(
      'Your team has no game left to play this week.'
    );
  });

  it('refuses a return from injured reserve once the returns are used, but not one from PUP', () => {
    const league = fresh();
    const [player, other] = players(league, 'MIN', 'active');
    if (!player || !other) throw new Error('no players');
    player.injury = hurt(5);
    expect(makeMove(league, { kind: 'injuredReserve', team: 'MIN', playerId: player.id }, rng).ok).toBe(true);
    player.injury = null;
    playFourGames(league);
    league.date = { ...league.date, week: 5 };
    for (let i = 0; i < league.rules.roster.irReturns; i++) recordTransaction(league, 'MIN', 'activated', `x${i}`);
    expect(reason(league, { kind: 'activate', team: 'MIN', playerId: player.id })).toBe(
      "You've used all 8 returns from injured reserve this season."
    );
    // A return from the PUP list is its own kind, and uses none of them.
    other.status = 'pup';
    expect(makeMove(league, { kind: 'activate', team: 'MIN', playerId: other.id }, rng).ok).toBe(true);
    expect(league.season.transactions.at(-1)).toMatchObject({ kind: 'reserveReturn', playerId: other.id });
    expect(irReturnsUsed(league, 'MIN')).toBe(8);
  }); // prettier-ignore
});
