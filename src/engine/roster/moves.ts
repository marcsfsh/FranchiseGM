/**
 * Roster transactions (spec 19.4, 12.1): signing free agents to the active roster or the practice squad,
 * releases (with the June 1 option, through waivers when the rules say so), injured reserve and returns
 * from the reserve lists, practice squad promotions and elevations, waiver claims, and restructures. Every
 * move is checked first and previews its effect on the cap and the roster, or says why it can't be made;
 * the user's screens and the AI make their moves through the same functions.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { capFacts, capSheet } from '../cap/sheet';
import { offerProblem } from '../contracts/acceptance';
import { offerContract, practiceSquadSigning, type Offer } from '../contracts/build';
import { afterJune1, capCharge, capHit, payWeek, releaseImpact } from '../contracts/cap';
import { endContract, restructure, type Outcome } from '../contracts/moves';
import type { Contract } from '../contracts/types';
import {
  gamesOnReserve,
  irReturnsUsed,
  newId,
  recordTransaction,
  type TransactionKind
} from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import { fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { cannotPlay, designation } from '../season/injuries';
import { gameWeek, PLAYOFF_PHASES, weekGames } from '../season/state';
import { dollars, plural, possessive } from '../text';
import { elevatedThisWeek, elevationsThisSeason, practiceSquadVeteran, rosterCounts } from './rules';
import { claimProblem, placeOnWaivers, subjectToWaivers } from './waivers';

export type { Offer };

export type Move =
  | { kind: 'sign'; team: TeamAbbr; playerId: string; offer: Offer }
  | { kind: 'signPracticeSquad'; team: TeamAbbr; playerId: string }
  | { kind: 'release'; team: TeamAbbr; playerId: string; designated?: boolean }
  | { kind: 'injuredReserve'; team: TeamAbbr; playerId: string }
  | { kind: 'activate'; team: TeamAbbr; playerId: string }
  | { kind: 'promote'; team: TeamAbbr; playerId: string }
  | { kind: 'elevate'; team: TeamAbbr; playerId: string }
  | { kind: 'claim'; team: TeamAbbr; playerId: string }
  | { kind: 'restructure'; team: TeamAbbr; playerId: string; amount: number; voidYears?: number };

export interface MovePreview {
  /** The league year whose cap the move changes now. */
  year: number;
  /** Cap space this league year before and after the move. */
  spaceBefore: number;
  spaceAfter: number;
  /** Dead money the move leaves this league year and next. */
  deadNow: number;
  deadNext: number;
  /** The active roster and its limit, and the practice squad, after the move. */
  active: number;
  limit: number;
  practice: number;
  /** What happens, in sentences. */
  notes: string[];
}

interface Plan {
  preview: MovePreview;
  apply: (rng: Rng) => void;
}

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: string): Outcome<T> => ({ ok: false, reason });

const PRACTICE_SQUAD_PHASES = new Set<string>(['cutdown', 'regularSeason', ...PLAYOFF_PHASES]);
const RESERVE = new Set<Player['status']>(['ir', 'pup', 'nfi', 'suspended']);

/** The weekly pay a practice squad player signs for: the minimum, or the veterans' minimum. */
const practiceSquadPay = (league: League, player: Player): number =>
  practiceSquadVeteran(league, player)
    ? league.rules.pay.practiceSquadVeteranWeeklyMin
    : league.rules.pay.practiceSquadWeekly;

/** A practice squad deal from today through the season, at the weekly rate. */
const practiceSquadDeal = (league: League, player: Player, team: TeamAbbr, id: string): Contract =>
  practiceSquadSigning(
    league.rules,
    { id, playerId: player.id, team },
    league.date,
    practiceSquadPay(league, player)
  );

/** Gives a player a free jersey number on his new team. */
function fitJersey(league: League, player: Player, team: TeamAbbr, rng: Rng): void {
  const taken = new Set(
    Object.values(league.players)
      .filter(p => p.team === team && p.id !== player.id)
      .map(p => p.jersey)
  );
  if (taken.has(player.jersey)) player.jersey = pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
}

/** Joins a player to a team on a new contract. */
function join(league: League, player: Player, team: TeamAbbr, contract: Contract, status: Player['status'], rng: Rng) {
  league.contracts[contract.id] = contract;
  fitJersey(league, player, team, rng);
  player.team = team;
  player.status = status;
  player.contractId = contract.id;
} // prettier-ignore

function log(league: League, team: TeamAbbr, kind: TransactionKind, player: Player): void {
  recordTransaction(league, team, kind, player.id);
}

/** June 1 designations the team has used this league year. */
export function june1Used(league: League, team: TeamAbbr): number {
  const year = leagueYear(league.date);
  return Object.values(league.contracts).filter(
    c => c.team === team && c.ended?.designated && leagueYear(c.ended.date) === year
  ).length;
}

/** Whether a released player is owed the rest of his season's base: a vested veteran on the week 1 roster. */
function owedTerminationPay(league: League, player: Player, contract: Contract): boolean {
  const { date, rules } = league;
  const inSeason =
    (date.phase === 'regularSeason' && date.week >= 2) || (PLAYOFF_PHASES as readonly string[]).includes(date.phase);
  return (
    inSeason &&
    player.experience >= rules.roster.vestedVeteranSeasons &&
    payWeek(contract.signed, leagueYear(date), rules) === 1
  );
} // prettier-ignore

function plan(league: League, move: Move): Outcome<Plan> {
  const player = league.players[move.playerId];
  if (!player) return refuse('That player is no longer in the league.');
  const { rules } = league;
  const team = move.team;
  const name = fullName(player);
  const year = leagueYear(league.date);
  const counts = rosterCounts(league, team);
  const before = capSheet(league, team).space;
  const contract = player.contractId ? league.contracts[player.contractId] : undefined;
  const preview = (change: Partial<MovePreview>): MovePreview => ({
    year,
    spaceBefore: before,
    spaceAfter: before,
    deadNow: 0,
    deadNext: 0,
    active: counts.active,
    limit: counts.limit,
    practice: counts.practice,
    notes: [],
    ...change
  });
  const ownPlayer = player.team === team;
  const roomOnRoster = () =>
    counts.active < counts.limit
      ? null
      : `Your active roster is full (${counts.limit}): release or move a player first.`;
  const capRoom = (charge: number) =>
    charge <= before
      ? null
      : `His ${year} cap hit of ${dollars(charge)} is more than your ${dollars(Math.max(0, before))} of cap space.`;

  switch (move.kind) {
    case 'sign': {
      if (player.status !== 'freeAgent' || player.team) return refuse(`${name} isn't a free agent.`);
      const declined = offerProblem(league, player, move.offer);
      if (declined) return refuse(declined);
      const full = roomOnRoster();
      if (full) return refuse(full);
      const deal = offerContract(rules, { id: 'preview', playerId: player.id, team }, league.date, move.offer, player.experience);
      const charge = capHit(deal, year, rules);
      const over = capRoom(charge);
      if (over) return refuse(over);
      return ok({
        preview: preview({
          spaceAfter: before - charge,
          active: counts.active + 1,
          notes: [`${name} signs for ${plural(move.offer.years, 'year')}.`]
        }),
        apply: rng => {
          join(league, player, team, { ...deal, id: newId(league, 'c') }, 'active', rng);
          log(league, team, 'signed', player);
        }
      });
    } // prettier-ignore

    case 'signPracticeSquad': {
      if (player.status !== 'freeAgent' || player.team) return refuse(`${name} isn't a free agent.`);
      if (!PRACTICE_SQUAD_PHASES.has(league.date.phase)) return refuse('Practice squads form after the final cutdown.');
      const r = rules.roster;
      if (counts.practice >= r.practiceSquad) return refuse(`Your practice squad is full (${r.practiceSquad}).`);
      if (practiceSquadVeteran(league, player) && counts.practiceVeterans >= r.practiceSquadVeterans)
        return refuse(
          `Your practice squad already has ${r.practiceSquadVeterans} players with more than ${plural(r.practiceSquadVeteranSeasons, 'accrued season')}.`
        );
      const deal = practiceSquadDeal(league, player, team, 'preview');
      const charge = capHit(deal, year, rules);
      const over = capRoom(charge);
      if (over) return refuse(over);
      return ok({
        preview: preview({
          spaceAfter: before - charge,
          practice: counts.practice + 1,
          notes: [`${name} joins the practice squad at ${dollars(deal.weeklyPay)} a week.`]
        }),
        apply: rng => {
          join(league, player, team, practiceSquadDeal(league, player, team, newId(league, 'c')), 'practice', rng);
          log(league, team, 'practiceSquad', player);
        }
      });
    } // prettier-ignore

    case 'release': {
      if (!ownPlayer || !contract) return refuse(`${name} isn't on your roster.`);
      if (player.status !== 'active' && player.status !== 'practice' && !RESERVE.has(player.status))
        return refuse(`${name} can't be released from ${player.status}.`);
      const squad = player.status === 'practice';
      const designated = move.designated ?? false;
      if (designated) {
        if (squad) return refuse('A June 1 designation is for players on the roster.');
        if (afterJune1(league.date)) return refuse('After June 1 every release splits its dead money already.');
        if (june1Used(league, team) >= rules.pay.june1Designations)
          return refuse(`You've used your ${plural(rules.pay.june1Designations, 'June 1 designation')} this league year.`);
      }
      const injured = !squad && cannotPlay(designation(player.injury));
      const terminationPay = !squad && owedTerminationPay(league, player, contract);
      const facts = capFacts(league, player.id);
      const impact = releaseImpact(contract, league.date, rules, { designated, injured, terminationPay }, facts);
      const after = before + impact.savings;
      if (impact.savings < 0 && after < 0)
        return refuse(
          `Releasing him now leaves ${dollars(-impact.savings)} more on this year's cap, which would put you over it. A June 1 designation moves most of it to next year.`
        );
      const waived = subjectToWaivers(league, player);
      const notes = [
        waived
          ? `${name} goes on waivers: another team can claim him before the next game, taking over his contract.`
          : `${name} becomes a free agent.`
      ];
      if (injured) notes.push('He is hurt, so his injury guarantees are owed.');
      if (terminationPay) notes.push("As a vested veteran on the week 1 roster, he's owed the rest of this season's salary.");
      return ok({
        preview: preview({
          spaceAfter: after,
          deadNow: impact.deadNow,
          deadNext: impact.deadNext,
          active: counts.active - (player.status === 'active' ? 1 : 0),
          practice: counts.practice - (squad ? 1 : 0),
          notes
        }),
        apply: () => {
          league.contracts[contract.id] = endContract(contract, {
            date: { ...league.date },
            how: 'released',
            designated,
            injured,
            terminationPay
          });
          league.season.elevations = league.season.elevations.filter(
            e => !(e.playerId === player.id && e.week === gameWeek(league))
          );
          league.teams[team].resting = league.teams[team].resting.filter(id => id !== player.id);
          log(league, team, 'released', player);
          if (waived) placeOnWaivers(league, player, team, contract.id);
          else Object.assign(player, { team: null, status: 'freeAgent', contractId: null });
        }
      });
    } // prettier-ignore

    case 'injuredReserve': {
      if (!ownPlayer || player.status !== 'active') return refuse(`${name} isn't on your active roster.`);
      if (!cannotPlay(designation(player.injury))) return refuse('Only a player too hurt to play can go on injured reserve.');
      return ok({
        preview: preview({
          active: counts.active - 1,
          notes: [
            `${name} must miss at least ${plural(rules.roster.irMinGames, 'game')}; bringing him back uses one of your ${rules.roster.irReturns} returns.`
          ]
        }),
        apply: () => {
          player.status = 'ir';
          log(league, team, 'injuredReserve', player);
        }
      });
    } // prettier-ignore

    case 'activate': {
      if (!ownPlayer || !['ir', 'pup', 'nfi'].includes(player.status)) return refuse(`${name} isn't on a reserve list.`);
      if ((player.injury?.weeksOut ?? 0) > 0) return refuse(`${name} isn't healthy yet.`);
      if (player.status === 'ir') {
        const missed = gamesOnReserve(league, player);
        if (missed < rules.roster.irMinGames)
          return refuse(`${name} has missed ${missed} of the ${rules.roster.irMinGames} games injured reserve requires.`);
        if (irReturnsUsed(league, team) >= rules.roster.irReturns)
          return refuse(`You've used all ${rules.roster.irReturns} returns from injured reserve this season.`);
      } else {
        const played = Object.values(league.season.results).filter(g => !g.playoff && (g.home === team || g.away === team)).length;
        if (league.date.phase === 'regularSeason' && played < rules.roster.pupMinGames)
          return refuse(`Players on this list miss at least ${plural(rules.roster.pupMinGames, 'game')}.`);
      }
      const full = roomOnRoster();
      if (full) return refuse(full);
      return ok({
        preview: preview({ active: counts.active + 1, notes: [`${name} returns to the active roster.`] }),
        apply: () => {
          player.status = 'active';
          log(league, team, 'activated', player);
        }
      });
    } // prettier-ignore

    case 'promote': {
      if (!ownPlayer || player.status !== 'practice' || !contract) return refuse(`${name} isn't on your practice squad.`);
      const full = roomOnRoster();
      if (full) return refuse(full);
      const deal = offerContract(rules, { id: 'preview', playerId: player.id, team }, league.date, { years: 1, salary: minimumSalary(rules, player.experience), signingBonus: 0 }, player.experience);
      const ended = endContract(contract, { date: { ...league.date }, how: 'replaced', designated: false, injured: false, terminationPay: false });
      const charge = capHit(deal, year, rules) - (capHit(contract, year, rules) - capHit(ended, year, rules));
      const over = capRoom(charge);
      if (over) return refuse(over);
      return ok({
        preview: preview({
          spaceAfter: before - charge,
          active: counts.active + 1,
          practice: counts.practice - 1,
          notes: [`${name} signs to the active roster at the minimum salary.`]
        }),
        apply: rng => {
          league.contracts[contract.id] = ended;
          join(league, player, team, { ...deal, id: newId(league, 'c') }, 'active', rng);
          log(league, team, 'promoted', player);
        }
      });
    } // prettier-ignore

    case 'elevate': {
      if (!ownPlayer || player.status !== 'practice') return refuse(`${name} isn't on your practice squad.`);
      const game = weekGames(league).find(g => g.home === team || g.away === team);
      if (!game) return refuse('Your team has no game left to play this week.');
      const r = rules.roster;
      const elevated = elevatedThisWeek(league, team);
      if (elevated.includes(player.id)) return refuse(`${name} is already elevated for this game.`);
      if (elevated.length >= r.elevationsPerGame) return refuse(`You can elevate ${r.elevationsPerGame} players a game.`);
      if (elevationsThisSeason(league, player.id) >= r.elevationsPerPlayer)
        return refuse(`${name} has been elevated ${plural(r.elevationsPerPlayer, 'time')} this season; sign him to the roster instead.`);
      return ok({
        preview: preview({ notes: [`${name} can dress for this week's game, then returns to the practice squad.`] }),
        apply: () => {
          league.season.elevations.push({ playerId: player.id, team, week: game.week });
          log(league, team, 'elevated', player);
        }
      });
    } // prettier-ignore

    case 'claim': {
      const entry = league.waivers.find(w => w.playerId === player.id);
      if (!entry) return refuse(`${name} isn't on waivers.`);
      if (entry.claims.includes(team)) return refuse(`You've already claimed ${name}.`);
      const problem = claimProblem(league, team, entry);
      if (problem) return refuse(problem);
      return ok({
        preview: preview({
          notes: [`Claims are awarded in waiver order when the week is played; the winner takes over his contract.`]
        }),
        apply: () => {
          entry.claims.push(team);
        }
      });
    } // prettier-ignore

    case 'restructure': {
      if (!ownPlayer || !contract || contract.ended) return refuse(`${name} isn't under contract with you.`);
      const done = restructure(contract, league.date, move.amount, minimumSalary(rules, player.experience), rules, move.voidYears ?? 0);
      if (!done.ok) return done;
      const facts = capFacts(league, player.id);
      const now = capCharge(contract, year, rules, facts).total - capCharge(done.value, year, rules, facts).total;
      return ok({
        preview: preview({
          spaceAfter: before + now,
          notes: [`${dollars(move.amount)} of ${possessive(name)} salary becomes a bonus spread over ${plural(done.value.restructures.at(-1)?.prorationYears.length ?? 1, 'year')}.`]
        }),
        apply: () => {
          league.contracts[contract.id] = done.value;
          log(league, team, 'restructured', player);
        }
      });
    } // prettier-ignore
  }
}

/** What a move would do, or why it can't be made. */
export function previewMove(league: League, move: Move): Outcome<MovePreview> {
  const p = plan(league, move);
  return p.ok ? ok(p.value.preview) : p;
}

/** Makes a move after checking it, returning its preview, or why it can't be made. */
export function makeMove(league: League, move: Move, rng: Rng): Outcome<MovePreview> {
  const p = plan(league, move);
  if (!p.ok) return p;
  p.value.apply(rng);
  return ok(p.value.preview);
}
