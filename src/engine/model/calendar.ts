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

/** Playoff rounds a bracket needs: the rounds within each conference, then the Super Bowl (spec 5.3). */
export function playoffRounds(teamsPerConference: number): number {
  return Math.ceil(Math.log2(Math.max(1, teamsPerConference))) + 1;
}

/** Short round names, counted back from the Super Bowl. */
const ROUNDS_FROM_FINAL = ['Super Bowl', 'Conference', 'Divisional', 'Wild Card'] as const;

/**
 * The playoff round of a game week. Playoff games are numbered on from the regular season's weeks, so
 * round 1 is week `weeks + 1`; smaller brackets drop the early rounds.
 */
export function playoffRoundName(
  week: number,
  season: { weeks: number; playoffTeamsPerConference: number }
): string {
  const round = week - season.weeks;
  return (
    ROUNDS_FROM_FINAL[playoffRounds(season.playoffTeamsPerConference) - round] ?? `Playoff round ${round}`
  );
}

/** Orders two dates. Negative when a is earlier. */
export function compareDates(a: GameDate, b: GameDate): number {
  return a.season - b.season || PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.week - b.week;
}

/** The league year a date falls in: it turns over when free agency opens (spec 4.1). */
export function leagueYear(date: GameDate): number {
  return PHASES.indexOf(date.phase) >= PHASES.indexOf('freeAgency') ? date.season + 1 : date.season;
}

/**
 * Where each phase falls on the calendar: month (1 to 12), day, and years after the season's start year.
 * Weekly phases advance a week at a time from here. Used for ages and calendar lines, not for scheduling.
 */
const PHASE_DAYS: Record<Phase, readonly [month: number, day: number, yearOffset: number]> = {
  regularSeason: [9, 10, 0],
  wildCard: [1, 16, 1],
  divisional: [1, 23, 1],
  conference: [1, 30, 1],
  superBowl: [2, 14, 1],
  staff: [2, 16, 1],
  awards: [2, 18, 1],
  resign: [2, 20, 1],
  combine: [2, 27, 1],
  annualMeeting: [3, 6, 1],
  freeAgency: [3, 10, 1],
  proDays: [4, 7, 1],
  draft: [4, 22, 1],
  udfa: [4, 25, 1],
  otas: [5, 25, 1],
  trainingCamp: [7, 22, 1],
  preseason: [8, 8, 1],
  cutdown: [8, 25, 1]
};

/** The calendar day a game date falls on, YYYY-MM-DD (approximate within the week). */
export function calendarDay(date: GameDate): string {
  const [month, day, offset] = PHASE_DAYS[date.phase];
  const utc = new Date(Date.UTC(date.season + offset, month - 1, day + 7 * Math.max(0, date.week - 1)));
  return utc.toISOString().slice(0, 10);
}
