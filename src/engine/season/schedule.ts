/**
 * Playoff games on the calendar (spec 4.1, 5.3): each round's games get dates, kickoff times, and venues.
 * Playoff weeks are numbered on from the regular season's, so the Wild Card round is week 19 of 18.
 */
import { gameId, type ScheduledGame } from '../../data/schedule';
import { superBowlVenue } from '../../data/super-bowl';
import { homeStadium } from '../../data/teams';
import type { League } from '../league/types';
import type { PlayoffGame } from './playoffs';

/**
 * Kickoff slots by round, as days after the regular season's last Sunday, the weekday, and Eastern time:
 * Saturday to Monday for the Wild Card round, Saturday and Sunday for the divisional round, Sunday for the
 * conference championships, and the Super Bowl two weeks later (the NFL's current calendar).
 */
const SLOTS: Readonly<Record<number, readonly (readonly [number, string, string])[]>> = {
  1: [
    [6, 'Sat', '16:30'],
    [6, 'Sat', '20:00'],
    [7, 'Sun', '13:00'],
    [7, 'Sun', '16:30'],
    [7, 'Sun', '20:15'],
    [8, 'Mon', '20:15']
  ],
  2: [
    [13, 'Sat', '16:30'],
    [13, 'Sat', '20:15'],
    [14, 'Sun', '15:00'],
    [14, 'Sun', '18:30']
  ],
  3: [
    [21, 'Sun', '15:00'],
    [21, 'Sun', '18:30']
  ],
  4: [[35, 'Sun', '18:30']]
};

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Scheduled games for a playoff round, in the order the bracket lists them. */
export function playoffSchedule(league: League, games: readonly PlayoffGame[]): ScheduledGame[] {
  const season = league.season.season;
  const weeks = league.rules.season.weeks;
  const lastWeek = league.schedule.filter(g => g.week === weeks).map(g => g.date);
  const lastSunday = lastWeek.sort().at(-1) ?? `${season + 1}-01-10`;
  return games.map((g, i) => {
    const slots = SLOTS[g.round] ?? SLOTS[4] ?? [];
    const [days, day, time] = slots[i] ?? slots.at(-1) ?? [7, 'Sun', '13:00'];
    const neutral = g.conference === null;
    return {
      id: gameId(season, weeks + g.round, g.away, g.home),
      season,
      week: weeks + g.round,
      day,
      date: addDays(lastSunday, days),
      timeEt: time,
      away: g.away,
      home: g.home,
      siteType: neutral ? 'neutral' : 'home',
      venue: neutral ? superBowlVenue(season) : homeStadium(g.home).id
    };
  });
}
