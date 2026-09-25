/**
 * Depth chart slots (spec 7.3). Every scheme puts one role in each slot; blends mix the two schemes'
 * recipes slot by slot. Defensive slots cover both fronts: in a 4-3 the edges are defensive ends and FLEX
 * is the Sam linebacker; in a 3-4 the edges are outside linebackers and FLEX is the second 5-technique end.
 */
import type { DefensePackage, DefenseTendencies, OffenseTendencies, Personnel } from './tendencies';

export const OFFENSE_SLOTS = [
  'QB', 'RB1', 'RB2', 'FB', 'X', 'Z', 'SLOT', 'TE1', 'TE2', 'LT', 'LG', 'C', 'RG', 'RT'
] as const; // prettier-ignore
export const DEFENSE_SLOTS = [
  'LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', 'MIKE', 'WILL', 'CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS'
] as const; // prettier-ignore
export const SPECIAL_SLOTS = ['K', 'P', 'LS', 'KR', 'PR', 'GUNNER'] as const;

/**
 * Return and coverage duties. Fit compares a role rating with the player's overall, which only means
 * something in the roles of his position, so these show role ratings without fit.
 */
export const DUTY_SLOTS = ['KR', 'PR', 'GUNNER'] as const;

export type OffenseSlot = (typeof OFFENSE_SLOTS)[number];
export type DefenseSlot = (typeof DEFENSE_SLOTS)[number];
export type SpecialSlot = (typeof SPECIAL_SLOTS)[number];
export type Slot = OffenseSlot | DefenseSlot | SpecialSlot;

/** Slots where fit applies: every offensive, defensive, and kicking role. */
export const FIT_SLOTS: readonly Slot[] = [
  ...OFFENSE_SLOTS,
  ...DEFENSE_SLOTS,
  ...SPECIAL_SLOTS.filter(s => !(DUTY_SLOTS as readonly string[]).includes(s))
];

/** Backs and tight ends in each personnel group; receivers fill the rest of the five skill spots. */
const PERSONNEL_COUNTS: Record<Personnel, { rb: number; te: number }> = {
  '10': { rb: 1, te: 0 },
  '11': { rb: 1, te: 1 },
  '12': { rb: 1, te: 2 },
  '13': { rb: 1, te: 3 },
  '21': { rb: 2, te: 1 },
  '22': { rb: 2, te: 2 }
};

/**
 * Share of offensive snaps each slot plays, from the personnel mix. The lead back splits carries with the
 * change-of-pace back by `rb1Share`; the second back in 21 and 22 personnel is the fullback.
 */
export function offenseSnapShares(t: OffenseTendencies, rb1Share: number): Record<OffenseSlot, number> {
  let fb = 0;
  let te1 = 0;
  let te2 = 0;
  let z = 0;
  let slot = 0;
  for (const [group, share] of Object.entries(t.personnel) as [Personnel, number][]) {
    const { rb, te } = PERSONNEL_COUNTS[group];
    const wr = 5 - rb - te;
    if (rb >= 2) fb += share;
    if (te >= 1) te1 += share;
    if (te >= 2) te2 += share;
    if (wr >= 2) z += share;
    if (wr >= 3) slot += share;
  }
  return {
    QB: 1,
    RB1: rb1Share,
    RB2: 1 - rb1Share,
    FB: fb,
    X: 1,
    Z: z,
    SLOT: slot,
    TE1: te1,
    TE2: te2,
    LT: 1,
    LG: 1,
    C: 1,
    RG: 1,
    RT: 1
  };
}

/** Which defensive slots come off the field in each sub package. */
const PACKAGE_OFF: Record<DefensePackage, readonly DefenseSlot[]> = {
  base: ['NCB', 'DIME'],
  nickel: ['FLEX', 'DIME'],
  dime: ['FLEX', 'WILL']
};

/** Share of defensive snaps each slot plays, from the package mix. */
export function defenseSnapShares(t: DefenseTendencies): Record<DefenseSlot, number> {
  const shares = Object.fromEntries(DEFENSE_SLOTS.map(s => [s, 0])) as Record<DefenseSlot, number>;
  for (const [pkg, share] of Object.entries(t.packages) as [DefensePackage, number][]) {
    for (const slot of DEFENSE_SLOTS) if (!PACKAGE_OFF[pkg].includes(slot)) shares[slot] += share;
  }
  return shares;
}
