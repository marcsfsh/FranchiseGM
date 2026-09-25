/**
 * Game calendar (spec 2.3, 4.1). Dates are game-calendar objects, never wall-clock time.
 * Phases follow the season calendar order; the league year turns over at free agency.
 */

export const PHASES = [
  'regularSeason',
  'wildCard',
  'divisional',
  'conference',
  'superBowl',
  'staff',
  'awards',
  'resign',
  'combine',
  'annualMeeting',
  'freeAgency',
  'proDays',
  'draft',
  'udfa',
  'otas',
  'trainingCamp',
  'preseason',
  'cutdown'
] as const;

export type Phase = (typeof PHASES)[number];

export interface GameDate {
  /** The season, named for the year it starts: the 2026 season ends with the Super Bowl in early 2027. */
  season: number;
  phase: Phase;
  /** Week within the phase (regular season 1 to 18; free agency 1 to 4; otherwise 1). */
  week: number;
}

export const PHASE_LABELS: Record<Phase, string> = {
  regularSeason: 'Regular season',
  wildCard: 'Wild Card round',
  divisional: 'Divisional round',
  conference: 'Conference championships',
  superBowl: 'Super Bowl',
  staff: 'Staff management',
  awards: 'Awards and Hall of Fame',
  resign: 'Re-sign window',
  combine: 'Combine',
  annualMeeting: 'Annual meeting',
  freeAgency: 'Free agency',
  proDays: 'Pro days',
  draft: 'Draft',
  udfa: 'Undrafted free agents',
  otas: 'OTAs and minicamp',
  trainingCamp: 'Training camp',
  preseason: 'Preseason',
  cutdown: 'Final cutdown'
};

/** Orders two dates. Negative when a is earlier. */
export function compareDates(a: GameDate, b: GameDate): number {
  return a.season - b.season || PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.week - b.week;
}

/** The league year a date falls in: it turns over when free agency opens (spec 4.1). */
export function leagueYear(date: GameDate): number {
  return PHASES.indexOf(date.phase) >= PHASES.indexOf('freeAgency') ? date.season + 1 : date.season;
}
