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
import type { DepthOrder } from './depth';
import type { LeagueRandom } from '../rng';
import type { RuleSet } from '../rules/ruleset';
import type { TeamSchemes } from '../schemes/resolve';
import type { WaiverEntry } from '../roster/waivers';
import type { DevelopmentSettings } from '../progression/settings';
import type { TrainingPlan } from '../progression/training';
import type { InboxItem, PauseEvent } from '../season/inbox';
import type { SeasonState } from '../season/state';
import type { GamePlan, Rotation } from '../sim/plan';
import type { SimSliders } from '../sim/sliders';

/**
 * Save format version (spec 2.4). Bump it whenever the shape of League changes; older saves then open
 * with a clear message instead of being migrated.
 */
export const SAVE_SCHEMA_VERSION = 16;

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
  /** The schemes the head coach runs (spec 7.2). */
  schemes: TeamSchemes;
  /** Questionable players the coach is resting this week instead of playing them hurt (spec 10.8). */
  resting: string[];
  /**
   * Depth chart choices (spec 12.2): each slot's players in order, by the head coach while `auto` is on
   * (starters only) or by the user. A listed player who can't play is skipped; players not listed follow
   * by role rating.
   */
  depth: { auto: boolean; order: DepthOrder };
  /** This week's game plan (spec 8.7), made by the coaching staff while `auto` is on or by the user. */
  plan: { auto: boolean; plan: GamePlan };
  /** Rotations and packages (spec 12.3). */
  rotation: Rotation;
  /** The weekly focus, players' own focuses, and the offseason program (spec 10.5). */
  training: TrainingPlan;
  /** Cap space carried over into the current league year (spec 11.1). */
  carryover: number;
  /** Cash paid in each closed league year of the salary floor's current window (spec 11.1). */
  spending: { year: number; cash: number }[];
}

/**
 * The user's jobs that can run on auto (spec 22.7), with the same AI as AI teams. The game plan and depth
 * chart toggles live on the team; the other jobs are added as their features arrive.
 */
export interface AutoJobs {
  /** Signings, cuts, injured reserve, practice squad moves, and waiver claims. */
  roster: boolean;
  /** Extensions, tags, tenders, and fifth-year options in the re-sign window (spec 11.4, 11.5). */
  contracts: boolean;
}

/** League settings that can change mid-save (spec 22). Sections are added as their features arrive. */
export interface LeagueSettings {
  version: number;
  /** Fit is capped at plus or minus this many points (spec 7.3). */
  fitCap: number;
  /** Game sim and stat sliders (spec 22.3). */
  sim: SimSliders;
  /** Event types that stop a multi-week advance (spec 19.6). */
  pause: Record<PauseEvent, boolean>;
  /** The user's jobs on auto (spec 22.7). */
  auto: AutoJobs;
  /** Development and draft (spec 22.4). */
  development: DevelopmentSettings;
}

export interface League {
  schema: number;
  meta: LeagueMeta;
  date: GameDate;
  random: LeagueRandom;
  rules: RuleSet;
  /**
   * Each league year's salary cap from the league's first (spec 11.1), for the salary floor and for pricing
   * past deals against the cap they were signed under.
   */
  caps: Record<number, number>;
  settings: LeagueSettings;
  teams: Record<TeamAbbr, TeamState>;
  players: Record<string, Player>;
  contracts: Record<string, Contract>;
  staff: Record<string, StaffMember>;
  owners: Record<string, Owner>;
  /** The current season's schedule; playoff games join it as each round is set. */
  schedule: ScheduledGame[];
  /**
   * The first season's published schedule (spec 5.2): later schedules match their rotations in it and keep
   * its weekly layout.
   */
  seedSchedule: ScheduledGame[];
  /** Next season's schedule once it's released in the offseason (spec 5.2), until that season starts. */
  upcoming: ScheduledGame[] | null;
  /**
   * The coming season's preseason (spec 4.1), from training camp until the season starts: its games and
   * the scores of those played.
   */
  preseason: { games: ScheduledGame[]; results: Record<string, { home: number; away: number }> } | null;
  /** The current season's results, seeds, and champion. */
  season: SeasonState;
  /** Messages for the user (spec 19.6), oldest first. */
  inbox: InboxItem[];
  /** Players on waivers until the league next advances (spec 12.1). */
  waivers: WaiverEntry[];
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
