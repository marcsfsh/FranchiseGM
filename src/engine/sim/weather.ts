/**
 * Game weather (spec 17.2): open-air and open retractable-roof stadiums draw the day's weather from the
 * venue's climate normals for the month; domes and closed roofs play at room conditions.
 */
import type { MonthClimate } from '../../data/climate';
import type { Venue } from '../../data/stadiums';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import type { GameWeather } from './types';

const W = TUNING.sim.weather;
const INDOOR: Omit<GameWeather, 'altitudeFt'> = {
  indoor: true,
  tempF: 70,
  windMph: 0,
  precipitation: 'none'
};

export function drawWeather(rng: Rng, venue: Venue, climate: MonthClimate | null): GameWeather {
  if (venue.roof === 'dome' || !climate) return { ...INDOOR, altitudeFt: venue.altitudeFt };
  // Kickoffs run from early afternoon to night; game time sits about two thirds of the way to the high.
  const mean = climate.lowF + W.gameTimeShare * (climate.highF - climate.lowF);
  const tempF = Math.round(rng.normal(mean, W.tempSd));
  // A wet game is roughly as likely as a day with measurable precipitation in that month.
  const wet = rng.chance(Math.min(W.wetMax, climate.precipIn * W.wetPerInch));
  if (venue.roof === 'retractable' && (wet || tempF < W.roofClosesBelowF))
    return { ...INDOOR, altitudeFt: venue.altitudeFt };
  // Below freezing, wet games are snow at least snowFloor of the time, more where snowfall is heavy.
  const snowShare =
    climate.snowIn > 0 ? climate.snowIn / (climate.snowIn + climate.precipIn * W.snowPerPrecip) : 0;
  const precipitation = !wet
    ? 'none'
    : tempF <= W.snowBelowF && rng.chance(Math.max(snowShare, W.snowFloor))
      ? 'snow'
      : 'rain';
  const windMph = Math.max(
    0,
    Math.round(
      climate.windMph * (W.windLow + rng.float() * W.windSpread) + (rng.chance(W.gustChance) ? W.gustMph : 0)
    )
  );
  return { indoor: false, tempF, windMph, precipitation, altitudeFt: venue.altitudeFt };
}

/** Weather bad enough to trigger "bad weather" abilities (spec 7.4). */
export const isBadWeather = (w: GameWeather): boolean =>
  !w.indoor && (w.precipitation !== 'none' || w.windMph >= W.badWindMph || w.tempF <= W.badColdF);

const ZONE_OFFSETS: Record<string, number> = {
  'America/New_York': -5,
  'America/Detroit': -5,
  'America/Chicago': -6,
  'America/Mexico_City': -6,
  'America/Denver': -7,
  'America/Phoenix': -7,
  'America/Los_Angeles': -8,
  'America/Sao_Paulo': -3,
  'Europe/London': 0,
  'Europe/Paris': 1,
  'Europe/Madrid': 1,
  'Europe/Berlin': 1,
  'Australia/Melbourne': 10
};

/** Hours between two venues' time zones (standard time). */
export function zoneHours(a: Venue, b: Venue): number {
  return Math.abs((ZONE_OFFSETS[a.timeZone] ?? -5) - (ZONE_OFFSETS[b.timeZone] ?? -5));
}
