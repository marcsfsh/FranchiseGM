/** Madden traits (spec 6.4). Exact names and values are confirmed against the CSV in docs/MAPPING.md. */

export const QB_STYLES = ['pocket', 'balanced', 'scrambling'] as const;
export const SENSE_PRESSURE = ['paranoid', 'triggerHappy', 'ideal', 'average', 'oblivious'] as const;
export const FORCES_PASSES = ['conservative', 'ideal', 'aggressive'] as const;
export const COVERS_BALL = ['never', 'onBigHits', 'onMediumHits', 'forAllHits', 'always'] as const;
export const PLAYS_BALL = ['conservative', 'balanced', 'aggressive'] as const;
export const PENALTY = ['disciplined', 'normal', 'undisciplined'] as const;
export const LB_STYLES = ['passRush', 'balanced', 'cover'] as const;

export interface Traits {
  qbStyle: (typeof QB_STYLES)[number];
  sensePressure: (typeof SENSE_PRESSURE)[number];
  throwAway: boolean;
  tightSpiral: boolean;
  forcesPasses: (typeof FORCES_PASSES)[number];
  coversBall: (typeof COVERS_BALL)[number];
  fightForYards: boolean;
  feetInBounds: boolean;
  dropsOpenPasses: boolean;
  possessionCatch: boolean;
  aggressiveCatch: boolean;
  yacCatch: boolean;
  highMotor: boolean;
  bigHitter: boolean;
  stripsBall: boolean;
  playsBall: (typeof PLAYS_BALL)[number];
  penalty: (typeof PENALTY)[number];
  clutch: boolean;
  predictable: boolean;
  dlSwim: boolean;
  dlSpin: boolean;
  dlBullRush: boolean;
  lbStyle: (typeof LB_STYLES)[number];
}

export const DEFAULT_TRAITS: Traits = {
  qbStyle: 'balanced',
  sensePressure: 'average',
  throwAway: false,
  tightSpiral: false,
  forcesPasses: 'ideal',
  coversBall: 'onBigHits',
  fightForYards: false,
  feetInBounds: false,
  dropsOpenPasses: false,
  possessionCatch: false,
  aggressiveCatch: false,
  yacCatch: false,
  highMotor: false,
  bigHitter: false,
  stripsBall: false,
  playsBall: 'balanced',
  penalty: 'normal',
  clutch: false,
  predictable: false,
  dlSwim: false,
  dlSpin: false,
  dlBullRush: false,
  lbStyle: 'balanced'
};
