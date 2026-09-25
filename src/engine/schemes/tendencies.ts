/**
 * Scheme tendency sliders (spec 7.2). Every scheme is defined by these; blends average them and custom
 * schemes (M21) edit them. Rates and shares are fractions from 0 to 1 unless a slider says otherwise.
 */

export const DOWN_DISTANCES = ['first', 'secondShort', 'secondLong', 'thirdShort', 'thirdLong'] as const;
export type DownDistance = (typeof DOWN_DISTANCES)[number];

/** Offensive personnel groupings: backs, then tight ends; receivers fill the rest of the five. */
export const PERSONNEL = ['10', '11', '12', '13', '21', '22'] as const;
export type Personnel = (typeof PERSONNEL)[number];

export const RUN_CONCEPTS = ['insideZone', 'outsideZone', 'power', 'counter', 'draw'] as const;
export type RunConcept = (typeof RUN_CONCEPTS)[number];

/** Offensive depth chart slots that run routes, for target priority. */
export const TARGET_SLOTS = ['X', 'Z', 'SLOT', 'TE1', 'TE2', 'RB1', 'RB2', 'FB'] as const;
export type TargetSlot = (typeof TARGET_SLOTS)[number];

export const PACKAGES = ['base', 'nickel', 'dime'] as const;
export type DefensePackage = (typeof PACKAGES)[number];

export const SHELLS = ['cover1', 'cover2', 'cover3', 'cover4', 'cover6'] as const;
export type Shell = (typeof SHELLS)[number];

export interface OffenseTendencies {
  /** Pass rate by down and distance (short is 3 yards or fewer to go). */
  passRate: Record<DownDistance, number>;
  /** Average depth of target, in yards. */
  airYards: number;
  /** Play action, as a share of dropbacks. */
  playAction: number;
  /** Run-pass options, as a share of plays. */
  rpo: number;
  /** Screens, as a share of passes. */
  screen: number;
  /** Designed quarterback runs, as a share of runs. */
  qbRuns: number;
  /** How freely the quarterback leaves the pocket to scramble. */
  scramble: number;
  /** 0 huddles and bleeds the clock; 1 plays at hurry-up pace. */
  tempo: number;
  personnel: Record<Personnel, number>;
  runConcepts: Record<RunConcept, number>;
  /** Target priority by slot: the share of targets each slot draws. */
  targets: Record<TargetSlot, number>;
  /** Passes that travel 20 or more yards in the air, as a share of passes. */
  deepShots: number;
  /** Baseline fourth-down aggressiveness; the head coach and game plan adjust it. */
  fourthDown: number;
}

export interface DefenseTendencies {
  /** Base front: 4 down linemen or 3. */
  front: 3 | 4;
  packages: Record<DefensePackage, number>;
  /** Five or more rushers, as a share of pass plays. */
  blitz: number;
  /** Simulated pressures (four rushers from unexpected spots), as a share of pass plays. */
  simPressure: number;
  /** Man coverage share; the rest is zone. */
  man: number;
  shells: Record<Shell, number>;
  /** Press coverage rate on outside corners. */
  press: number;
  /** Run fits: 0 is gap control (read and react), 1 is penetration (attack a gap). */
  runFit: number;
  /** Stunts and twists, as a share of pass rushes. */
  stunts: number;
}

/** The share groups that must each sum to 1. */
export const OFFENSE_SHARES = ['personnel', 'runConcepts', 'targets'] as const;
export const DEFENSE_SHARES = ['packages', 'shells'] as const;

export interface SliderRange {
  min: number;
  max: number;
}

/** Slider ranges, used to validate custom schemes and to scale distances between schemes. */
export const OFFENSE_RANGES: Record<Exclude<keyof OffenseTendencies, (typeof OFFENSE_SHARES)[number] | 'passRate'>, SliderRange> & { passRate: SliderRange } = {
  passRate: { min: 0.15, max: 0.98 },
  airYards: { min: 4, max: 12 },
  playAction: { min: 0, max: 0.45 },
  rpo: { min: 0, max: 0.35 },
  screen: { min: 0, max: 0.25 },
  qbRuns: { min: 0, max: 0.35 },
  scramble: { min: 0, max: 1 },
  tempo: { min: 0, max: 1 },
  deepShots: { min: 0.02, max: 0.3 },
  fourthDown: { min: 0, max: 1 }
}; // prettier-ignore

export const DEFENSE_RANGES: Record<Exclude<keyof DefenseTendencies, (typeof DEFENSE_SHARES)[number] | 'front'>, SliderRange> = {
  blitz: { min: 0, max: 0.6 },
  simPressure: { min: 0, max: 0.35 },
  man: { min: 0, max: 1 },
  press: { min: 0, max: 1 },
  runFit: { min: 0, max: 1 },
  stunts: { min: 0, max: 0.5 }
}; // prettier-ignore

const sum = (values: Record<string, number>): number => Object.values(values).reduce((a, b) => a + b, 0);

/** Problems with a set of offensive tendencies; empty when valid. */
export function checkOffense(t: OffenseTendencies): string[] {
  const problems: string[] = [];
  for (const group of OFFENSE_SHARES) {
    const total = sum(t[group]);
    if (Math.abs(total - 1) > 1e-6) problems.push(`${group} shares sum to ${total.toFixed(3)}, not 1`);
  }
  for (const dd of DOWN_DISTANCES) {
    const value = t.passRate[dd];
    if (value < OFFENSE_RANGES.passRate.min || value > OFFENSE_RANGES.passRate.max)
      problems.push(`passRate.${dd} ${value} is outside its range`);
  }
  for (const [key, range] of Object.entries(OFFENSE_RANGES)) {
    if (key === 'passRate') continue;
    const value = t[key as keyof OffenseTendencies] as number;
    if (value < range.min || value > range.max) problems.push(`${key} ${value} is outside its range`);
  }
  return problems;
}

/** Problems with a set of defensive tendencies; empty when valid. */
export function checkDefense(t: DefenseTendencies): string[] {
  const problems: string[] = [];
  for (const group of DEFENSE_SHARES) {
    const total = sum(t[group]);
    if (Math.abs(total - 1) > 1e-6) problems.push(`${group} shares sum to ${total.toFixed(3)}, not 1`);
  }
  if (t.front !== 3 && t.front !== 4) problems.push(`front ${String(t.front)} isn't 3 or 4`);
  for (const [key, range] of Object.entries(DEFENSE_RANGES)) {
    const value = t[key as keyof DefenseTendencies] as number;
    if (value < range.min || value > range.max) problems.push(`${key} ${value} is outside its range`);
  }
  return problems;
}

const mix = (a: number, b: number, w: number): number => a * w + b * (1 - w);

function mixRecord<K extends string>(
  a: Record<K, number>,
  b: Record<K, number>,
  w: number
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(a) as K[]) out[key] = mix(a[key], b[key], w);
  return out;
}

/** Weighted average of two offenses; `w` is the first scheme's weight (spec 7.2 blends). */
export function blendOffense(a: OffenseTendencies, b: OffenseTendencies, w: number): OffenseTendencies {
  return {
    passRate: mixRecord(a.passRate, b.passRate, w),
    airYards: mix(a.airYards, b.airYards, w),
    playAction: mix(a.playAction, b.playAction, w),
    rpo: mix(a.rpo, b.rpo, w),
    screen: mix(a.screen, b.screen, w),
    qbRuns: mix(a.qbRuns, b.qbRuns, w),
    scramble: mix(a.scramble, b.scramble, w),
    tempo: mix(a.tempo, b.tempo, w),
    personnel: mixRecord(a.personnel, b.personnel, w),
    runConcepts: mixRecord(a.runConcepts, b.runConcepts, w),
    targets: mixRecord(a.targets, b.targets, w),
    deepShots: mix(a.deepShots, b.deepShots, w),
    fourthDown: mix(a.fourthDown, b.fourthDown, w)
  };
}

/** Weighted average of two defenses. The front is discrete, so the heavier scheme's front wins. */
export function blendDefense(a: DefenseTendencies, b: DefenseTendencies, w: number): DefenseTendencies {
  return {
    front: w >= 0.5 ? a.front : b.front,
    packages: mixRecord(a.packages, b.packages, w),
    blitz: mix(a.blitz, b.blitz, w),
    simPressure: mix(a.simPressure, b.simPressure, w),
    man: mix(a.man, b.man, w),
    shells: mixRecord(a.shells, b.shells, w),
    press: mix(a.press, b.press, w),
    runFit: mix(a.runFit, b.runFit, w),
    stunts: mix(a.stunts, b.stunts, w)
  };
}

/**
 * Every slider as a 0-to-1 coordinate: scalars scaled by their ranges, shares as they are. Distances
 * between schemes use these so no slider dominates by its units.
 */
function offenseVector(t: OffenseTendencies): number[] {
  const scaled = (value: number, r: SliderRange): number => (value - r.min) / (r.max - r.min);
  return [
    ...DOWN_DISTANCES.map(dd => scaled(t.passRate[dd], OFFENSE_RANGES.passRate)),
    scaled(t.airYards, OFFENSE_RANGES.airYards),
    scaled(t.playAction, OFFENSE_RANGES.playAction),
    scaled(t.rpo, OFFENSE_RANGES.rpo),
    scaled(t.screen, OFFENSE_RANGES.screen),
    scaled(t.qbRuns, OFFENSE_RANGES.qbRuns),
    scaled(t.scramble, OFFENSE_RANGES.scramble),
    scaled(t.tempo, OFFENSE_RANGES.tempo),
    ...Object.values(t.personnel),
    ...Object.values(t.runConcepts),
    ...Object.values(t.targets),
    scaled(t.deepShots, OFFENSE_RANGES.deepShots),
    scaled(t.fourthDown, OFFENSE_RANGES.fourthDown)
  ];
}

function defenseVector(t: DefenseTendencies): number[] {
  const scaled = (value: number, r: SliderRange): number => (value - r.min) / (r.max - r.min);
  return [
    t.front === 4 ? 1 : 0,
    ...Object.values(t.packages),
    scaled(t.blitz, DEFENSE_RANGES.blitz),
    scaled(t.simPressure, DEFENSE_RANGES.simPressure),
    scaled(t.man, DEFENSE_RANGES.man),
    ...Object.values(t.shells),
    scaled(t.press, DEFENSE_RANGES.press),
    scaled(t.runFit, DEFENSE_RANGES.runFit),
    scaled(t.stunts, DEFENSE_RANGES.stunts)
  ];
}

/** Root-mean-square difference of the 0-to-1 coordinates, so the result is 0 (same) to 1. */
function rms(a: number[], b: number[]): number {
  let total = 0;
  a.forEach((value, i) => (total += (value - (b[i] as number)) ** 2));
  return Math.min(1, Math.sqrt(total / a.length));
}

/** How far apart two offenses are, 0 to 1 (spec 7.6 coordinator mismatch). */
export const offenseDistance = (a: OffenseTendencies, b: OffenseTendencies): number =>
  rms(offenseVector(a), offenseVector(b));

/** How far apart two defenses are, 0 to 1. */
export const defenseDistance = (a: DefenseTendencies, b: DefenseTendencies): number =>
  rms(defenseVector(a), defenseVector(b));

/** Snaps by down and distance in a typical game, for averaging pass rates (spec 23 targets refine it). */
export function passShare(t: OffenseTendencies, downMix: Record<DownDistance, number>): number {
  let total = 0;
  for (const dd of DOWN_DISTANCES) total += downMix[dd] * t.passRate[dd];
  return total;
}
