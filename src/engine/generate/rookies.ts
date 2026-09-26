/**
 * A stand-in rookie class until M11's draft (D-27): each spring a class of prospects is generated with the
 * position mix of a standard roster. Teams take them for the rule set's rounds in reverse order of last
 * season's finish, each taking the best prospect left by a blend of potential and overall, on rookie scale
 * deals; the rest are undrafted free agents, and after the draft each AI team signs the best of them. M11
 * replaces this with class generation, scouting, the draft room, and the UDFA scramble.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capHit } from '../contracts/cap';
import { rookieContract, udfaContract } from '../contracts/build';
import { activeRoster, freeAgents, newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import { fullName, type Player } from '../model/player';
import { POSITION_GROUP, type Position } from '../model/positions';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { PLAYOFF_PHASES, leagueStandings } from '../season/state';
import { winPct } from '../season/standings';
import { TUNING } from '../tuning';
import { ACTIVE_ROSTER } from './league';
import { generatePlayer, type NameData } from './player';

const O = TUNING.offseason;

export interface DraftPick {
  playerId: string;
  team: TeamAbbr;
  round: number;
  pick: number;
}

/**
 * The draft order (spec 10.4): teams out of the playoffs by record, worst first, then playoff teams by the
 * round they went out in, the champion last; a weaker schedule breaks ties.
 */
export function draftOrder(league: League): TeamAbbr[] {
  const records = leagueStandings(league).table.records;
  const weeks = league.rules.season.weeks;
  const reached = new Map<TeamAbbr, number>();
  for (const g of Object.values(league.season.results)) {
    if (!g.playoff) continue;
    for (const t of [g.home, g.away]) reached.set(t, Math.max(reached.get(t) ?? 0, g.week - weeks));
  }
  const champion = league.season.champion;
  if (champion) reached.set(champion, PLAYOFF_PHASES.length + 1);
  return [...TEAM_ABBRS].sort(
    (a, b) =>
      (reached.get(a) ?? 0) - (reached.get(b) ?? 0) ||
      winPct(records[a].overall) - winPct(records[b].overall) ||
      records[a].sos - records[b].sos ||
      (a < b ? -1 : 1)
  );
}

/**
 * Cap space a team keeps through free agency for its draft class: its picks' rookie deals in this league
 * year, and its undrafted rookies at the minimum.
 */
export function rookieReserve(league: League, abbr: TeamAbbr, order: readonly TeamAbbr[] = draftOrder(league)): number {
  const year = leagueYear(league.date);
  const slot = order.indexOf(abbr);
  let total = O.udfaPerTeam * minimumSalary(league.rules, 0);
  for (let round = 1; round <= league.rules.season.draftRounds; round++) {
    const deal = rookieContract(league.rules, { id: 'reserve', playerId: '', team: abbr }, year, (round - 1) * order.length + slot + 1);
    total += capHit(deal, year, league.rules);
  }
  return total;
} // prettier-ignore

/** A spot on the team's roster: a jersey number nobody there wears. */
function jerseyFor(league: League, player: Player, team: TeamAbbr, rng: Rng): number {
  const taken = new Set(activeRoster(league, team).map(p => p.jersey));
  return pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
}

/** This year's class of prospects, added to the league as free agents who haven't been drafted. */
function prospects(league: League, names: NameData, rng: Rng): Player[] {
  const year = leagueYear(league.date);
  const positions = ACTIVE_ROSTER.map(([p]) => p);
  const weights = ACTIVE_ROSTER.map(([, n]) => n);
  const usedNames = new Set(Object.values(league.players).map(fullName));
  const ctx = { rng, names, season: year, usedNames, newId: () => newId(league, 'p') };
  const [mean, spread] = O.classQuality;
  return Array.from({ length: O.classSize }, () => {
    const position = rng.weighted(positions, weights) as Position;
    const player = generatePlayer(ctx, {
      position,
      quality: rng.normal(mean + O.classQualityByGroup[POSITION_GROUP[position]], spread),
      age: rng.int(O.classAge[0], O.classAge[1]),
      team: null,
      status: 'freeAgent'
    });
    Object.assign(player, { experience: 0, accrued: 0, draft: { year, undrafted: true }, jersey: 0 });
    league.players[player.id] = player;
    return player;
  });
}

/** Signs a rookie to a team on his first contract. */
function signRookie(league: League, player: Player, team: TeamAbbr, contractId: string, rng: Rng): void {
  player.jersey = jerseyFor(league, player, team, rng);
  Object.assign(player, { team, status: 'active', contractId });
}

/**
 * Generates the class and runs the draft: every team's picks, on rookie scale deals. Returns the picks in
 * order; the prospects nobody took stay in the league as undrafted free agents.
 */
export function standInDraft(league: League, names: NameData, rng: Rng): DraftPick[] {
  const year = leagueYear(league.date);
  const order = draftOrder(league);
  const board = prospects(league, names, rng)
    .map(p => ({ p, value: O.draftPotentialWeight * p.potential + (1 - O.draftPotentialWeight) * p.ovr + rng.normal(0, O.draftNoise) }))
    .sort((a, b) => b.value - a.value || (a.p.id < b.p.id ? -1 : 1))
    .map(e => e.p); // prettier-ignore
  const picks: DraftPick[] = [];
  for (let round = 1; round <= league.rules.season.draftRounds; round++)
    order.forEach((team, i) => {
      const player = board.shift();
      if (!player) return;
      const pick = (round - 1) * order.length + i + 1;
      const contract = rookieContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team }, year, pick);
      league.contracts[contract.id] = contract;
      player.draft = { year, round, pick, team };
      signRookie(league, player, team, contract.id, rng);
      recordTransaction(league, team, 'drafted', player.id, `round ${round}, pick ${pick}`);
      picks.push({ playerId: player.id, team, round, pick });
    }); // prettier-ignore
  return picks;
}

/**
 * After the draft, each AI team (and the user's, when its roster management is on auto) signs the best
 * undrafted rookies left, a round at a time in draft order, while it has room under the offseason limit.
 */
export function signUndrafted(league: League, rng: Rng): Player[] {
  const year = leagueYear(league.date);
  const user = league.settings.auto.roster ? null : league.meta.start.userTeam;
  const order = draftOrder(league).filter(t => t !== user);
  const board = freeAgents(league)
    .filter(p => p.experience === 0 && 'undrafted' in p.draft && p.draft.year === year)
    .sort((a, b) => b.potential - a.potential || b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  const signed: Player[] = [];
  for (let round = 0; round < O.udfaPerTeam; round++)
    for (const team of order) {
      if (activeRoster(league, team).length >= league.rules.roster.offseason) continue;
      const player = board.shift();
      if (!player) return signed;
      const bonus = Math.round(rng.int(O.udfaBonus[0], O.udfaBonus[1]) / 1000) * 1000;
      const contract = udfaContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team }, year, bonus);
      league.contracts[contract.id] = contract;
      signRookie(league, player, team, contract.id, rng);
      recordTransaction(league, team, 'signed', player.id, 'an undrafted rookie');
      signed.push(player);
    } // prettier-ignore
  return signed;
}
