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
import {
  DEV_TRAITS,
  INTERNATIONAL_PATHWAY,
  type DevTrait,
  type Personality,
  type Player,
  type RosterStatus
} from '../model/player';
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
  const T = TUNING.traits;
  const t: Traits = { ...DEFAULT_TRAITS };
  const chance = (p: number) => rng.chance(Math.max(0, Math.min(1, p)));
  const odds = (curve: { center: number; spread: number; scale: number; base?: number }, value: number) =>
    (curve.base ?? 0) + curve.scale * sigmoid((value - curve.center) / curve.spread);
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
    t.sensePressure =
      r.awr >= T.smartQbAwareness
        ? rng.pick(['ideal', 'ideal', 'average'])
        : r.awr >= T.averageQbAwareness
          ? rng.pick(['average', 'average', 'ideal', 'triggerHappy'])
          : rng.pick(['paranoid', 'triggerHappy', 'oblivious', 'average']);
    t.throwAway = chance(odds(T.throwAway, r.awr));
    t.tightSpiral = chance(odds(T.tightSpiral, r.thp + r.dac));
    t.forcesPasses =
      r.awr >= T.idealForcesAwareness
        ? 'ideal'
        : r.thp >= T.aggressiveForcesThrowPower
          ? 'aggressive'
          : rng.pick(['conservative', 'ideal', 'aggressive']);
  }
  const [allHits, mediumHits, bigHits] = T.coversBall;
  t.coversBall =
    r.car >= allHits
      ? 'forAllHits'
      : r.car >= mediumHits
        ? 'onMediumHits'
        : r.car >= bigHits
          ? 'onBigHits'
          : 'never';
  if (['RB', 'WR', 'TE', 'QB'].includes(group)) {
    t.fightForYards = chance(tendency('fightForYards', odds(T.fightForYards, r.btk + r.trk)));
  }
  if (['WR', 'TE', 'RB'].includes(group)) {
    t.feetInBounds = chance(tendency('feetInBounds', odds(T.feetInBounds, r.cth + r.agi)));
    t.dropsOpenPasses = chance(odds(T.dropsOpenPasses, 2 * T.dropsOpenPasses.center - r.cth));
    t.possessionCatch = chance(tendency('possessionCatch', odds(T.possessionCatch, r.cit)));
    t.aggressiveCatch = chance(tendency('aggressiveCatch', odds(T.aggressiveCatch, r.spc)));
    t.yacCatch = chance(tendency('yacCatch', odds(T.yacCatch, r.spd + r.agi)));
  }
  if (['DL', 'LB', 'DB'].includes(group)) {
    t.highMotor = chance(tendency('highMotor', odds(T.highMotor, r.pur + r.sta)));
    t.bigHitter = chance(tendency('bigHitter', odds(T.bigHitter, r.pow)));
    t.stripsBall = chance(odds(T.stripsBall, r.pow + r.tak));
    if (group !== 'DL') t.playsBall = pickEnum('playsBall', { balanced: 1 }) as Traits['playsBall'];
  }
  if (group === 'DL' || position === 'LOLB' || position === 'ROLB') {
    t.dlSwim = chance(tendency('dlSwim', odds(T.dlSwim, r.fmv)));
    t.dlSpin = chance(tendency('dlSpin', odds(T.dlSpin, r.fmv)));
    t.dlBullRush = chance(tendency('dlBullRush', odds(T.dlBullRush, r.pmv)));
  }
  if (group === 'LB') t.lbStyle = pickEnum('lbStyle', { balanced: 1 }) as Traits['lbStyle'];
  t.penalty =
    r.awr >= T.disciplinedAwareness
      ? rng.pick(['disciplined', 'normal'])
      : r.awr < T.undisciplinedAwareness
        ? rng.pick(['normal', 'undisciplined'])
        : 'normal';
  t.clutch = chance(odds(T.clutch, r.awr));
  t.predictable =
    ['QB', 'RB'].includes(group) && chance(odds(T.predictable, 2 * T.predictable.center - r.awr));
  return t;
}

function drawPersonality(rng: Rng, ovr: number, age: number, awr: number): Personality {
  const P = TUNING.personality;
  const trait = ([mean, sd]: readonly [number, number], shift = 0) =>
    Math.max(1, Math.min(99, Math.round(rng.normal(mean + shift, sd))));
  return {
    ego: trait(P.ego, (ovr - P.averageOverall) * P.egoPerOverall),
    loyalty: trait(P.loyalty),
    workEthic: trait(P.workEthic),
    leadership: trait(
      P.leadership,
      (awr - P.averageOverall) * P.leadershipPerAwareness + (age - P.leadershipPivotAge) * P.leadershipPerYear
    ),
    competitiveness: trait(P.competitiveness),
    greed: trait(P.greed, (ovr - P.averageOverall) * P.greedPerOverall),
    volatility: trait(P.volatility),
    mediaStyle: trait(P.mediaStyle),
    socialActivity: trait(P.socialActivity)
  };
}

function drawDevTrait(rng: Rng, potential: number, age: number): DevTrait {
  // Development describes the future, so young players with high ceilings carry the better traits.
  const D = TUNING.development;
  const youth = age <= 25 ? D.youth.throughAge25 : age <= 29 ? D.youth.throughAge29 : D.youth.older;
  const weight = (c: { center: number; spread: number; scale: number; base: number }) =>
    sigmoid((potential - c.center) / c.spread) * c.scale * youth + c.base;
  return DEV_TRAITS[
    rng.weightedIndex([1, weight(D.star), weight(D.superstar), weight(D.xFactor)])
  ] as DevTrait;
}

/** Peak age by position group, where ratings stop rising (spec 10.5 uses the same curve later). */
export function peakAge(position: Position): number {
  return G.peakAge[POSITION_GROUP[position]];
}

export function generatePlayer(ctx: GenContext, req: PlayerRequest): Player {
  const { rng } = ctx;
  const template = TEMPLATES[req.position];
  const archetype = template.archetypes[
    rng.weightedIndex(template.archetypes.map(a => a.weight))
  ] as Archetype;
  const [minAge, maxAge] = G.ageRange;
  const age =
    req.age ?? Math.max(minAge, Math.min(maxAge, Math.round(rng.normal(template.age[0], template.age[1]))));

  const ratings: Ratings = emptyRatings();
  for (const key of RATING_KEYS) {
    const [mean, sd, loading] = template.ratings[key];
    const shared = loading * req.quality;
    const own = Math.sqrt(Math.max(0, 1 - loading * loading)) * rng.normal();
    let value = mean + (archetype.adjust[key as RatingKey] ?? 0) + sd * (shared + own);
    // Age: awareness grows with experience; athleticism fades later (spec 10.5 refines this).
    if (key === 'awr' || key === 'prc') {
      value += Math.max(
        G.awarenessRange[0],
        Math.min(G.awarenessRange[1], (age - G.awarenessPivotAge) * G.awarenessPerYear)
      );
    }
    if (['spd', 'acc', 'agi', 'cod', 'jmp'].includes(key))
      value -= Math.max(0, age - G.athleticDeclineAge) * G.athleticDeclinePerYear;
    if (key === 'sta') value -= Math.max(0, age - G.staminaDeclineAge) * G.athleticDeclinePerYear;
    if (key === 'kpw' || key === 'kac')
      value -= Math.max(0, age - G.kickingDeclineAge) * G.athleticDeclinePerYear;
    ratings[key] = Math.max(G.ratingFloor, clampRating(value));
  }

  const heightIn = Math.round(rng.normal(template.height[0] + archetype.heightAdjust, template.height[1]));
  const height = Math.max(G.heightRange[0], Math.min(G.heightRange[1], heightIn));
  const weightLb = rng.normal(
    template.weight[0] + archetype.weightAdjust + (height - template.height[0]) * G.weightPerInch,
    template.weight[1]
  );
  const weight = Math.max(G.weightRange[0], Math.min(G.weightRange[1], Math.round(weightLb)));

  const ovr = overall(req.position, ratings);
  const growth = Math.max(0, peakAge(req.position) - age) * rng.range(G.growthPerYearMin, G.growthPerYearMax);
  const potential = Math.max(ovr, Math.min(99, Math.round(ovr + growth + rng.normal(0, G.potentialNoise))));

  const birthDate = birthDateFor(rng, ctx.season, age);
  const { firstName, lastName } = pickName(ctx, Number(birthDate.slice(0, 4)));
  const { hometown, international } = pickHometown(rng, ctx.names.hometowns);
  const college =
    international && rng.chance(G.internationalPathwayShare)
      ? INTERNATIONAL_PATHWAY
      : pickCollege(rng, ctx.names.colleges, req.quality);

  const experience = Math.max(0, age - G.entryAge + (rng.chance(G.lateStartShare) ? -1 : 0));
  const draftScore = req.quality * G.draftScoreQualityWeight + rng.normal(0, G.draftScoreNoise);
  const draftYear = ctx.season - experience;
  const draft =
    college === INTERNATIONAL_PATHWAY || draftScore < G.undraftedBelow
      ? { year: draftYear, undrafted: true as const }
      : (() => {
          const round = Math.max(
            1,
            Math.min(7, Math.ceil((G.draftRoundBase - draftScore) * G.draftRoundScale))
          );
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
    handedness:
      HANDED.includes(req.position) && rng.chance(req.position === 'QB' ? G.leftHandedQb : G.leftFootedKicker)
        ? 'L'
        : 'R',
    experience,
    // A generated veteran's seasons all counted both ways.
    accrued: experience,
    draft,
    ratings,
    potential,
    ovr,
    traits: drawTraits(rng, req.position, ratings, archetype.traits),
    abilities: [],
    dev: drawDevTrait(rng, potential, age),
    personality: drawPersonality(rng, ovr, age, ratings.awr),
    team: req.team,
    // A veteran joined his team in his draft year if it drafted him, else halfway through his career so far.
    joined: 'team' in draft && draft.team === req.team ? draft.year : ctx.season - Math.floor(experience / 2),
    lastTeam: null,
    status: req.status,
    morale: Math.max(G.morale[2], Math.min(G.morale[3], Math.round(rng.normal(G.morale[0], G.morale[1])))),
    contractId: null,
    injury: null
  };
}
