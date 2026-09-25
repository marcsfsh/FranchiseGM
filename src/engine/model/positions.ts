/** Positions (spec 6.1). Madden's positions plus long snapper, which real rosters carry. */

export const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS'
] as const; // prettier-ignore

export type Position = (typeof POSITIONS)[number];
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST';
export type Side = 'offense' | 'defense' | 'special';

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  LE: 'DL', RE: 'DL', DT: 'DL', LOLB: 'LB', MLB: 'LB', ROLB: 'LB', CB: 'DB', FS: 'DB', SS: 'DB',
  K: 'ST', P: 'ST', LS: 'ST'
}; // prettier-ignore

export const sideOf = (position: Position): Side => {
  const group = POSITION_GROUP[position];
  return group === 'ST' ? 'special' : ['DL', 'LB', 'DB'].includes(group) ? 'defense' : 'offense';
};

export function isPosition(value: unknown): value is Position {
  return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value);
}

/** Who throws or kicks with a handedness that matters (spec 6.1). */
export const HANDED: readonly Position[] = ['QB', 'K', 'P'];
