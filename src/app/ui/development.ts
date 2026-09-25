/**
 * The development settings card for Settings (spec 22.4, 10.5): the retirement age, the progression and
 * regression speeds (each split by age and by position), and the four curve tables. Every value is a
 * percentage of normal from 0% to 200%; changes apply from the next week or phase.
 */
import type { PositionGroup } from '../../engine/model/positions';
import {
  AGE_BRACKETS,
  bracketLabel,
  defaultDevelopment,
  DEVELOPMENT_RANGE,
  POSITION_GROUPS,
  type DevelopmentSettings,
  type DevelopmentSpeeds
} from '../../engine/progression/settings';
import { h } from '../dom';
import { dialogFrame, openDialog } from '../feedback';
import type { AppState } from '../state';
import { sortableTable, type TableColumn } from './sortable';

const STEP = 0.05;
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const clamp = (value: number): number =>
  Math.min(DEVELOPMENT_RANGE.max, Math.max(DEVELOPMENT_RANGE.min, Math.round(value / STEP) * STEP));

const SPEED_LABELS: Record<keyof DevelopmentSpeeds, string> = {
  progressionAge: 'Progression speed by age',
  progressionPosition: 'Progression speed by position',
  regressionAge: 'Regression speed by age',
  regressionPosition: 'Regression speed by position'
};

const GROUP_NAMES: Record<PositionGroup, string> = {
  QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', OL: 'Offensive line',
  DL: 'Defensive line', LB: 'Linebackers', DB: 'Defensive backs', ST: 'Kickers, punters, and snappers'
}; // prettier-ignore

const RETIREMENT = [-3, -2, -1, 0, 1, 2, 3];
const retirementWords = (years: number): string =>
  years === 0
    ? 'At the usual age'
    : `${Math.abs(years)} ${Math.abs(years) === 1 ? 'year' : 'years'} ${years < 0 ? 'earlier' : 'later'}`;

/** Values away from normal. */
function changed(s: DevelopmentSettings): number {
  const values = [
    ...s.progressionByAge,
    ...s.regressionByAge,
    ...Object.values(s.progressionByPosition),
    ...Object.values(s.regressionByPosition),
    ...Object.values(s.speed)
  ];
  return values.filter(v => Math.abs(v - 1) > 1e-9).length + (s.retirementAge ? 1 : 0);
}

/**
 * A percentage input for one table cell, committed on change. An entry that isn't a number is refused and
 * the setting keeps its value; one outside 0 to 200 or between steps of 5 is brought to the nearest allowed.
 */
function cellInput(
  app: AppState,
  id: string,
  row: CurveRow,
  kind: 'progression' | 'regression',
  status: HTMLElement
): HTMLElement {
  const said = `${kind === 'progression' ? 'Progression' : 'Regression'}, ${row.name}`;
  const error = h('p', { class: 'field-error', id: `${id}-error`, hidden: true });
  const input = h('input', { class: 'input', type: 'number', id, min: '0', max: '200', step: '5', inputmode: 'numeric', value: String(Math.round(row[kind] * 100)), 'aria-label': `${said}, percent`, 'aria-describedby': error.id });
  input.addEventListener('change', () => {
    const typed = input.value.trim() === '' ? NaN : Number(input.value);
    if (!Number.isFinite(typed)) {
      error.textContent = 'Enter a whole number from 0 to 200.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      status.textContent = `${said}: enter a whole number from 0 to 200. It stays at ${percent(row[kind])}.`;
      return;
    }
    error.textContent = '';
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    const next = clamp(typed / 100);
    const shown = Math.round(next * 100);
    input.value = String(shown);
    row[kind] = next;
    app.edit(l => row.write(l.settings.development, kind, next), ['development', id, next]);
    const note = typed > 200 ? ', the most allowed' : typed < 0 ? ', the least allowed' : shown !== typed ? ', to the nearest 5' : '';
    status.textContent = `${said}: ${shown}%${note}.`;
  });
  return h('td', { class: 'num' }, input, error);
} // prettier-ignore

interface CurveRow {
  id: string;
  label: string;
  /** The row in its inputs' names: "ages 23 to 24", "quarterbacks". */
  name: string;
  order: number;
  /** The row's values, kept current as they're edited so a sort reads what the cells show. */
  progression: number;
  regression: number;
  write: (s: DevelopmentSettings, kind: 'progression' | 'regression', v: number) => void;
}

function curveTable(
  app: AppState,
  key: string,
  name: string,
  head: string,
  rows: CurveRow[],
  status: HTMLElement
): HTMLElement {
  const columns: TableColumn<CurveRow>[] = [
    { id: 'row', label: head, name: head.toLowerCase(), type: 'number', value: r => r.order, first: 'asc', words: ['in order', 'in reverse'], cell: r => h('th', { scope: 'row' }, r.label) },
    { id: 'progression', label: 'Progression (%)', name: 'progression', type: 'number', numeric: true, value: r => r.progression, cell: r => cellInput(app, `dev-${key}-p-${r.id}`, r, 'progression', status) },
    { id: 'regression', label: 'Regression (%)', name: 'regression', type: 'number', numeric: true, value: r => r.regression, cell: r => cellInput(app, `dev-${key}-r-${r.id}`, r, 'regression', status) }
  ]; // prettier-ignore
  return sortableTable({ key: `development.${key}`, name, caption: name, captionClass: 'sr-only', className: 'stat-table curve-table', columns, rows, rowId: r => r.id, defaultOrder: `by ${head.toLowerCase()}`, scroll: true, status }).element; // prettier-ignore
}

/** Asks before putting every development setting back to normal; `done` runs after a reset. */
function confirmReset(app: AppState, trigger: HTMLElement, done: () => void): void {
  const count = app.league ? changed(app.league.settings.development) : 0;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel');
  const reset = h('button', { class: 'btn btn-danger', type: 'button' }, `Reset ${count} ${count === 1 ? 'setting' : 'settings'}`);
  const dialog = dialogFrame('resetDevelopmentDialog', 'Reset development', h('p', null, `${count} ${count === 1 ? 'setting is' : 'settings are'} away from normal. Resetting puts every one back to the calibrated league.`), h('div', { class: 'btn-row' }, reset, cancel));
  document.getElementById('resetDevelopmentDialog')?.remove();
  document.body.append(dialog);
  reset.addEventListener('click', () => {
    app.edit(l => {
      l.settings.development = defaultDevelopment();
    }, ['developmentReset']);
    dialog.close();
    done();
  });
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  openDialog(dialog, trigger);
} // prettier-ignore

/**
 * The development card's contents. `status` is its live region, kept outside the card's redraws; `onReset`
 * redraws the card after the values return to normal.
 */
export function developmentCard(app: AppState, status: HTMLElement, onReset: () => void): HTMLElement[] {
  const league = app.league;
  if (!league) return [];
  const s = league.settings.development;

  const retirement = h(
    'select',
    { class: 'select', id: 'devRetirement' },
    ...RETIREMENT.map(y => h('option', { value: String(y) }, retirementWords(y)))
  );
  retirement.value = String(s.retirementAge);
  retirement.addEventListener('change', () => {
    const years = Number(retirement.value);
    app.edit(l => {
      l.settings.development.retirementAge = years;
    }, ['development', 'retirementAge', years]);
    status.textContent = `Players retire ${retirementWords(years).toLowerCase()}.`;
  }); // prettier-ignore

  const speed = (k: keyof DevelopmentSpeeds) => {
    const id = `devSpeed-${k}`;
    const output = h('output', { for: id, class: 'slider-value' }, percent(s.speed[k]));
    const input = h('input', { type: 'range', id, min: String(DEVELOPMENT_RANGE.min), max: String(DEVELOPMENT_RANGE.max), step: String(STEP), value: String(s.speed[k]), 'aria-valuetext': percent(s.speed[k]) });
    input.addEventListener('input', () => {
      output.textContent = percent(Number(input.value));
      input.setAttribute('aria-valuetext', percent(Number(input.value)));
    });
    input.addEventListener('change', () => {
      const next = clamp(Number(input.value));
      app.edit(l => {
        l.settings.development.speed[k] = next;
      }, ['development', k, next]);
    });
    return h('div', { class: 'slider' }, h('label', { for: id }, SPEED_LABELS[k]), input, output);
  }; // prettier-ignore

  const ages: CurveRow[] = AGE_BRACKETS.map((_, i) => ({
    id: String(i),
    label: bracketLabel(i),
    name: `ages ${bracketLabel(i)}`,
    order: i,
    progression: s.progressionByAge[i] ?? 1,
    regression: s.regressionByAge[i] ?? 1,
    write: (d, kind, v) => {
      (kind === 'progression' ? d.progressionByAge : d.regressionByAge)[i] = v;
    }
  }));
  const groups: CurveRow[] = POSITION_GROUPS.map((g, i) => ({
    id: g,
    label: GROUP_NAMES[g],
    name: GROUP_NAMES[g].toLowerCase(),
    order: i,
    progression: s.progressionByPosition[g],
    regression: s.regressionByPosition[g],
    write: (d, kind, v) => {
      (kind === 'progression' ? d.progressionByPosition : d.regressionByPosition)[g] = v;
    }
  }));

  const reset = h(
    'button',
    { class: 'btn btn-outline', type: 'button', id: 'resetDevelopment' },
    'Reset development to normal'
  );
  reset.addEventListener('click', () => {
    if (!changed(league.settings.development)) {
      status.textContent = 'Every development setting is already normal.';
      return;
    }
    confirmReset(app, reset, onReset);
  }); // prettier-ignore

  return [
    h('p', { class: 'muted' }, 'How players grow and decline. Each value is a percentage of normal development; 100% is the calibrated league. Changes apply from the next week or phase.'),
    h('div', { class: 'field' }, h('label', { for: 'devRetirement' }, 'Players retire'), retirement),
    h('details', { class: 'slider-group', open: true }, h('summary', null, 'Speed'), h('div', { class: 'slider-list' }, ...(Object.keys(SPEED_LABELS) as (keyof DevelopmentSpeeds)[]).map(speed))),
    h('details', { class: 'slider-group' }, h('summary', null, 'By age'), curveTable(app, 'age', 'Progression and regression by age', 'Ages', ages, status)),
    h('details', { class: 'slider-group' }, h('summary', null, 'By position'), curveTable(app, 'position', 'Progression and regression by position', 'Position', groups, status)),
    h('div', { class: 'btn-row' }, reset)
  ]; // prettier-ignore
}
