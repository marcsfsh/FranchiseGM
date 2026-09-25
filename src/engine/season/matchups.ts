/**
 * Who plays whom, and where, in a season after the seed year (spec 5.2). Each team plays its division
 * rivals home and away, a division of its own conference on a 3-year rotation, a division of the other
 * conference on a 4-year rotation, the same-place finishers of the other two divisions in its conference,
 * and a 17th game against a same-place finisher in the other conference. The rotations are matched from
 * the seed year's schedule and advanced a year at a time, and a rotating meeting's site flips from the last
 * time the rotation brought the two divisions together.
 */
import { TEAMS, divisionKey, team, type Conference, type TeamAbbr } from '../../data/teams';

export type MatchupKind = 'division' | 'conference' | 'interconference' | 'place' | 'extra';

export interface Matchup {
  home: TeamAbbr;
  away: TeamAbbr;
  kind: MatchupKind;
}

/** A game of the seed year's schedule. */
export interface SeedGame {
  home: TeamAbbr;
  away: TeamAbbr;
}

/** Two divisions, by key ("AFC East"). Inter-conference pairs list the AFC division first. */
export type DivisionPair = readonly [string, string];

/** The rotations as the seed year shows them, with the cycles completed. */
export interface Rotation {
  seedYear: number;
  /** Each conference's three division matchings in the order the 3-year cycle plays them, seed year first. */
  intra: Record<Conference, DivisionPair[][]>;
  /** The four matchings of AFC to NFC divisions in the order the 4-year cycle plays them, seed year first. */
  inter: DivisionPair[][];
  /** The conference that hosted the 17th game in the seed year. */
  extraHost: Conference;
  /** Seed-year hosts of the division-rotation meetings, by team pair. */
  hosts: Record<string, TeamAbbr>;
  /** Seed-year same-place hosting in each conference, as [host division, visiting division]. */
  place: Record<Conference, DivisionPair[]>;
}

const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];
/** Teams in a division. */
const SIZE = TEAMS.length / new Set(TEAMS.map(divisionKey)).size;
/**
 * The 17th game's division is the one the 4-year rotation brings two years later (and brought two years
 * earlier), so the seed year's 17th-game matching sits two places along the inter-conference cycle.
 */
const EXTRA_AHEAD = 2;

const divisionOfTeam = (abbr: TeamAbbr): string => divisionKey(team(abbr));
/** A conference's divisions in name order. */
const divisionsOf = (conference: Conference): string[] =>
  [...new Set(TEAMS.filter(t => t.conf === conference).map(divisionKey))].sort();
/** A division's teams in abbreviation order. */
const teamsOf = (division: string): TeamAbbr[] =>
  TEAMS.filter(t => divisionKey(t) === division)
    .map(t => t.abbr)
    .sort();
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const otherConference = (c: Conference): Conference => (c === 'AFC' ? 'NFC' : 'AFC');
const conferenceOf = (division: string): Conference => (division.startsWith('AFC') ? 'AFC' : 'NFC');

/** The three ways to split a conference's four divisions into two pairs, the first division's pair first. */
function splits(divisions: readonly string[]): DivisionPair[][] {
  const [d0, ...rest] = divisions as [string, ...string[]];
  return rest.map(partner => {
    const [a, b] = rest.filter(d => d !== partner) as [string, string];
    return [
      [d0, partner],
      [a, b]
    ];
  });
}

/** Matches the rotations in the seed year's schedule and completes their cycles. */
export function matchRotation(seed: readonly SeedGame[], seedYear: number): Rotation {
  const games = new Map<string, number>();
  const hosted = new Map<string, Map<string, number>>();
  for (const g of seed) {
    const home = divisionOfTeam(g.home);
    const away = divisionOfTeam(g.away);
    if (home === away) continue;
    const key = pairKey(home, away);
    games.set(key, (games.get(key) ?? 0) + 1);
    const byHost = hosted.get(key) ?? new Map<string, number>();
    byHost.set(home, (byHost.get(home) ?? 0) + 1);
    hosted.set(key, byHost);
  }
  // A rotation meets every team of the other division; same-place and 17th games meet one team per place.
  const pairsWith = (count: number, sameConference: boolean): DivisionPair[] =>
    [...games]
      .filter(([key, n]) => n === count && sameConference === (conferenceOf(key.split('|')[0] as string) === conferenceOf(key.split('|')[1] as string)))
      .map(([key]) => key.split('|') as unknown as DivisionPair)
      .sort(); // prettier-ignore
  const hostOf = (pair: DivisionPair): string => {
    const byHost = [...(hosted.get(pairKey(pair[0], pair[1])) ?? new Map<string, number>())];
    return byHost.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? pair[0];
  };

  const intra = {} as Record<Conference, DivisionPair[][]>;
  const place = {} as Record<Conference, DivisionPair[]>;
  for (const conference of CONFERENCES) {
    const divisions = divisionsOf(conference);
    const seeded = pairsWith(SIZE * SIZE, true).filter(p => conferenceOf(p[0]) === conference);
    const all = splits(divisions);
    const partner = (split: DivisionPair[]): string => split[0]?.[1] ?? '';
    const partnerInSeed = seeded.find(p => p.includes(divisions[0] as string))?.find(d => d !== divisions[0]);
    const first = all.find(s => partner(s) === partnerInSeed);
    if (seeded.length !== 2 || !first)
      throw new Error(`The seed schedule has no ${conference} division rotation.`);
    // The rest of the cycle: the first division's remaining partners, later name first (the NFL's order after
    // 2026: the AFC East meets the AFC South in 2027 and the AFC North in 2028).
    const rest = all.filter(s => s !== first).sort((a, b) => (partner(a) < partner(b) ? 1 : -1));
    intra[conference] = [first, ...rest];
    const hosting = pairsWith(SIZE, true)
      .filter(p => conferenceOf(p[0]) === conference)
      .map(p => (hostOf(p) === p[0] ? p : ([p[1], p[0]] as const)));
    const eachOnce = divisions.every(d => hosting.filter(p => p[0] === d).length === 1);
    place[conference] = hosting.length === divisions.length && eachOnce ? hosting : cyclePlace(first);
  }

  const afc = divisionsOf('AFC');
  const nfc = divisionsOf('NFC');
  const inSeed = pairsWith(SIZE * SIZE, false);
  const extraSeed = pairsWith(SIZE, false);
  if (inSeed.length !== afc.length || extraSeed.length !== afc.length)
    throw new Error('The seed schedule has no inter-conference rotation.');
  const taken = new Set([...inSeed, ...extraSeed].map(p => pairKey(p[0], p[1])));
  const open: DivisionPair[][] = [];
  const build = (i: number, used: Set<string>, pairs: DivisionPair[]): void => {
    if (i === afc.length) {
      open.push([...pairs]);
      return;
    }
    const a = afc[i] as string;
    for (const n of nfc) {
      if (used.has(n) || taken.has(pairKey(a, n))) continue;
      used.add(n);
      pairs.push([a, n]);
      build(i + 1, used, pairs);
      pairs.pop();
      used.delete(n);
    }
  };
  build(0, new Set(), []);
  // The first open matching in name order comes next (the AFC East meets the NFC East in 2027), and the
  // pairs left over close the cycle.
  const next = open[0];
  const nextKeys = new Set(next?.map(p => pairKey(p[0], p[1])));
  const last = open.find(m => m.every(p => !nextKeys.has(pairKey(p[0], p[1]))));
  if (!next || !last) throw new Error('The seed schedule leaves no 4-year inter-conference cycle.');
  const extraGame = seed.find(g => conferenceOf(divisionOfTeam(g.home)) !== conferenceOf(divisionOfTeam(g.away)) && extraSeed.some(p => p.includes(divisionOfTeam(g.home)) && p.includes(divisionOfTeam(g.away)))); // prettier-ignore
  const inter = [inSeed, next, extraSeed, last];
  const hosts: Record<string, TeamAbbr> = {};
  const rotating = new Set([...inSeed, ...intra.AFC[0] ?? [], ...intra.NFC[0] ?? []].map(p => pairKey(p[0], p[1]))); // prettier-ignore
  for (const g of seed)
    if (rotating.has(pairKey(divisionOfTeam(g.home), divisionOfTeam(g.away))))
      hosts[pairKey(g.home, g.away)] = g.home;
  return {
    seedYear,
    intra,
    inter,
    extraHost: extraGame ? team(extraGame.home).conf : 'NFC',
    hosts,
    place
  };
}

/**
 * Same-place hosting for a division split seen for the first time: the first division hosts the first team
 * of the other pair, and around the cycle each division hosts once and visits once.
 */
function cyclePlace(split: readonly DivisionPair[]): DivisionPair[] {
  const [[a, a2], [b, b2]] = split as [DivisionPair, DivisionPair];
  return [
    [a, b],
    [b, a2],
    [a2, b2],
    [b2, a]
  ];
}

const flip = (pairs: readonly DivisionPair[], flipped: boolean): DivisionPair[] =>
  pairs.map(([h, v]) => (flipped ? [v, h] : [h, v]));

/**
 * The 16 games between two rotating divisions. The seed year's sites come from its schedule; a pairing the
 * seed year didn't have starts from a balanced pattern (each team two home and two away). Every return of
 * the rotation flips the sites.
 */
function rotationGames(
  rotation: Rotation,
  pair: DivisionPair,
  seeded: boolean,
  returns: number,
  kind: MatchupKind
): Matchup[] {
  const rows = teamsOf(pair[0]);
  const cols = teamsOf(pair[1]);
  const games: Matchup[] = [];
  rows.forEach((x, i) =>
    cols.forEach((y, j) => {
      const pattern = (i + j) % SIZE < SIZE / 2 ? x : y;
      let host = seeded ? (rotation.hosts[pairKey(x, y)] ?? pattern) : pattern;
      if (returns % 2) host = host === x ? y : x;
      games.push({ home: host, away: host === x ? y : x, kind });
    })
  );
  return games;
}

/** Same-place hosting in a conference for a year: the seed's, or the first-time cycle, flipped on each return. */
export function placeHosting(rotation: Rotation, conference: Conference, year: number): DivisionPair[] {
  const k = year - rotation.seedYear;
  const cycle = rotation.intra[conference];
  const i = k % cycle.length;
  const base = i === 0 ? rotation.place[conference] : cyclePlace(cycle[i] ?? []);
  return flip(base, Math.floor(k / cycle.length) % 2 === 1);
}

/** Each conference's division pairs in the 3-year rotation for a year. */
export const intraPairs = (rotation: Rotation, conference: Conference, year: number): DivisionPair[] => {
  const cycle = rotation.intra[conference];
  return cycle[(year - rotation.seedYear) % cycle.length] ?? [];
};

/** The AFC-NFC division pairs in the 4-year rotation for a year. */
export const interPairs = (rotation: Rotation, year: number): DivisionPair[] =>
  rotation.inter[(year - rotation.seedYear) % rotation.inter.length] ?? [];

/** The AFC-NFC division pairs of the 17th game for a year, and the conference that hosts it. */
export function extraPairs(rotation: Rotation, year: number): { pairs: DivisionPair[]; host: Conference } {
  const k = year - rotation.seedYear;
  return {
    pairs: rotation.inter[(k + EXTRA_AHEAD) % rotation.inter.length] ?? [],
    host: k % 2 === 0 ? rotation.extraHost : otherConference(rotation.extraHost)
  };
}

/** A division's teams by last season's finish (1 is first), ties and gaps in abbreviation order. */
function byPlace(division: string, places: Partial<Record<TeamAbbr, number>>): TeamAbbr[] {
  return teamsOf(division).sort((a, b) => (places[a] ?? SIZE) - (places[b] ?? SIZE) || (a < b ? -1 : 1));
}

/** Every game of a season from the seed year on, with its host (spec 5.2). */
export function seasonMatchups(
  rotation: Rotation,
  year: number,
  places: Partial<Record<TeamAbbr, number>>
): Matchup[] {
  const k = year - rotation.seedYear;
  if (!Number.isInteger(k) || k < 0) throw new RangeError(`No rotation for ${year}.`);
  const games: Matchup[] = [];
  for (const division of new Set(TEAMS.map(divisionKey))) {
    const clubs = teamsOf(division);
    for (const home of clubs)
      for (const away of clubs) if (home !== away) games.push({ home, away, kind: 'division' });
  }
  for (const conference of CONFERENCES) {
    const cycle = rotation.intra[conference];
    for (const pair of intraPairs(rotation, conference, year))
      games.push(...rotationGames(rotation, pair, k % cycle.length === 0, Math.floor(k / cycle.length), 'conference'));
  } // prettier-ignore
  const cycle = rotation.inter.length;
  for (const pair of interPairs(rotation, year))
    games.push(...rotationGames(rotation, pair, k % cycle === 0, Math.floor(k / cycle), 'interconference'));
  for (const conference of CONFERENCES)
    for (const [host, visitor] of placeHosting(rotation, conference, year)) {
      const hosts = byPlace(host, places);
      const visitors = byPlace(visitor, places);
      hosts.forEach((home, p) => games.push({ home, away: visitors[p] as TeamAbbr, kind: 'place' }));
    }
  const extra = extraPairs(rotation, year);
  for (const [afcDivision, nfcDivision] of extra.pairs) {
    const afcTeams = byPlace(afcDivision, places);
    const nfcTeams = byPlace(nfcDivision, places);
    afcTeams.forEach((a, p) => {
      const n = nfcTeams[p] as TeamAbbr;
      games.push(
        extra.host === 'AFC' ? { home: a, away: n, kind: 'extra' } : { home: n, away: a, kind: 'extra' }
      );
    });
  }
  return games;
}
