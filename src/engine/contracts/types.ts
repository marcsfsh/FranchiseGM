/**
 * Contracts (spec 6.5). Cap hits and dead money are always computed from this structure (spec 11.2),
 * never stored as the source of truth.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { GameDate } from '../model/calendar';
import type { StatKey } from '../sim/stats';

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
  /** The regular-season total the condition checks when the season ends. */
  stat: { key: StatKey; atLeast: number } | null;
  /** Settled when the regular season ends: null until then, or if the deal ended first. */
  earned: boolean | null;
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
  /** An option year, and whether it was exercised (null until decided). */
  option: 'team' | 'player' | null;
  optionExercised: boolean | null;
  /** League years the option bonus prorates over, fixed when the option is exercised. */
  optionBonusYears: number[] | null;
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

/**
 * How a deal ended before its last year (spec 11.2). Every end but a replacement accelerates the remaining
 * proration. A release also owes the guaranteed salary; a trade sends the guarantees with the player; a
 * declined option ends the deal when the option year opens; a replaced deal (a practice squad deal on
 * promotion) just stops.
 */
export type ContractEndReason = 'released' | 'traded' | 'declined' | 'replaced';

export interface ContractEnd {
  date: GameDate;
  how: ContractEndReason;
  /** A June 1 designation: later years' dead money moves to the next league year. */
  designated: boolean;
  /** Hurt when released, so injury guarantees are owed. */
  injured: boolean;
  /** A vested veteran released in season after the first week: the rest of his base salary is owed. */
  terminationPay: boolean;
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
  /** League years the signing bonus prorates over, once fixed (a restructure adding void years fixes it). */
  signingBonusYears: number[] | null;
  vesting: GuaranteeVesting[];
  noTrade: boolean;
  fifthYearOption: 'none' | 'eligible' | 'exercised' | 'declined';
  restructures: Restructure[];
  /** Weekly pay for practice squad contracts; 0 otherwise. */
  weeklyPay: number;
  /** Set when the deal ends early; dead money is computed from it. */
  ended: ContractEnd | null;
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
    option: null,
    optionExercised: null,
    optionBonusYears: null
  };
}
