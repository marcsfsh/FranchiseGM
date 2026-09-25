/** Monthly climate normals per weather station (spec 17.1), from data-raw/climate.csv. */
import { parseCsv } from './csv';

export interface MonthClimate {
  /** Mean daily high and low, Fahrenheit. */
  highF: number;
  lowF: number;
  /** Monthly precipitation and snowfall, inches. */
  precipIn: number;
  snowIn: number;
  /** Mean wind speed, mph. */
  windMph: number;
}

/** Twelve months, January first, keyed by station. */
export type ClimateTable = Record<string, MonthClimate[]>;

export function parseClimate(text: string): ClimateTable {
  const table: ClimateTable = {};
  for (const row of parseCsv(text).rows) {
    const key = row.key as string;
    const month = Number(row.month);
    const num = (field: string) => {
      const value = Number(row[field]);
      if (row[field] === '' || !Number.isFinite(value))
        throw new Error(`climate ${key} month ${month}: missing ${field}`);
      return value;
    };
    (table[key] ??= [])[month - 1] = {
      highF: num('tmax_f'),
      lowF: num('tmin_f'),
      precipIn: num('precip_in'),
      snowIn: num('snow_in'),
      windMph: num('wind_mph')
    };
  }
  for (const [key, months] of Object.entries(table)) {
    if (months.length !== 12 || months.some(m => !m)) throw new Error(`climate ${key}: expected 12 months`);
  }
  return table;
}
