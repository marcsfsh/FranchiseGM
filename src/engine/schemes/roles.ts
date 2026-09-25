/**
 * Roles and role recipes (spec 7.3). A recipe has rating weights that sum to 1 and trait adjustments;
 * ability value comes from the scheme's situation profile (abilities.ts). Schemes pick a role for each
 * depth chart slot (catalog.ts). The recipes are provisional hand-set values, recorded in DECISIONS.md;
 * calibration (spec 23) checks their effect sizes.
 */
import type { Position } from '../model/positions';
import type { RatingKey } from '../model/ratings';
import type { Traits } from '../model/traits';

export interface TraitAdjustment {
  trait: keyof Traits;
  /** The trait value that earns the points: an option name, or true for a yes-or-no trait. */
  value: string | boolean;
  points: number;
  /** How the fit breakdown names it, such as "YAC catch" or "fumble prone". */
  label: string;
}

export type RatingWeights = Partial<Record<RatingKey, number>>;

export interface RoleRecipe {
  label: string;
  /** The position whose typical player anchors the role's scale: he rates his own overall here. */
  primary: Position;
  /** Positions that can fill the role on the depth chart. */
  eligible: readonly Position[];
  weights: RatingWeights;
  traits: readonly TraitAdjustment[];
}

const T = (trait: keyof Traits, value: string | boolean, points: number, label: string): TraitAdjustment => ({
  trait,
  value,
  points,
  label
});

// Trait adjustments shared by several roles.
const DROPS = T('dropsOpenPasses', true, -2, 'drops open passes');
const FUMBLES = T('coversBall', 'never', -1, 'fumble prone');
const UNDISCIPLINED = T('penalty', 'undisciplined', -1, 'undisciplined');
const OL_TRAITS = [
  T('penalty', 'undisciplined', -2, 'undisciplined'),
  T('penalty', 'disciplined', 1, 'disciplined')
];
const RUSH_MOVES = [T('dlSwim', true, 1, 'swim move'), T('dlSpin', true, 1, 'spin move')];

const QB: readonly Position[] = ['QB'];
const BACKS: readonly Position[] = ['HB', 'FB'];
const FULLBACKS: readonly Position[] = ['FB', 'HB', 'TE'];
const RECEIVERS: readonly Position[] = ['WR'];
const TIGHT_ENDS: readonly Position[] = ['TE'];
const TACKLES: readonly Position[] = ['LT', 'RT', 'LG', 'RG'];
const GUARDS: readonly Position[] = ['LG', 'RG', 'C', 'LT', 'RT'];
const CENTERS: readonly Position[] = ['C', 'LG', 'RG'];
const ENDS: readonly Position[] = ['LE', 'RE', 'DT', 'LOLB', 'ROLB'];
const TACKLES_DL: readonly Position[] = ['DT', 'LE', 'RE'];
const EDGE_BACKERS: readonly Position[] = ['LOLB', 'ROLB', 'LE', 'RE'];
const BACKERS: readonly Position[] = ['LOLB', 'ROLB', 'MLB'];
const MIKES: readonly Position[] = ['MLB', 'LOLB', 'ROLB'];
const CORNERS: readonly Position[] = ['CB'];
const NICKELS: readonly Position[] = ['CB', 'SS', 'FS'];
const SAFETIES: readonly Position[] = ['FS', 'SS', 'CB'];
const RETURNERS: readonly Position[] = ['HB', 'WR', 'CB', 'FS', 'SS'];

export const ROLES = {
  // Quarterbacks
  qbTiming: {
    label: 'Timing passer', primary: 'QB', eligible: QB,
    weights: { sac: 0.22, mac: 0.14, awr: 0.22, tup: 0.1, pac: 0.06, tor: 0.08, thp: 0.08, dac: 0.04, bsk: 0.03, spd: 0.03 },
    traits: [
      T('forcesPasses', 'aggressive', -2, 'forces passes'), T('forcesPasses', 'conservative', 1, 'protects the ball'),
      T('qbStyle', 'pocket', 1, 'pocket passer'), T('sensePressure', 'ideal', 1, 'senses pressure'),
      T('throwAway', true, 1, 'throws it away')
    ]
  },
  qbPlayAction: {
    label: 'Play-action passer', primary: 'QB', eligible: QB,
    weights: { pac: 0.16, mac: 0.16, sac: 0.14, tor: 0.12, awr: 0.16, thp: 0.08, dac: 0.08, tup: 0.06, spd: 0.04 },
    traits: [
      T('qbStyle', 'balanced', 1, 'throws on the move'), T('qbStyle', 'pocket', -1, 'statue in the pocket'),
      T('forcesPasses', 'aggressive', -1, 'forces passes'), T('throwAway', true, 1, 'throws it away')
    ]
  },
  qbSpread: {
    label: 'Spread passer', primary: 'QB', eligible: QB,
    weights: { sac: 0.18, mac: 0.18, dac: 0.12, awr: 0.2, thp: 0.1, tup: 0.1, tor: 0.05, bsk: 0.04, pac: 0.03 },
    traits: [
      T('qbStyle', 'pocket', 1, 'pocket passer'), T('sensePressure', 'ideal', 1, 'senses pressure'),
      T('sensePressure', 'triggerHappy', -1, 'bails early'), T('tightSpiral', true, 1, 'tight spiral'),
      T('forcesPasses', 'conservative', -1, 'checks down too often')
    ]
  },
  qbDeepPlayAction: {
    label: 'Play-action deep passer', primary: 'QB', eligible: QB,
    weights: { thp: 0.16, dac: 0.14, pac: 0.14, mac: 0.12, awr: 0.18, sac: 0.1, tup: 0.08, bsk: 0.05, spd: 0.03 },
    traits: [
      T('tightSpiral', true, 1, 'tight spiral'), T('forcesPasses', 'aggressive', 1, 'takes shots'),
      T('forcesPasses', 'conservative', -1, 'checks down too often')
    ]
  },

  // Running backs and fullbacks
  rbReceiving: {
    label: 'Receiving back', primary: 'HB', eligible: BACKS,
    weights: { cth: 0.18, srr: 0.12, bcv: 0.15, agi: 0.1, acc: 0.1, spd: 0.1, car: 0.1, jkm: 0.05, pbk: 0.1 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), T('possessionCatch', true, 1, 'possession catch'), DROPS, FUMBLES]
  },
  rbZone: {
    label: 'Zone runner', primary: 'HB', eligible: BACKS,
    weights: { bcv: 0.25, agi: 0.1, cod: 0.1, acc: 0.15, jkm: 0.075, spm: 0.075, spd: 0.1, car: 0.1, trk: 0.025, btk: 0.025 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), FUMBLES]
  },
  rbSpread: {
    label: 'Spread back', primary: 'HB', eligible: BACKS,
    weights: { pbk: 0.15, cth: 0.15, srr: 0.1, bcv: 0.15, acc: 0.1, agi: 0.1, spd: 0.1, car: 0.1, jkm: 0.05 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), DROPS, FUMBLES]
  },
  rbPower: {
    label: 'Power runner', primary: 'HB', eligible: BACKS,
    weights: { trk: 0.175, btk: 0.175, str: 0.1, sfa: 0.1, car: 0.15, bcv: 0.1, acc: 0.1, agi: 0.05, spd: 0.05 },
    traits: [
      T('fightForYards', true, 1, 'fights for yards'), T('coversBall', 'never', -2, 'fumble prone'),
      T('coversBall', 'always', 1, 'secures the ball')
    ]
  },
  rbChangeOfPace: {
    label: 'Change-of-pace back', primary: 'HB', eligible: BACKS,
    weights: { spd: 0.2, acc: 0.15, agi: 0.15, cod: 0.1, jkm: 0.1, cth: 0.1, bcv: 0.1, car: 0.1 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), FUMBLES]
  },
  fbLead: {
    label: 'Lead blocker', primary: 'FB', eligible: FULLBACKS,
    weights: { lbk: 0.3, ibl: 0.15, rbk: 0.15, str: 0.15, awr: 0.1, trk: 0.05, car: 0.05, cth: 0.05 },
    traits: [T('fightForYards', true, 1, 'fights for yards'), UNDISCIPLINED]
  },
  fbHBack: {
    label: 'H-back', primary: 'FB', eligible: FULLBACKS,
    weights: { lbk: 0.2, rbk: 0.1, cth: 0.2, srr: 0.1, awr: 0.1, str: 0.1, ibl: 0.1, car: 0.1 },
    traits: [T('possessionCatch', true, 1, 'possession catch'), T('dropsOpenPasses', true, -1, 'drops open passes')]
  },

  // Receivers
  wrPossession: {
    label: 'Possession receiver', primary: 'WR', eligible: RECEIVERS,
    weights: { cth: 0.18, srr: 0.16, mrr: 0.14, cit: 0.14, rls: 0.1, awr: 0.1, spd: 0.08, str: 0.05, drr: 0.05 },
    traits: [
      T('possessionCatch', true, 2, 'possession catch'), T('feetInBounds', true, 1, 'feet in bounds'),
      T('aggressiveCatch', true, 1, 'aggressive catch'), DROPS
    ]
  },
  wrTiming: {
    label: 'Timing receiver', primary: 'WR', eligible: RECEIVERS,
    weights: { srr: 0.16, mrr: 0.16, cth: 0.16, spd: 0.12, acc: 0.1, agi: 0.08, drr: 0.08, awr: 0.08, cit: 0.06 },
    traits: [T('feetInBounds', true, 1, 'feet in bounds'), T('possessionCatch', true, 1, 'possession catch'), DROPS]
  },
  wrSlot: {
    label: 'Slot receiver', primary: 'WR', eligible: RECEIVERS,
    weights: { srr: 0.2, cth: 0.16, agi: 0.12, cod: 0.12, acc: 0.1, cit: 0.1, mrr: 0.1, spd: 0.05, awr: 0.05 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), T('possessionCatch', true, 1, 'possession catch'), DROPS]
  },
  wrYac: {
    label: 'Yards-after-catch receiver', primary: 'WR', eligible: RECEIVERS,
    weights: { cth: 0.14, mrr: 0.14, srr: 0.1, spd: 0.12, acc: 0.08, btk: 0.08, bcv: 0.06, rbk: 0.1, cit: 0.08, str: 0.05, drr: 0.05 },
    traits: [T('yacCatch', true, 2, 'YAC catch'), T('fightForYards', true, 1, 'fights for yards'), DROPS]
  },
  wrDeepPlayAction: {
    label: 'Play-action deep threat', primary: 'WR', eligible: RECEIVERS,
    weights: { drr: 0.2, spd: 0.2, mrr: 0.14, cth: 0.12, rls: 0.1, spc: 0.08, acc: 0.08, awr: 0.04, jmp: 0.04 },
    traits: [T('aggressiveCatch', true, 1, 'aggressive catch'), DROPS]
  },
  wrVertical: {
    label: 'Vertical receiver', primary: 'WR', eligible: RECEIVERS,
    weights: { spd: 0.22, drr: 0.2, rls: 0.14, cth: 0.12, spc: 0.1, jmp: 0.08, acc: 0.08, mrr: 0.06 },
    traits: [T('aggressiveCatch', true, 2, 'aggressive catch'), DROPS]
  },
  wrRouteRunner: {
    label: 'Route runner', primary: 'WR', eligible: RECEIVERS,
    weights: { srr: 0.16, mrr: 0.18, drr: 0.14, cth: 0.14, spd: 0.12, acc: 0.08, rls: 0.08, cod: 0.06, awr: 0.04 },
    traits: [T('feetInBounds', true, 1, 'feet in bounds'), T('possessionCatch', true, 1, 'possession catch'), DROPS]
  },
  wrQuickSlot: {
    label: 'Quick slot', primary: 'WR', eligible: RECEIVERS,
    weights: { srr: 0.2, agi: 0.15, cod: 0.15, acc: 0.12, cth: 0.14, spd: 0.1, mrr: 0.08, bcv: 0.06 },
    traits: [T('yacCatch', true, 2, 'YAC catch'), DROPS]
  },

  // Tight ends
  teMove: {
    label: 'Move tight end', primary: 'TE', eligible: TIGHT_ENDS,
    weights: { cth: 0.18, srr: 0.14, mrr: 0.14, spd: 0.12, cit: 0.12, rls: 0.08, acc: 0.06, rbk: 0.08, awr: 0.08 },
    traits: [T('yacCatch', true, 1, 'YAC catch'), T('possessionCatch', true, 1, 'possession catch'), DROPS]
  },
  teY: {
    label: 'Y tight end', primary: 'TE', eligible: TIGHT_ENDS,
    weights: { rbk: 0.2, cth: 0.14, mrr: 0.12, cit: 0.1, str: 0.1, rbf: 0.08, srr: 0.08, spd: 0.06, awr: 0.08, pbk: 0.04 },
    traits: [T('possessionCatch', true, 1, 'possession catch'), T('dropsOpenPasses', true, -1, 'drops open passes'), UNDISCIPLINED]
  },
  teInline: {
    label: 'In-line tight end', primary: 'TE', eligible: TIGHT_ENDS,
    weights: { rbk: 0.24, rbp: 0.1, str: 0.14, pbk: 0.12, cth: 0.1, cit: 0.08, awr: 0.1, ibl: 0.06, rbf: 0.06 },
    traits: [UNDISCIPLINED, T('dropsOpenPasses', true, -1, 'drops open passes')]
  },

  // Offensive line
  tackleZone: {
    label: 'Zone tackle', primary: 'LT', eligible: TACKLES,
    weights: { rbf: 0.16, rbk: 0.14, pbk: 0.16, pbf: 0.1, pbp: 0.08, agi: 0.1, acc: 0.08, awr: 0.1, str: 0.08 },
    traits: [...OL_TRAITS, T('highMotor', true, 1, 'high motor')]
  },
  tackleGap: {
    label: 'Gap tackle', primary: 'LT', eligible: TACKLES,
    weights: { rbp: 0.16, rbk: 0.16, str: 0.14, ibl: 0.06, pbk: 0.16, pbp: 0.1, pbf: 0.06, awr: 0.1, acc: 0.06 },
    traits: OL_TRAITS
  },
  tacklePass: {
    label: 'Pass-protecting tackle', primary: 'LT', eligible: TACKLES,
    weights: { pbk: 0.24, pbf: 0.16, pbp: 0.16, rbk: 0.08, str: 0.1, awr: 0.1, acc: 0.08, agi: 0.08 },
    traits: OL_TRAITS
  },
  tackleBalanced: {
    label: 'Balanced tackle', primary: 'LT', eligible: TACKLES,
    weights: { pbk: 0.2, pbf: 0.12, pbp: 0.12, rbk: 0.14, rbf: 0.08, rbp: 0.06, str: 0.1, awr: 0.1, acc: 0.04, agi: 0.04 },
    traits: OL_TRAITS
  },
  guardZone: {
    label: 'Zone guard', primary: 'LG', eligible: GUARDS,
    weights: { rbf: 0.16, rbk: 0.16, agi: 0.08, acc: 0.08, pbk: 0.14, pbp: 0.08, pbf: 0.06, str: 0.1, awr: 0.1, ibl: 0.04 },
    traits: [...OL_TRAITS, T('highMotor', true, 1, 'high motor')]
  },
  guardGap: {
    label: 'Gap guard', primary: 'LG', eligible: GUARDS,
    weights: { rbp: 0.18, rbk: 0.16, str: 0.16, ibl: 0.08, pbk: 0.12, pbp: 0.1, awr: 0.1, pbf: 0.04, acc: 0.06 },
    traits: OL_TRAITS
  },
  guardPass: {
    label: 'Pass-protecting guard', primary: 'LG', eligible: GUARDS,
    weights: { pbk: 0.22, pbp: 0.16, pbf: 0.12, str: 0.12, rbk: 0.1, awr: 0.12, acc: 0.08, rbp: 0.08 },
    traits: OL_TRAITS
  },
  guardBalanced: {
    label: 'Balanced guard', primary: 'LG', eligible: GUARDS,
    weights: { rbk: 0.16, rbp: 0.1, rbf: 0.08, pbk: 0.16, pbp: 0.1, pbf: 0.08, str: 0.12, awr: 0.12, acc: 0.04, ibl: 0.04 },
    traits: OL_TRAITS
  },
  centerZone: {
    label: 'Zone center', primary: 'C', eligible: CENTERS,
    weights: { rbf: 0.14, rbk: 0.16, awr: 0.16, pbk: 0.14, pbp: 0.08, pbf: 0.06, agi: 0.08, acc: 0.06, str: 0.12 },
    traits: [...OL_TRAITS, T('highMotor', true, 1, 'high motor')]
  },
  centerGap: {
    label: 'Gap center', primary: 'C', eligible: CENTERS,
    weights: { rbp: 0.16, rbk: 0.16, str: 0.16, awr: 0.14, pbk: 0.12, pbp: 0.1, ibl: 0.06, pbf: 0.04, acc: 0.06 },
    traits: OL_TRAITS
  },
  centerPass: {
    label: 'Pass-protecting center', primary: 'C', eligible: CENTERS,
    weights: { pbk: 0.2, pbp: 0.14, pbf: 0.12, awr: 0.18, str: 0.12, rbk: 0.12, acc: 0.06, agi: 0.06 },
    traits: OL_TRAITS
  },
  centerBalanced: {
    label: 'Balanced center', primary: 'C', eligible: CENTERS,
    weights: { rbk: 0.16, rbp: 0.1, rbf: 0.08, pbk: 0.16, pbp: 0.1, pbf: 0.08, awr: 0.16, str: 0.12, acc: 0.04 },
    traits: OL_TRAITS
  },

  // Defensive line
  end43: {
    label: '4-3 end', primary: 'LE', eligible: ENDS,
    weights: { fmv: 0.16, pmv: 0.16, bsh: 0.14, spd: 0.08, acc: 0.1, str: 0.1, pur: 0.08, tak: 0.08, prc: 0.06, awr: 0.04 },
    traits: [T('highMotor', true, 1, 'high motor'), T('dlBullRush', true, 1, 'bull rush'), T('dlSwim', true, 1, 'swim move'), UNDISCIPLINED]
  },
  endLeo: {
    label: 'Leo end', primary: 'LE', eligible: ENDS,
    weights: { fmv: 0.22, spd: 0.14, acc: 0.14, pmv: 0.1, agi: 0.06, bsh: 0.1, pur: 0.1, tak: 0.08, prc: 0.06 },
    traits: [...RUSH_MOVES, T('highMotor', true, 1, 'high motor')]
  },
  tackle3Tech: {
    label: '3-technique tackle', primary: 'DT', eligible: TACKLES_DL,
    weights: { pmv: 0.16, fmv: 0.14, acc: 0.14, bsh: 0.16, str: 0.14, tak: 0.1, pur: 0.06, prc: 0.06, awr: 0.04 },
    traits: [...RUSH_MOVES, T('highMotor', true, 1, 'high motor')]
  },
  nose1Tech: {
    label: '1-technique nose', primary: 'DT', eligible: TACKLES_DL,
    weights: { str: 0.24, bsh: 0.22, tak: 0.14, pmv: 0.1, prc: 0.1, awr: 0.08, pur: 0.04, acc: 0.08 },
    traits: [T('dlBullRush', true, 1, 'bull rush'), T('highMotor', true, 1, 'high motor')]
  },
  noseOneGap: {
    label: 'One-gap nose', primary: 'DT', eligible: TACKLES_DL,
    weights: { str: 0.2, bsh: 0.18, acc: 0.12, pmv: 0.12, tak: 0.12, fmv: 0.06, prc: 0.1, awr: 0.06, pur: 0.04 },
    traits: [T('dlBullRush', true, 1, 'bull rush'), T('dlSwim', true, 1, 'swim move')]
  },
  end5Tech: {
    label: '5-technique end', primary: 'LE', eligible: ['LE', 'RE', 'DT'],
    weights: { str: 0.18, bsh: 0.18, pmv: 0.16, tak: 0.12, fmv: 0.06, pur: 0.08, prc: 0.1, awr: 0.06, acc: 0.06 },
    traits: [T('dlBullRush', true, 1, 'bull rush'), T('highMotor', true, 1, 'high motor')]
  },

  // Linebackers
  olb34: {
    label: '3-4 outside linebacker', primary: 'LOLB', eligible: EDGE_BACKERS,
    weights: { fmv: 0.16, pmv: 0.12, spd: 0.12, acc: 0.12, bsh: 0.1, pur: 0.1, tak: 0.08, zcv: 0.06, prc: 0.08, awr: 0.06 },
    traits: [
      T('lbStyle', 'passRush', 2, 'pass rusher'), T('lbStyle', 'cover', -1, 'coverage linebacker'),
      ...RUSH_MOVES, T('highMotor', true, 1, 'high motor')
    ]
  },
  lbSam: {
    label: 'Sam linebacker', primary: 'LOLB', eligible: BACKERS,
    weights: { str: 0.1, bsh: 0.14, tak: 0.16, pur: 0.12, prc: 0.12, awr: 0.1, zcv: 0.1, mcv: 0.06, spd: 0.06, pow: 0.04 },
    traits: [T('lbStyle', 'balanced', 1, 'balanced linebacker'), T('bigHitter', true, 1, 'big hitter')]
  },
  mike43: {
    label: '4-3 Mike', primary: 'MLB', eligible: MIKES,
    weights: { tak: 0.18, prc: 0.16, awr: 0.16, pur: 0.12, bsh: 0.12, zcv: 0.1, spd: 0.06, pow: 0.06, str: 0.04 },
    traits: [T('lbStyle', 'balanced', 1, 'balanced linebacker'), T('bigHitter', true, 1, 'big hitter')]
  },
  lbWill: {
    label: 'Will linebacker', primary: 'LOLB', eligible: BACKERS,
    weights: { spd: 0.14, pur: 0.16, tak: 0.14, zcv: 0.14, mcv: 0.08, prc: 0.12, awr: 0.1, acc: 0.08, agi: 0.04 },
    traits: [T('lbStyle', 'cover', 1, 'coverage linebacker'), T('lbStyle', 'passRush', -1, 'pass-rush linebacker')]
  },
  mike34: {
    label: '3-4 Mike', primary: 'MLB', eligible: MIKES,
    weights: { tak: 0.18, bsh: 0.16, prc: 0.14, awr: 0.14, pow: 0.1, str: 0.08, pur: 0.1, zcv: 0.06, spd: 0.04 },
    traits: [T('bigHitter', true, 1, 'big hitter'), T('lbStyle', 'balanced', 1, 'balanced linebacker')]
  },
  will34: {
    label: '3-4 Will', primary: 'MLB', eligible: MIKES,
    weights: { pur: 0.14, tak: 0.14, zcv: 0.16, mcv: 0.08, spd: 0.12, prc: 0.12, awr: 0.12, acc: 0.08, agi: 0.04 },
    traits: [T('lbStyle', 'cover', 2, 'coverage linebacker'), T('lbStyle', 'passRush', -1, 'pass-rush linebacker')]
  },
  lbBlitz: {
    label: 'Blitzing linebacker', primary: 'MLB', eligible: MIKES,
    weights: { spd: 0.12, acc: 0.12, pur: 0.14, tak: 0.14, fmv: 0.1, pmv: 0.08, prc: 0.1, awr: 0.08, mcv: 0.06, bsh: 0.06 },
    traits: [T('lbStyle', 'passRush', 2, 'pass rusher'), T('lbStyle', 'cover', -1, 'coverage linebacker'), T('highMotor', true, 1, 'high motor')]
  },
  lbCover: {
    label: 'Cover linebacker', primary: 'MLB', eligible: MIKES,
    weights: { mcv: 0.16, spd: 0.14, pur: 0.12, tak: 0.12, zcv: 0.08, prc: 0.1, awr: 0.1, acc: 0.1, agi: 0.08 },
    traits: [T('lbStyle', 'cover', 2, 'coverage linebacker')]
  },

  // Defensive backs
  cbPress: {
    label: 'Press corner', primary: 'CB', eligible: CORNERS,
    weights: { mcv: 0.24, prs: 0.18, spd: 0.16, acc: 0.1, agi: 0.08, cod: 0.08, prc: 0.06, awr: 0.04, jmp: 0.06 },
    traits: [
      T('playsBall', 'aggressive', 1, 'plays the ball'), T('playsBall', 'conservative', -1, 'plays the man'),
      T('penalty', 'undisciplined', -2, 'undisciplined'), T('penalty', 'disciplined', 1, 'disciplined')
    ]
  },
  cbZone: {
    label: 'Zone corner', primary: 'CB', eligible: CORNERS,
    weights: { zcv: 0.24, spd: 0.16, prc: 0.14, awr: 0.1, jmp: 0.08, cth: 0.08, acc: 0.08, prs: 0.06, tak: 0.06 },
    traits: [T('playsBall', 'aggressive', 2, 'plays the ball'), T('playsBall', 'conservative', -1, 'plays the man'), UNDISCIPLINED]
  },
  cbBalanced: {
    label: 'Balanced corner', primary: 'CB', eligible: CORNERS,
    weights: { mcv: 0.18, zcv: 0.18, spd: 0.16, prs: 0.1, acc: 0.08, agi: 0.06, cod: 0.06, prc: 0.08, awr: 0.06, jmp: 0.04 },
    traits: [T('playsBall', 'aggressive', 1, 'plays the ball'), UNDISCIPLINED]
  },
  cbSlot: {
    label: 'Slot corner', primary: 'CB', eligible: NICKELS,
    weights: { zcv: 0.14, mcv: 0.14, agi: 0.14, cod: 0.12, acc: 0.12, prc: 0.1, tak: 0.1, spd: 0.08, awr: 0.06 },
    traits: [UNDISCIPLINED, T('bigHitter', true, 1, 'big hitter')]
  },
  cbSlotMan: {
    label: 'Man slot corner', primary: 'CB', eligible: NICKELS,
    weights: { mcv: 0.22, agi: 0.14, cod: 0.14, acc: 0.12, spd: 0.1, prs: 0.08, prc: 0.08, tak: 0.06, awr: 0.06 },
    traits: [T('penalty', 'undisciplined', -2, 'undisciplined'), T('playsBall', 'aggressive', 1, 'plays the ball')]
  },
  dimeBack: {
    label: 'Dime back', primary: 'SS', eligible: SAFETIES,
    weights: { zcv: 0.16, mcv: 0.14, spd: 0.14, prc: 0.12, awr: 0.1, tak: 0.1, acc: 0.08, agi: 0.08, pur: 0.08 },
    traits: [T('playsBall', 'aggressive', 1, 'plays the ball')]
  },
  fsTwoHigh: {
    label: 'Two-high free safety', primary: 'FS', eligible: SAFETIES,
    weights: { zcv: 0.22, spd: 0.14, prc: 0.14, awr: 0.12, mcv: 0.08, acc: 0.08, tak: 0.08, pur: 0.06, cth: 0.04, jmp: 0.04 },
    traits: [T('playsBall', 'aggressive', 1, 'plays the ball'), T('playsBall', 'conservative', -1, 'plays the man')]
  },
  fsCenterField: {
    label: 'Center fielder', primary: 'FS', eligible: SAFETIES,
    weights: { spd: 0.2, zcv: 0.2, prc: 0.14, acc: 0.1, awr: 0.1, pur: 0.08, cth: 0.06, jmp: 0.06, tak: 0.06 },
    traits: [T('playsBall', 'aggressive', 2, 'plays the ball'), T('playsBall', 'conservative', -1, 'plays the man')]
  },
  ssBox: {
    label: 'Box safety', primary: 'SS', eligible: SAFETIES,
    weights: { tak: 0.18, pow: 0.1, pur: 0.12, bsh: 0.08, prc: 0.14, zcv: 0.12, spd: 0.1, awr: 0.1, str: 0.06 },
    traits: [T('bigHitter', true, 1, 'big hitter'), T('stripsBall', true, 1, 'strips the ball')]
  },
  ssHybrid: {
    label: 'Hybrid safety', primary: 'SS', eligible: SAFETIES,
    weights: { zcv: 0.18, tak: 0.14, pur: 0.1, spd: 0.12, prc: 0.14, mcv: 0.1, awr: 0.12, pow: 0.06, acc: 0.04 },
    traits: [T('playsBall', 'aggressive', 1, 'plays the ball')]
  },
  ssMan: {
    label: 'Man safety', primary: 'SS', eligible: SAFETIES,
    weights: { mcv: 0.2, tak: 0.14, spd: 0.14, pur: 0.1, prc: 0.1, zcv: 0.08, awr: 0.1, str: 0.06, acc: 0.08 },
    traits: [UNDISCIPLINED]
  },

  // Special teams (the same in every scheme until special teams philosophies arrive in M21)
  kicker: {
    label: 'Kicker', primary: 'K', eligible: ['K', 'P'],
    weights: { kpw: 0.45, kac: 0.45, awr: 0.1 },
    traits: [T('clutch', true, 1, 'clutch')]
  },
  punter: {
    label: 'Punter', primary: 'P', eligible: ['P', 'K'],
    weights: { kpw: 0.45, kac: 0.45, awr: 0.1 },
    traits: []
  },
  longSnapper: {
    label: 'Long snapper', primary: 'LS', eligible: ['LS', 'C'],
    weights: { lsp: 0.7, awr: 0.15, str: 0.05, rbk: 0.05, pbk: 0.05 },
    traits: []
  },
  kickReturner: {
    label: 'Kick returner', primary: 'HB', eligible: RETURNERS,
    weights: { ret: 0.3, spd: 0.2, acc: 0.14, bcv: 0.12, agi: 0.08, btk: 0.08, car: 0.08 },
    traits: [T('coversBall', 'never', -2, 'fumble prone'), T('fightForYards', true, 1, 'fights for yards')]
  },
  puntReturner: {
    label: 'Punt returner', primary: 'WR', eligible: RETURNERS,
    weights: { ret: 0.3, agi: 0.14, cod: 0.12, cth: 0.12, bcv: 0.12, acc: 0.1, spd: 0.1 },
    traits: [T('coversBall', 'never', -2, 'fumble prone')]
  },
  gunner: {
    label: 'Gunner', primary: 'CB', eligible: ['CB', 'WR', 'FS', 'SS', 'HB'],
    weights: { spd: 0.26, acc: 0.16, tak: 0.16, pur: 0.16, rls: 0.1, str: 0.08, awr: 0.08 },
    traits: [T('highMotor', true, 1, 'high motor')]
  }
} as const satisfies Record<string, RoleRecipe>; // prettier-ignore

export type RoleId = keyof typeof ROLES;

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

export const role = (id: RoleId): RoleRecipe => ROLES[id];
