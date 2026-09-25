/**
 * Calibration targets (spec 23.2): each metric's pass and warn bands, a wide band for the short CI run, a
 * source, and a note, kept in `calibration/targets.json`. Evaluation marks each metric pass, warn, fail,
 * info (measured, no target yet), or pending (not measured until a later milestone).
 */
import { METRICS, type MetricDef, type MetricValue } from './metrics';

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

export interface MetricResult extends MetricDef, MetricValue {
  status: Status;
  target: Target | null;
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

/**
 * Compares measured metrics with their targets. A full run checks every metric; a CI run checks only the
 * metrics with a CI band, against that band alone.
 */
export function evaluate(
  metrics: ReadonlyMap<string, MetricValue>,
  file: TargetsFile,
  mode: Mode
): MetricResult[] {
  const results: MetricResult[] = [];
  for (const def of METRICS) {
    const target = file.targets[def.id] ?? null;
    if (mode === 'ci' && !target?.ci) continue;
    const measured = metrics.get(def.id) ?? { value: null, n: 0 };
    let status: Status;
    if (measured.value === null) status = 'pending';
    else if (!target) status = 'info';
    else if (mode === 'ci') status = within(measured.value, target.ci as Band) ? 'pass' : 'fail';
    else if (within(measured.value, target.pass)) status = 'pass';
    else status = within(measured.value, target.warn) ? 'warn' : 'fail';
    results.push({ ...def, ...measured, status, target });
  }
  return results;
}
