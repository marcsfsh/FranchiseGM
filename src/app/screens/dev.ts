/**
 * Developer tools (spec 23.5): the calibration runner and report viewer (spec 23.1). The same replays and
 * weekly-loop seasons as `npm run calibrate`, in the worker with a progress bar; the report shows here and
 * saves as Markdown.
 * A run belongs to the visit: it keeps going when you leave the screen, and the screen picks it up again
 * when you come back. Later milestones add the AI decision log, the sim inspector, and the performance
 * overlay.
 */
import targetsJson from '../../../calibration/targets.json';
import { GROUP_TITLES, type MetricGroup } from '../../engine/calibration/metrics';
import {
  count,
  formatBand,
  formatValue,
  reportMarkdown,
  SOURCE_LABELS,
  statusText,
  type CalibrationReport
} from '../../engine/calibration/report';
import { defaultExperiments, type RunPlan } from '../../engine/calibration/run';
import type { MetricResult, Status, TargetsFile } from '../../engine/calibration/targets';
import { devMenuOn } from '../dev-menu';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { h, mount } from '../dom';
import { showBusy, toast } from '../feedback';
import type { AppState } from '../state';
import { card, pageHead } from './common';
import type { Screen, ScreenContext } from './types';

// JSON arrays type as number[]; checkTargets (tests) proves each band has two ends.
const targets = targetsJson as unknown as TargetsFile;

const STATUS_CLASS: Record<Status, string> = {
  pass: 'status-ok',
  warn: 'status-warn',
  fail: 'status-bad',
  info: 'status-neutral',
  pending: 'status-neutral'
};

const SEASONS_MAX = 100;
const LOOP_MAX = 20;
const SEED_MAX = 2 ** 31 - 1;

/** A calibration run in progress. */
interface ActiveRun {
  controller: AbortController;
  /** What the worker is replaying, like "Season 3 of 10". */
  step: string;
  done: number;
  total: number;
  /** Quarters of the run announced so far, 0 to 3. */
  quarters: number;
  cancelling: boolean;
}

/** The screen while it's mounted: runs report progress and their end to it. */
interface RunView {
  sync(): void;
  announce(message: string): void;
  showReport(report: CalibrationReport): void;
}

/** The visit's state: the form's values, the run in progress, and the last report. */
const visit: {
  seasons: string;
  loop: string;
  seed: string;
  run: ActiveRun | null;
  report: CalibrationReport | null;
} = {
  seasons: '10',
  loop: '2',
  seed: '1',
  run: null,
  report: null
};
let view: RunView | null = null;

function startRun(app: AppState, plan: RunPlan): void {
  const run: ActiveRun = {
    controller: new AbortController(),
    step: '',
    done: 0,
    total: 1,
    quarters: 0,
    cancelling: false
  };
  visit.run = run;
  view?.sync();
  view?.announce(
    `Calibration started: ${count(plan.seasons, 'season')} and ${count(plan.loopSeasons, 'weekly-loop season')}.`
  );
  const onProgress = (p: { done: number; total: number; label?: string }) => {
    run.total = Math.max(1, p.total);
    run.done = p.done;
    if (p.label) run.step = p.label;
    // Announce each quarter; the progress bar and the step line carry the rest.
    const quarters = Math.min(3, Math.floor((4 * run.done) / run.total));
    if (quarters > run.quarters) {
      run.quarters = quarters;
      if (!run.cancelling) view?.announce(`Calibration ${quarters * 25}% done.`);
    }
    view?.sync();
  };
  // The status line tells the screen; with the screen closed, a toast does.
  const end = (message: string) => {
    visit.run = null;
    view?.sync();
    if (view) view.announce(message);
    else toast(message);
  };
  app.calibrate(plan, targets, onProgress, run.controller.signal).then(
    report => {
      if (!report) return end('Calibration cancelled.');
      visit.report = report;
      view?.showReport(report);
      const c = report.counts;
      end(`Calibration finished: ${c.pass} pass, ${c.warn} warn, ${c.fail} fail.`);
    },
    (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      visit.run = null;
      view?.sync();
      view?.announce('The calibration run stopped.');
      toast(
        `The calibration run stopped: ${reason}. Try again with fewer seasons, or run npm run calibrate.`,
        {
          persistent: true
        }
      );
    }
  );
}

/** A value cell; a metric the run didn't measure shows a dash and reads "Not measured". */
function valueText(r: MetricResult, value: number | null): HTMLElement {
  return value === null
    ? h(
        'span',
        null,
        h('span', { 'aria-hidden': 'true' }, '—'),
        h('span', { class: 'sr-only' }, 'Not measured')
      )
    : h('span', null, formatValue(value, r.format));
}

const targetText = (r: MetricResult) => (r.target ? formatBand(r.target.pass, r.format) : 'No target');

/** The status, with "(weekly loop)" where the weekly loop decided it. */
const statusChip = (r: MetricResult) => {
  const label = statusText(r);
  return h(
    'span',
    { class: `status ${STATUS_CLASS[r.status]}` },
    label.charAt(0).toUpperCase() + label.slice(1)
  );
};

/**
 * One group of results: a table where there's room, labeled rows in narrow spaces and at large text
 * sizes (style guide 7.3). The heading names both.
 */
/** Status order for sorting: failures first when high to low. */
const STATUS_RANK: Record<Status, number> = { fail: 4, warn: 3, pass: 2, info: 1, pending: 0 };

function resultGroup(key: string, title: string, rows: readonly MetricResult[], status: HTMLElement): HTMLElement {
  const id = `metrics-${key}`;
  const items = new Map(
    rows.map(r => [
      r.id,
      h('li', { class: 'metric-row' },
        h('span', { class: 'metric-name' }, r.label),
        statusChip(r),
        h('dl', { class: 'metric-facts' },
          h('div', null, h('dt', null, SOURCE_LABELS.replays), h('dd', null, valueText(r, r.replays.value))),
          h('div', null, h('dt', null, SOURCE_LABELS.loop), h('dd', null, valueText(r, r.loop.value))),
          h('div', null, h('dt', null, 'Target'), h('dd', null, targetText(r)))
        )
      )
    ])
  );
  const list = h('ul', { class: 'metric-list', 'aria-labelledby': id });
  const columns: TableColumn<MetricResult>[] = [
    { id: 'metric', label: 'Metric', name: 'metric', type: 'text', value: r => r.label, cell: r => h('th', { scope: 'row' }, r.label) },
    { id: 'replays', label: SOURCE_LABELS.replays, name: 'replays', type: 'number', numeric: true, value: r => r.replays.value, cell: r => h('td', { class: 'num' }, valueText(r, r.replays.value)) },
    { id: 'loop', label: SOURCE_LABELS.loop, name: 'weekly loop', type: 'number', numeric: true, value: r => r.loop.value, cell: r => h('td', { class: 'num' }, valueText(r, r.loop.value)) },
    { id: 'target', label: 'Target', name: 'target', type: 'number', first: 'asc', value: r => r.target?.pass[0], cell: r => h('td', null, targetText(r)) },
    { id: 'status', label: 'Status', name: 'status', type: 'number', words: ['passes first', 'failures first'], value: r => STATUS_RANK[r.status], cell: r => h('td', null, statusChip(r)) }
  ];
  const table = sortableTable({ key: `dev.${key}`, name: title.toLowerCase(), caption: title, captionClass: 'sr-only', className: 'stat-table metric-table', columns, rows, rowId: r => r.id, defaultOrder: 'in report order', status, onSort: ordered => list.replaceChildren(...ordered.map(r => items.get(r.id) as HTMLElement)) });
  return h('div', { class: 'metric-region' }, h('h4', { class: 'metric-title', id }, title), table.element, list);
} // prettier-ignore

function saveReport(report: CalibrationReport): void {
  const blob = new Blob([reportMarkdown(report)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = h('a', {
    href: url,
    download: `calibration-${report.created}-${report.seasons}s-seed${report.seed}.md`
  });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportView(report: CalibrationReport, status: HTMLElement): HTMLElement {
  const c = report.counts;
  const flagged = report.results.filter(r => r.status === 'warn' || r.status === 'fail');
  const groups = [...new Set(report.results.map(r => r.group))] as MetricGroup[];
  const save = h('button', { class: 'btn btn-outline', type: 'button' }, 'Save report');
  save.addEventListener('click', () => saveReport(report));
  return h(
    'div',
    { class: 'stack' },
    h('h3', null, 'Report'),
    h(
      'p',
      null,
      `${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.info} info, ${c.pending} not measured yet. ` +
        `${count(report.seasons, 'season')} in ${count(report.leagues, 'league')}, ` +
        `${count(report.experiments, 'fit experiment season')}, and ` +
        `${count(report.loopSeasons, 'weekly-loop season')}, seed ${report.seed}, ` +
        `${count(Math.round(report.seconds), 'second')}.`
    ),
    h(
      'p',
      { class: 'hint' },
      'Season records are judged on the weekly-loop seasons, which play through the weekly advance as the game does. Everything else is judged on the replays.'
    ),
    h('p', { class: 'hint' }, 'The report lasts until you close the page. Save report keeps a copy.'),
    h('div', { class: 'btn-row' }, save),
    flagged.length ? resultGroup('flagged', 'Warnings and failures', flagged, status) : null,
    ...groups.map(g =>
      resultGroup(
        g,
        GROUP_TITLES[g],
        report.results.filter(r => r.group === g),
        status
      )
    )
  );
}

const noReport = () =>
  h(
    'p',
    { class: 'empty' },
    'No report yet. Reports last until you close the page; Save report keeps a copy.'
  );

function calibrationCard({ app }: ScreenContext): HTMLElement {
  const seasons = h('input', {
    class: 'input',
    id: 'calSeasons',
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    max: String(SEASONS_MAX),
    value: visit.seasons,
    'aria-describedby': 'calSeasons-hint calSeasons-error'
  });
  const seed = h('input', {
    class: 'input',
    id: 'calSeed',
    type: 'number',
    inputmode: 'numeric',
    min: '0',
    max: String(SEED_MAX),
    value: visit.seed,
    'aria-describedby': 'calSeed-error'
  });
  const loop = h('input', {
    class: 'input',
    id: 'calLoop',
    type: 'number',
    inputmode: 'numeric',
    min: '0',
    max: String(LOOP_MAX),
    value: visit.loop,
    'aria-describedby': 'calLoop-hint calLoop-error'
  });
  seasons.addEventListener('input', () => (visit.seasons = seasons.value));
  loop.addEventListener('input', () => (visit.loop = loop.value));
  seed.addEventListener('input', () => (visit.seed = seed.value));
  const seasonsError = h('p', { class: 'field-error', id: 'calSeasons-error', role: 'alert', hidden: true });
  const loopError = h('p', { class: 'field-error', id: 'calLoop-error', role: 'alert', hidden: true });
  const seedError = h('p', { class: 'field-error', id: 'calSeed-error', role: 'alert', hidden: true });
  const runButton = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Run calibration');
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', hidden: true }, 'Cancel');
  const progress = h('progress', {
    class: 'progress',
    max: '1',
    value: '0',
    'aria-label': 'Calibration progress',
    hidden: true
  });
  // The step line follows every replay; the status line announces only the start, each quarter, and the end.
  const step = h('p', { class: 'muted', hidden: true });
  const status = h('p', { class: 'muted', role: 'status' });
  const results = h('div', { class: 'stack' }, visit.report ? reportView(visit.report, status) : noReport());
  let runIdle: (() => void) | null = null;
  let cancelIdle: (() => void) | null = null;

  const sync = () => {
    const run = visit.run;
    if (!run) {
      // Cancel is about to hide; keep focus on the form's own button.
      if (document.activeElement === cancel) runButton.focus();
      runIdle?.();
      cancelIdle?.();
      runIdle = cancelIdle = null;
      cancel.hidden = progress.hidden = step.hidden = true;
      return;
    }
    runIdle ??= showBusy(runButton, 'Running…');
    if (run.cancelling) cancelIdle ??= showBusy(cancel, 'Cancelling…');
    cancel.hidden = progress.hidden = step.hidden = false;
    progress.max = run.total;
    progress.value = run.done;
    const where = run.step || 'Starting';
    progress.setAttribute('aria-valuetext', where);
    step.textContent = `${where}.`;
  };

  const whole = (input: HTMLInputElement, error: HTMLElement, max: number, message: string) => {
    const text = input.value.trim();
    const n = Number(text);
    const ok = text !== '' && Number.isInteger(n) && n >= Number(input.min) && n <= max;
    error.hidden = ok;
    error.textContent = ok ? '' : message;
    if (ok) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
    return ok ? n : null;
  };

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'calSeasons' }, 'Seasons'),
      seasons,
      h(
        'p',
        { class: 'hint', id: 'calSeasons-hint' },
        'Each season takes a few seconds here. Full 100-season runs belong on the command line. The run keeps going if you leave this screen.'
      ),
      seasonsError
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'calLoop' }, 'Weekly-loop seasons'),
      loop,
      h(
        'p',
        { class: 'hint', id: 'calLoop-hint' },
        'Each plays the regular season through the weekly advance, roster moves and all, and decides the season records. Each takes about half a minute here.'
      ),
      loopError
    ),
    h('div', { class: 'field' }, h('label', { for: 'calSeed' }, 'Seed'), seed, seedError),
    h('div', { class: 'btn-row' }, runButton, cancel),
    progress,
    step,
    status
  );
  cancel.addEventListener('click', () => {
    const run = visit.run;
    if (!run || run.cancelling) return;
    run.cancelling = true;
    run.controller.abort();
    sync();
    status.textContent = 'Cancelling after the season or week in progress.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (visit.run) return;
    const n = whole(seasons, seasonsError, SEASONS_MAX, 'Enter a whole number of seasons from 1 to 100.');
    const l = whole(loop, loopError, LOOP_MAX, `Enter a whole number of seasons from 0 to ${LOOP_MAX}.`);
    const s = whole(seed, seedError, SEED_MAX, 'Enter a whole number from 0 to 2,147,483,647.');
    if (n === null) return seasons.focus();
    if (l === null) return loop.focus();
    if (s === null) return seed.focus();
    startRun(app, { seed: s, seasons: n, perLeague: 10, experiments: defaultExperiments(n), loopSeasons: l, chains: 0, chainSeasons: 0 }); // prettier-ignore
  });

  view = {
    sync,
    announce: message => (status.textContent = message),
    showReport: report => mount(results, reportView(report, status))
  };
  sync();
  return card(
    'Calibration',
    h(
      'p',
      { class: 'muted' },
      'Replays the 2026 season in generated leagues, plays it through the weekly advance, and checks the results against sourced NFL targets.'
    ),
    form,
    results
  );
}

export function devScreen(): Screen {
  return {
    title: 'Developer tools',
    render: ctx =>
      h(
        'section',
        { class: 'view' },
        pageHead('Developer tools'),
        devMenuOn()
          ? calibrationCard(ctx)
          : card(
              'Developer tools',
              h('p', { class: 'empty' }, 'Developer tools are hidden. Unlock them from Settings.')
            )
      ),
    dispose: () => {
      view = null;
    }
  };
}
