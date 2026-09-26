/**
 * Retirement (spec 10.7): each offseason every veteran may retire. The chance rises with age past the usual
 * age for his position (moved by the retirement-age setting), with a decline from his peak, a serious
 * injury, no contract, or a title just won, and falls with a competitive streak and years left on his deal.
 * Now and then a younger player walks away by surprise. A retired player keeps his record and history; his
 * contract ends, and what it still prorates comes onto his team's cap.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { endContract } from '../contracts/moves';
import { endPending } from '../contracts/resign';
import type { League } from '../league/types';
import { calendarDay, leagueYear } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { POSITION_GROUP } from '../model/positions';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { putContract } from '../league/contract-index';

const R = TUNING.retirement;
const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

/** Players the retirement check covers: veterans on a team or in free agency. */
const RETIRING = new Set<Player['status']>([
  'active',
  'ir',
  'pup',
  'nfi',
  'practice',
  'suspended',
  'freeAgent'
]);

/** The chance a player retires this offseason. `champion` is the team that just won the title. */
export function retirementChance(league: League, player: Player, champion: TeamAbbr | null): number {
  if (player.experience < 1 || !RETIRING.has(player.status)) return 0;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const usual = R.age[POSITION_GROUP[player.position]] + league.settings.development.retirementAge;
  const contract = player.contractId ? league.contracts[player.contractId] : undefined;
  const yearsLeft = contract
    ? contract.years.some(y => !y.isVoid && y.year > leagueYear(league.date))
    : false;
  const hurt =
    player.injury !== null && (player.injury.career || player.injury.weeksOut >= R.longInjuryWeeks);
  const logit =
    (age - usual) / R.ageSpread +
    (R.decline * Math.max(0, player.potential - player.ovr)) / 10 +
    (hurt ? R.injury : 0) +
    (!contract ? R.unsigned : yearsLeft ? R.underContract : 0) +
    (champion !== null && player.team === champion ? R.champion : 0) +
    (R.competitiveness * (50 - player.personality.competitiveness)) / 50;
  return Math.min(1, logistic(logit) + (age < R.surpriseBefore ? R.surprise : 0));
}

/** Decides this offseason's retirements and retires the players. Returns who retired and the team each left. */
export function retirePlayers(league: League, rng: Rng): { player: Player; team: TeamAbbr | null }[] {
  const champion = league.season.champion;
  const retired: { player: Player; team: TeamAbbr | null }[] = [];
  const players = Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const player of players) {
    if (!rng.chance(retirementChance(league, player, champion))) continue;
    const team = player.team;
    const contract = player.contractId ? league.contracts[player.contractId] : undefined;
    const end = {
      date: { ...league.date },
      how: 'retired',
      designated: false,
      injured: false,
      terminationPay: false
    } as const;
    if (contract) putContract(league, endContract(contract, end));
    endPending(league, player, end);
    Object.assign(player, { team: null, status: 'retired', contractId: null, retiredIn: league.date.season });
    retired.push({ player, team });
  }
  return retired;
}
