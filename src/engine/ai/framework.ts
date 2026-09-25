/**
 * The AI decision framework (spec 14.1). Each option is scored by named considerations: a consideration
 * reads its input from the world and turns it into a 0-to-1 score through a response curve. The scores
 * combine by a weighted geometric mean, so one very bad consideration can veto an option. The pick is a
 * softmax over the best options whose temperature falls as competence rises (spec 14.5), and every
 * decision leaves a log entry with its inputs, scores, and the options that lost (spec 14.10).
 */
import type { Rng } from '../rng';
import { TUNING } from '../tuning';

const A = TUNING.ai;

export interface Consideration<O> {
  name: string;
  /** The world's input for an option, for the log. */
  input(option: O): number;
  /** The response curve: input to a 0-to-1 score. */
  curve(input: number): number;
}

export interface ScoredPart {
  name: string;
  input: number;
  score: number;
  weight: number;
}

export interface Scored<O> {
  option: O;
  score: number;
  parts: ScoredPart[];
}

export interface DecisionLog {
  decision: string;
  /** Who decided: a team, coach, or GM. */
  actor: string;
  chosen: { label: string; score: number; parts: ScoredPart[] };
  /** The next best options and their scores, best first. */
  rejected: { label: string; score: number }[];
}

export interface Decision<O> {
  chosen: O;
  log: DecisionLog;
}

/** Scores every option: the weighted geometric mean of its considerations. */
export function score<O>(
  options: readonly O[],
  considerations: readonly Consideration<O>[],
  weights: Readonly<Record<string, number>>
): Scored<O>[] {
  return options.map(option => {
    const parts = considerations.map(c => {
      const input = c.input(option);
      return {
        name: c.name,
        input,
        score: Math.min(1, Math.max(0, c.curve(input))),
        weight: weights[c.name] ?? 1
      };
    });
    const total = parts.reduce((n, p) => n + p.weight, 0);
    const log = parts.reduce((n, p) => n + p.weight * Math.log(Math.max(A.floor, p.score)), 0);
    return { option, score: total > 0 ? Math.exp(log / total) : 0, parts };
  });
}

/**
 * Picks among the best options with a softmax. Competence (0 to 100) sets the temperature: a sharp
 * decision-maker nearly always takes the best option, a poor one wanders among the close ones.
 */
export function decide<O>(
  decision: string,
  actor: string,
  options: readonly O[],
  considerations: readonly Consideration<O>[],
  weights: Readonly<Record<string, number>>,
  competence: number,
  rng: Rng,
  label: (option: O) => string
): Decision<O> | null {
  if (!options.length) return null;
  const ranked = score(options, considerations, weights).sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, A.topOptions);
  const temperature = A.temperature[1] - (A.temperature[1] - A.temperature[0]) * (competence / 100);
  const best = (top[0] as Scored<O>).score;
  const index = rng.weightedIndex(top.map(o => Math.exp((o.score - best) / temperature)));
  const chosen = top[index] as Scored<O>;
  return {
    chosen: chosen.option,
    log: {
      decision,
      actor,
      chosen: { label: label(chosen.option), score: chosen.score, parts: chosen.parts },
      rejected: ranked
        .filter(o => o !== chosen)
        .slice(0, A.loggedRejections)
        .map(o => ({ label: label(o.option), score: o.score }))
    }
  };
}

/** Response curves (spec 14.1): shapes that turn an input into a 0-to-1 score. */
export const curves = {
  /** 0 at `lo`, 1 at `hi`, straight between (reversed when lo > hi). */
  linear:
    (lo: number, hi: number) =>
    (x: number): number =>
      Math.min(1, Math.max(0, (x - lo) / (hi - lo))),
  /** An S-curve: 0.5 at `mid`, steeper as `width` shrinks. */
  logistic:
    (mid: number, width: number) =>
    (x: number): number =>
      1 / (1 + Math.exp(-(x - mid) / width)),
  /** `low` when false, 1 when true. */
  flag:
    (low: number) =>
    (x: number): number =>
      x ? 1 : low,
  /** Another curve raised to run from `floor` to 1: a consideration that shades a choice but can't veto it. */
  lift:
    (floor: number, inner: (x: number) => number) =>
    (x: number): number =>
      floor + (1 - floor) * inner(x),
  /** The same score whatever the input. */
  constant: (value: number) => (): number => value
};
