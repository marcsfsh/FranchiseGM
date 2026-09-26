/**
 * Holdouts and trade demands (spec 10.9, 11.9; D-57). As training camp opens, a good player underpaid in
 * the last year of his deal may hold out for a new one: he goes on the list for players who didn't report,
 * fined per the CBA for the camp days and preseason games he misses when the setting is on, and missing
 * games (and their pay) after that, until his team extends him or he reports. A deeply unhappy player may
 * ask for a trade, at camp or in a game week; until M15's trades the request stands until a new deal, his
 * morale's recovery, or the new league year. The frequency setting scales both, and 0 turns them off.
 */
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../cap/sheet';
import { recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { clampMorale, isLeader, roomOf } from '../locker/room';
import { calendarDay, leagueYear } from '../model/calendar';
import { ageOn, fullName, type Player } from '../model/player';
import type { PauseEvent } from '../season/inbox';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { dollars } from '../text';
import { TUNING } from '../tuning';
import { typicalOffer } from './build';
import { marketValue } from './market';
import { settledSalary, termFor } from './negotiation';
import { expiring } from './resign';
import { worthIt } from './value';
import { contractSummary } from './view';

const H = TUNING.holdouts;

/**
 * A demand made or ended, for the inbox and the news: `cost` is what a holdout lost before he reported, and
 * `ended` the demand a new deal ended.
 */
export interface DemandEvent {
  player: Player;
  team: TeamAbbr;
  kind: 'holdout' | 'trade' | 'reported' | 'lapsed' | 'extended';
  cost?: number;
  ended?: 'holdout' | 'trade';
}

/** A trait's weight: 0.5 at 0, 1.5 at 100. */
const weigh = (trait: number): number => 0.5 + trait / 100;

/** What his deal pays a year against his market value now: 1 at his value, less when he's underpaid. */
export function payShare(league: League, player: Player): number {
  const contract = player.contractId ? league.contracts[player.contractId] : undefined;
  if (!contract) return 1;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const value = marketValue(league.rules, player.position, player.ovr, age, player.experience);
  return contractSummary(contract, league.date).apy / value;
}

/** The chance he holds out as camp opens (spec 11.9): a good player underpaid in his deal's last year. */
export function holdoutChance(league: League, player: Player): number {
  const frequency = league.settings.drama.holdouts;
  if (!frequency || player.status !== 'active' || player.demand || !player.team) return 0;
  if (player.ovr < H.minOvr || player.experience < H.minSeasons || !expiring(league, player)) return 0;
  const share = payShare(league, player);
  if (share >= H.underpaid) return 0;
  const traits = player.personality;
  const under = 1 - share / H.underpaid;
  return Math.min(1, H.rate * frequency * weigh(traits.greed) * (1 - (H.loyaltyDamp * traits.loyalty) / 100) * under);
} // prettier-ignore

/** The chance he asks for a trade at camp (spec 11.9), or in a game week with `weekly`: a deeply unhappy starter. */
export function tradeChance(league: League, player: Player, weekly = false): number {
  const frequency = league.settings.drama.holdouts;
  if (!frequency || player.demand || !player.team || player.status === 'practice') return 0;
  if (player.morale > H.tradeBelow || player.experience < H.tradeSeasons || player.ovr < H.tradeOvr) return 0;
  return Math.min(1, H.tradeRate * frequency * weigh(player.personality.ego) * (weekly ? H.tradeWeekly : 1));
}

/** Sets a demand. A holdout goes on the list for players who didn't report; a leader's costs his teammates. */
function demand(league: League, player: Player, kind: 'holdout' | 'trade'): void {
  player.demand = { kind, since: { ...league.date }, fines: 0 };
  if (kind !== 'holdout' || !player.team) return;
  player.status = 'holdout';
  recordTransaction(league, player.team, 'heldOut', player.id, 'holding out for a new deal');
  if (isLeader(player))
    for (const p of roomOf(league, player.team)) p.morale = clampMorale(p.morale - H.leaderRoom);
}

/** Demands as training camp opens: holdouts from the underpaid, and trade requests from the unhappy. */
export function campDemands(league: League, rng: Rng): DemandEvent[] {
  const events: DemandEvent[] = [];
  const players = Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of players) {
    if (!p.team) continue;
    const team = p.team;
    if (rng.float() < holdoutChance(league, p)) {
      demand(league, p, 'holdout');
      events.push({ player: p, team, kind: 'holdout' });
    } else if (rng.float() < tradeChance(league, p)) {
      demand(league, p, 'trade');
      events.push({ player: p, team, kind: 'trade' });
    }
  }
  return events;
}

/**
 * Ends a player's demand: with a new deal his morale lifts; reporting without one costs it. A holdout
 * rejoins the active roster.
 */
export function endDemand(player: Player, how: 'deal' | 'reported' | 'lapsed' | 'gone'): void {
  if (!player.demand) return;
  if (player.status === 'holdout') player.status = 'active';
  if (how === 'deal') player.morale = clampMorale(player.morale + H.dealMorale);
  if (how === 'reported') player.morale = clampMorale(player.morale - H.reportMorale);
  delete player.demand;
}

/**
 * What a holdout loses for the step that passed (CBA Article 42): the daily fine for each day of camp and a
 * week's pay for each preseason game while fines are on, and each game's pay, which isn't a fine.
 */
function costOf(league: League, player: Player, step: 'camp' | 'preseason' | 'game'): number {
  const contract = player.contractId ? league.contracts[player.contractId] : undefined;
  if (!contract) return 0;
  const week = Math.round(contractSummary(contract, league.date).apy / league.rules.season.weeks);
  if (step === 'game') return week;
  if (!league.settings.drama.fines) return 0;
  if (step === 'preseason') return week;
  const pay = league.rules.pay;
  return H.campDays * (contract.type === 'rookie' ? pay.holdoutFineDailyRookie : pay.holdoutFineDaily);
}

/**
 * A step passes for every demand: each holdout pays for what he missed and may report, and each trade
 * request lapses once his morale is back. In a game week, new trade requests may come. `step` names what
 * the holdouts missed.
 */
export function stepDemands(league: League, step: 'camp' | 'preseason' | 'game' | 'cutdown', rng: Rng): DemandEvent[] {
  const events: DemandEvent[] = [];
  const players = Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of players) {
    const team = p.team;
    if (!team) continue;
    const d = p.demand;
    if (d?.kind === 'holdout') {
      if (step !== 'cutdown') d.fines += costOf(league, p, step);
      const chance = H.report * (1.5 - p.personality.greed / 100) + (league.settings.drama.fines ? H.fined : 0);
      if (rng.float() < chance) {
        endDemand(p, 'reported');
        recordTransaction(league, team, 'reported', p.id, 'ending his holdout without a new deal');
        events.push({ player: p, team, kind: 'reported', cost: d.fines });
      }
    } else if (d?.kind === 'trade') {
      if (p.morale >= H.tradeLapse) {
        endDemand(p, 'lapsed');
        events.push({ player: p, team, kind: 'lapsed' });
      }
    } else if (step === 'game' && rng.float() < tradeChance(league, p, true)) {
      demand(league, p, 'trade');
      events.push({ player: p, team, kind: 'trade' });
    }
  }
  return events;
} // prettier-ignore

/**
 * The AI's answer to its holdouts and trade requests (D-57): an extension at its GM's price when he's worth
 * it (D-38) and next year's cap has room; otherwise it waits him out. `extend` makes the move.
 */
export function answerDemands(league: League, teams: readonly TeamAbbr[], extend: (team: TeamAbbr, player: Player, offer: { years: number; salary: number; signingBonus: number }) => boolean): DemandEvent[] {
  const year = leagueYear(league.date);
  const done: DemandEvent[] = [];
  for (const p of Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const team = p.team;
    if (!team || !p.demand || !teams.includes(team) || !expiring(league, p)) continue;
    const years = termFor(ageOn(p.birthDate, calendarDay(league.date)));
    const aav = settledSalary(league, p, team, years, true);
    const offer = typicalOffer(league.rules, years, aav, minimumSalary(league.rules, p.experience));
    if (aav > capSheet(league, team, year + 1).space || !worthIt(league, p, offer)) continue;
    const kind = p.demand.kind;
    if (extend(team, p, offer)) done.push({ player: p, team, kind: 'extended', ended: kind });
  }
  return done;
} // prettier-ignore

const nick = (team: TeamAbbr): string => TEAM_COLORS[team].name;
const named = (p: Player): string => `${fullName(p)} (${p.position})`;

/** A demand event in the user's inbox (spec 19.6), or null for another team's: holdouts and trade requests can pause an advance. */
export function demandMessage(league: League, e: DemandEvent): { title: string; body: string; event: PauseEvent | null } | null {
  if (e.team !== league.meta.start.userTeam) return null;
  const who = named(e.player);
  switch (e.kind) {
    case 'holdout': {
      const contract = e.player.contractId ? league.contracts[e.player.contractId] : undefined;
      const pay = league.rules.pay;
      const daily = contract?.type === 'rookie' ? pay.holdoutFineDailyRookie : pay.holdoutFineDaily;
      const fined = league.settings.drama.fines ? ` Per the CBA he's fined ${dollars(daily)} for each day of camp he misses.` : '';
      return { title: `${who} is holding out for a new deal`, body: `In the last year of his deal and paid well under his value, he didn't report to training camp, so he's off your active roster on the list for players who didn't report.${fined} Extend him on the Contracts screen, or wait for him to report.`, event: 'contractDemands' };
    }
    case 'trade':
      return { title: `${who} wants to be traded`, body: `Unhappy with his situation (morale ${e.player.morale}), he asked to be traded. He keeps playing; a new deal can win him back, and the request lapses once he's happier.`, event: 'contractDemands' };
    case 'reported':
      return { title: `${who} reported`, body: `He ended his holdout without a new deal, after losing ${dollars(e.cost ?? 0)} in fines and pay. He's back on your active roster.`, event: null };
    case 'lapsed':
      return { title: `${who} dropped his trade request`, body: 'He is happier with his situation now.', event: null };
    case 'extended':
      return { title: `Your staff extended ${who}`, body: `The new deal ends his ${e.ended === 'holdout' ? 'holdout' : 'trade request'}.`, event: null };
  }
} // prettier-ignore

/** A demand event's headline, for a player rated `newsFrom` or more; null for the rest. */
export function demandHeadline(e: DemandEvent): string | null {
  if (e.player.ovr < H.newsFrom) return null;
  const who = named(e.player);
  switch (e.kind) {
    case 'holdout':
      return `${who} holds out of the ${nick(e.team)} camp for a new deal`;
    case 'trade':
      return `${who} asks the ${nick(e.team)} for a trade`;
    case 'reported':
      return `${who} ends his holdout and reports to the ${nick(e.team)}`;
    case 'extended':
      return `The ${nick(e.team)} extend ${who}, ending his ${e.ended === 'holdout' ? 'holdout' : 'trade request'}`;
    case 'lapsed':
      return null;
  }
}

/** Demands end with the league year. */
export function clearDemands(league: League): void {
  for (const p of Object.values(league.players)) if (p.demand) endDemand(p, 'gone');
}
