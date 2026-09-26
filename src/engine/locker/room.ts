/**
 * Morale and the locker room (spec 10.9; D-51). Each game week every player in a team's room moves toward
 * the baseline, then with his team's result, his role against what his ratings earn him, and his pay
 * against his market value, each scaled by the trait that cares about it; the room's leaders lift him and
 * its disruptive players drag him down. Releasing a leader costs his teammates at once, and each new league
 * year eases every morale back toward the baseline.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { marketValue } from '../contracts/market';
import { contractSummary } from '../contracts/view';
import { BASE_SLOTS, startersOf } from '../league/depth';
import type { League } from '../league/types';
import { calendarDay, leagueYear } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { POSITION_GROUP, type PositionGroup } from '../model/positions';
import type { Rng } from '../rng';
import type { Slot } from '../schemes/slots';
import { PLAYOFF_PHASES } from '../season/state';
import { cannotPlay, designation } from '../season/injuries';
import { TUNING } from '../tuning';

const L = TUNING.lockerRoom;

/** The players in a team's room: its roster, practice squad, and reserve lists. */
const ROOM = new Set<Player['status']>(['active', 'practice', 'ir', 'pup', 'nfi', 'suspended']);

/** Who starts for morale's purposes: the base lineup and the kicking specialists. */
const STARTING_SLOTS: readonly Slot[] = [...BASE_SLOTS, 'K', 'P', 'LS'];

/** Deals a player signs before he's earned a market: his rookie deal, and the minimum practice squad. */
const ROOKIE_DEALS = new Set(['rookie', 'udfa', 'practiceSquad']);

/** A trait's weight on a change it cares about: `traitScale[0]` at 0, `traitScale[1]` at 100. */
const weigh = (trait: number): number =>
  L.traitScale[0] + ((L.traitScale[1] - L.traitScale[0]) * trait) / 100;

export const clampMorale = (value: number): number => Math.max(0, Math.min(100, value));

/** A leader: high leadership and the seasons to be heard. */
export const isLeader = (p: Player): boolean =>
  p.personality.leadership >= L.leaderAt && p.experience >= L.leaderSeasons;

/** A disruptive player: unhappy, with the ego and volatility to spread it. */
export const isDisruptive = (p: Player): boolean =>
  p.morale < L.disruptiveBelow && (p.personality.ego + p.personality.volatility) / 2 >= L.disruptiveAt;

/** League years with his current team, counting the one under way from 0. */
export const tenure = (league: League, p: Player): number => Math.max(0, leagueYear(league.date) - p.joined);

/** A team's room. */
export const roomOf = (league: League, team: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === team && ROOM.has(p.status));

/** The morale a team's active roster averages; the baseline for an empty one. */
export function teamMorale(league: League, team: TeamAbbr): number {
  const active = Object.values(league.players).filter(p => p.team === team && p.status === 'active');
  return active.length ? active.reduce((sum, p) => sum + p.morale, 0) / active.length : L.baseline;
}

/**
 * The room's pull on each of its players a week: the lift of its leaders and the drag of its disruptive
 * players, the loudest `voices` of each, never counting a player's own voice.
 */
export function roomPull(room: readonly Player[]): (p: Player) => number {
  const loudest = (list: Player[], by: (p: Player) => number) => list.sort((a, b) => by(b) - by(a) || (a.id < b.id ? -1 : 1)).slice(0, L.voices + 1); // prettier-ignore
  const leaders = loudest(room.filter(isLeader), p => p.personality.leadership);
  const disruptive = loudest(room.filter(isDisruptive), p => p.personality.ego + p.personality.volatility);
  const count = (list: readonly Player[], p: Player) =>
    Math.min(L.voices, list.filter(q => q.id !== p.id).length);
  return p => count(leaders, p) * L.leader - count(disruptive, p) * L.disruptive;
}

/** Each team's starters by position group, from its depth chart's active players. */
function startersByGroup(league: League, team: TeamAbbr): Map<PositionGroup, Player[]> {
  const onRoster = (id: string) =>
    league.players[id]?.team === team && league.players[id]?.status === 'active';
  const firsts = startersOf(league.teams[team].depth.order, onRoster);
  const byGroup = new Map<PositionGroup, Player[]>();
  for (const slot of STARTING_SLOTS) {
    const p = league.players[firsts[slot] ?? ''];
    if (!p) continue;
    const group = POSITION_GROUP[p.position];
    const list = byGroup.get(group) ?? [];
    if (!list.includes(p)) byGroup.set(group, [...list, p]);
  }
  return byGroup;
}

/** A player's role this week: +1 starting, -1 kept on the bench though his ratings would start, 0 else. */
function role(p: Player, starters: Map<PositionGroup, Player[]>): number {
  const group = starters.get(POSITION_GROUP[p.position]) ?? [];
  if (group.includes(p)) return 1;
  if (!group.length || p.status !== 'active' || cannotPlay(designation(p.injury))) return 0;
  return p.ovr >= Math.min(...group.map(s => s.ovr)) + L.benchedBy ? -1 : 0;
}

/** How far under his market value a veteran's deal pays him, 0 to 1; 0 for rookie deals and fair pay. */
function underpaid(league: League, p: Player): number {
  const contract = p.contractId ? league.contracts[p.contractId] : undefined;
  if (!contract || ROOKIE_DEALS.has(contract.type)) return 0;
  const age = ageOn(p.birthDate, calendarDay(league.date));
  const value = marketValue(league.rules, p.position, p.ovr, age, p.experience);
  const paid = contractSummary(contract, league.date).apy;
  return paid >= value * L.underpaid ? 0 : 1 - paid / (value * L.underpaid);
}

/** Whole points, rounded up or down at random in proportion, so small weekly changes add up. */
const whole = (value: number, rng: Rng): number => {
  const floor = Math.floor(value);
  return floor + (rng.float() < value - floor ? 1 : 0);
};

/**
 * A game week of morale for every room (spec 10.9). `results` holds each team's result this week, if it
 * played. Returns each player's change.
 */
export function weeklyMorale(
  league: League,
  results: ReadonlyMap<TeamAbbr, 'W' | 'L' | 'T'>,
  rng: Rng
): Map<string, number> {
  const changes = new Map<string, number>();
  const rooms = new Map<TeamAbbr, Player[]>();
  for (const p of Object.values(league.players))
    if (p.team && ROOM.has(p.status)) rooms.set(p.team, [...(rooms.get(p.team) ?? []), p]);
  // Time on the user's team teaches his character; the user remembers it after he leaves.
  const user = rooms.get(league.meta.start.userTeam) ?? [];
  learnCharacters(
    league,
    user.filter(p => characterKnown(league, p)).map(p => p.id)
  );
  for (const team of TEAM_ABBRS) {
    const room = (rooms.get(team) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
    const pull = roomPull(room);
    const starters = startersByGroup(league, team);
    const result = results.get(team);
    for (const p of room) {
      const traits = p.personality;
      let change = (L.baseline - p.morale) * L.drift + pull(p);
      if (result === 'W') change += L.result * weigh(traits.competitiveness);
      if (result === 'L') change -= L.result * weigh(traits.competitiveness);
      const now = role(p, starters);
      if (now > 0) change += L.starting;
      if (now < 0) change -= L.benched * weigh(traits.ego);
      change -= L.pay * underpaid(league, p) * weigh(traits.greed);
      const next = clampMorale(p.morale + whole(change, rng));
      if (next !== p.morale) changes.set(p.id, next - p.morale);
      p.morale = next;
    }
  } // prettier-ignore
  return changes;
}

/** Whether releasing him costs his teammates: a leader who's been with the team `popularSeasons`. */
export const popular = (league: League, p: Player): boolean =>
  isLeader(p) && tenure(league, p) >= L.popularSeasons;

/** His teammates' morale drops when the team releases a popular leader (spec 10.9). */
export function releaseMorale(league: League, team: TeamAbbr, released: Player): void {
  if (!popular(league, released)) return;
  for (const p of roomOf(league, team))
    if (p.id !== released.id) p.morale = clampMorale(p.morale - L.releaseLeader);
}

const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));

/** The starters whose time together is a unit's chemistry (spec 10.9). */
export const LINE: readonly Slot[] = ['LT', 'LG', 'C', 'RG', 'RT'];
export const SECONDARY: readonly Slot[] = ['CB1', 'CB2', 'FS', 'SS'];

/** A unit's chemistry, -1 to 1: its starters' average league years with the team against the typical. */
export function chemistry(league: League, players: readonly Player[]): number {
  if (!players.length) return 0;
  const together = players.reduce((sum, p) => sum + tenure(league, p), 0) / players.length;
  return clampUnit((together - L.chemistryTypical) / L.chemistrySpan);
}

/** A team's locker room in a game, in cohesion's execution units for each side of the ball. */
export interface LockerRoomEffect {
  offense: number;
  defense: number;
}

/** The locker room at its best, on each side: the most morale and chemistry can add. */
export const LOCKER_ROOM_BEST = (L.moralePoints + L.chemistryPoints) * TUNING.cohesion.executionPerPoint;

/**
 * A team's locker room in a game (spec 10.9): its dressed players' morale on both sides of the ball, the
 * offensive line's chemistry on offense and the secondary's on defense. `starters` gives each slot's starter.
 */
export function lockerRoomEffect(league: League, players: readonly Player[], starters: (slot: Slot) => Player | undefined): LockerRoomEffect {
  const morale = players.length ? players.reduce((sum, p) => sum + p.morale, 0) / players.length : L.baseline;
  const mood = clampUnit((morale - L.baseline) / L.moraleSpan) * L.moralePoints;
  const unit = (slots: readonly Slot[]) => chemistry(league, slots.flatMap(s => starters(s) ?? [])) * L.chemistryPoints;
  const per = TUNING.cohesion.executionPerPoint;
  return { offense: (mood + unit(LINE)) * per, defense: (mood + unit(SECONDARY)) * per };
} // prettier-ignore

/**
 * Whether the user knows a player's character (spec 10.9): learned from a top-30 visit, or from time on the
 * user's team, a league year before this one or `revealWeek` game weeks into this one.
 */
export function characterKnown(league: League, p: Player): boolean {
  if (league.personalityKnown.includes(p.id)) return true;
  if (p.team !== league.meta.start.userTeam) return false;
  if (leagueYear(league.date) > p.joined) return true;
  const { phase, week } = league.date;
  return (phase === 'regularSeason' && week > L.revealWeek) || PLAYOFF_PHASES.includes(phase as (typeof PLAYOFF_PHASES)[number]);
} // prettier-ignore

/** The user remembers these players' characters from now on. */
export function learnCharacters(league: League, ids: readonly string[]): void {
  const known = new Set(league.personalityKnown);
  for (const id of ids)
    if (!known.has(id)) {
      known.add(id);
      league.personalityKnown.push(id);
    }
}

/** A new league year eases every morale `offseasonReset` of the way back to the baseline. */
export function resetMorale(league: League): void {
  for (const p of Object.values(league.players))
    if (p.status !== 'retired')
      p.morale = clampMorale(Math.round(p.morale + (L.baseline - p.morale) * L.offseasonReset));
}
