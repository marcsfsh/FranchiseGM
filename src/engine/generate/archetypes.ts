/**
 * Expands the archetype templates (src/data/archetypes.json, provisional) into per-position rating
 * distributions (spec 10.2). A rating is mean + adjust + sd x (loading x quality + sqrt(1 - loading^2) x noise).
 */
import raw from '../../data/archetypes.json';
import { POSITIONS, type Position } from '../model/positions';
import { RATING_KEYS, type RatingKey } from '../model/ratings';
import type { Traits } from '../model/traits';
import { HAND_SET_FORMULAS } from '../ratings/overall';

export type RatingSpec = readonly [mean: number, sd: number, loading: number];

/** Trait tendencies: a probability for boolean traits, or weights over values for enum traits. */
export type TraitTendencies = Partial<Record<keyof Traits, number | Record<string, number>>>;

export interface Archetype {
  name: string;
  weight: number;
  adjust: Partial<Record<RatingKey, number>>;
  heightAdjust: number;
  weightAdjust: number;
  traits: TraitTendencies;
}

export interface PositionTemplate {
  position: Position;
  height: readonly [number, number];
  weight: readonly [number, number];
  age: readonly [number, number];
  ratings: Record<RatingKey, RatingSpec>;
  archetypes: Archetype[];
}

interface RawArchetype {
  name: string;
  weight: number;
  adjust?: Record<string, number>;
  height_adjust?: number;
  weight_adjust?: number;
  traits?: TraitTendencies;
}

interface RawPosition {
  same?: string;
  height?: [number, number];
  weight?: [number, number];
  age?: [number, number];
  ratings?: Record<string, [number, number, number]>;
  archetypes?: RawArchetype[];
}

interface RawFile {
  status: string;
  keyDefault: [number, number, number];
  otherDefault: [number, number, number];
  shared: Record<string, [number, number, number]>;
  positions: Record<string, RawPosition>;
}

const FILE = raw as unknown as RawFile;

export const ARCHETYPES_STATUS: string = FILE.status;

function expand(position: Position): PositionTemplate {
  const file = FILE;
  let entry = file.positions[position];
  if (!entry) throw new Error(`No archetype template for ${position}`);
  if (entry.same) entry = file.positions[entry.same] as RawPosition;
  const keys = new Set(Object.keys(HAND_SET_FORMULAS[position].coefficients));
  const ratings = {} as Record<RatingKey, RatingSpec>;
  for (const key of RATING_KEYS) {
    ratings[key] = (entry.ratings?.[key] ??
      file.shared[key] ??
      (keys.has(key) ? file.keyDefault : file.otherDefault)) as RatingSpec;
  }
  return {
    position,
    height: entry.height as [number, number],
    weight: entry.weight as [number, number],
    age: entry.age as [number, number],
    ratings,
    archetypes: (entry.archetypes ?? []).map(a => ({
      name: a.name,
      weight: a.weight,
      adjust: (a.adjust ?? {}) as Partial<Record<RatingKey, number>>,
      heightAdjust: a.height_adjust ?? 0,
      weightAdjust: a.weight_adjust ?? 0,
      traits: a.traits ?? {}
    }))
  };
}

export const TEMPLATES: Record<Position, PositionTemplate> = Object.fromEntries(
  POSITIONS.map(p => [p, expand(p)])
) as Record<Position, PositionTemplate>;
