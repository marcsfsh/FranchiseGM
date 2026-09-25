/**
 * Name, hometown, and college lists for player and staff generation (spec 10.1). The raw files in
 * data-raw/ carry their public-domain sources in their headers.
 */
import { parseCsv } from './csv';

export interface FirstNames {
  names: string[];
  /** First birth year of each five-year bucket. */
  buckets: number[];
  /** weights[bucket][i] is the relative frequency of names[i] for births in that bucket. */
  weights: number[][];
}

export interface WeightedList {
  names: string[];
  weights: number[];
}

export interface Hometowns {
  cities: string[];
  /** US state, or blank outside the US. */
  regions: string[];
  countries: string[];
  weights: number[];
}

export interface Colleges {
  names: string[];
  divisions: string[];
  conferences: string[];
  regions: string[];
  weights: number[];
}

export function parseFirstNames(text: string): FirstNames {
  const table = parseCsv(text);
  const bucketHeaders = table.headers.filter(h => /^b\d{4}$/.test(h));
  return {
    names: table.rows.map(r => r.name as string),
    buckets: bucketHeaders.map(h => Number(h.slice(1))),
    weights: bucketHeaders.map(h => table.rows.map(r => Number(r[h])))
  };
}

export function parseSurnames(text: string): WeightedList {
  const rows = parseCsv(text).rows;
  return { names: rows.map(r => r.name as string), weights: rows.map(r => Number(r.count)) };
}

export function parseHometowns(text: string): Hometowns {
  const rows = parseCsv(text).rows;
  return {
    cities: rows.map(r => r.city as string),
    regions: rows.map(r => r.region as string),
    countries: rows.map(r => r.country as string),
    weights: rows.map(r => Number(r.weight))
  };
}

export function parseColleges(text: string): Colleges {
  const rows = parseCsv(text).rows;
  return {
    names: rows.map(r => r.name as string),
    divisions: rows.map(r => r.division as string),
    conferences: rows.map(r => r.conference as string),
    regions: rows.map(r => r.region as string),
    weights: rows.map(r => Number(r.weight))
  };
}
