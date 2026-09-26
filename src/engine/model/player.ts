/** The player record (spec 6.1). */
import type { PlayerInjury } from '../season/injuries';
import type { GameDate } from './calendar';
import type { TeamAbbr } from '../../data/team-colors';
import type { Position } from './positions';
import type { Ratings } from './ratings';
import type { Traits } from './traits';

/** Madden development traits (style guide 2.5, spec 10.6). */
export const DEV_TRAITS = ['Normal', 'Star', 'Superstar', 'X-Factor'] as const;
export type DevTrait = (typeof DEV_TRAITS)[number];

/** Where a player is (spec 12.1): 'holdout' is the reserve list for players who didn't report (spec 11.9). */
export const ROSTER_STATUSES = [
  'active', 'practice', 'ir', 'pup', 'nfi', 'suspended', 'holdout', 'waivers', 'freeAgent', 'retired', 'removed'
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

/**
 * How a player goes about a deal (spec 11.6, 11.7), hidden from every screen, 0 to 100 each: how hard his
 * agent bargains, which sets how far over his real floor the agent opens; how much he values money paid up
 * front, as a signing bonus, over the same money paid later; and how front offices misread him, which sets
 * where his real floor sits in the range they expect him to sign for (D-63).
 */
export interface DealStyle {
  agent: number;
  upFront: number;
  read: number;
}

/** A deal style that leans neither way, for a player whose style the league hasn't drawn. */
export const PLAIN_DEAL_STYLE: DealStyle = { agent: 50, upFront: 50, read: 50 };

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
  dealStyle: DealStyle;
  team: TeamAbbr | null;
  /**
   * The league year he joined his current team (spec 10.9's chemistry and time together), or for a player
   * without a team the year he last had one or entered the league.
   */
  joined: number;
  /** The team he last played for, while he's without one: loyalty draws him back (spec 11.7). */
  lastTeam: TeamAbbr | null;
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
  /** What he's demanding of his team, if anything (spec 11.9). */
  demand?: PlayerDemand;
  /** A suspension still to serve (spec 10.9): games left, and why. */
  suspension?: { games: number; reason: 'ped' | 'conduct' };
  /** Seasons of charity work to his name, for the Man of the Year (spec 10.9, 18.4). */
  community?: number;
  /** The season he retired after (spec 10.7); Hall of Fame candidates wait five seasons from it. */
  retiredIn?: number;
  /** Columns from an import that the model doesn't use, kept for lossless round trips. */
  extra?: Record<string, string>;
}

/**
 * A player's demand of his team (spec 11.9): a holdout for a new deal, or a trade request; `fines` counts
 * what holding out has cost him in fines and missed pay, in dollars.
 */
export interface PlayerDemand {
  kind: 'holdout' | 'trade';
  since: GameDate;
  fines: number;
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
