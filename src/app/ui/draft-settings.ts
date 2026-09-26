/**
 * The draft class settings card for Settings (spec 22.4, 10.3): the class size, scouting accuracy, the
 * class strength draw overall and by position group, bust and gem frequency by position group, and each
 * position's share of a class. Values are percentages of normal, except strength, which runs from -100%
 * (the weakest classes) to +100% (the strongest). Classes are made a season ahead, so changes apply to the
 * next class made; scouting accuracy applies at once.
 */
import { POSITIONS, type Position, type PositionGroup } from '../../engine/model/positions';
import {
  ACCURACY_MIN,
  CLASS_SIZE_RANGE,
  defaultDraftSettings,
  DRAFT_RANGE,
  type DraftSettings
} from '../../engine/draft/settings';
import { POSITION_GROUPS } from '../../engine/progression/settings';
import { h } from '../dom';
import { dialogFrame, openDialog } from '../feedback';
import type { AppState } from '../state';
import { GROUP_LABELS } from './players';
import { sortableTable, type TableColumn } from './sortable';

const STEP = 5;
/** A multiplier as a whole percentage, and back. */
const toPercent = (value: number): number => Math.round(value * 100);
/** "+50%", "−25%", or "0%". */
const signedPercent = (n: number): string => (n > 0 ? `+${n}%` : n < 0 ? `−${-n}%` : '0%');
const rangeWords = (min: number, max: number): string => `${min < 0 ? `−${-min}` : min} to ${max}`;
/** "150%", or "−25%" with a true minus sign. */
const percentText = (n: number): string => (n < 0 ? `−${-n}%` : `${n}%`);

/** Values away from normal. */
function changed(s: DraftSettings): number {
  const d = defaultDraftSettings();
  const differs = (a: number, b: number) => Math.abs(a - b) > 1e-9;
  const records = (['groupMean', 'groupSpread', 'bust', 'gem'] as const).flatMap(k => POSITION_GROUPS.map(g => differs(s[k][g], d[k][g]))); // prettier-ignore
  const mix = POSITIONS.map(p => differs(s.positionMix[p], d.positionMix[p]));
  const single = (['classSize', 'strengthMean', 'strengthSpread', 'scoutingAccuracy'] as const).map(k =>
    differs(s[k], d[k])
  );
  return [...records, ...mix, ...single].filter(Boolean).length;
}

interface CellSpec {
  id: string;
  /** The setting in sentences: "Strength, quarterbacks". */
  said: string;
  /** The value shown, in whole percent. */
  value: number;
  min: number;
  max: number;
  /** Applies a new value, in whole percent. */
  write: (percent: number) => void;
}

/**
 * A percentage input for one table cell, committed on change. An entry that isn't a number is refused and
 * the setting keeps its value; one outside the range or between steps of 5 is brought to the nearest allowed.
 */
function percentCell(spec: CellSpec, status: HTMLElement): HTMLElement {
  const error = h('p', { class: 'field-error', id: `${spec.id}-error`, hidden: true });
  const range = rangeWords(spec.min, spec.max);
  // A signed value needs the keyboard with a minus sign, so only unsigned cells ask for digits alone.
  const input = h('input', { class: 'input', type: 'number', id: spec.id, min: String(spec.min), max: String(spec.max), step: String(STEP), inputmode: spec.min < 0 ? null : 'numeric', value: String(spec.value), 'aria-label': `${spec.said}, percent`, 'aria-describedby': error.id });
  let current = spec.value;
  input.addEventListener('change', () => {
    const typed = input.value.trim() === '' ? NaN : Number(input.value);
    if (!Number.isFinite(typed)) {
      error.textContent = `Enter a whole number from ${range}.`;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      status.textContent = `${spec.said}: enter a whole number from ${range}. It stays at ${percentText(current)}.`;
      return;
    }
    error.textContent = '';
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    const next = Math.min(spec.max, Math.max(spec.min, Math.round(typed / STEP) * STEP));
    input.value = String(next);
    current = next;
    spec.write(next);
    const note = typed > spec.max ? ', the most allowed' : typed < spec.min ? ', the least allowed' : next !== typed ? ', to the nearest 5' : '';
    status.textContent = `${spec.said}: ${percentText(next)}${note}.`;
  });
  return h('td', { class: 'num' }, input, error);
} // prettier-ignore

interface GroupRow {
  group: PositionGroup;
  order: number;
  /** The row's values in whole percent, kept current as they're edited so a sort reads what the cells show. */
  strength: number;
  spread: number;
  bust: number;
  gem: number;
}

interface MixRow {
  position: Position;
  order: number;
  share: number;
}

const MAX = toPercent(DRAFT_RANGE.max);

/** Asks before putting every draft class setting back to normal; `done` runs after a reset. */
function confirmReset(app: AppState, trigger: HTMLElement, done: () => void): void {
  const count = app.league ? changed(app.league.settings.draft) : 0;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel');
  const reset = h('button', { class: 'btn btn-danger', type: 'button' }, `Reset ${count} ${count === 1 ? 'setting' : 'settings'}`);
  const dialog = dialogFrame('resetDraftDialog', 'Reset draft classes', h('p', null, `${count} ${count === 1 ? 'setting is' : 'settings are'} away from normal. Resetting puts every one back to the calibrated league.`), h('div', { class: 'btn-row' }, reset, cancel));
  document.getElementById('resetDraftDialog')?.remove();
  document.body.append(dialog);
  reset.addEventListener('click', () => {
    app.edit(l => {
      l.settings.draft = defaultDraftSettings();
    }, ['draftReset']);
    dialog.close();
    done();
  });
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  openDialog(dialog, trigger);
} // prettier-ignore

/**
 * The draft class card's contents. `status` is its live region, kept outside the card's redraws; `onReset`
 * redraws the card after the values return to normal.
 */
export function draftSettingsCard(app: AppState, status: HTMLElement, onReset: () => void): HTMLElement[] {
  const league = app.league;
  if (!league) return [];
  const s = league.settings.draft;
  const edit = (change: (d: DraftSettings) => void, action: unknown[]) =>
    app.edit(l => change(l.settings.draft), ['draft', ...action]);

  // The class size: a whole number of prospects in its range.
  const sizeError = h('p', { class: 'field-error', id: 'draftClassSize-error', hidden: true });
  const size = h('input', {
    class: 'input',
    type: 'number',
    id: 'draftClassSize',
    min: String(CLASS_SIZE_RANGE.min),
    max: String(CLASS_SIZE_RANGE.max),
    step: '1',
    inputmode: 'numeric',
    value: String(s.classSize),
    'aria-describedby': 'draftClassSize-hint draftClassSize-error'
  });
  size.addEventListener('change', () => {
    const typed = size.value.trim() === '' ? NaN : Number(size.value);
    const range = `${CLASS_SIZE_RANGE.min} to ${CLASS_SIZE_RANGE.max}`;
    if (!Number.isFinite(typed)) {
      sizeError.textContent = `Enter a whole number from ${range}.`;
      sizeError.hidden = false;
      size.setAttribute('aria-invalid', 'true');
      status.textContent = `Class size: enter a whole number from ${range}. It stays at ${(app.league ?? league).settings.draft.classSize}.`;
      return;
    }
    sizeError.textContent = '';
    sizeError.hidden = true;
    size.removeAttribute('aria-invalid');
    const next = Math.min(CLASS_SIZE_RANGE.max, Math.max(CLASS_SIZE_RANGE.min, Math.round(typed)));
    size.value = String(next);
    edit(d => (d.classSize = next), ['classSize', next]);
    const note = typed > CLASS_SIZE_RANGE.max ? ', the most allowed' : typed < CLASS_SIZE_RANGE.min ? ', the fewest allowed' : '';
    status.textContent = `Class size: ${next} prospects${note}.`;
  }); // prettier-ignore

  // Sliders for the class as a whole: scouting accuracy, and its strength draw's mean and spread.
  // The output shows the number, which stays narrow at large text sizes; the value text says what it means.
  const slider = (id: string, label: string, value: number, min: number, max: number, words: (n: number) => string, write: (n: number) => void, shown: (n: number) => string = words) => {
    const output = h('output', { for: id, class: 'slider-value' }, shown(value));
    const input = h('input', { type: 'range', id, min: String(min), max: String(max), step: String(STEP), value: String(value), 'aria-valuetext': words(value) });
    input.addEventListener('input', () => {
      output.textContent = shown(Number(input.value));
      input.setAttribute('aria-valuetext', words(Number(input.value)));
    });
    input.addEventListener('change', () => write(Number(input.value)));
    return h('div', { class: 'slider' }, h('label', { for: id }, label), input, output);
  }; // prettier-ignore
  const plain = (n: number) => `${n}%`;
  const strength = (n: number) =>
    n === 0 ? '0%, normal' : `${signedPercent(n)}, ${n > 0 ? 'stronger' : 'weaker'}`;
  const sliders = h(
    'div',
    { class: 'slider-list' },
    slider('draftAccuracy', 'Scouting accuracy', toPercent(s.scoutingAccuracy), toPercent(ACCURACY_MIN), MAX, plain, n => edit(d => (d.scoutingAccuracy = n / 100), ['scoutingAccuracy', n])),
    slider('draftStrength', 'Class strength', toPercent(s.strengthMean), -100, 100, strength, n => edit(d => (d.strengthMean = n / 100), ['strengthMean', n]), signedPercent),
    slider('draftStrengthSpread', 'Class strength variation', toPercent(s.strengthSpread), 0, MAX, plain, n => edit(d => (d.strengthSpread = n / 100), ['strengthSpread', n]))
  ); // prettier-ignore

  // Position groups: strength draws, and how often prospects are busts or gems.
  const groups: GroupRow[] = POSITION_GROUPS.map((g, i) => ({
    group: g,
    order: i,
    strength: toPercent(s.groupMean[g]),
    spread: toPercent(s.groupSpread[g]),
    bust: toPercent(s.bust[g]),
    gem: toPercent(s.gem[g])
  }));
  const groupCell = (r: GroupRow, key: 'strength' | 'spread' | 'bust' | 'gem', label: string, min: number, max: number) =>
    percentCell({ id: `draft-${key}-${r.group}`, said: `${label}, ${GROUP_LABELS[r.group].toLowerCase()}`, value: r[key], min, max, write: n => {
      r[key] = n;
      edit(d => {
        const field = key === 'strength' ? d.groupMean : key === 'spread' ? d.groupSpread : d[key];
        field[r.group] = n / 100;
      }, [key, r.group, n]);
    } }, status); // prettier-ignore
  const groupColumns: TableColumn<GroupRow>[] = [
    { id: 'group', label: 'Position group', name: 'position group', type: 'number', value: r => r.order, first: 'asc', words: ['in order', 'in reverse'], cell: r => h('th', { scope: 'row' }, GROUP_LABELS[r.group]) },
    { id: 'strength', label: 'Strength (%)', name: 'strength', type: 'number', numeric: true, value: r => r.strength, cell: r => groupCell(r, 'strength', 'Strength', -100, 100) },
    { id: 'spread', label: 'Variation (%)', name: 'variation', type: 'number', numeric: true, value: r => r.spread, cell: r => groupCell(r, 'spread', 'Variation', 0, MAX) },
    { id: 'bust', label: 'Busts (%)', name: 'busts', type: 'number', numeric: true, value: r => r.bust, cell: r => groupCell(r, 'bust', 'Busts', 0, MAX) },
    { id: 'gem', label: 'Gems (%)', name: 'gems', type: 'number', numeric: true, value: r => r.gem, cell: r => groupCell(r, 'gem', 'Gems', 0, MAX) }
  ]; // prettier-ignore

  // Each position's share of a class.
  const mix: MixRow[] = POSITIONS.map((p, i) => ({
    position: p,
    order: i,
    share: toPercent(s.positionMix[p])
  }));
  const mixColumns: TableColumn<MixRow>[] = [
    { id: 'position', label: 'Position', name: 'position', type: 'number', value: r => r.order, first: 'asc', words: ['in order', 'in reverse'], cell: r => h('th', { scope: 'row' }, r.position) },
    { id: 'share', label: 'Share (%)', name: 'share', type: 'number', numeric: true, value: r => r.share, cell: r => percentCell({ id: `draft-mix-${r.position}`, said: `Share, ${r.position}`, value: r.share, min: 0, max: MAX, write: n => {
      r.share = n;
      edit(d => (d.positionMix[r.position] = n / 100), ['positionMix', r.position, n]);
    } }, status) }
  ]; // prettier-ignore

  const reset = h(
    'button',
    { class: 'btn btn-outline', type: 'button', id: 'resetDraft' },
    'Reset draft classes to normal'
  );
  reset.addEventListener('click', () => {
    if (!changed((app.league ?? league).settings.draft)) {
      status.textContent = 'Every draft class setting is already normal.';
      return;
    }
    confirmReset(app, reset, onReset);
  });

  return [
    h('p', { class: 'muted' }, 'How draft classes are made. Values are percentages of normal, where 100% is the calibrated league; strength runs from −100% for the weakest classes to +100% for the strongest. Classes are made a season ahead, so changes apply to the next class. Scouting accuracy applies at once.'),
    h('div', { class: 'field' }, h('label', { for: 'draftClassSize' }, 'Prospects in each class'), size, h('p', { class: 'hint', id: 'draftClassSize-hint' }, `${defaultDraftSettings().classSize} is normal. From ${CLASS_SIZE_RANGE.min} to ${CLASS_SIZE_RANGE.max}.`), sizeError),
    h('details', { class: 'slider-group', open: true }, h('summary', null, 'The whole class'), sliders),
    h('details', { class: 'slider-group' }, h('summary', null, 'By position group'), sortableTable({ key: 'draft.groups', name: 'Draft classes by position group', caption: 'Draft classes by position group', captionClass: 'sr-only', className: 'stat-table curve-table', columns: groupColumns, rows: groups, rowId: r => r.group, defaultOrder: 'by position group', scroll: true, status }).element),
    h('details', { class: 'slider-group' }, h('summary', null, 'Position mix'), sortableTable({ key: 'draft.mix', name: 'Position mix', caption: "Each position's share of a class", captionClass: 'sr-only', className: 'stat-table curve-table', columns: mixColumns, rows: mix, rowId: r => r.position, defaultOrder: 'by position', scroll: true, status }).element),
    h('div', { class: 'btn-row' }, reset)
  ]; // prettier-ignore
}
