/**
 * Calibration reports (spec 23.1): the run's settings, pass, warn, and fail counts, every metric against
 * its band, and the targets' sources. The runner writes the Markdown and JSON forms to
 * `calibration/reports/`; the dev menu shows the same report in the app.
 */
import { GROUP_TITLES, type MetricFormat, type MetricGroup } from './metrics';
import type { Band, MetricResult, Mode, Status } from './targets';

export interface RunSettings {
  mode: Mode;
  seed: number;
  /** Regular replays, and how they split into generated leagues. */
  seasons: number;
  leagues: number;
  perLeague: number;
  /** Fit experiment replays. */
  experiments: number;
}

export interface CalibrationReport extends RunSettings {
  version: 1;
  /** When the run finished, and how long it took; the caller supplies both. */
  created: string;
  seconds: number;
  counts: Record<Status, number>;
  results: MetricResult[];
}

export const STATUS_LABELS: Record<Status, string> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  info: 'info',
  pending: 'not measured yet'
};

export function buildReport(
  settings: RunSettings,
  results: MetricResult[],
  created: string,
  seconds: number
): CalibrationReport {
  const counts: Record<Status, number> = { pass: 0, warn: 0, fail: 0, info: 0, pending: 0 };
  for (const r of results) counts[r.status]++;
  return { version: 1, ...settings, created, seconds, counts, results };
}

/** A whole number with thousands separators. */
const thousands = (n: number): string =>
  `${n < 0 ? '−' : ''}${Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

const signed = (text: string, value: number): string =>
  value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;

/** A value as the metric prints it. */
export function formatValue(value: number | null, format: MetricFormat): string {
  if (value === null) return '—';
  switch (format) {
    case 'pct':
      return `${(value * 100).toFixed(1)}%`;
    case 'pctPoints':
      return `${signed(Math.abs(value * 100).toFixed(1), value)} pts`;
    case 'dec1':
      return value.toFixed(1);
    case 'dec2':
      return value.toFixed(2);
    case 'int':
      return thousands(Math.round(value));
    case 'signed1':
      return signed(Math.abs(value).toFixed(1), Number(value.toFixed(1)));
  }
}

export const formatBand = (band: Band, format: MetricFormat): string =>
  `${formatValue(band[0], format)} to ${formatValue(band[1], format)}`;

/** The band a result was judged by. */
const judged = (r: MetricResult, mode: Mode): Band | null =>
  r.target ? (mode === 'ci' ? (r.target.ci ?? null) : r.target.pass) : null;

/** A count with its noun, singular for one: "1 season", "25 seasons". */
export const count = (n: number, one: string, many = `${one}s`): string =>
  `${thousands(n)} ${n === 1 ? one : many}`;

/** A one-line summary and a line per warning or failure, for the command line. */
export function summaryLines(report: CalibrationReport): string[] {
  const c = report.counts;
  const lines = [
    `Calibration (${report.mode}, ${count(report.seasons, 'season')}, seed ${report.seed}): ` +
      `${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.info} info, ${c.pending} not measured yet.`
  ];
  for (const r of report.results) {
    if (r.status !== 'warn' && r.status !== 'fail') continue;
    const band = judged(r, report.mode);
    lines.push(
      `${r.status.toUpperCase()} ${r.id}: ${formatValue(r.value, r.format)}` +
        (band ? ` (target ${formatBand(band, r.format)})` : '')
    );
  }
  return lines;
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(rows: readonly MetricResult[], mode: Mode): string[] {
  const out = ['| Metric | Value | Target | Status | Sample |', '| --- | ---: | --- | --- | ---: |'];
  for (const r of rows) {
    const band = judged(r, mode);
    out.push(
      `| ${cell(r.label)} | ${formatValue(r.value, r.format)} | ${band ? formatBand(band, r.format) : '—'} | ` +
        `${STATUS_LABELS[r.status]} | ${thousands(r.n)} |`
    );
  }
  return out;
}

/** The report as Markdown: settings, counts, warnings and failures first, then every group and the sources. */
export function reportMarkdown(report: CalibrationReport): string {
  const c = report.counts;
  const lines: string[] = [
    '# Calibration report',
    '',
    `- Run: ${report.created}, ${report.mode === 'ci' ? 'CI subset with wide bands' : 'full'}, seed ${report.seed}, ` +
      `${report.seconds.toFixed(0)} s.`,
    `- Replays: ${count(report.seasons, 'season')} (${count(report.leagues, 'generated league')}, up to ` +
      `${count(report.perLeague, 'replay')} each) and ${count(report.experiments, 'fit experiment season')}.`,
    `- Result: ${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.info} info, ${c.pending} not measured yet.`
  ];
  const flagged = report.results.filter(r => r.status === 'warn' || r.status === 'fail');
  if (flagged.length) lines.push('', '## Warnings and failures', '', ...table(flagged, report.mode));
  const groups = [...new Set(report.results.map(r => r.group))] as MetricGroup[];
  for (const group of groups)
    lines.push(
      '',
      `## ${GROUP_TITLES[group]}`,
      '',
      ...table(
        report.results.filter(r => r.group === group),
        report.mode
      )
    );
  lines.push('', '## Targets and sources', '');
  for (const r of report.results) {
    if (!r.target) continue;
    const t = r.target;
    const bands =
      `pass ${formatBand(t.pass, r.format)}, warn ${formatBand(t.warn, r.format)}` +
      (t.ci ? `, CI ${formatBand(t.ci, r.format)}` : '');
    lines.push(`- \`${r.id}\` (${r.label}): ${bands}. ${t.source}${t.note ? ` ${t.note}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}
