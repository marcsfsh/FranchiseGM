/**
 * Stadiums and international venues (spec 17.1). Facts are the 2026 venues: name, opening year, capacity,
 * roof, playing surface, and altitude. Crowd noise (0 to 1) and condition are game values. Climate comes
 * from data-raw/climate.csv through each venue's weather station key.
 */

export type Roof = 'open' | 'dome' | 'retractable';
export type Surface = 'grass' | 'turf';

export interface Venue {
  id: string;
  name: string;
  city: string;
  /** US state or country subdivision. */
  region: string;
  country: string;
  opened: number;
  capacity: number;
  roof: Roof;
  surface: Surface;
  altitudeFt: number;
  /** Crowd noise factor, 0 to 1, used for home field advantage (spec 17.3). */
  noise: number;
  suites: number;
  /** Condition, 0 to 100, for upgrades (spec 20.4). */
  condition: number;
  /** Weather station key in data-raw/climate.csv. */
  climate: string;
  timeZone: string;
  lat: number;
  lon: number;
}

const v = (
  id: string,
  name: string,
  city: string,
  region: string,
  country: string,
  opened: number,
  capacity: number,
  roof: Roof,
  surface: Surface,
  altitudeFt: number,
  noise: number,
  suites: number,
  condition: number,
  climate: string,
  timeZone: string,
  lat: number,
  lon: number
): Venue => ({
  id,
  name,
  city,
  region,
  country,
  opened,
  capacity,
  roof,
  surface,
  altitudeFt,
  noise,
  suites,
  condition,
  climate,
  timeZone,
  lat,
  lon
});

/** Home stadiums, keyed by stadium ID. The Rams and Chargers share SoFi; the Giants and Jets share MetLife. */
// prettier-ignore
export const STADIUMS: readonly Venue[] = [
  v('ARI', 'State Farm Stadium', 'Glendale', 'AZ', 'USA', 2006, 63400, 'retractable', 'grass', 1070, 0.6, 88, 78, 'PHX', 'America/Phoenix', 33.528, -112.263),
  v('ATL', 'Mercedes-Benz Stadium', 'Atlanta', 'GA', 'USA', 2017, 71000, 'retractable', 'turf', 1000, 0.7, 190, 92, 'ATL', 'America/New_York', 33.755, -84.401),
  v('BAL', 'M&T Bank Stadium', 'Baltimore', 'MD', 'USA', 1998, 70745, 'open', 'grass', 30, 0.8, 128, 80, 'BAL', 'America/New_York', 39.278, -76.623),
  v('BUF', 'Highmark Stadium', 'Orchard Park', 'NY', 'USA', 2026, 62000, 'open', 'grass', 650, 0.85, 60, 100, 'BUF', 'America/New_York', 42.774, -78.787),
  v('CAR', 'Bank of America Stadium', 'Charlotte', 'NC', 'USA', 1996, 74867, 'open', 'turf', 750, 0.6, 159, 74, 'CLT', 'America/New_York', 35.226, -80.853),
  v('CHI', 'Soldier Field', 'Chicago', 'IL', 'USA', 1924, 61500, 'open', 'grass', 600, 0.7, 133, 60, 'CHI', 'America/Chicago', 41.862, -87.617),
  v('CIN', 'Paycor Stadium', 'Cincinnati', 'OH', 'USA', 2000, 65515, 'open', 'turf', 490, 0.65, 114, 70, 'CVG', 'America/New_York', 39.095, -84.516),
  v('CLE', 'Huntington Bank Field', 'Cleveland', 'OH', 'USA', 1999, 67431, 'open', 'grass', 580, 0.7, 145, 64, 'CLE', 'America/New_York', 41.506, -81.7),
  v('DAL', 'AT&T Stadium', 'Arlington', 'TX', 'USA', 2009, 80000, 'retractable', 'turf', 550, 0.7, 300, 88, 'DFW', 'America/Chicago', 32.748, -97.093),
  v('DEN', 'Empower Field at Mile High', 'Denver', 'CO', 'USA', 2001, 76125, 'open', 'grass', 5280, 0.8, 106, 72, 'DEN', 'America/Denver', 39.744, -105.02),
  v('DET', 'Ford Field', 'Detroit', 'MI', 'USA', 2002, 65000, 'dome', 'turf', 600, 0.8, 132, 76, 'DTW', 'America/Detroit', 42.34, -83.046),
  v('GB', 'Lambeau Field', 'Green Bay', 'WI', 'USA', 1957, 81441, 'open', 'grass', 640, 0.8, 168, 82, 'GRB', 'America/Chicago', 44.501, -88.062),
  v('HOU', 'NRG Stadium', 'Houston', 'TX', 'USA', 2002, 72220, 'retractable', 'turf', 50, 0.6, 189, 70, 'IAH', 'America/Chicago', 29.685, -95.411),
  v('IND', 'Lucas Oil Stadium', 'Indianapolis', 'IN', 'USA', 2008, 67000, 'retractable', 'turf', 715, 0.7, 139, 82, 'IND', 'America/Indiana/Indianapolis', 39.76, -86.164),
  v('JAX', 'EverBank Stadium', 'Jacksonville', 'FL', 'USA', 1995, 67814, 'open', 'grass', 15, 0.55, 88, 58, 'JAX', 'America/New_York', 30.324, -81.637),
  v('KC', 'GEHA Field at Arrowhead Stadium', 'Kansas City', 'MO', 'USA', 1972, 76416, 'open', 'grass', 750, 0.95, 80, 68, 'MCI', 'America/Chicago', 39.049, -94.484),
  v('SOFI', 'SoFi Stadium', 'Inglewood', 'CA', 'USA', 2020, 70240, 'dome', 'turf', 100, 0.55, 260, 96, 'LAX', 'America/Los_Angeles', 33.953, -118.339),
  v('LV', 'Allegiant Stadium', 'Las Vegas', 'NV', 'USA', 2020, 65000, 'dome', 'grass', 2030, 0.55, 127, 96, 'LAS', 'America/Los_Angeles', 36.091, -115.184),
  v('MIA', 'Hard Rock Stadium', 'Miami Gardens', 'FL', 'USA', 1987, 65326, 'open', 'grass', 10, 0.6, 180, 84, 'MIA', 'America/New_York', 25.958, -80.239),
  v('MIN', 'U.S. Bank Stadium', 'Minneapolis', 'MN', 'USA', 2016, 66860, 'dome', 'turf', 830, 0.9, 131, 90, 'MSP', 'America/Chicago', 44.974, -93.258),
  v('NE', 'Gillette Stadium', 'Foxborough', 'MA', 'USA', 2002, 65878, 'open', 'turf', 290, 0.7, 87, 78, 'PVD', 'America/New_York', 42.091, -71.264),
  v('NO', 'Caesars Superdome', 'New Orleans', 'LA', 'USA', 1975, 73208, 'dome', 'turf', 3, 0.9, 153, 72, 'MSY', 'America/Chicago', 29.951, -90.081),
  v('METL', 'MetLife Stadium', 'East Rutherford', 'NJ', 'USA', 2010, 82500, 'open', 'turf', 10, 0.65, 218, 78, 'EWR', 'America/New_York', 40.814, -74.074),
  v('PHI', 'Lincoln Financial Field', 'Philadelphia', 'PA', 'USA', 2003, 69796, 'open', 'grass', 30, 0.85, 172, 78, 'PHL', 'America/New_York', 39.901, -75.168),
  v('PIT', 'Acrisure Stadium', 'Pittsburgh', 'PA', 'USA', 2001, 68400, 'open', 'grass', 730, 0.75, 129, 72, 'PIT', 'America/New_York', 40.447, -80.016),
  v('SEA', 'Lumen Field', 'Seattle', 'WA', 'USA', 2002, 68740, 'open', 'turf', 20, 1, 112, 78, 'SEA', 'America/Los_Angeles', 47.595, -122.332),
  v('SF', "Levi's Stadium", 'Santa Clara', 'CA', 'USA', 2014, 68500, 'open', 'grass', 30, 0.55, 165, 88, 'SJC', 'America/Los_Angeles', 37.403, -121.97),
  v('TB', 'Raymond James Stadium', 'Tampa', 'FL', 'USA', 1998, 69218, 'open', 'grass', 30, 0.6, 195, 70, 'TPA', 'America/New_York', 27.976, -82.503),
  v('TEN', 'Nissan Stadium', 'Nashville', 'TN', 'USA', 1999, 69143, 'open', 'turf', 450, 0.65, 177, 56, 'BNA', 'America/Chicago', 36.166, -86.771),
  v('WAS', 'Northwest Stadium', 'Landover', 'MD', 'USA', 1997, 62000, 'open', 'grass', 150, 0.55, 243, 52, 'DCA', 'America/New_York', 38.908, -76.865)
];

/** International and neutral-site venues used by the 2026 schedule. */
// prettier-ignore
export const NEUTRAL_VENUES: readonly Venue[] = [
  v('MCG', 'Melbourne Cricket Ground', 'Melbourne', 'VIC', 'Australia', 1853, 100024, 'open', 'grass', 100, 0.5, 0, 90, 'MEL', 'Australia/Melbourne', -37.82, 144.983),
  v('MARA', 'Maracanã Stadium', 'Rio de Janeiro', 'RJ', 'Brazil', 1950, 78838, 'open', 'grass', 30, 0.5, 0, 80, 'GIG', 'America/Sao_Paulo', -22.912, -43.23),
  v('TOTT', 'Tottenham Hotspur Stadium', 'London', 'ENG', 'England', 2019, 62850, 'open', 'turf', 100, 0.5, 70, 98, 'LHR', 'Europe/London', 51.604, -0.066),
  v('WEMB', 'Wembley Stadium', 'London', 'ENG', 'England', 2007, 90000, 'open', 'grass', 150, 0.5, 160, 90, 'LHR', 'Europe/London', 51.556, -0.28),
  v('SDF', 'Stade de France', 'Saint-Denis', 'IDF', 'France', 1998, 80698, 'open', 'grass', 150, 0.5, 170, 82, 'CDG', 'Europe/Paris', 48.924, 2.36),
  v('BERN', 'Santiago Bernabéu', 'Madrid', 'MD', 'Spain', 1947, 78297, 'retractable', 'grass', 2130, 0.5, 245, 98, 'MAD', 'Europe/Madrid', 40.453, -3.688),
  v('ALLZ', 'FC Bayern Munich Stadium', 'Munich', 'BY', 'Germany', 2005, 75024, 'open', 'grass', 1700, 0.5, 106, 92, 'MUC', 'Europe/Berlin', 48.219, 11.625),
  v('AZTE', 'Estadio Banorte', 'Mexico City', 'CMX', 'Mexico', 1966, 83000, 'open', 'grass', 7350, 0.5, 856, 86, 'MEX', 'America/Mexico_City', 19.303, -99.15)
];

export const ALL_VENUES: readonly Venue[] = [...STADIUMS, ...NEUTRAL_VENUES];

const BY_ID = new Map(ALL_VENUES.map(venue => [venue.id, venue]));

export function venueById(id: string): Venue {
  const venue = BY_ID.get(id);
  if (!venue) throw new Error(`Unknown venue ${id}`);
  return venue;
}

/** Finds a venue by the name the schedule feed uses. */
export function venueByName(name: string): Venue | undefined {
  const key = name.trim().toLowerCase();
  return ALL_VENUES.find(venue => venue.name.toLowerCase() === key);
}
