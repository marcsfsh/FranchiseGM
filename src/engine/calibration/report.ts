/**
 * Calibration reports (spec 23.1): the run's settings, pass, warn, and fail counts, every metric against
 * its band with the replay, weekly-loop, and chained-league values side by side, and the targets' sources.
 * The runner writes the Markdown and JSON forms to `calibration/reports/`; the dev menu shows the same
 * report in the app.
 */
import { GROUP_TITLES, type MetricFormat, type MetricGroup } from './metrics';
import { CHAIN_GROUPS, LOOP_GROUPS, type Band, type MetricResult, type Mode, type Source, type Status } from './targets'; // prettier-ignore

export interface RunSettings {
  mode: Mode;
  seed: number;
  /** Regular replays, and how they split into generated leagues. */
  seasons: number;
  leagues: number;
  perLeague: number;
  /** Fit experiment replays. */
  experiments: number;
  /** Seasons played through the weekly loop, each in a league of its own. */
  loopSeasons: number;
  /** Leagues played season after season through the offseason, and how many seasons each. */
  chains: number;
  chainSeasons: number;
}

export interface CalibrationReport extends RunSettings {
  version: 3;
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
  return { version: 3, ...settings, created, seconds, counts, results };
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

export const SOURCE_LABELS: Record<Source, string> = {
  replays: 'Replays',
  loop: 'Weekly loop',
  chain: 'Chained leagues'
};

/** A status with the mode that decided it when that isn't the replays: "pass (weekly loop)". */
export const statusText = (r: MetricResult): string =>
  STATUS_LABELS[r.status] +
  (r.decidedBy === 'replays' ? '' : ` (${SOURCE_LABELS[r.decidedBy].toLowerCase()})`);

/**
 * A one-line summary, a line per warning or failure, and the metrics the weekly loop decides with both
 * modes' values, for the command line.
 */
export function summaryLines(report: CalibrationReport): string[] {
  const c = report.counts;
  const lines = [
    `Calibration (${report.mode}, ${count(report.seasons, 'replay season')}, ` +
      `${count(report.loopSeasons, 'weekly-loop season')}, and ${count(report.chains, 'chained league')} of ` +
      `${count(report.chainSeasons, 'season')}, seed ${report.seed}): ` +
      `${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.info} info, ${c.pending} not measured yet.`
  ];
  for (const r of report.results) {
    if (r.status !== 'warn' && r.status !== 'fail') continue;
    const band = judged(r, report.mode);
    lines.push(
      `${r.status.toUpperCase()} ${r.id}: ${formatValue(r.value, r.format)}` +
        (r.decidedBy === 'replays' ? '' : ` in the ${SOURCE_LABELS[r.decidedBy].toLowerCase()}`) +
        (band ? ` (target ${formatBand(band, r.format)})` : '')
    );
  }
  const decided = report.results.filter(r => r.decidedBy === 'loop');
  if (decided.length) lines.push('Decided by the weekly loop (replays, weekly loop, status):');
  for (const r of decided)
    lines.push(
      `  ${r.id}: ${formatValue(r.replays.value, r.format)}, ${formatValue(r.loop.value, r.format)}, ${r.status}`
    );
  const aging = report.results.filter(r => r.decidedBy === 'chain' && r.value !== null);
  if (aging.length) lines.push('Decided by the chained leagues (value, status):');
  for (const r of aging) lines.push(`  ${r.id}: ${formatValue(r.value, r.format)}, ${r.status}`);
  return lines;
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(rows: readonly MetricResult[], mode: Mode): string[] {
  const out = [
    '| Metric | Replays | Weekly loop | Chained | Target | Status | Sample |',
    '| --- | ---: | ---: | ---: | --- | --- | ---: |'
  ];
  for (const r of rows) {
    const band = judged(r, mode);
    out.push(
      `| ${cell(r.label)} | ${formatValue(r.replays.value, r.format)} | ${formatValue(r.loop.value, r.format)} | ` +
        `${formatValue(r.chain.value, r.format)} | ${band ? formatBand(band, r.format) : '—'} | ${statusText(r)} | ` +
        `${thousands(r.n)} |`
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
      `${count(report.perLeague, 'replay')} each) and ${count(report.experiments, 'fit experiment season')}, ` +
      'with rosters as generated.',
    `- Weekly loop: ${count(report.loopSeasons, 'season')} through the weekly advance, a generated league ` +
      'each, with AI roster moves, injured reserve, waivers, and practice squad elevations.',
    `- Chained leagues: ${count(report.chains, 'generated league')} played for ${count(report.chainSeasons, 'season')} ` +
      'each, through every offseason, as the game does it.',
    `- Decided by the chained leagues: ${CHAIN_GROUPS.map(g => GROUP_TITLES[g].toLowerCase()).join(', ')}, ` +
      "season records from each league's third season (D-40). Without chains, the weekly loop decides " +
      `${LOOP_GROUPS.map(g => GROUP_TITLES[g].toLowerCase()).join(', ')}. ` +
      "Everything else is decided by the replays. Each sample is the deciding mode's.",
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
