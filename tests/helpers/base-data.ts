import { readFileSync } from 'node:fs';
import { parseColleges, parseFirstNames, parseHometowns, parseSurnames } from '../../src/data/names';
import type { GenContext, NameData } from '../../src/engine/generate/player';
import { Rng } from '../../src/engine/rng';

const raw = (name: string) => readFileSync(`data-raw/${name}`, 'utf8');

let cached: NameData | null = null;

/** Name, hometown, and college lists straight from data-raw, for tests. */
export function nameData(): NameData {
  cached ??= {
    first: parseFirstNames(raw('first-names.csv')),
    surnames: parseSurnames(raw('surnames.csv')),
    hometowns: parseHometowns(raw('hometowns.csv')),
    colleges: parseColleges(raw('colleges.csv'))
  };
  return cached;
}

export function genContext(seed: number, season = 2026): GenContext {
  let n = 0;
  return { rng: new Rng(seed), names: nameData(), season, usedNames: new Set(), newId: () => `p${++n}` };
}
