/**
 * Stat categories (spec 9.2): the tables that hold each game's player lines. Every stored field belongs to
 * exactly one category; a player gets a row in a category's table only for games with something in it.
 * Penalties are stored one row per accepted foul, by type; a line's penalty count and yards are derived.
 */
import { PENALTY_IDS, type PenaltyId } from '../rules/ruleset';
import type { StatKey } from '../sim/stats';

export const CATEGORY_IDS = [
  'passing', 'rushing', 'receiving', 'blocking', 'defense', 'kicking', 'punting', 'returns', 'scoring',
  'participation'
] as const; // prettier-ignore
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_KEYS: Record<CategoryId, readonly StatKey[]> = {
  passing: [
    'passAtt', 'passCmp', 'passYds', 'passTd', 'passInt', 'sacked', 'sackYds', 'passLong', 'passFirstDowns',
    'passAirYds', 'pass20', 'pressured', 'throwAways', 'passDrops'
  ],
  rushing: [
    'rushAtt', 'rushYds', 'rushTd', 'rushLong', 'rushFirstDowns', 'fumbles', 'fumblesLost', 'rushYac',
    'brokenTackles', 'rush10'
  ],
  receiving: [
    'targets', 'receptions', 'recYds', 'recTd', 'recLong', 'recFirstDowns', 'yac', 'drops', 'contestedCatches',
    'rec20'
  ],
  blocking: ['sacksAllowed', 'pressuresAllowed', 'pancakes', 'runBlockWins', 'runBlockSnaps'],
  defense: [
    'soloTackles', 'assistedTackles', 'tacklesForLoss', 'sacks', 'qbHits', 'pressures', 'passesDefended',
    'defInt', 'defIntYds', 'defIntTd', 'forcedFumbles', 'fumbleRecoveries', 'fumbleReturnTd', 'safeties',
    'targetsAllowed', 'completionsAllowed', 'yardsAllowed', 'tdsAllowed', 'missedTackles'
  ],
  kicking: [
    'fgMade', 'fgAtt', 'fgLong', 'fgMade40', 'fgAtt40', 'fgMade50', 'fgAtt50', 'xpMade', 'xpAtt', 'kickoffs',
    'kickoffTouchbacks'
  ],
  punting: ['punts', 'puntYds', 'puntNetYds', 'puntsIn20', 'puntTouchbacks', 'puntLong', 'puntsBlocked'],
  returns: [
    'kickReturns', 'kickReturnYds', 'kickReturnTd', 'kickReturnLong', 'puntReturns', 'puntReturnYds',
    'puntReturnTd', 'puntReturnLong', 'fairCatches'
  ],
  scoring: ['twoPointMade'],
  participation: ['snapsOffense', 'snapsDefense', 'snapsSpecial', 'started']
}; // prettier-ignore

/**
 * Line fields no table stores: penalty totals come from the penalty rows, and tackles are solo plus
 * assisted.
 */
export const DERIVED_KEYS: readonly StatKey[] = ['penalties', 'penaltyYds', 'tackles'];

/** The penalty table's fields: the foul (its position in PENALTY_IDS) and the yards it cost. */
export const PENALTY_FIELDS = ['penaltyType', 'penaltyYds'] as const;

export const penaltyIndex = (id: PenaltyId): number => PENALTY_IDS.indexOf(id);

export const TABLE_IDS = [...CATEGORY_IDS, 'penalties'] as const;
export type TableId = (typeof TABLE_IDS)[number];

export function tableFields(id: TableId): readonly string[] {
  return id === 'penalties' ? PENALTY_FIELDS : CATEGORY_KEYS[id];
}
