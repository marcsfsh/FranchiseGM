/**
 * Developer tools (spec 23.5): the calibration runner and report viewer (spec 23.1). The same replays as
 * `npm run calibrate`, in the worker with a progress bar; the report shows here and saves as Markdown.
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
  STATUS_LABELS,
  type CalibrationReport
} from '../../engine/calibration/report';
import { defaultExperiments, type RunPlan } from '../../engine/calibration/run';
import type { MetricResult, Status, TargetsFile } from '../../engine/calibration/targets';
import { devMenuOn } from '../dev-menu';
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
const visit: { seasons: string; seed: string; run: ActiveRun | null; report: CalibrationReport | null } = {
  seasons: '10',
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
  view?.announce(`Calibration started: ${count(plan.seasons, 'season')}.`);
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

/** A value cell; a metric this build can't measure yet shows a dash and reads "Not measured yet". */
function valueText(r: MetricResult): HTMLElement {
  return r.value === null
    ? h(
        'span',
        null,
        h('span', { 'aria-hidden': 'true' }, '—'),
        h('span', { class: 'sr-only' }, 'Not measured yet')
      )
    : h('span', null, formatValue(r.value, r.format));
}

const targetText = (r: MetricResult) => (r.target ? formatBand(r.target.pass, r.format) : 'No target');

const statusChip = (s: Status) => {
  const label = STATUS_LABELS[s];
  return h('span', { class: `status ${STATUS_CLASS[s]}` }, label.charAt(0).toUpperCase() + label.slice(1));
};

/**
 * One group of results: a table where there's room, labeled rows in narrow spaces and at large text
 * sizes (style guide 7.3). The heading names both.
 */
function resultGroup(key: string, title: string, rows: readonly MetricResult[]): HTMLElement {
  const id = `metrics-${key}`;
  const table = h(
    'table',
    { class: 'stat-table metric-table' },
    h('caption', { class: 'sr-only' }, title),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col' }, 'Metric'),
        h('th', { scope: 'col', class: 'num' }, 'Value'),
        h('th', { scope: 'col' }, 'Target'),
        h('th', { scope: 'col' }, 'Status')
      )
    ),
    h(
      'tbody',
      null,
      ...rows.map(r =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, r.label),
          h('td', { class: 'num' }, valueText(r)),
          h('td', null, targetText(r)),
          h('td', null, statusChip(r.status))
        )
      )
    )
  );
  const list = h(
    'ul',
    { class: 'metric-list', 'aria-labelledby': id },
    ...rows.map(r =>
      h(
        'li',
        { class: 'metric-row' },
        h('span', { class: 'metric-name' }, r.label),
        statusChip(r.status),
        h(
          'dl',
          { class: 'metric-facts' },
          h('div', null, h('dt', null, 'Value'), h('dd', null, valueText(r))),
          h('div', null, h('dt', null, 'Target'), h('dd', null, targetText(r)))
        )
      )
    )
  );
  return h('div', { class: 'metric-region' }, h('h4', { class: 'metric-title', id }, title), table, list);
}

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

function reportView(report: CalibrationReport): HTMLElement {
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
        `${count(report.seasons, 'season')} in ${count(report.leagues, 'league')} and ` +
        `${count(report.experiments, 'fit experiment season')}, seed ${report.seed}, ` +
        `${count(Math.round(report.seconds), 'second')}.`
    ),
    h('p', { class: 'hint' }, 'The report lasts until you close the page. Save report keeps a copy.'),
    h('div', { class: 'btn-row' }, save),
    flagged.length ? resultGroup('flagged', 'Warnings and failures', flagged) : null,
    ...groups.map(g =>
      resultGroup(
        g,
        GROUP_TITLES[g],
        report.results.filter(r => r.group === g)
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
  seasons.addEventListener('input', () => (visit.seasons = seasons.value));
  seed.addEventListener('input', () => (visit.seed = seed.value));
  const seasonsError = h('p', { class: 'field-error', id: 'calSeasons-error', role: 'alert', hidden: true });
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
  const results = h('div', { class: 'stack' }, visit.report ? reportView(visit.report) : noReport());
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
    const ok = text !== '' && Number.isInteger(n) && n >= (input === seasons ? 1 : 0) && n <= max;
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
    status.textContent = 'Cancelling after this season.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (visit.run) return;
    const n = whole(seasons, seasonsError, SEASONS_MAX, 'Enter a whole number of seasons from 1 to 100.');
    const s = whole(seed, seedError, SEED_MAX, 'Enter a whole number from 0 to 2,147,483,647.');
    if (n === null) return seasons.focus();
    if (s === null) return seed.focus();
    startRun(app, { seed: s, seasons: n, perLeague: 10, experiments: defaultExperiments(n) });
  });

  view = {
    sync,
    announce: message => (status.textContent = message),
    showReport: report => mount(results, reportView(report))
  };
  sync();
  return card(
    'Calibration',
    h(
      'p',
      { class: 'muted' },
      'Replays the 2026 season in generated leagues and checks the results against sourced NFL targets.'
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
