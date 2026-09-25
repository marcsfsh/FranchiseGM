/**
 * Development settings (spec 22.4, 10.5): the four curve tables (progression and regression by age and by
 * position), the speed of each (split by age and by position), and the retirement age. Every value is a
 * multiplier where 1 is normal; the settings screen shows them as percentages.
 */
import type { PositionGroup } from '../model/positions';

/** The age tables' brackets: each bracket's oldest age, the last open-ended. */
export const AGE_BRACKETS = [22, 24, 26, 28, 30, 32, 34, 99] as const;
export const POSITION_GROUPS: readonly PositionGroup[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'DB',
  'ST'
];

/** A bracket's ages in words: "22 and under", "23 to 24", "35 and over". */
export function bracketLabel(index: number): string {
  const top = AGE_BRACKETS[index] ?? 99;
  const bottom = index === 0 ? null : (AGE_BRACKETS[index - 1] ?? 0) + 1;
  if (bottom === null) return `${top} and under`;
  return top >= 99 ? `${bottom} and over` : `${bottom} to ${top}`;
}

export const bracketOf = (age: number): number => {
  const i = AGE_BRACKETS.findIndex(top => age <= top);
  return i < 0 ? AGE_BRACKETS.length - 1 : i;
};

export interface DevelopmentSpeeds {
  progressionAge: number;
  progressionPosition: number;
  regressionAge: number;
  regressionPosition: number;
}

export interface DevelopmentSettings {
  /** Years added to the ages players tend to retire at (spec 10.7), from -3 to 3. */
  retirementAge: number;
  /** Multipliers on progression and regression by age bracket (AGE_BRACKETS). */
  progressionByAge: number[];
  regressionByAge: number[];
  /** Multipliers on progression and regression by position group. */
  progressionByPosition: Record<PositionGroup, number>;
  regressionByPosition: Record<PositionGroup, number>;
  /** Overall speeds: each age table and each position table scaled as a whole. */
  speed: DevelopmentSpeeds;
}

/** Settings values are kept in this range, as for the sim sliders. */
export const DEVELOPMENT_RANGE = { min: 0, max: 2 } as const;

const everyGroup = (value: number): Record<PositionGroup, number> =>
  Object.fromEntries(POSITION_GROUPS.map(g => [g, value])) as Record<PositionGroup, number>;

export function defaultDevelopment(): DevelopmentSettings {
  return {
    retirementAge: 0,
    progressionByAge: AGE_BRACKETS.map(() => 1),
    regressionByAge: AGE_BRACKETS.map(() => 1),
    progressionByPosition: everyGroup(1),
    regressionByPosition: everyGroup(1),
    speed: { progressionAge: 1, progressionPosition: 1, regressionAge: 1, regressionPosition: 1 }
  };
}

/** What the settings do to growth at an age and position group. */
export function growthMultiplier(s: DevelopmentSettings, age: number, group: PositionGroup): number {
  return (
    (s.progressionByAge[bracketOf(age)] ?? 1) *
    s.speed.progressionAge *
    s.progressionByPosition[group] *
    s.speed.progressionPosition
  );
}

/** What the settings do to decline at an age and position group. */
export function declineMultiplier(s: DevelopmentSettings, age: number, group: PositionGroup): number {
  return (
    (s.regressionByAge[bracketOf(age)] ?? 1) *
    s.speed.regressionAge *
    s.regressionByPosition[group] *
    s.speed.regressionPosition
  );
}
