import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { hear, replyWords } from '../../src/engine/contracts/negotiation';
import type { League } from '../../src/engine/league/types';
import {
  characterKnown,
  chemistry,
  gamePerformances,
  isDisruptive,
  isLeader,
  learnCharacters,
  LINE,
  LOCKER_ROOM_BEST,
  lockerRoomEffect,
  popular,
  resetMorale,
  roomOf,
  roomPull,
  SECONDARY,
  weeklyMorale
} from '../../src/engine/locker/room';
import { leagueYear } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { makeMove } from '../../src/engine/roster/moves';
import { emptyLine, emptyTotals, type PlayerLine } from '../../src/engine/sim/stats';
import type { GameResult } from '../../src/engine/sim/types';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// Morale and the locker room (spec 10.9; D-51).
const L = TUNING.lockerRoom;

/** A quiet league: everyone at the baseline with middling traits, nobody a leader or disruptive. */
function quiet(): League {
  const league = structuredClone(situationLeague);
  for (const p of Object.values(league.players)) {
    p.morale = L.baseline;
    Object.assign(p.personality, { leadership: 50, ego: 50, volatility: 30, competitiveness: 50, greed: 50 });
  }
  return league;
}

const room = (league: League, team: TeamAbbr = 'MIN'): Player[] => roomOf(league, team);

const line = (change: Partial<PlayerLine>): PlayerLine => ({ ...emptyLine(), ...change });
/** A finished game with these player lines on each side; the morale step reads only the box score. */
const game = (home: Record<string, PlayerLine>, away: Record<string, PlayerLine>): GameResult =>
  ({ box: { home: { totals: emptyTotals(), players: home }, away: { totals: emptyTotals(), players: away } } }) as unknown as GameResult; // prettier-ignore

/** One player's average morale change over many weeks from the same start, since weeks round at random. */
function averageChange(league: League, player: Player, week: (seed: number) => void, n = 60): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (const p of room(league)) p.morale = L.baseline;
    week(i);
    total += player.morale - L.baseline;
  }
  return total / n;
}

describe('weekly morale (spec 10.9)', () => {
  it('lifts morale with a win and lowers it with a loss, more for the competitive', () => {
    const league = quiet();
    const [keen, easy] = room(league);
    if (!keen || !easy) throw new Error('no players');
    keen.personality.competitiveness = 100;
    easy.personality.competitiveness = 0;
    const lost = (seed: number) => weeklyMorale(league, new Map([['MIN', 'L']]), stream(seed));
    const won = (seed: number) => weeklyMorale(league, new Map([['MIN', 'W']]), stream(seed));
    expect(averageChange(league, keen, lost)).toBeCloseTo(-L.result * L.traitScale[1], 0);
    expect(averageChange(league, easy, lost)).toBeCloseTo(-L.result * L.traitScale[0], 0);
    expect(averageChange(league, keen, won)).toBeGreaterThan(averageChange(league, easy, won));
  });

  it("judges a starter's own game against the week's other starters at his position", () => {
    const league = quiet();
    const at = (position: string) => Object.values(league.players).filter(p => p.position === position && p.team).map(p => p.id); // prettier-ignore
    const [great, poor, ...rest] = at('QB').slice(0, 8);
    const [lt] = at('LT');
    const [k] = at('K');
    const [wr] = at('WR');
    if (!great || !poor || rest.length < 6 || !lt || !k || !wr) throw new Error('no players');
    const usual = line({ started: 1, passYds: 250, passTd: 1 });
    const home = Object.fromEntries(rest.slice(0, 3).map(id => [id, usual]));
    const away = Object.fromEntries(rest.slice(3).map(id => [id, usual]));
    home[great] = line({ started: 1, passYds: 450, passTd: 5 });
    away[poor] = line({ started: 1, passYds: 100, passInt: 3 });
    // The box score doesn't score a lineman's game. A kicker who only kicked off had no kicks to judge,
    // and the backup receiver didn't start.
    home[lt] = line({ started: 1 });
    home[k] = line({ kickoffs: 5 });
    away[wr] = line({ receptions: 12, recYds: 200 });
    expect(Object.fromEntries(gamePerformances(league, [game(home, away)]))).toEqual({
      [great]: 1,
      [poor]: -1
    });
    // Nobody stands out when every game is the same.
    expect(gamePerformances(league, [game(Object.fromEntries(rest.map(id => [id, usual])), {})]).size).toBe(
      0
    );
  });

  it("moves a player's morale with his own game, more for the competitive", () => {
    const league = quiet();
    const [keen] = room(league);
    if (!keen) throw new Error('no player');
    keen.personality.competitiveness = 100;
    const week = (verdict: number) => (seed: number) => weeklyMorale(league, new Map(), stream(seed), new Map([[keen.id, verdict]])); // prettier-ignore
    const usual = averageChange(league, keen, week(0));
    expect(averageChange(league, keen, week(1)) - usual).toBeCloseTo(L.performance * L.traitScale[1], 0);
    expect(averageChange(league, keen, week(-1)) - usual).toBeCloseTo(-L.performance * L.traitScale[1], 0);
  });

  it('drifts toward the baseline', () => {
    const league = quiet();
    const [p] = room(league);
    if (!p) throw new Error('no player');
    p.morale = 30;
    weeklyMorale(league, new Map(), stream(1));
    expect(p.morale).toBeGreaterThan(30);
    expect(p.morale).toBeLessThanOrEqual(30 + Math.ceil((L.baseline - 30) * L.drift));
  });

  it("costs a player his ratings would start but who sits, more with ego, and pleases a starter", () => {
    const league = quiet();
    const qbs = room(league).filter(p => p.position === 'QB' && p.status === 'active').sort((a, b) => b.ovr - a.ovr);
    const [better, worse] = qbs;
    if (!better || !worse) throw new Error('no quarterbacks');
    better.ovr = Math.max(better.ovr, worse.ovr + L.benchedBy);
    better.injury = null;
    better.personality.ego = 100;
    league.teams.MIN.depth.order = { QB: [worse.id] };
    const week = (seed: number) => weeklyMorale(league, new Map(), stream(seed));
    expect(averageChange(league, better, week)).toBeCloseTo(-L.benched * L.traitScale[1], 0);
    expect(averageChange(league, worse, week)).toBeCloseTo(L.starting, 0);
  }); // prettier-ignore

  it('costs a veteran paid well under his market value, and not a player on his rookie deal', () => {
    const league = quiet();
    const onDeal = (type: string) => room(league).find(p => p.contractId && league.contracts[p.contractId]?.type === type && p.status === 'active'); // prettier-ignore
    const veteran = onDeal('veteran');
    const rookie = onDeal('rookie');
    if (!veteran || !rookie) throw new Error('no players');
    for (const p of [veteran, rookie]) Object.assign(p, { ovr: 97 }, { personality: { ...p.personality, greed: 100 } }); // prettier-ignore
    const week = (seed: number) => weeklyMorale(league, new Map(), stream(seed));
    expect(averageChange(league, veteran, week)).toBeLessThan(-0.5);
    expect(averageChange(league, rookie, week)).toBeCloseTo(0, 0);
  }); // prettier-ignore

  it("lets the loudest leaders lift the room and disruptive players drag it, never by their own voice", () => {
    const league = quiet();
    const players = room(league);
    const leaders = players.slice(0, L.voices + 2);
    for (const p of leaders) Object.assign(p, { experience: L.leaderSeasons }, { personality: { ...p.personality, leadership: 90 } }); // prettier-ignore
    const troubled = players.slice(10, 12);
    for (const p of troubled) Object.assign(p, { morale: L.disruptiveBelow - 10 }, { personality: { ...p.personality, ego: 90, volatility: 90 } }); // prettier-ignore
    expect(leaders.every(isLeader)).toBe(true);
    expect(troubled.every(isDisruptive)).toBe(true);
    const pull = roomPull(players);
    const teammate = players[20] as Player;
    expect(pull(teammate)).toBeCloseTo(L.voices * L.leader - 2 * L.disruptive);
    // A leader hears the other leaders, still the loudest few; a disruptive player hears the other one.
    expect(pull(leaders[0] as Player)).toBeCloseTo(L.voices * L.leader - 2 * L.disruptive);
    expect(pull(troubled[0] as Player)).toBeCloseTo(L.voices * L.leader - L.disruptive);
    const lone = roomPull([leaders[0] as Player, teammate]);
    expect(lone(leaders[0] as Player)).toBe(0);
    expect(lone(teammate)).toBeCloseTo(L.leader);
  }); // prettier-ignore
});

describe('the locker room and roster moves (spec 10.9)', () => {
  it("costs the room a popular leader's release, with a warning first, and nobody else's", () => {
    const league = quiet();
    const players = room(league).filter(p => p.status === 'active');
    const [leader, other] = players;
    if (!leader || !other) throw new Error('no players');
    Object.assign(leader, { experience: 8, joined: leagueYear(league.date) - L.popularSeasons });
    leader.personality.leadership = 90;
    expect(popular(league, leader)).toBe(true);
    const done = makeMove(league, { kind: 'release', team: 'MIN', playerId: leader.id }, stream(2));
    if (!done.ok) throw new Error(done.reason);
    expect(done.value.notes.join(' ')).toMatch(/is a leader in your locker room/);
    expect(room(league).every(p => p.morale === L.baseline - L.releaseLeader)).toBe(true);
    expect(makeMove(league, { kind: 'release', team: 'MIN', playerId: other.id }, stream(3)).ok).toBe(true);
    expect(room(league).every(p => p.morale === L.baseline - L.releaseLeader)).toBe(true);
  });

  it('costs the room a lowball offer to a popular leader in talks, and nobody else', () => {
    const league = quiet();
    const [leader, other] = room(league).filter(
      p => p.status === 'active' && !['K', 'P', 'LS'].includes(p.position)
    );
    if (!leader || !other) throw new Error('no players');
    for (const p of [leader, other]) p.ovr = 85;
    Object.assign(leader, { experience: 8, joined: leagueYear(league.date) - L.popularSeasons });
    leader.personality.leadership = 90;
    const lowball = (p: Player) => ({ years: 1, salary: league.rules.pay.minimumSalary[p.experience] ?? 0, signingBonus: 0 }); // prettier-ignore
    const reply = hear(league, 'MIN', leader, lowball(leader), true);
    expect(reply).toMatchObject({ lowball: true, teammates: true });
    expect(replyWords(reply)).toMatch(/His teammates took it badly/);
    expect(leader.morale).toBe(L.baseline - TUNING.contracts.negotiation.lowballMorale);
    expect(room(league).every(p => p === leader || p.morale === L.baseline - L.lowballLeader)).toBe(true);
    const plain = hear(league, 'MIN', other, lowball(other), true);
    expect(plain).toMatchObject({ lowball: true });
    expect('teammates' in plain).toBe(false);
    expect(room(league).every(p => p === leader || p === other || p.morale === L.baseline - L.lowballLeader)).toBe(true); // prettier-ignore
  });

  it('eases every morale partway back to the baseline as a league year opens', () => {
    const league = quiet();
    const [high, low] = room(league);
    if (!high || !low) throw new Error('no players');
    high.morale = 90;
    low.morale = 50;
    resetMorale(league);
    expect(high.morale).toBe(Math.round(90 + (L.baseline - 90) * L.offseasonReset));
    expect(low.morale).toBe(Math.round(50 + (L.baseline - 50) * L.offseasonReset));
  });
});

describe('the locker room in games (spec 10.9)', () => {
  it("rates a unit's chemistry by its starters' time together, from -1 to 1", () => {
    const league = quiet();
    const year = leagueYear(league.date);
    const line = room(league)
      .filter(p => p.position === 'LT' || p.position === 'C')
      .slice(0, 3);
    for (const p of line) p.joined = year;
    expect(chemistry(league, line)).toBeCloseTo(-L.chemistryTypical / L.chemistrySpan);
    for (const p of line) p.joined = year - 20;
    expect(chemistry(league, line)).toBe(1);
    for (const p of line) p.joined = year - L.chemistryTypical;
    expect(chemistry(league, line)).toBeCloseTo(0);
    expect(chemistry(league, [])).toBe(0);
  });

  it("lifts both sides with the room's morale, the offense with the line's chemistry and the defense with the secondary's", () => {
    const league = quiet();
    const players = room(league);
    const year = leagueYear(league.date);
    const starters = new Map<string, Player>();
    LINE.forEach((slot, i) => starters.set(slot, Object.assign(players[i] as Player, { joined: year - 20 })));
    SECONDARY.forEach((slot, i) => starters.set(slot, Object.assign(players[10 + i] as Player, { joined: year - L.chemistryTypical })));
    const effect = (list: readonly Player[]) => lockerRoomEffect(league, list, slot => starters.get(slot));
    const even = effect(players);
    expect(even.defense).toBeCloseTo(0);
    expect(even.offense).toBeCloseTo(L.chemistryPoints * TUNING.cohesion.executionPerPoint);
    for (const p of players) p.morale = 100;
    const happy = effect(players);
    expect(happy.defense).toBeCloseTo(L.moralePoints * TUNING.cohesion.executionPerPoint);
    expect(happy.offense).toBeCloseTo(LOCKER_ROOM_BEST);
    for (const p of players) p.morale = 0;
    expect(effect(players).defense).toBeCloseTo(-L.moralePoints * TUNING.cohesion.executionPerPoint);
  }); // prettier-ignore
});

describe("the user's knowledge of characters (spec 10.9)", () => {
  it("learns a player's character from a visit, or from half a season on the user's team, and keeps it", () => {
    const league = quiet();
    const year = leagueYear(league.date);
    const [mine] = room(league).filter(p => p.status === 'active');
    const [theirs] = room(league, 'GB');
    if (!mine || !theirs) throw new Error('no players');
    mine.joined = year;
    league.date = { season: year, phase: 'regularSeason', week: 1 };
    expect(characterKnown(league, mine)).toBe(false);
    league.date.week = L.revealWeek + 1;
    expect(characterKnown(league, mine)).toBe(true);
    mine.joined = year - 1;
    league.date.week = 1;
    expect(characterKnown(league, mine)).toBe(true);
    expect(characterKnown(league, theirs)).toBe(false);
    learnCharacters(league, [theirs.id, theirs.id]);
    expect(league.personalityKnown.filter(id => id === theirs.id)).toHaveLength(1);
    expect(characterKnown(league, theirs)).toBe(true);
    // The weeks on the user's team are remembered once he's gone.
    weeklyMorale(league, new Map(), stream(1));
    mine.team = 'GB';
    expect(characterKnown(league, mine)).toBe(true);
  });
});
