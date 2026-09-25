/**
 * Action composites for the sim (spec 8.3 step 5): weighted averages of the ratings each resolution uses.
 * The sim works with a player's composite minus the typical starter's at the positions that usually do the
 * action, so an average starter plays at league base rates and rating edges move the odds.
 */
import type { Ability } from '../abilities/catalog';
import { starterRatings } from '../fit/reference';
import type { Position } from '../model/positions';
import type { RatingKey, Ratings } from '../model/ratings';

type Weights = Partial<Record<RatingKey, number>>;

export const COMPOSITES = {
  passBlock: { pbk: 0.4, pbp: 0.2, pbf: 0.2, str: 0.1, awr: 0.1 },
  runBlockZone: { rbf: 0.35, rbk: 0.3, agi: 0.15, acc: 0.1, awr: 0.1 },
  runBlockGap: { rbp: 0.35, rbk: 0.3, str: 0.2, ibl: 0.15 },
  leadBlock: { lbk: 0.5, ibl: 0.25, str: 0.15, awr: 0.1 },
  passRush: { fmv: 0.3, pmv: 0.3, acc: 0.15, spd: 0.1, str: 0.1, bsh: 0.05 },
  runStop: { bsh: 0.3, str: 0.2, tak: 0.2, pur: 0.15, prc: 0.15 },
  tackle: { tak: 0.45, pur: 0.25, spd: 0.1, pow: 0.1, prc: 0.1 },
  manCover: { mcv: 0.45, spd: 0.2, agi: 0.1, cod: 0.1, prs: 0.15 },
  zoneCover: { zcv: 0.45, prc: 0.2, spd: 0.15, awr: 0.1, jmp: 0.1 },
  ballHawk: { cth: 0.35, zcv: 0.3, prc: 0.2, jmp: 0.15 },
  routeShort: { srr: 0.45, agi: 0.15, cod: 0.15, rls: 0.1, acc: 0.15 },
  routeMid: { mrr: 0.45, spd: 0.15, rls: 0.15, cod: 0.1, acc: 0.15 },
  routeDeep: { drr: 0.35, spd: 0.4, rls: 0.15, acc: 0.1 },
  hands: { cth: 0.7, cit: 0.2, awr: 0.1 },
  contested: { cit: 0.45, spc: 0.35, jmp: 0.2 },
  elusive: { jkm: 0.25, spm: 0.15, agi: 0.25, cod: 0.15, bcv: 0.2 },
  power: { trk: 0.35, btk: 0.35, str: 0.2, sfa: 0.1 },
  vision: { bcv: 0.6, awr: 0.4 },
  burst: { spd: 0.6, acc: 0.4 },
  ballSecurity: { car: 1 },
  accShort: { sac: 0.8, awr: 0.2 },
  accMid: { mac: 0.8, awr: 0.2 },
  accDeep: { dac: 0.7, thp: 0.3 },
  poise: { tup: 0.5, awr: 0.3, bsk: 0.2 },
  escape: { bsk: 0.4, spd: 0.3, agi: 0.3 },
  onRun: { tor: 0.7, spd: 0.3 },
  playAction: { pac: 1 },
  decision: { awr: 0.6, tup: 0.2, sac: 0.2 },
  kickPower: { kpw: 1 },
  kickAccuracy: { kac: 1 },
  returner: { ret: 0.4, spd: 0.2, acc: 0.15, bcv: 0.15, agi: 0.1 },
  snap: { lsp: 1 }
} as const satisfies Record<string, Weights>;

export type CompositeId = keyof typeof COMPOSITES;
export const COMPOSITE_IDS = Object.keys(COMPOSITES) as CompositeId[];

/** Positions whose typical players set each composite's zero point. */
const REFERENCE_POSITIONS: Record<CompositeId, readonly Position[]> = {
  passBlock: ['LT', 'LG', 'C', 'RG', 'RT'],
  runBlockZone: ['LT', 'LG', 'C', 'RG', 'RT'],
  runBlockGap: ['LT', 'LG', 'C', 'RG', 'RT'],
  leadBlock: ['FB'],
  passRush: ['LE', 'RE', 'DT', 'LOLB', 'ROLB'],
  runStop: ['LE', 'RE', 'DT', 'MLB'],
  tackle: ['MLB', 'LOLB', 'ROLB', 'SS', 'FS', 'CB'],
  manCover: ['CB'],
  zoneCover: ['CB', 'FS', 'SS'],
  ballHawk: ['CB', 'FS', 'SS'],
  routeShort: ['WR'],
  routeMid: ['WR'],
  routeDeep: ['WR'],
  hands: ['WR', 'TE', 'HB'],
  contested: ['WR', 'TE'],
  elusive: ['HB'],
  power: ['HB'],
  vision: ['HB'],
  burst: ['HB'],
  ballSecurity: ['HB'],
  accShort: ['QB'],
  accMid: ['QB'],
  accDeep: ['QB'],
  poise: ['QB'],
  escape: ['QB'],
  onRun: ['QB'],
  playAction: ['QB'],
  decision: ['QB'],
  kickPower: ['K', 'P'],
  kickAccuracy: ['K', 'P'],
  returner: ['HB', 'WR', 'CB'],
  snap: ['LS']
};

function value(weights: Weights, ratings: Partial<Record<RatingKey, number>>): number {
  let total = 0;
  for (const [key, w] of Object.entries(weights) as [RatingKey, number][]) total += w * (ratings[key] ?? 0);
  return total;
}

/** Each composite for the typical starter at the positions that do the action. */
export const COMPOSITE_REFERENCE: Record<CompositeId, number> = Object.fromEntries(
  COMPOSITE_IDS.map(id => {
    const positions = REFERENCE_POSITIONS[id];
    const total = positions.reduce((sum, p) => sum + value(COMPOSITES[id], starterRatings(p)), 0);
    return [id, total / positions.length];
  })
) as Record<CompositeId, number>;

export type Composites = Record<CompositeId, number>;

/** A player's composites as rating points above (or below) the typical player for each action. */
export function compositeEdges(ratings: Ratings): Composites {
  const out = {} as Composites;
  for (const id of COMPOSITE_IDS) out[id] = value(COMPOSITES[id], ratings) - COMPOSITE_REFERENCE[id];
  return out;
}

/** What an ability's rating boosts add to each composite while it is active (spec 7.4 effects). */
export function abilityEdges(ability: Pick<Ability, 'boosts'>): Partial<Composites> {
  const out: Partial<Composites> = {};
  for (const id of COMPOSITE_IDS) {
    const points = value(COMPOSITES[id], ability.boosts);
    if (points !== 0) out[id] = points;
  }
  return out;
}
