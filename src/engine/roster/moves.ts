/**
 * Roster transactions (spec 19.4, 12.1): signing free agents to the active roster or the practice squad,
 * releases (with the June 1 option, through waivers when the rules say so), injured reserve and returns
 * from the reserve lists, practice squad promotions and elevations, waiver claims, and restructures. Every
 * move is checked first and previews its effect on the cap and the roster, or says why it can't be made;
 * the user's screens and the AI make their moves through the same functions. An offer in talks (spec 11.6)
 * hears the player's answer only when it's made.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { capFacts, capSheet, elevationCost, type SheetChange } from '../cap/sheet';
import { offerProblem } from '../contracts/acceptance';
import {
  extensionContract,
  offerContract,
  practiceSquadSigning,
  rightsContract,
  termsProblem,
  type Offer
} from '../contracts/build';
import { afterJune1, capHit, payWeek, releaseImpact } from '../contracts/cap';
import { endContract, restructure, type Outcome } from '../contracts/moves';
import { endDemand } from '../contracts/holdouts';
import { hear, replyWords, talks } from '../contracts/negotiation';
import {
  creditedNextYear,
  endPending,
  expiring,
  extensionProblem,
  optionOpen,
  optionSalary,
  TAG_LABELS,
  tagSalary,
  tagUsed,
  TENDER_LABELS,
  tenderLevels,
  tenderSalary,
  type TagKind,
  type TenderLevel
} from '../contracts/resign';
import { emptyYear, type Contract } from '../contracts/types';
import { scrambleOpen, undraftedRookies } from '../draft/udfa';
import {
  gamesOnReserve,
  irReturnsUsed,
  newId,
  recordTransaction,
  type TransactionKind
} from '../league/transactions';
import type { League } from '../league/types';
import { popular, releaseMorale } from '../locker/room';
import { leagueYear } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import { fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { cannotPlay, designation } from '../season/injuries';
import { gameWeek, PLAYOFF_PHASES, weekGames } from '../season/state';
import { dollars, plural, possessive } from '../text';
import { elevatedThisWeek, elevationsThisSeason, practiceSquadVeteran, rosterCounts } from './rules';
import { claimedContract, claimProblem, placeOnWaivers, subjectToWaivers } from './waivers';
import { putContract } from '../league/contract-index';

export type { Offer };

/**
 * A roster move; `reason` says why for the transaction log (post-M42 section 1.1). An offer with `talks` is
 * the user's in negotiation (spec 11.6): its preview leaves out the player's answer, which he gives only
 * when the move is made; other offers are judged at the market (spec 11.7).
 */
export type Move = (
  | { kind: 'sign'; team: TeamAbbr; playerId: string; offer: Offer; talks?: boolean }
  | { kind: 'signPracticeSquad'; team: TeamAbbr; playerId: string }
  | { kind: 'release'; team: TeamAbbr; playerId: string; designated?: boolean }
  | { kind: 'injuredReserve'; team: TeamAbbr; playerId: string }
  | { kind: 'activate'; team: TeamAbbr; playerId: string }
  | { kind: 'promote'; team: TeamAbbr; playerId: string }
  | { kind: 'elevate'; team: TeamAbbr; playerId: string }
  | { kind: 'claim'; team: TeamAbbr; playerId: string }
  | { kind: 'restructure'; team: TeamAbbr; playerId: string; amount: number; voidYears?: number }
  | { kind: 'extend'; team: TeamAbbr; playerId: string; offer: Offer; talks?: boolean }
  | { kind: 'tag'; team: TeamAbbr; playerId: string; tag: TagKind }
  | { kind: 'tender'; team: TeamAbbr; playerId: string; level: TenderLevel }
  | { kind: 'option'; team: TeamAbbr; playerId: string; exercise: boolean }
) & { reason?: string };

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
  /** For an offer in talks: what happens once he takes it, in sentences. */
  taken?: string[];
}

export interface MoveOptions {
  /**
   * Whether the cap and the roster sizes bind the move: always for the AI, and for the user unless the
   * league's rule enforcement is off (post-M23 2.10.1; D-46).
   */
  enforce?: boolean;
}

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = <T>(reason: string): Outcome<T> => ({ ok: false, reason });

const PRACTICE_SQUAD_PHASES = new Set<string>(['cutdown', 'regularSeason', ...PLAYOFF_PHASES]);
const RESERVE = new Set<Player['status']>(['ir', 'pup', 'nfi', 'suspended', 'holdout']);

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
  putContract(league, contract);
  fitJersey(league, player, team, rng);
  if (player.team !== team) player.joined = leagueYear(league.date);
  player.team = team;
  player.status = status;
  player.contractId = contract.id;
} // prettier-ignore

function log(league: League, team: TeamAbbr, kind: TransactionKind, player: Player, reason?: string): void {
  recordTransaction(league, team, kind, player.id, reason);
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
    player.accrued >= rules.roster.vestedVeteranSeasons &&
    payWeek(contract.signed, leagueYear(date), rules) === 1
  );
} // prettier-ignore

function plan(league: League, move: Move, enforce: boolean): Outcome<Plan> {
  if (move.kind === 'extend' || move.kind === 'tag' || move.kind === 'tender' || move.kind === 'option')
    return resignPlan(league, move, enforce);
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
    counts.active < counts.limit || !enforce
      ? null
      : `Your active roster is full (${counts.limit}): release or move a player first.`;
  // Cap space after a move, by the same sheet as the team's (the rule of 51 included).
  const spaceWith = (change: SheetChange) => capSheet(league, team, year, change).space;
  // A move that adds to the cap (a signing, promotion, elevation, or claim) must leave the team under it,
  // whatever its space before: under the rule of 51 a cheap signing can leave the sheet unchanged. A move
  // that frees space is always allowed, and one that moves money without adding to the cap is allowed
  // unless it leaves an over-the-cap team with less room (D-46).
  const overCap = (after: number, adds = false) => enforce && after < 0 && (adds || after < before);
  const capRoom = (charge: number, after: number) =>
    !overCap(after, true)
      ? null
      : before < 0
        ? `You're ${dollars(-before)} over the ${year} cap. Get under it with a release or a restructure before you add to it.`
        : `His ${year} cap hit of ${dollars(charge)} is more than your ${dollars(before)} of cap space.`;

  switch (move.kind) {
    case 'sign': {
      if (player.status !== 'freeAgent' || player.team) return refuse(`${name} isn't a free agent.`);
      if (scrambleOpen(league) && undraftedRookies(league).includes(player))
        return refuse(`${name} is weighing offers from teams until the undrafted free agents step ends. Offer him a signing bonus in Undrafted rookies instead.`); // prettier-ignore
      if (move.talks && talks(league, team, player.id).closed) return refuse(replyWords({ kind: 'closed' }));
      const declined = move.talks ? termsProblem(rules, move.offer, minimumSalary(rules, player.experience)) : offerProblem(league, player, move.offer, team);
      if (declined) return refuse(declined);
      const full = roomOnRoster();
      if (full) return refuse(full);
      const deal = offerContract(rules, { id: 'preview', playerId: player.id, team }, league.date, move.offer, player.experience);
      const after = spaceWith({ add: [{ contract: deal, status: 'active' }] });
      const over = capRoom(capHit(deal, year, rules), after);
      if (over) return refuse(over);
      const signs = `${name} signs for ${plural(move.offer.years, 'year')}.`;
      return ok({
        preview: preview({
          spaceAfter: after,
          active: counts.active + 1,
          notes: [move.talks ? `He answers when you send the offer. If he takes it, he signs for ${plural(move.offer.years, 'year')}.` : signs]
        }),
        taken: [`${name} takes your offer and signs for ${plural(move.offer.years, 'year')}.`],
        apply: rng => {
          join(league, player, team, { ...deal, id: newId(league, 'c') }, 'active', rng);
          log(league, team, 'signed', player, move.reason);
        }
      });
    } // prettier-ignore

    case 'signPracticeSquad': {
      if (player.status !== 'freeAgent' || player.team) return refuse(`${name} isn't a free agent.`);
      if (!PRACTICE_SQUAD_PHASES.has(league.date.phase)) return refuse('Practice squads form after the final cutdown.');
      const r = rules.roster;
      if (counts.practice >= r.practiceSquad && enforce) return refuse(`Your practice squad is full (${r.practiceSquad}).`);
      if (practiceSquadVeteran(league, player) && counts.practiceVeterans >= r.practiceSquadVeterans && enforce)
        return refuse(
          `Your practice squad already has ${r.practiceSquadVeterans} players with more than ${plural(r.practiceSquadVeteranSeasons, 'accrued season')}.`
        );
      const deal = practiceSquadDeal(league, player, team, 'preview');
      const after = spaceWith({ add: [{ contract: deal, status: 'practice' }] });
      const over = capRoom(capHit(deal, year, rules), after);
      if (over) return refuse(over);
      return ok({
        preview: preview({
          spaceAfter: after,
          practice: counts.practice + 1,
          notes: [`${name} joins the practice squad at ${dollars(deal.weeklyPay)} a week.`]
        }),
        apply: rng => {
          join(league, player, team, practiceSquadDeal(league, player, team, newId(league, 'c')), 'practice', rng);
          log(league, team, 'practiceSquad', player, move.reason);
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
        if (afterJune1(league.date, rules)) return refuse('After June 1 every release splits its dead money already.');
        if (june1Used(league, team) >= rules.pay.june1Designations)
          return refuse(`You've used your ${plural(rules.pay.june1Designations, 'June 1 designation')} this league year.`);
      }
      const injured = !squad && cannotPlay(designation(player.injury));
      const terminationPay = !squad && owedTerminationPay(league, player, contract);
      const facts = capFacts(league, player.id);
      const impact = releaseImpact(contract, league.date, rules, { designated, injured, terminationPay }, facts);
      const end = { date: { ...league.date }, how: 'released' as const, designated, injured, terminationPay };
      const after = spaceWith({ replace: [endContract(contract, end)] });
      if (overCap(after))
        return refuse(
          `Releasing him now leaves ${dollars(before - after)} more on this year's cap, which would put you over it. A June 1 designation moves most of it to next year.`
        );
      const waived = subjectToWaivers(league, player);
      const notes = [
        waived
          ? `${name} goes on waivers: another team can claim him before the next game, taking over his contract.`
          : `${name} becomes a free agent.`
      ];
      if (injured) notes.push('He is hurt, so his injury guarantees are owed.');
      if (popular(league, player)) notes.push(`${name} is a leader in your locker room: letting him go hurts his teammates' morale.`);
      if (terminationPay) notes.push("As a vested veteran on the week 1 roster, he's owed the rest of this season's salary.");
      // Under the CBA a June 1 release keeps its full charge until June 2, when the split takes effect.
      if (designated)
        notes.push(
          `His full cap hit stays on your ${year} cap until June 2. Then ${impact.savings >= 0 ? `${dollars(impact.savings)} comes off it` : `it grows by ${dollars(-impact.savings)}`}, and ${dollars(impact.deadNext)} of dead money moves to ${year + 1}.`
        );
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
          putContract(league, endContract(contract, end));
          endPending(league, player, end);
          league.season.elevations = league.season.elevations.filter(
            e => !(e.playerId === player.id && e.week === gameWeek(league))
          );
          league.teams[team].resting = league.teams[team].resting.filter(id => id !== player.id);
          endDemand(player, 'gone');
          log(league, team, 'released', player, move.reason);
          releaseMorale(league, team, player);
          if (waived) placeOnWaivers(league, player, team, contract.id);
          else Object.assign(player, { team: null, lastTeam: team, status: 'freeAgent', contractId: null });
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
          log(league, team, 'injuredReserve', player, move.reason);
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
          log(league, team, player.status === 'ir' ? 'activated' : 'reserveReturn', player, move.reason);
          player.status = 'active';
        }
      });
    } // prettier-ignore

    case 'promote': {
      if (!ownPlayer || player.status !== 'practice' || !contract) return refuse(`${name} isn't on your practice squad.`);
      const full = roomOnRoster();
      if (full) return refuse(full);
      const deal = offerContract(rules, { id: 'preview', playerId: player.id, team }, league.date, { years: 1, salary: minimumSalary(rules, player.experience), signingBonus: 0 }, player.experience);
      const ended = endContract(contract, { date: { ...league.date }, how: 'replaced', designated: false, injured: false, terminationPay: false });
      const after = spaceWith({ replace: [ended], add: [{ contract: deal, status: 'active' }] });
      const over = capRoom(capHit(deal, year, rules), after);
      if (over) return refuse(over);
      return ok({
        preview: preview({
          spaceAfter: after,
          active: counts.active + 1,
          practice: counts.practice - 1,
          notes: [`${name} signs to the active roster at the minimum salary.`]
        }),
        apply: rng => {
          putContract(league, ended);
          join(league, player, team, { ...deal, id: newId(league, 'c') }, 'active', rng);
          log(league, team, 'promoted', player, move.reason);
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
      // An elevated player earns the active minimum's week for the game (spec 12.1).
      const cost = elevationCost(league, player.id);
      const after = spaceWith({ elevate: player.id });
      if (overCap(after, true)) return refuse(before < 0 ? `You're ${dollars(-before)} over the ${year} cap. Get under it with a release or a restructure before you add to it.` : `His ${dollars(cost)} for the game is more than your ${dollars(before)} of cap space.`);
      return ok({
        preview: preview({
          spaceAfter: after,
          notes: [
            `${name} can dress for this week's game, then returns to the practice squad.`,
            `He earns ${dollars(cost)} more than his practice squad pay for the game.`
          ]
        }),
        apply: () => {
          league.season.elevations.push({ playerId: player.id, team, week: game.week });
          log(league, team, 'elevated', player, move.reason);
        }
      });
    } // prettier-ignore

    case 'claim': {
      const entry = league.waivers.find(w => w.playerId === player.id);
      if (!entry) return refuse(`${name} isn't on waivers.`);
      if (entry.claims.includes(team)) return refuse(`You've already claimed ${name}.`);
      const problem = claimProblem(league, team, entry, false, enforce);
      if (problem) return refuse(problem);
      const old = league.contracts[entry.contractId];
      const claimed = old ? claimedContract(old, team, 'preview', league.date, rules) : null;
      // The space he'd leave if he's awarded to you.
      const after = claimed ? spaceWith({ add: [{ contract: claimed, status: 'active' }] }) : before;
      return ok({
        preview: preview({
          spaceAfter: after,
          active: counts.active + 1,
          notes: [
            'Claims are awarded in waiver order when the week is played; the winner takes over his contract.',
            `If he's awarded to you, you'll have ${dollars(after)} of ${year} cap space.`
          ]
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
      const after = spaceWith({ replace: [done.value] });
      if (overCap(after)) return refuse(`The restructure would put you ${dollars(-after)} over the ${year} cap.`);
      return ok({
        preview: preview({
          spaceAfter: after,
          notes: [`${dollars(move.amount)} of ${possessive(name)} salary becomes a bonus spread over ${plural(done.value.restructures.at(-1)?.prorationYears.length ?? 1, 'year')}.`]
        }),
        apply: () => {
          putContract(league, done.value);
          log(league, team, 'restructured', player, move.reason);
        }
      });
    } // prettier-ignore
  }
}

/** Re-sign window moves (spec 11.4, 11.5): a deal that follows his current one, or his fifth-year option. */
function resignPlan(
  league: League,
  move: Extract<Move, { kind: 'extend' | 'tag' | 'tender' | 'option' }>,
  enforce: boolean
): Outcome<Plan> {
  const player = league.players[move.playerId];
  if (!player) return refuse('That player is no longer in the league.');
  const { rules } = league;
  const team = move.team;
  const name = fullName(player);
  const counts = rosterCounts(league, team);
  const year = leagueYear(league.date);
  if (player.team !== team) return refuse(`${name} isn't on your roster.`);
  const window = league.date.phase === 'resign';
  // A deal for next league year: its cap effect then, by the same sheet as the team's.
  const next = (contract: Contract, notes: string[], kind: TransactionKind, extra?: (id: string) => void): Outcome<Plan> => {
    const before = capSheet(league, team, year + 1).space;
    const after = capSheet(league, team, year + 1, { add: [{ contract, status: 'active' }] }).space;
    // A deal for next league year adds to its cap, so it must leave the team under it (D-46).
    if (after < 0 && enforce)
      return refuse(`His ${year + 1} salary of ${dollars(capHit(contract, year + 1, rules))} is more than your ${dollars(Math.max(0, before))} of ${year + 1} cap space.`);
    return ok({
      preview: { year: year + 1, spaceBefore: before, spaceAfter: after, deadNow: 0, deadNext: 0, active: counts.active, limit: counts.limit, practice: counts.practice, notes },
      apply: () => {
        const id = newId(league, 'c');
        putContract(league, { ...contract, id });
        player.nextContractId = id;
        extra?.(id);
        log(league, team, kind, player, move.reason);
      }
    });
  }; // prettier-ignore
  const base = { id: 'preview', playerId: player.id, team };

  switch (move.kind) {
    case 'extend': {
      if (!expiring(league, player)) return refuse(`${name}'s contract doesn't run out this league year.`);
      if (move.talks && talks(league, team, player.id).closed) return refuse(replyWords({ kind: 'closed' }));
      const declined = move.talks ? termsProblem(rules, move.offer, minimumSalary(rules, creditedNextYear(league, player))) : extensionProblem(league, player, move.offer);
      if (declined) return refuse(declined);
      const deal = extensionContract(rules, base, league.date, move.offer, creditedNextYear(league, player));
      const extension = `a ${move.offer.years}-year extension from ${year + 1}`;
      // A new deal ends a holdout or a trade request (spec 11.9).
      const planned = next(deal, [move.talks ? `He answers when you send the offer. If he takes it, he signs ${extension}.` : `${name} signs ${extension}.`], 'extended', () => endDemand(player, 'deal'));
      return planned.ok ? ok({ ...planned.value, taken: [`${name} takes your offer and signs ${extension}.`] }) : planned;
    } // prettier-ignore

    case 'tag': {
      if (!window) return refuse('Tags are for the re-sign window.');
      if (!expiring(league, player)) return refuse(`${name}'s contract doesn't run out this league year.`);
      if (tagUsed(league, team)) return refuse('You can tag one player a year, and you already have.');
      const salary = tagSalary(league, player, move.tag);
      const deal = { ...rightsContract(base, league.date, move.tag === 'transition' ? 'transitionTag' : 'franchiseTag', salary), rights: move.tag };
      const binds = move.tag === 'exclusive' ? 'No other team can talk to him.' : move.tag === 'nonExclusive' ? 'Other teams can make offers; you can match or take two first-round picks.' : 'Other teams can make offers; you can match.';
      return next(deal, [`${TAG_LABELS[move.tag]}: ${name} plays ${year + 1} for ${dollars(salary)}, fully guaranteed.`, binds], 'tagged');
    } // prettier-ignore

    case 'tender': {
      if (!window) return refuse('Tenders are for the re-sign window.');
      if (!expiring(league, player)) return refuse(`${name}'s contract doesn't run out this league year.`);
      if (!tenderLevels(league, player).includes(move.level)) return refuse(`${name} can't take a ${TENDER_LABELS[move.level].toLowerCase()}.`);
      const salary = tenderSalary(league, player, move.level);
      const deal = { ...rightsContract(base, league.date, 'rfaTender', salary), rights: move.level };
      return next(deal, [`${TENDER_LABELS[move.level]}: ${name} plays ${year + 1} for ${dollars(salary)} if nobody else signs him.`], 'tendered');
    } // prettier-ignore

    case 'option': {
      if (!window) return refuse('Fifth-year options are decided in the re-sign window.');
      if (!optionOpen(league, player)) return refuse(`${name} has no fifth-year option to decide.`);
      const contract = league.contracts[player.contractId ?? ''] as Contract;
      if (!move.exercise)
        return ok({
          preview: { year, spaceBefore: capSheet(league, team).space, spaceAfter: capSheet(league, team).space, deadNow: 0, deadNext: 0, active: counts.active, limit: counts.limit, practice: counts.practice, notes: [`${name} plays out his rookie deal and can be a free agent after ${year + 1}.`] },
          apply: () => {
            putContract(league, { ...contract, fifthYearOption: 'declined' });
            log(league, team, 'optionDeclined', player, move.reason);
          }
        });
      const option = optionSalary(league, player);
      const fifth = (contract.years.at(-1)?.year ?? year + 1) + 1;
      const exercised: Contract = { ...contract, fifthYearOption: 'exercised', years: [...contract.years, { ...emptyYear(fifth), base: option.salary, guaranteedBase: option.salary }] };
      const before = capSheet(league, team, fifth).space;
      const after = capSheet(league, team, fifth, { replace: [exercised] }).space;
      return ok({
        preview: { year: fifth, spaceBefore: before, spaceAfter: after, deadNow: 0, deadNext: 0, active: counts.active, limit: counts.limit, practice: counts.practice, notes: [`${name} is under contract through ${fifth} at ${dollars(option.salary)} that year, fully guaranteed.`] },
        apply: () => {
          putContract(league, exercised);
          log(league, team, 'optionExercised', player, move.reason);
        }
      });
    } // prettier-ignore
  }
}

/** What a move would do, or why it can't be made. */
export function previewMove(league: League, move: Move, options: MoveOptions = {}): Outcome<MovePreview> {
  const p = plan(league, move, options.enforce ?? true);
  return p.ok ? ok(p.value.preview) : p;
}

/**
 * Makes a move after checking it, returning its preview, or why it can't be made. An offer in talks is made
 * only if the player takes it: otherwise his answer, a counter or a no, is the reason (spec 11.6).
 */
export function makeMove(
  league: League,
  move: Move,
  rng: Rng,
  options: MoveOptions = {}
): Outcome<MovePreview> {
  const p = plan(league, move, options.enforce ?? true);
  if (!p.ok) return p;
  const player = league.players[move.playerId];
  if ((move.kind === 'sign' || move.kind === 'extend') && move.talks && player) {
    const reply = hear(league, move.team, player, move.offer, move.kind === 'extend');
    if (reply.kind !== 'accept') return refuse(replyWords(reply));
    p.value.apply(rng);
    return ok({ ...p.value.preview, notes: p.value.taken ?? p.value.preview.notes });
  }
  p.value.apply(rng);
  return ok(p.value.preview);
}
