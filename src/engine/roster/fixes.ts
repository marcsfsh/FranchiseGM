/**
 * Moves that make a team legal to advance (D-46), each previewed: the one-tap fixes the user is offered
 * before an advance, and the moves the AI makes for the teams it runs. For the cap, restructures and
 * releases that free space; for the roster minimum, practice squad promotions and free agents at the
 * minimum where the roster is thinnest (the cheapest others when those run out); for a game-day roster, elevations, promotions, and signings at the
 * positions it lacks, and injured reserve for players who can't play, to open spots. Every one is a checked
 * move.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { askingSalary } from '../contracts/acceptance';
import { convertible } from '../contracts/moves';
import { ACTIVE_ROSTER } from '../generate/league';
import { freeAgents } from '../league/transactions';
import type { League } from '../league/types';
import type { Player } from '../model/player';
import { POSITION_GROUP, type Position, type PositionGroup } from '../model/positions';
import { minimumSalary } from '../rules/ruleset';
import { cannotPlay, designation } from '../season/injuries';
import { TUNING } from '../tuning';
import { gameDayProblem } from './legality';
import { previewMove, type Move, type MovePreview } from './moves';

export interface Fix {
  move: Move;
  preview: MovePreview;
}

/** Cap space a fix frees this league year. */
export const saved = (fix: Fix): number => fix.preview.spaceAfter - fix.preview.spaceBefore;

/** A move with its preview, or null when the rules refuse it. */
function fixOf(league: League, move: Move): Fix | null {
  const preview = previewMove(league, move);
  return preview.ok ? { move, preview: preview.value } : null;
}

const teamPlayers = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === abbr);
const healthy = (p: Player): boolean => !cannotPlay(designation(p.injury));
const byId = (a: Fix, b: Fix): number => (a.move.playerId < b.move.playerId ? -1 : 1);

/** Restructures that free cap space this league year, each converting all it can, the most saved first. */
export function restructureFixes(league: League, abbr: TeamAbbr): Fix[] {
  const fixes: Fix[] = [];
  for (const p of teamPlayers(league, abbr)) {
    const contract = p.contractId ? league.contracts[p.contractId] : undefined;
    if (!contract || contract.ended) continue;
    const amount = convertible(
      contract,
      league.date,
      minimumSalary(league.rules, p.experience),
      league.rules
    );
    if (amount <= 0) continue;
    const fix = fixOf(league, { kind: 'restructure', team: abbr, playerId: p.id, amount, reason: 'to get under the salary cap' }); // prettier-ignore
    if (fix && saved(fix) > 0) fixes.push(fix);
  }
  return fixes.sort((a, b) => saved(b) - saved(a) || byId(a, b));
}

/** Releases that free cap space this league year, the most saved first. */
export function releaseFixes(league: League, abbr: TeamAbbr): Fix[] {
  const fixes = teamPlayers(league, abbr).flatMap(p => {
    const fix = fixOf(league, { kind: 'release', team: abbr, playerId: p.id, reason: 'to get under the salary cap' }); // prettier-ignore
    return fix && saved(fix) > 0 ? [fix] : [];
  });
  return fixes.sort((a, b) => saved(b) - saved(a) || byId(a, b));
}

/** The standard roster's count at each position group (spec 12.1). */
const STANDARD = new Map<PositionGroup, number>();
for (const [position, n] of ACTIVE_ROSTER) {
  const group = POSITION_GROUP[position];
  STANDARD.set(group, (STANDARD.get(group) ?? 0) + n);
}

/** Healthy active players each group is short of the standard roster's count. */
function groupNeeds(league: League, abbr: TeamAbbr): Map<PositionGroup, number> {
  const have = new Map<PositionGroup, number>();
  for (const p of teamPlayers(league, abbr))
    if (p.status === 'active' && healthy(p)) have.set(POSITION_GROUP[p.position], (have.get(POSITION_GROUP[p.position]) ?? 0) + 1); // prettier-ignore
  return new Map([...STANDARD].map(([group, n]) => [group, Math.max(0, n - (have.get(group) ?? 0))]));
}

/** Whether a free agent's asking price is his minimum salary: within a quote step of it. */
const asksMinimum = (league: League, p: Player, ask: number): boolean =>
  ask < minimumSalary(league.rules, p.experience) + TUNING.market.quoteStep;

/**
 * Moves that add a healthy player to the active roster, at most `limit`: practice squad promotions and free
 * agents asking the minimum, where the roster is thinnest (then the team's own players, then the best),
 * and once those run out the free agents asking least; `fits` narrows them to some positions.
 */
export function fillFixes(
  league: League,
  abbr: TeamAbbr,
  limit: number,
  fits: (position: Position) => boolean = () => true
): Fix[] {
  const needs = groupNeeds(league, abbr);
  const need = (p: Player) => needs.get(POSITION_GROUP[p.position]) ?? 0;
  const squad = teamPlayers(league, abbr).filter(
    p => p.status === 'practice' && healthy(p) && fits(p.position)
  );
  const asks = new Map(
    freeAgents(league)
      .filter(p => healthy(p) && fits(p.position))
      .map(p => [p, askingSalary(league, p, abbr)])
  );
  const cheap = [...asks].filter(([p, ask]) => asksMinimum(league, p, ask)).map(([p]) => p);
  const rest = [...asks].filter(([p, ask]) => !asksMinimum(league, p, ask)).sort((a, b) => a[1] - b[1] || (a[0].id < b[0].id ? -1 : 1)).map(([p]) => p); // prettier-ignore
  const first = [...squad, ...cheap].sort(
    (a, b) =>
      need(b) - need(a) ||
      Number(b.status === 'practice') - Number(a.status === 'practice') ||
      b.ovr - a.ovr ||
      (a.id < b.id ? -1 : 1)
  );
  const fixes: Fix[] = [];
  for (const p of [...first, ...rest]) {
    if (fixes.length >= limit) break;
    const reason = 'to fill the active roster';
    const move: Move =
      p.status === 'practice'
        ? { kind: 'promote', team: abbr, playerId: p.id, reason }
        : { kind: 'sign', team: abbr, playerId: p.id, offer: { years: 1, salary: asks.get(p) ?? askingSalary(league, p, abbr), signingBonus: 0 }, reason }; // prettier-ignore
    const fix = fixOf(league, move);
    if (fix) fixes.push(fix);
  }
  return fixes;
}

/**
 * Moves toward a legal game-day roster this week (D-46), at most `limit`: practice squad players elevated
 * for the game, then promotions and minimum signings, at the positions it lacks; and, when the roster has
 * no room for them, injured reserve for the players out longest. Empty when the team can dress or has no
 * game.
 */
export function gameDayFixes(league: League, abbr: TeamAbbr, limit: number): Fix[] {
  const short = gameDayProblem(league, abbr)?.gameDay;
  if (!short) return [];
  const fits = (position: Position) =>
    short.missing.includes(position) || (short.line > 0 && POSITION_GROUP[position] === 'OL');
  const squad = teamPlayers(league, abbr)
    .filter(p => p.status === 'practice' && healthy(p) && fits(p.position))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  const elevations = squad.flatMap(p => {
    const fix = fixOf(league, { kind: 'elevate', team: abbr, playerId: p.id, reason: 'to dress a full game-day roster' }); // prettier-ignore
    return fix ? [fix] : [];
  });
  const fills = fillFixes(league, abbr, limit, fits);
  const reserve = fills.length
    ? []
    : teamPlayers(league, abbr)
        .filter(p => p.status === 'active' && !healthy(p))
        .sort((a, b) => (b.injury?.weeksOut ?? 0) - (a.injury?.weeksOut ?? 0) || (a.id < b.id ? -1 : 1))
        .flatMap(p => {
          const fix = fixOf(league, { kind: 'injuredReserve', team: abbr, playerId: p.id, reason: 'to open a roster spot' }); // prettier-ignore
          return fix ? [fix] : [];
        });
  return [...elevations, ...fills, ...reserve].slice(0, limit);
}
