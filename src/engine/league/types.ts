/**
 * The league save state. Everything the game needs to continue a league lives here, as plain JSON-safe
 * data: no Maps, Sets, class instances, or undefined values, so saves and exports round-trip exactly.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { ScheduledGame } from '../../data/schedule';
import type { Contract } from '../contracts/types';
import type { GameDate } from '../model/calendar';
import type { Player } from '../model/player';
import type { Owner, StaffMember, StaffRole } from '../model/staff';
import type { LeagueRandom } from '../rng';
import type { RuleSet } from '../rules/ruleset';

/**
 * Save format version (spec 2.4). Bump it whenever the shape of League changes; older saves then open
 * with a clear message instead of being migrated.
 */
export const SAVE_SCHEMA_VERSION = 1;

export type Permission = 'none' | 'user' | 'any';

/** Choices locked when the league is created (spec 3.2). */
export interface StartOptions {
  dataSource: 'fictional' | 'madden';
  startingRosters: 'actual' | 'fantasyDraft';
  userTeam: TeamAbbr;
  startSeason: number;
  seed: number;
  relocation: Permission;
  rebrand: Permission;
  styleDrift: boolean;
  aiOwnersProposeRules: boolean;
}

export interface LeagueMeta {
  id: string;
  /** Changeable any time. */
  name: string;
  start: StartOptions;
  /** Set once the editor changes the league (spec 21, M20). */
  edited: boolean;
  /** Game version that created the league. */
  createdBy: string;
}

export interface TeamState {
  abbr: TeamAbbr;
  ownerId: string;
  /** Staff IDs by role; scouts share a role. */
  staff: Partial<Record<StaffRole, string[]>>;
}

/** League settings that can change mid-save (spec 22). Sections are added as their features arrive. */
export interface LeagueSettings {
  version: number;
}

export interface League {
  schema: number;
  meta: LeagueMeta;
  date: GameDate;
  random: LeagueRandom;
  rules: RuleSet;
  settings: LeagueSettings;
  teams: Record<TeamAbbr, TeamState>;
  players: Record<string, Player>;
  contracts: Record<string, Contract>;
  staff: Record<string, StaffMember>;
  owners: Record<string, Owner>;
  /** The current season's schedule. */
  schedule: ScheduledGame[];
  /** Counters for new IDs by prefix (p, c, s, o, and more later). */
  nextId: Record<string, number>;
}

/** What the start screen lists for each saved league (spec 21). */
export interface LeagueSummary {
  id: string;
  name: string;
  userTeam: TeamAbbr;
  season: number;
  phase: GameDate['phase'];
  week: number;
  edited: boolean;
  schema: number;
  /** Wall-clock time of the last save, in ms since the epoch ("Saved just now" refers to real time). */
  savedAt: number;
}

export function summarize(league: League, savedAt: number): LeagueSummary {
  return {
    id: league.meta.id,
    name: league.meta.name,
    userTeam: league.meta.start.userTeam,
    season: league.date.season,
    phase: league.date.phase,
    week: league.date.week,
    edited: league.meta.edited,
    schema: league.schema,
    savedAt
  };
}
