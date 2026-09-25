/** Game simulation inputs and outputs (spec 8.2, 8.8). */
import type { TeamAbbr } from '../../data/team-colors';
import type { Venue } from '../../data/stadiums';
import type { Cohesion } from '../fit/cohesion';
import type { Position } from '../model/positions';
import type { Traits } from '../model/traits';
import type { GameRules, PenaltyId } from '../rules/ruleset';
import type { ResolvedDefense, ResolvedOffense } from '../schemes/resolve';
import type { ContextTrigger, PlayTrigger } from '../schemes/situations';
import type { Slot } from '../schemes/slots';
import type { DefenseTendencies, OffenseTendencies } from '../schemes/tendencies';
import type { CompositeId, Composites } from './composites';
import type { SimSliders } from './sliders';
import type { PlayerLine, TeamTotals } from './stats';

export type Side = 'home' | 'away';

export interface SimAbility {
  id: string;
  name: string;
  triggers: readonly PlayTrigger[];
  contexts: readonly ContextTrigger[];
  edges: Partial<Composites>;
}

/** A player as the sim sees him: action edges, traits, abilities, and live game state. */
export interface SimPlayer {
  id: string;
  name: string;
  /** "F. Last", for play descriptions. */
  short: string;
  position: Position;
  jersey: number;
  ovr: number;
  edges: Composites;
  traits: Traits;
  abilities: SimAbility[];
  /** Fit in each slot he can play (spec 7.3), in points. */
  fit: Partial<Record<Slot, number>>;
  stamina: number;
  injury: number;
  toughness: number;
  /** In-game energy, 0 to 100 (spec 8.4). */
  energy: number;
  /** Out of the game for injury. */
  out: boolean;
}

export interface CoachStyle {
  /** Fourth-down and two-point aggressiveness, 0 to 100 (spec 8.6). */
  aggressiveness: number;
  /** Clock management skill, 0 to 100. */
  clock: number;
  /** Halftime adjustment skill, 0 to 100. */
  halftime: number;
}

export interface TeamSetup {
  abbr: TeamAbbr;
  name: string;
  /** Whether this is the user's team (gameplay and penalty sliders have user and AI values). */
  user: boolean;
  players: Record<string, SimPlayer>;
  /** Players in depth order for every slot. */
  depth: Record<Slot, string[]>;
  offense: ResolvedOffense;
  defense: ResolvedDefense;
  /** Tendencies after coach flexibility (spec 7.6); the game plan starts from these. */
  tendencies: { offense: OffenseTendencies; defense: DefenseTendencies };
  coach: CoachStyle;
  cohesion: Cohesion;
  /** Rating points for today: form (spec 8.5) plus home field (spec 17.3), negative for visitors. */
  boost: number;
  /**
   * Adaptive play calling (spec 7.6): the pass-rate shift toward what the roster does well, within the
   * limit the head coach's flexibility allows.
   */
  lean: number;
}

export type Precipitation = 'none' | 'rain' | 'snow';

export interface GameWeather {
  indoor: boolean;
  tempF: number;
  windMph: number;
  precipitation: Precipitation;
  altitudeFt: number;
}

export interface GameSetup {
  id: string;
  season: number;
  week: number;
  playoff: boolean;
  neutral: boolean;
  venue: Venue;
  weather: GameWeather;
  rules: GameRules;
  sliders: SimSliders;
  home: TeamSetup;
  away: TeamSetup;
  /** Visiting offense's false-start multiplier from crowd noise (spec 17.3). */
  crowd: number;
  /** Count situations per slot for measured profiles (spec 7.5). */
  measure?: boolean;
}

export interface ScoringPlay {
  quarter: number;
  /** Seconds left in the quarter. */
  clock: number;
  team: TeamAbbr;
  kind: 'touchdown' | 'fieldGoal' | 'safety' | 'extraPoint' | 'twoPoint' | 'defensiveTry';
  points: number;
  description: string;
  home: number;
  away: number;
}

export type DriveResult =
  | 'touchdown'
  | 'fieldGoal'
  | 'missedFieldGoal'
  | 'punt'
  | 'interception'
  | 'fumble'
  | 'downs'
  | 'safety'
  | 'endOfHalf'
  | 'endOfGame';

export interface DriveSummary {
  team: TeamAbbr;
  quarter: number;
  clock: number;
  /** Starting yard line, from the offense's own goal line. */
  start: number;
  plays: number;
  yards: number;
  seconds: number;
  result: DriveResult;
}

export type InjurySeverity = 'minor' | 'short' | 'medium' | 'season';

export interface InjuryEvent {
  playerId: string;
  team: TeamAbbr;
  quarter: number;
  severity: InjurySeverity;
  /** Weeks he is expected to miss (0 for a minor injury). */
  weeks: number;
  bodyPart: string;
}

/** An accepted foul, charged to a player (spec 9.2 penalties by type). */
export interface PenaltyEvent {
  playerId: string;
  team: TeamAbbr;
  penalty: PenaltyId;
  yards: number;
}

/** A player thrown out of the game for a flagrant foul (spec 16). */
export interface EjectionEvent {
  playerId: string;
  team: TeamAbbr;
  quarter: number;
  penalty: PenaltyId;
}

export interface SituationCounts {
  snaps: Partial<Record<Slot, number>>;
  counts: Partial<Record<Slot, Partial<Record<PlayTrigger, number>>>>;
}

export interface TeamBox {
  totals: TeamTotals;
  players: Record<string, PlayerLine>;
}

export interface GameResult {
  id: string;
  home: TeamAbbr;
  away: TeamAbbr;
  score: { home: number; away: number };
  /** Points by quarter; a fifth entry holds overtime. */
  quarters: { home: number[]; away: number[] };
  winner: TeamAbbr | null;
  overtime: boolean;
  box: { home: TeamBox; away: TeamBox };
  scoring: ScoringPlay[];
  drives: DriveSummary[];
  injuries: InjuryEvent[];
  ejections: EjectionEvent[];
  penalties: PenaltyEvent[];
  recap: string[];
  weather: GameWeather;
  plays: number;
  /** Measured situations by team, when the setup asked for them. */
  situations?: { home: SituationCounts; away: SituationCounts };
}

export type { CompositeId };
