/**
 * Contracts (spec 6.5). Cap hits and dead money are always computed from this structure (spec 11.2),
 * never stored as the source of truth.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { GameDate } from '../model/calendar';

export const CONTRACT_TYPES = [
  'rookie',
  'veteran',
  'extension',
  'franchiseTag',
  'transitionTag',
  'rfaTender',
  'minimum',
  'practiceSquad',
  'udfa'
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export interface Incentive {
  /** What must happen, in words the UI can show. */
  condition: string;
  amount: number;
  /** Likely to be earned (counts now) or not (counts next year if earned). */
  likely: boolean;
}

export interface ContractYear {
  /** League year. */
  year: number;
  base: number;
  rosterBonus: number;
  /** Option bonus, prorated like a signing bonus once exercised. */
  optionBonus: number;
  /** Maximum per-game active roster bonus; counts by games active. */
  perGameBonus: number;
  workoutBonus: number;
  incentives: Incentive[];
  /** Base salary that is fully guaranteed, and guaranteed for injury only. */
  guaranteedBase: number;
  injuryGuaranteedBase: number;
  /** A void year exists only to spread proration; it voids before it starts. */
  isVoid: boolean;
  option: 'team' | 'player' | null;
}

export interface GuaranteeVesting {
  year: number;
  /** When the guarantee vests, as a game date. */
  date: GameDate;
  amount: number;
}

export interface Restructure {
  date: GameDate;
  /** Base salary converted to signing bonus. */
  amount: number;
  /** League years the converted amount prorates over. */
  prorationYears: number[];
}

export interface Contract {
  id: string;
  playerId: string;
  team: TeamAbbr;
  signed: GameDate;
  type: ContractType;
  /** Every league year of the deal in order, including years already played and void years. */
  years: ContractYear[];
  signingBonus: number;
  vesting: GuaranteeVesting[];
  noTrade: boolean;
  fifthYearOption: 'none' | 'eligible' | 'exercised' | 'declined';
  restructures: Restructure[];
  /** Weekly pay for practice squad contracts; 0 otherwise. */
  weeklyPay: number;
}

/** A contract year with no money in it, for building contracts. */
export function emptyYear(year: number): ContractYear {
  return {
    year,
    base: 0,
    rosterBonus: 0,
    optionBonus: 0,
    perGameBonus: 0,
    workoutBonus: 0,
    incentives: [],
    guaranteedBase: 0,
    injuryGuaranteedBase: 0,
    isVoid: false,
    option: null
  };
}
