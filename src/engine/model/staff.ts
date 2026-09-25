/** Coaches, staff, and owners (spec 6.6, 13.1, 14.3, 14.8). */
import type { TeamAbbr } from '../../data/team-colors';
import type { DefenseSchemeId, OffenseSchemeId } from '../schemes/ids';

export const STAFF_ROLES = [
  'HC', 'OC', 'DC', 'STC', 'QBC', 'RBC', 'WRC', 'TEC', 'OLC', 'DLC', 'LBC', 'DBC', 'DOS', 'DOP', 'SCOUT', 'GM'
] as const; // prettier-ignore
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  HC: 'Head coach',
  OC: 'Offensive coordinator',
  DC: 'Defensive coordinator',
  STC: 'Special teams coordinator',
  QBC: 'Quarterbacks coach',
  RBC: 'Running backs coach',
  WRC: 'Wide receivers coach',
  TEC: 'Tight ends coach',
  OLC: 'Offensive line coach',
  DLC: 'Defensive line coach',
  LBC: 'Linebackers coach',
  DBC: 'Defensive backs coach',
  DOS: 'Director of scouting',
  DOP: 'Director of player personnel',
  SCOUT: 'Scout',
  GM: 'General manager'
};

/** Rating keys by role (spec 13.1). Every rating is 0 to 99. */
export const STAFF_RATING_KEYS: Record<StaffRole, readonly string[]> = {
  HC: ['gameManagement', 'motivation', 'development', 'schemeKnowledge', 'discipline', 'flexibility'],
  OC: ['playCalling', 'schemeMastery', 'development'],
  DC: ['playCalling', 'schemeMastery', 'development'],
  STC: ['playCalling', 'schemeMastery', 'development'],
  QBC: ['development', 'technique'],
  RBC: ['development', 'technique'],
  WRC: ['development', 'technique'],
  TEC: ['development', 'technique'],
  OLC: ['development', 'technique'],
  DLC: ['development', 'technique'],
  LBC: ['development', 'technique'],
  DBC: ['development', 'technique'],
  DOS: ['accuracy', 'points'],
  DOP: ['evaluation', 'contractSense'],
  SCOUT: ['points', 'accuracy'],
  GM: ['evaluation', 'negotiation', 'drafting', 'capManagement']
};

/** How a head coach runs games and his depth chart (spec 8.6, 12.2, 14.3), 0 to 100. */
export interface CoachTendencies {
  /** Fourth-down and two-point aggressiveness. */
  aggressiveness: number;
  /** Lean toward the pass (100) or the run (0). */
  passLean: number;
  /** Clock and timeout management quality. */
  clockManagement: number;
  /** Depth chart style: 0 favors veterans, 50 plays merit, 100 favors youth (spec 12.2). */
  youthLean: number;
  rigidity: number;
  playerRelationships: number;
  /** How much personnel power he pushes for. */
  personnelPower: number;
}

export interface CareerRecord {
  wins: number;
  losses: number;
  ties: number;
  playoffWins: number;
  playoffLosses: number;
  titles: number;
}

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  /** Calendar birth date, YYYY-MM-DD. */
  birthDate: string;
  role: StaffRole;
  team: TeamAbbr | null;
  ratings: Record<string, number>;
  /** Summary rating for lists and hiring, 0 to 99. */
  overall: number;
  abilities: string[];
  offenseScheme: OffenseSchemeId | null;
  defenseScheme: DefenseSchemeId | null;
  /** Personality traits, 0 to 100 (spec 14.3). */
  personality: Record<string, number>;
  tendencies: CoachTendencies | null;
  /** Morale, 0 to 100; a coordinator running a scheme he doesn't prefer loses some (spec 7.6). */
  morale: number;
  contract: { years: number; salary: number };
  /** Head coach record counts head coach games only (spec 13.4). */
  record: CareerRecord;
  /** Seasons in this role before the league began. */
  yearsInRole: number;
  /** Scouting region for scouts. */
  region: string | null;
}

export interface Owner {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  team: TeamAbbr;
  /** Wealth tier, 1 (modest) to 5 (among the richest owners). */
  wealth: number;
  /** Owner traits, 0 to 100 (spec 14.8). */
  personality: {
    patience: number;
    meddling: number;
    spending: number;
    relocationAppetite: number;
    tradition: number;
    competitiveness: number;
  };
}

export const emptyRecord = (): CareerRecord => ({
  wins: 0,
  losses: 0,
  ties: 0,
  playoffWins: 0,
  playoffLosses: 0,
  titles: 0
});
