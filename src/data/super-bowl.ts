/**
 * Super Bowl sites (spec 5.3): the ones the NFL has announced, then a rotation of warm-weather and domed
 * stadiums that have hosted before. Venue IDs are from src/data/stadiums.ts.
 */
const ANNOUNCED: Readonly<Record<number, string>> = {
  // By season: the 2025 season's Super Bowl LX was at Levi's Stadium.
  2025: 'SF',
  2026: 'SOFI',
  2027: 'ATL'
};
const ROTATION: readonly string[] = ['NO', 'MIA', 'ARI', 'LV', 'HOU', 'TB', 'MIN', 'SF', 'SOFI', 'ATL', 'DAL', 'IND', 'DET']; // prettier-ignore
const FIRST_ROTATED = 2028;

/** The venue of the Super Bowl that ends a season. */
export function superBowlVenue(season: number): string {
  const announced = ANNOUNCED[season];
  if (announced) return announced;
  const i = (((season - FIRST_ROTATED) % ROTATION.length) + ROTATION.length) % ROTATION.length;
  return ROTATION[i] as string;
}

/** The Super Bowl's number: the 2026 season ends with Super Bowl LXI. */
export const superBowlNumber = (season: number): number => season - 1965;
