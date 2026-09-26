/** The player record (spec 6.1). */
import type { PlayerInjury } from '../season/injuries';
import type { TeamAbbr } from '../../data/team-colors';
import type { Position } from './positions';
import type { Ratings } from './ratings';
import type { Traits } from './traits';

/** Madden development traits (style guide 2.5, spec 10.6). */
export const DEV_TRAITS = ['Normal', 'Star', 'Superstar', 'X-Factor'] as const;
export type DevTrait = (typeof DEV_TRAITS)[number];

export const ROSTER_STATUSES = [
  'active', 'practice', 'ir', 'pup', 'nfi', 'suspended', 'waivers', 'freeAgent', 'retired', 'removed'
] as const; // prettier-ignore
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** Hidden personality traits, 0 to 100 (spec 10.9). */
export interface Personality {
  ego: number;
  loyalty: number;
  workEthic: number;
  leadership: number;
  competitiveness: number;
  greed: number;
  volatility: number;
  /** 0 is guarded with the media, 100 is outspoken. */
  mediaStyle: number;
  socialActivity: number;
}

export type DraftInfo =
  { year: number; round: number; pick: number; team: TeamAbbr } | { year: number; undrafted: true };

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  jersey: number;
  /** Calendar birth date, YYYY-MM-DD. Age is derived for a league date. */
  birthDate: string;
  college: string;
  hometown: string;
  /** Inches and pounds. */
  height: number;
  weight: number;
  handedness: 'R' | 'L';
  /**
   * Credited seasons: seasons with 3 or more regular-season games on full pay status, for minimum salaries
   * (spec 11.1).
   */
  experience: number;
  /**
   * Accrued seasons: seasons with 6 or more regular-season games on full pay status, for free agency, vested
   * veterans, and the practice squad's veteran limit (spec 11.5, 12.1).
   */
  accrued: number;
  draft: DraftInfo;
  ratings: Ratings;
  /** Hidden ceiling overall for generated and young players. */
  potential: number;
  /** Overall for the player's position, stored and recomputed when ratings change (spec 7.1). */
  ovr: number;
  traits: Traits;
  /** Ability IDs (spec 7.4): up to 3 for elite players, 1 for strong ones. */
  abilities: string[];
  dev: DevTrait;
  personality: Personality;
  team: TeamAbbr | null;
  /**
   * The league year he joined his current team (spec 10.9's chemistry and time together), or for a player
   * without a team the year he last had one or entered the league.
   */
  joined: number;
  status: RosterStatus;
  /** Morale, 0 to 100. */
  morale: number;
  contractId: string | null;
  /**
   * A deal signed to follow his current one (an extension, a tag, or a tender in the re-sign window); it
   * takes over when the new league year opens.
   */
  nextContractId?: string;
  /** The injury he's carrying, if any (spec 10.8). */
  injury: PlayerInjury | null;
  /** The season he retired after (spec 10.7); Hall of Fame candidates wait five seasons from it. */
  retiredIn?: number;
  /** Columns from an import that the model doesn't use, kept for lossless round trips. */
  extra?: Record<string, string>;
}

/** Age in whole years on a calendar date (YYYY-MM-DD). */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const fullName = (p: Pick<Player, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`;

/** The college entry for players who came through the NFL's International Player Pathway. */
export const INTERNATIONAL_PATHWAY = 'International Player Pathway';
