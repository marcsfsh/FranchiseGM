/**
 * A stand-in draft until M11's (D-27): the class made a season ago (D-41) is drafted for the rule set's
 * rounds in reverse order of last season's finish, each team taking the prospect it values most as the
 * consensus sees him, on rookie scale deals; the rest are undrafted free agents, and after the draft each
 * AI team signs the best of them. M11 replaces this with scouting, the draft room, and the UDFA scramble.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capHit } from '../contracts/cap';
import { rookieContract, udfaContract } from '../contracts/build';
import { generateClass, perceivedValue, type Prospect } from '../draft/class';
import { issueNextYear, numberDraft, picksIn } from '../draft/picks';
import { activeRoster, freeAgents, newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import type { Player } from '../model/player';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { PLAYOFF_PHASES, leagueStandings } from '../season/state';
import { winPct } from '../season/standings';
import { TUNING } from '../tuning';
import type { NameData } from './player';

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
 * Cap space a team keeps through free agency for its draft class: the rookie deals of the picks it holds in
 * this league year's draft, and its undrafted rookies at the minimum. A pick not yet numbered is placed by
 * `order`.
 */
export function rookieReserve(league: League, abbr: TeamAbbr, order: readonly TeamAbbr[] = draftOrder(league)): number {
  const year = leagueYear(league.date);
  let total = O.udfaPerTeam * minimumSalary(league.rules, 0);
  for (const p of league.picks)
    if (p.year === year && p.owner === abbr && !p.playerId) {
      const number = p.number ?? (p.round - 1) * order.length + order.indexOf(p.original) + 1;
      total += capHit(rookieContract(league.rules, { id: 'reserve', playerId: '', team: abbr }, year, number), year, league.rules);
    }
  return total;
} // prettier-ignore

/** A spot on the team's roster: a jersey number nobody there wears. */
function jerseyFor(league: League, player: Player, team: TeamAbbr, rng: Rng): number {
  const taken = new Set(activeRoster(league, team).map(p => p.jersey));
  return pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
}

/**
 * This year's class, its prospects added to the league as free agents who haven't been drafted: the class
 * made a season ago (D-41), or one made now if the league has none for this year.
 */
function prospects(league: League, names: NameData, rng: Rng): Prospect[] {
  const year = leagueYear(league.date);
  const made = league.draft?.year === year ? league.draft : generateClass(league, year, { names, rng, newId: () => newId(league, 'p') }, rng);
  league.draft = null;
  for (const p of made.prospects) league.players[p.player.id] = p.player;
  return made.prospects;
} // prettier-ignore

/** Signs a rookie to a team on his first contract. */
function signRookie(league: League, player: Player, team: TeamAbbr, contractId: string, rng: Rng): void {
  player.jersey = jerseyFor(league, player, team, rng);
  Object.assign(player, { team, status: 'active', contractId });
}

/**
 * Runs the draft on the year's pick records, each taken by the team holding it, on rookie scale deals; then
 * teams get their picks three drafts on. Returns the picks in order; the prospects nobody took stay in the
 * league as undrafted free agents.
 */
export function standInDraft(league: League, names: NameData, rng: Rng): DraftPick[] {
  const year = leagueYear(league.date);
  if (picksIn(league, year).some(p => p.number === null)) numberDraft(league, year, draftOrder(league));
  const board = prospects(league, names, rng)
    .map(p => ({ p: p.player, value: perceivedValue(p) + rng.normal(0, O.draftNoise) }))
    .sort((a, b) => b.value - a.value || (a.p.id < b.p.id ? -1 : 1))
    .map(e => e.p); // prettier-ignore
  const picks: DraftPick[] = [];
  for (const record of picksIn(league, year)) {
    const player = board.shift();
    if (!player) break;
    const { owner: team, round } = record;
    const pick = record.number as number;
    const contract = rookieContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team }, year, pick);
    league.contracts[contract.id] = contract;
    player.draft = { year, round, pick, team };
    record.playerId = player.id;
    signRookie(league, player, team, contract.id, rng);
    recordTransaction(league, team, 'drafted', player.id, `round ${round}, pick ${pick}`);
    picks.push({ playerId: player.id, team, round, pick });
  } // prettier-ignore
  issueNextYear(league, year);
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
