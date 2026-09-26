/**
 * Calibration targets (spec 23.2): each metric's pass and warn bands, a wide band for the short CI run, a
 * source, and a note, kept in `calibration/targets.json`. Evaluation marks each metric pass, warn, fail,
 * info (measured, no target yet), or pending (not measured in this run, or not until a later milestone).
 * Aging, the draft, and the economy are judged on leagues chained through the offseason; season records on
 * the chained leagues' seasons from their third (D-40), or on the weekly-loop seasons when a run has no
 * chains, as a CI run doesn't (C-20); and everything else on the replays.
 */
import { METRICS, type MetricDef, type MetricGroup, type MetricValue } from './metrics';

export type Band = readonly [number, number];

export interface Target {
  pass: Band;
  warn: Band;
  /** Present when the short CI run checks the metric: its wide band. */
  ci?: Band;
  source: string;
  /** What the metric measures and how the band follows from the source. */
  note: string;
}

export interface TargetsFile {
  version: number;
  targets: Record<string, Target>;
}

export type Status = 'pass' | 'warn' | 'fail' | 'info' | 'pending';
export type Mode = 'full' | 'ci';

/** A run's modes: replays of the season, seasons through the weekly loop, and leagues chained through the offseason. */
export type Source = 'replays' | 'loop' | 'chain';

/**
 * Metric groups the weekly loop decides when a run has no chained leagues: season records depend on
 * in-season roster management (injured reserve, signings, waivers, and elevations), which replays leave out
 * (C-20).
 */
export const LOOP_GROUPS: readonly MetricGroup[] = ['seasons'];

/**
 * Metric groups the chained leagues decide: aging, the draft, and the economy need seasons played through the
 * offseason, and season records follow the league's own free agency and drafts once creation settings fade
 * (D-40).
 */
export const CHAIN_GROUPS: readonly MetricGroup[] = ['aging', 'draft', 'economy', 'seasons'];

/** The mode that decides a metric: season records fall back to the weekly loop in a run without chains. */
export const decidedBy = (def: Pick<MetricDef, 'group'>, chained = true): Source =>
  LOOP_GROUPS.includes(def.group) && !chained
    ? 'loop'
    : CHAIN_GROUPS.includes(def.group)
      ? 'chain'
      : 'replays';

/** A metric's result: the deciding mode's value and sample, with both modes' values side by side. */
export interface MetricResult extends MetricDef, MetricValue {
  status: Status;
  target: Target | null;
  decidedBy: Source;
  replays: MetricValue;
  loop: MetricValue;
  chain: MetricValue;
}

const within = (value: number, [lo, hi]: Band): boolean => value >= lo && value <= hi;

/** Problems with a targets file: unknown metric IDs and bands that don't nest. */
export function checkTargets(file: TargetsFile): string[] {
  const known = new Set(METRICS.map(m => m.id));
  const problems: string[] = [];
  for (const [id, t] of Object.entries(file.targets)) {
    if (!known.has(id)) problems.push(`${id}: no such metric`);
    const [plo, phi] = t.pass;
    const [wlo, whi] = t.warn;
    if (!(plo <= phi && wlo <= plo && phi <= whi))
      problems.push(`${id}: the warn band must contain the pass band`);
    if (t.ci && !(t.ci[0] <= plo && phi <= t.ci[1]))
      problems.push(`${id}: the CI band must contain the pass band`);
    if (!t.source?.trim()) problems.push(`${id}: no source`);
    if (!t.note?.trim()) problems.push(`${id}: no note`);
  }
  return problems;
}

const NONE: MetricValue = { value: null, n: 0 };

/**
 * Compares measured metrics with their targets, each on the mode that decides it. A full run checks every
 * metric; a CI run checks only the metrics with a CI band, against that band alone.
 */
export function evaluate(
  metrics: Readonly<Record<Source, ReadonlyMap<string, MetricValue>>>,
  file: TargetsFile,
  mode: Mode
): MetricResult[] {
  const results: MetricResult[] = [];
  for (const def of METRICS) {
    const target = file.targets[def.id] ?? null;
    if (mode === 'ci' && !target?.ci) continue;
    const by = decidedBy(def, metrics.chain.has(def.id));
    const replays = metrics.replays.get(def.id) ?? NONE;
    const loop = metrics.loop.get(def.id) ?? NONE;
    const chain = metrics.chain.get(def.id) ?? NONE;
    const measured = by === 'chain' ? chain : by === 'loop' ? loop : replays;
    let status: Status;
    if (measured.value === null) status = 'pending';
    else if (!target) status = 'info';
    else if (mode === 'ci') status = within(measured.value, target.ci as Band) ? 'pass' : 'fail';
    else if (within(measured.value, target.pass)) status = 'pass';
    else status = within(measured.value, target.warn) ? 'warn' : 'fail';
    results.push({ ...def, ...measured, status, target, decidedBy: by, replays, loop, chain });
  }
  return results;
}
