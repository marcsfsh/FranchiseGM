/** The published 2026 schedule loader (spec 5.1). Rows come from data-raw/schedule-2026.csv. */
import { parseCsv } from './csv';
import { isTeamAbbr, type TeamAbbr } from './team-colors';
import { homeStadium } from './teams';
import { venueByName } from './stadiums';

export type SiteType = 'home' | 'neutral' | 'international';

export interface ScheduledGame {
  id: string;
  season: number;
  week: number;
  day: string;
  /** Eastern calendar date, YYYY-MM-DD. */
  date: string;
  /** Eastern kickoff time, HH:MM. */
  timeEt: string;
  away: TeamAbbr;
  home: TeamAbbr;
  siteType: SiteType;
  /** Venue ID from src/data/stadiums.ts. */
  venue: string;
}

const SITE_TYPES: readonly SiteType[] = ['home', 'neutral', 'international'];

export const gameId = (season: number, week: number, away: string, home: string): string =>
  `${season}-${String(week).padStart(2, '0')}-${away}-${home}`;

/** Parses and validates a schedule CSV. Throws with the line number on the first bad row. */
export function parseSchedule(text: string, season: number): ScheduledGame[] {
  const table = parseCsv(text);
  return table.rows.map((row, i) => {
    const where = `schedule line ${table.lines[i]}`;
    const week = Number(row.week);
    const { away, home } = row;
    if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error(`${where}: bad week "${row.week}"`);
    if (!isTeamAbbr(away) || !isTeamAbbr(home) || away === home)
      throw new Error(`${where}: bad teams ${away}@${home}`);
    const siteType = row.site_type as SiteType;
    if (!SITE_TYPES.includes(siteType)) throw new Error(`${where}: bad site type "${row.site_type}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '') || !/^\d{2}:\d{2}$/.test(row.time_et ?? '')) {
      throw new Error(`${where}: bad date or time`);
    }
    const venue = siteType === 'home' ? homeStadium(home).id : venueByName(row.site_name ?? '')?.id;
    if (!venue) throw new Error(`${where}: unknown venue "${row.site_name}"`);
    return {
      id: gameId(season, week, away, home),
      season,
      week,
      day: row.day ?? '',
      date: row.date as string,
      timeEt: row.time_et as string,
      away,
      home,
      siteType,
      venue
    };
  });
}
