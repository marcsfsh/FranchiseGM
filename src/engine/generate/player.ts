/**
 * Player generation (spec 10.1, 10.2): position, archetype, correlated ratings, height and weight,
 * traits conditional on ratings, personality, hidden potential, and development trait. Used for the
 * fictional league now and for draft classes in M11.
 */
import type { Colleges, FirstNames, Hometowns, WeightedList } from '../../data/names';
import type { TeamAbbr } from '../../data/team-colors';
import { TEAM_ABBRS } from '../../data/team-colors';
import type { Rng } from '../rng';
import { HANDED, POSITION_GROUP, type Position } from '../model/positions';
import { RATING_KEYS, clampRating, emptyRatings, type RatingKey, type Ratings } from '../model/ratings';
import { DEV_TRAITS, type DevTrait, type Personality, type Player, type RosterStatus } from '../model/player';
import { DEFAULT_TRAITS, type Traits } from '../model/traits';
import { overall } from '../ratings/overall';
import { TUNING } from '../tuning';
import { TEMPLATES, type Archetype, type TraitTendencies } from './archetypes';

export interface NameData {
  first: FirstNames;
  surnames: WeightedList;
  hometowns: Hometowns;
  colleges: Colleges;
}

export interface GenContext {
  rng: Rng;
  names: NameData;
  /** League year being generated for. Ages are as of September 1. */
  season: number;
  /** Full names already in use, so none repeat (spec 10.1). */
  usedNames: Set<string>;
  newId(): string;
}

export interface PlayerRequest {
  position: Position;
  /** Latent quality in standard deviations: 0 is an average rostered player. */
  quality: number;
  age?: number;
  team: TeamAbbr | null;
  status: RosterStatus;
  jersey?: number;
}

const G = TUNING.generation;

// Cumulative weight tables, built once per data object.
const cumulativeCache = new WeakMap<readonly number[], Float64Array>();
function cumulative(weights: readonly number[]): Float64Array {
  let table = cumulativeCache.get(weights);
  if (!table) {
    table = new Float64Array(weights.length);
    let sum = 0;
    weights.forEach((w, i) => {
      sum += Math.max(0, w);
      (table as Float64Array)[i] = sum;
    });
    cumulativeCache.set(weights, table);
  }
  return table;
}

/** Index drawn in proportion to the weights. Binary search over the cumulative table. */
export function weightedDraw(rng: Rng, weights: readonly number[]): number {
  const table = cumulative(weights);
  const target = rng.float() * (table[table.length - 1] as number);
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((table[mid] as number) > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function birthDateFor(rng: Rng, season: number, age: number): string {
  const month = rng.int(1, 12);
  const day = rng.int(1, month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31);
  // Age is measured on September 1 of the season.
  const year = season - age - (month > 9 || (month === 9 && day > 1) ? 1 : 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pickName(ctx: GenContext, birthYear: number): { firstName: string; lastName: string } {
  const { first, surnames } = ctx.names;
  const bucket = Math.max(
    0,
    Math.min(first.buckets.length - 1, Math.floor((birthYear - (first.buckets[0] ?? 1975)) / 5))
  );
  const weights = first.weights[bucket] as number[];
  for (let attempt = 0; attempt < 40; attempt++) {
    const firstName = first.names[weightedDraw(ctx.rng, weights)] as string;
    const lastName = surnames.names[weightedDraw(ctx.rng, surnames.weights)] as string;
    const key = `${firstName} ${lastName}`;
    if (!ctx.usedNames.has(key)) {
      ctx.usedNames.add(key);
      return { firstName, lastName };
    }
  }
  // Very unlikely: fall back to a generational suffix that keeps the name unique.
  for (const suffix of ['Jr.', 'II', 'III', 'IV']) {
    const firstName = first.names[weightedDraw(ctx.rng, weights)] as string;
    const lastName = `${surnames.names[weightedDraw(ctx.rng, surnames.weights)]} ${suffix}`;
    if (!ctx.usedNames.has(`${firstName} ${lastName}`)) {
      ctx.usedNames.add(`${firstName} ${lastName}`);
      return { firstName, lastName };
    }
  }
  throw new Error('Could not find an unused name');
}

const POWER = new Set(['SEC', 'Big Ten', 'ACC', 'Big 12', 'Independent']);
type Tier = 'power' | 'group5' | 'fcs' | 'small';
const tierOf = (division: string, conference: string): Tier =>
  division === 'FBS' ? (POWER.has(conference) ? 'power' : 'group5') : division === 'FCS' ? 'fcs' : 'small';

const tierCache = new WeakMap<
  Colleges,
  Record<Tier, { index: number[]; weights: number[]; total: number }>
>();
function collegeTiers(colleges: Colleges) {
  let tiers = tierCache.get(colleges);
  if (!tiers) {
    tiers = { power: { index: [], weights: [], total: 0 }, group5: { index: [], weights: [], total: 0 }, fcs: { index: [], weights: [], total: 0 }, small: { index: [], weights: [], total: 0 } }; // prettier-ignore
    colleges.names.forEach((_, i) => {
      const tier = (tiers as Record<Tier, { index: number[]; weights: number[]; total: number }>)[
        tierOf(colleges.divisions[i] as string, colleges.conferences[i] as string)
      ];
      tier.index.push(i);
      tier.weights.push(colleges.weights[i] as number);
      tier.total += colleges.weights[i] as number;
    });
    tierCache.set(colleges, tiers);
  }
  return tiers;
}

/** Better players come from bigger programs more often, but every tier produces talent. */
function pickCollege(rng: Rng, colleges: Colleges, quality: number): string {
  const tiers = collegeTiers(colleges);
  const names: Tier[] = ['power', 'group5', 'fcs', 'small'];
  const tilt = [G.collegeTilt, 0, -G.collegeTilt, -G.collegeTilt * 1.5];
  const weights = names.map((t, i) => tiers[t].total * Math.exp((tilt[i] as number) * quality));
  const tier = tiers[names[rng.weightedIndex(weights)] as Tier];
  return colleges.names[tier.index[weightedDraw(rng, tier.weights)] as number] as string;
}

function pickHometown(rng: Rng, towns: Hometowns): { hometown: string; international: boolean } {
  const i = weightedDraw(rng, towns.weights);
  const country = towns.countries[i] as string;
  const place = towns.regions[i]
    ? `${towns.cities[i]}, ${towns.regions[i]}`
    : `${towns.cities[i]}, ${country}`;
  return { hometown: place, international: country !== 'USA' };
}

function drawTraits(rng: Rng, position: Position, r: Ratings, tendencies: TraitTendencies): Traits {
  const t: Traits = { ...DEFAULT_TRAITS };
  const chance = (p: number) => rng.chance(Math.max(0, Math.min(1, p)));
  const group = POSITION_GROUP[position];
  const tendency = (key: keyof Traits, fallback: number) => {
    const value = tendencies[key];
    return typeof value === 'number' ? value : fallback;
  };
  const pickEnum = (key: keyof Traits, fallback: Record<string, number>) => {
    const value = tendencies[key];
    const table = value && typeof value === 'object' ? value : fallback;
    const keys = Object.keys(table);
    return keys[rng.weightedIndex(keys.map(k => table[k] as number))] as string;
  };
  if (position === 'QB') {
    t.qbStyle = pickEnum('qbStyle', { balanced: 1 }) as Traits['qbStyle'];
    t.sensePressure = r.awr >= 80 ? rng.pick(['ideal', 'ideal', 'average']) : r.awr >= 65 ? rng.pick(['average', 'average', 'ideal', 'triggerHappy']) : rng.pick(['paranoid', 'triggerHappy', 'oblivious', 'average']); // prettier-ignore
    t.throwAway = chance(sigmoid((r.awr - 72) / 6));
    t.tightSpiral = chance(sigmoid((r.thp + r.dac - 160) / 8));
    t.forcesPasses =
      r.awr >= 78 ? 'ideal' : r.thp >= 90 ? 'aggressive' : rng.pick(['conservative', 'ideal', 'aggressive']);
  }
  t.coversBall =
    r.car >= 85 ? 'forAllHits' : r.car >= 75 ? 'onMediumHits' : r.car >= 60 ? 'onBigHits' : 'never';
  if (['RB', 'WR', 'TE', 'QB'].includes(group)) {
    t.fightForYards = chance(tendency('fightForYards', sigmoid((r.btk + r.trk - 140) / 10)));
  }
  if (['WR', 'TE', 'RB'].includes(group)) {
    t.feetInBounds = chance(tendency('feetInBounds', sigmoid((r.cth + r.agi - 160) / 8)));
    t.dropsOpenPasses = chance(sigmoid((60 - r.cth) / 6));
    t.possessionCatch = chance(tendency('possessionCatch', sigmoid((r.cit - 75) / 6)));
    t.aggressiveCatch = chance(tendency('aggressiveCatch', sigmoid((r.spc - 75) / 6)));
    t.yacCatch = chance(tendency('yacCatch', sigmoid((r.spd + r.agi - 175) / 6)));
  }
  if (['DL', 'LB', 'DB'].includes(group)) {
    t.highMotor = chance(tendency('highMotor', sigmoid((r.pur + r.sta - 160) / 10)));
    t.bigHitter = chance(tendency('bigHitter', sigmoid((r.pow - 75) / 6)));
    t.stripsBall = chance(sigmoid((r.pow + r.tak - 160) / 10) * 0.6);
    if (group !== 'DL') t.playsBall = pickEnum('playsBall', { balanced: 1 }) as Traits['playsBall'];
  }
  if (group === 'DL' || position === 'LOLB' || position === 'ROLB') {
    t.dlSwim = chance(tendency('dlSwim', sigmoid((r.fmv - 75) / 6) * 0.7));
    t.dlSpin = chance(tendency('dlSpin', sigmoid((r.fmv - 78) / 6) * 0.5));
    t.dlBullRush = chance(tendency('dlBullRush', sigmoid((r.pmv - 75) / 6) * 0.7));
  }
  if (group === 'LB') t.lbStyle = pickEnum('lbStyle', { balanced: 1 }) as Traits['lbStyle'];
  t.penalty =
    r.awr >= 80
      ? rng.pick(['disciplined', 'normal'])
      : r.awr < 58
        ? rng.pick(['normal', 'undisciplined'])
        : 'normal';
  t.clutch = chance(0.08 + 0.12 * sigmoid((r.awr - 80) / 5));
  t.predictable = ['QB', 'RB'].includes(group) && chance(sigmoid((55 - r.awr) / 6) * 0.3);
  return t;
}

function drawPersonality(rng: Rng, ovr: number, age: number, awr: number): Personality {
  const trait = (mean: number, sd: number) => Math.max(1, Math.min(99, Math.round(rng.normal(mean, sd))));
  return {
    ego: trait(45 + (ovr - 70) * 0.6, 17),
    loyalty: trait(50, 20),
    workEthic: trait(60, 17),
    leadership: trait(45 + (awr - 70) * 0.4 + (age - 26) * 1.5, 17),
    competitiveness: trait(62, 15),
    greed: trait(48 + (ovr - 70) * 0.3, 19),
    volatility: trait(38, 18),
    mediaStyle: trait(50, 20),
    socialActivity: trait(50, 22)
  };
}

function drawDevTrait(rng: Rng, potential: number, age: number): DevTrait {
  // Development describes the future, so young players with high ceilings carry the better traits.
  const young = age <= 25 ? 1 : age <= 29 ? 0.85 : 0.7;
  const weights = [
    1,
    sigmoid((potential - 78) / 4) * 0.55 * young + 0.08,
    sigmoid((potential - 84) / 3) * 0.7 * young + 0.01,
    sigmoid((potential - 90) / 2) * 0.5 * young
  ];
  return DEV_TRAITS[rng.weightedIndex(weights)] as DevTrait;
}

/** Peak age by position group, where ratings stop rising (spec 10.5 uses the same curve later). */
export function peakAge(position: Position): number {
  const group = POSITION_GROUP[position];
  return group === 'QB' || group === 'ST'
    ? 30
    : group === 'RB'
      ? 25
      : group === 'DB' || group === 'WR'
        ? 26
        : 27;
}

export function generatePlayer(ctx: GenContext, req: PlayerRequest): Player {
  const { rng } = ctx;
  const template = TEMPLATES[req.position];
  const archetype = template.archetypes[
    rng.weightedIndex(template.archetypes.map(a => a.weight))
  ] as Archetype;
  const age = req.age ?? Math.max(21, Math.min(40, Math.round(rng.normal(template.age[0], template.age[1]))));

  const ratings: Ratings = emptyRatings();
  for (const key of RATING_KEYS) {
    const [mean, sd, loading] = template.ratings[key];
    const shared = loading * req.quality;
    const own = Math.sqrt(Math.max(0, 1 - loading * loading)) * rng.normal();
    let value = mean + (archetype.adjust[key as RatingKey] ?? 0) + sd * (shared + own);
    // Age: awareness grows with experience; athleticism fades past 29 (spec 10.5 refines this).
    if (key === 'awr' || key === 'prc') value += Math.max(-5, Math.min(6, (age - 25) * G.awarenessPerYear));
    if (['spd', 'acc', 'agi', 'cod', 'jmp'].includes(key))
      value -= Math.max(0, age - 29) * G.athleticDeclinePerYear;
    if (key === 'sta') value -= Math.max(0, age - 31) * G.athleticDeclinePerYear;
    if ((key === 'kpw' || key === 'kac') && age > 35) value -= (age - 35) * G.athleticDeclinePerYear;
    ratings[key] = Math.max(G.ratingFloor, clampRating(value));
  }

  const heightIn = Math.round(rng.normal(template.height[0] + archetype.heightAdjust, template.height[1]));
  const height = Math.max(66, Math.min(82, heightIn));
  const weightLb = rng.normal(
    template.weight[0] + archetype.weightAdjust + (height - template.height[0]) * 4,
    template.weight[1]
  );
  const weight = Math.max(160, Math.min(380, Math.round(weightLb)));

  const ovr = overall(req.position, ratings);
  const growth = Math.max(0, peakAge(req.position) - age) * rng.range(G.growthPerYearMin, G.growthPerYearMax);
  const potential = Math.max(ovr, Math.min(99, Math.round(ovr + growth + rng.normal(0, 2))));

  const birthDate = birthDateFor(rng, ctx.season, age);
  const { firstName, lastName } = pickName(ctx, Number(birthDate.slice(0, 4)));
  const { hometown, international } = pickHometown(rng, ctx.names.hometowns);
  const college =
    international && rng.chance(G.internationalPathwayShare)
      ? ''
      : pickCollege(rng, ctx.names.colleges, req.quality);

  const experience = Math.max(0, age - 22 + (rng.chance(0.25) ? -1 : 0));
  const draftScore = req.quality * 0.8 + rng.normal(0, 0.8);
  const draftYear = ctx.season - experience;
  const draft =
    college === '' || draftScore < G.undraftedBelow
      ? { year: draftYear, undrafted: true as const }
      : (() => {
          const round = Math.max(1, Math.min(7, Math.ceil((1.6 - draftScore) * 2.2)));
          return {
            year: draftYear,
            round,
            pick: (round - 1) * 32 + rng.int(1, 32),
            team: rng.pick(TEAM_ABBRS)
          };
        })();

  return {
    id: ctx.newId(),
    firstName,
    lastName,
    position: req.position,
    jersey: req.jersey ?? 0,
    birthDate,
    college,
    hometown,
    height,
    weight,
    handedness: HANDED.includes(req.position) && rng.chance(req.position === 'QB' ? 0.07 : 0.12) ? 'L' : 'R',
    experience,
    draft,
    ratings,
    potential,
    ovr,
    traits: drawTraits(rng, req.position, ratings, archetype.traits),
    abilities: [],
    dev: drawDevTrait(rng, potential, age),
    personality: drawPersonality(rng, ovr, age, ratings.awr),
    team: req.team,
    status: req.status,
    morale: Math.max(30, Math.min(95, Math.round(rng.normal(70, 8)))),
    contractId: null
  };
}
