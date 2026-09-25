/**
 * The named schemes (spec 7.2): M3 builds 4 offenses and 4 defenses; the rest and custom schemes arrive
 * in M21. Tendencies are provisional values drawn from 2020s NFL play-by-play tendencies of teams known
 * for each scheme, recorded in DECISIONS.md; calibration (spec 23) checks them.
 */
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES, type DefenseSchemeId, type OffenseSchemeId } from './ids';
import type { RoleId } from './roles';
import type { DefenseSlot, OffenseSlot, SpecialSlot } from './slots';
import type { DefenseTendencies, OffenseTendencies } from './tendencies';

export interface OffenseScheme {
  id: OffenseSchemeId;
  name: string;
  summary: string;
  tendencies: OffenseTendencies;
  roles: Record<OffenseSlot, RoleId>;
}

export interface DefenseScheme {
  id: DefenseSchemeId;
  name: string;
  summary: string;
  tendencies: DefenseTendencies;
  roles: Record<DefenseSlot, RoleId>;
}

export const OFFENSES: Record<OffenseSchemeId, OffenseScheme> = {
  westCoast: {
    id: 'westCoast',
    name: 'West Coast',
    summary: 'Short, timed throws that stretch the field horizontally, with backs and tight ends as receivers.',
    tendencies: {
      passRate: { first: 0.55, secondShort: 0.48, secondLong: 0.66, thirdShort: 0.6, thirdLong: 0.92 },
      airYards: 6.8, playAction: 0.2, rpo: 0.06, screen: 0.12, qbRuns: 0.05, scramble: 0.4, tempo: 0.5,
      personnel: { '10': 0.03, '11': 0.62, '12': 0.2, '13': 0.03, '21': 0.1, '22': 0.02 },
      runConcepts: { insideZone: 0.35, outsideZone: 0.2, power: 0.15, counter: 0.1, draw: 0.2 },
      targets: { X: 0.2, Z: 0.17, SLOT: 0.18, TE1: 0.2, TE2: 0.03, RB1: 0.14, RB2: 0.04, FB: 0.04 },
      deepShots: 0.08, fourthDown: 0.5
    },
    roles: {
      QB: 'qbTiming', RB1: 'rbReceiving', RB2: 'rbChangeOfPace', FB: 'fbHBack', X: 'wrPossession', Z: 'wrTiming',
      SLOT: 'wrSlot', TE1: 'teMove', TE2: 'teInline', LT: 'tackleBalanced', LG: 'guardBalanced', C: 'centerBalanced',
      RG: 'guardBalanced', RT: 'tackleBalanced'
    }
  },
  shanahanZone: {
    id: 'shanahanZone',
    name: 'Shanahan outside zone',
    summary: 'Outside zone runs with bootlegs and play action off the same look, and a fullback in the mix.',
    tendencies: {
      passRate: { first: 0.45, secondShort: 0.35, secondLong: 0.58, thirdShort: 0.5, thirdLong: 0.88 },
      airYards: 7.8, playAction: 0.32, rpo: 0.02, screen: 0.08, qbRuns: 0.03, scramble: 0.3, tempo: 0.35,
      personnel: { '10': 0.01, '11': 0.5, '12': 0.18, '13': 0.02, '21': 0.25, '22': 0.04 },
      runConcepts: { insideZone: 0.25, outsideZone: 0.5, power: 0.05, counter: 0.08, draw: 0.12 },
      targets: { X: 0.22, Z: 0.2, SLOT: 0.14, TE1: 0.18, TE2: 0.03, RB1: 0.12, RB2: 0.04, FB: 0.07 },
      deepShots: 0.11, fourthDown: 0.45
    },
    roles: {
      QB: 'qbPlayAction', RB1: 'rbZone', RB2: 'rbChangeOfPace', FB: 'fbLead', X: 'wrYac', Z: 'wrDeepPlayAction',
      SLOT: 'wrSlot', TE1: 'teY', TE2: 'teInline', LT: 'tackleZone', LG: 'guardZone', C: 'centerZone',
      RG: 'guardZone', RT: 'tackleZone'
    }
  },
  airRaid: {
    id: 'airRaid',
    name: 'Air Raid',
    summary: 'Four- and five-wide spread passing at tempo, with mesh and vertical concepts from the shotgun.',
    tendencies: {
      passRate: { first: 0.62, secondShort: 0.56, secondLong: 0.73, thirdShort: 0.68, thirdLong: 0.94 },
      airYards: 8.4, playAction: 0.1, rpo: 0.12, screen: 0.1, qbRuns: 0.06, scramble: 0.5, tempo: 0.8,
      personnel: { '10': 0.3, '11': 0.62, '12': 0.08, '13': 0, '21': 0, '22': 0 },
      runConcepts: { insideZone: 0.45, outsideZone: 0.1, power: 0.1, counter: 0.1, draw: 0.25 },
      targets: { X: 0.25, Z: 0.23, SLOT: 0.27, TE1: 0.1, TE2: 0.01, RB1: 0.1, RB2: 0.04, FB: 0 },
      deepShots: 0.15, fourthDown: 0.7
    },
    roles: {
      QB: 'qbSpread', RB1: 'rbSpread', RB2: 'rbChangeOfPace', FB: 'fbHBack', X: 'wrVertical', Z: 'wrRouteRunner',
      SLOT: 'wrQuickSlot', TE1: 'teMove', TE2: 'teInline', LT: 'tacklePass', LG: 'guardPass', C: 'centerPass',
      RG: 'guardPass', RT: 'tacklePass'
    }
  },
  powerRun: {
    id: 'powerRun',
    name: 'Power run',
    summary: 'Gap runs with pulling guards and extra tight ends, then play-action shots down the field.',
    tendencies: {
      passRate: { first: 0.4, secondShort: 0.3, secondLong: 0.55, thirdShort: 0.4, thirdLong: 0.86 },
      airYards: 8.6, playAction: 0.28, rpo: 0.04, screen: 0.06, qbRuns: 0.06, scramble: 0.35, tempo: 0.25,
      personnel: { '10': 0.02, '11': 0.4, '12': 0.25, '13': 0.08, '21': 0.15, '22': 0.1 },
      runConcepts: { insideZone: 0.2, outsideZone: 0.05, power: 0.4, counter: 0.2, draw: 0.15 },
      targets: { X: 0.24, Z: 0.2, SLOT: 0.12, TE1: 0.2, TE2: 0.06, RB1: 0.08, RB2: 0.03, FB: 0.07 },
      deepShots: 0.14, fourthDown: 0.55
    },
    roles: {
      QB: 'qbDeepPlayAction', RB1: 'rbPower', RB2: 'rbChangeOfPace', FB: 'fbLead', X: 'wrVertical',
      Z: 'wrDeepPlayAction', SLOT: 'wrSlot', TE1: 'teInline', TE2: 'teInline', LT: 'tackleGap', LG: 'guardGap',
      C: 'centerGap', RG: 'guardGap', RT: 'tackleGap'
    }
  }
}; // prettier-ignore

export const DEFENSES: Record<DefenseSchemeId, DefenseScheme> = {
  fourThreeOver: {
    id: 'fourThreeOver',
    name: '4-3 over',
    summary: 'Four down linemen shaded to the strong side, with a mix of coverages behind them.',
    tendencies: {
      front: 4, packages: { base: 0.35, nickel: 0.55, dime: 0.1 }, blitz: 0.25, simPressure: 0.08, man: 0.35,
      shells: { cover1: 0.25, cover2: 0.2, cover3: 0.35, cover4: 0.15, cover6: 0.05 }, press: 0.35, runFit: 0.4,
      stunts: 0.18
    },
    roles: {
      LEDGE: 'end43', REDGE: 'end43', DT1: 'tackle3Tech', DT2: 'nose1Tech', FLEX: 'lbSam', MIKE: 'mike43',
      WILL: 'lbWill', CB1: 'cbBalanced', CB2: 'cbBalanced', NCB: 'cbSlot', DIME: 'dimeBack', FS: 'fsTwoHigh',
      SS: 'ssBox'
    }
  },
  threeFourOneGap: {
    id: 'threeFourOneGap',
    name: '3-4 one-gap',
    summary: 'Three linemen who each attack a gap, with outside linebackers as the edge rushers.',
    tendencies: {
      front: 3, packages: { base: 0.3, nickel: 0.6, dime: 0.1 }, blitz: 0.32, simPressure: 0.12, man: 0.4,
      shells: { cover1: 0.3, cover2: 0.15, cover3: 0.3, cover4: 0.2, cover6: 0.05 }, press: 0.4, runFit: 0.65,
      stunts: 0.2
    },
    roles: {
      LEDGE: 'olb34', REDGE: 'olb34', DT1: 'end5Tech', DT2: 'noseOneGap', FLEX: 'end5Tech', MIKE: 'mike34',
      WILL: 'will34', CB1: 'cbBalanced', CB2: 'cbBalanced', NCB: 'cbSlot', DIME: 'dimeBack', FS: 'fsTwoHigh',
      SS: 'ssHybrid'
    }
  },
  cover3: {
    id: 'cover3',
    name: 'Cover 3 single-high',
    summary: 'A single deep safety and three-deep zones, with a speed rusher off the weak side.',
    tendencies: {
      front: 4, packages: { base: 0.4, nickel: 0.52, dime: 0.08 }, blitz: 0.2, simPressure: 0.06, man: 0.25,
      shells: { cover1: 0.25, cover2: 0.05, cover3: 0.6, cover4: 0.07, cover6: 0.03 }, press: 0.3, runFit: 0.45,
      stunts: 0.15
    },
    roles: {
      LEDGE: 'endLeo', REDGE: 'end43', DT1: 'tackle3Tech', DT2: 'nose1Tech', FLEX: 'lbSam', MIKE: 'mike43',
      WILL: 'lbWill', CB1: 'cbZone', CB2: 'cbZone', NCB: 'cbSlot', DIME: 'dimeBack', FS: 'fsCenterField',
      SS: 'ssBox'
    }
  },
  manBlitz: {
    id: 'manBlitz',
    name: 'Man blitz',
    summary: 'Cover 1 pressure: press-man corners, a free safety in the middle, and extra rushers.',
    tendencies: {
      front: 3, packages: { base: 0.25, nickel: 0.55, dime: 0.2 }, blitz: 0.42, simPressure: 0.15, man: 0.72,
      shells: { cover1: 0.6, cover2: 0.1, cover3: 0.15, cover4: 0.1, cover6: 0.05 }, press: 0.65, runFit: 0.6,
      stunts: 0.25
    },
    roles: {
      LEDGE: 'olb34', REDGE: 'olb34', DT1: 'end5Tech', DT2: 'noseOneGap', FLEX: 'end5Tech', MIKE: 'lbBlitz',
      WILL: 'lbCover', CB1: 'cbPress', CB2: 'cbPress', NCB: 'cbSlotMan', DIME: 'dimeBack', FS: 'fsCenterField',
      SS: 'ssMan'
    }
  }
}; // prettier-ignore

/** Special teams roles are the same in every scheme until special teams philosophies (M21). */
export const SPECIAL_ROLES: Record<SpecialSlot, RoleId> = {
  K: 'kicker',
  P: 'punter',
  LS: 'longSnapper',
  KR: 'kickReturner',
  PR: 'puntReturner',
  GUNNER: 'gunner'
};

export const OFFENSE_LIST: readonly OffenseScheme[] = OFFENSE_SCHEMES.map(id => OFFENSES[id]);
export const DEFENSE_LIST: readonly DefenseScheme[] = DEFENSE_SCHEMES.map(id => DEFENSES[id]);
