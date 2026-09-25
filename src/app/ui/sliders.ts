/**
 * The game sim and stat sliders card for Settings (spec 22.3): general sliders, gameplay and penalty
 * sliders with separate values for the user's team and AI teams, and league stat output. Each is a
 * percentage of normal from 0% to 200%; changes apply from the next game played.
 */
import type { League } from '../../engine/league/types';
import {
  defaultSliders,
  GAMEPLAY_SLIDERS,
  OUTPUT_SLIDERS,
  PENALTY_SLIDERS,
  SLIDER_RANGE,
  type GameplaySlider,
  type OutputSlider,
  type PenaltySlider,
  type SimSliders
} from '../../engine/sim/sliders';
import { h } from '../dom';
import { dialogFrame, openDialog } from '../feedback';
import type { AppState } from '../state';

type GeneralSlider = keyof SimSliders['general'];

const GENERAL_LABELS: Record<GeneralSlider, string> = {
  upsets: 'Upset frequency',
  homeField: 'Home field strength',
  injuryFrequency: 'Injury frequency',
  injurySeverity: 'Injury severity',
  weatherImpact: 'Weather impact',
  fitEffect: 'Scheme fit effect',
  cohesionEffect: 'Cohesion effect'
};

const GAMEPLAY_LABELS: Record<GameplaySlider, string> = {
  qbAccuracy: 'QB accuracy',
  passBlocking: 'Pass blocking',
  wrCatching: 'WR catching',
  runBlocking: 'Run blocking',
  fumbles: 'Fumbles',
  passDefenseReaction: 'Pass defense reaction time',
  interceptions: 'Interceptions',
  passCoverage: 'Pass coverage',
  tackling: 'Tackling',
  fgPower: 'Field goal power',
  fgAccuracy: 'Field goal accuracy',
  puntPower: 'Punt power',
  puntAccuracy: 'Punt accuracy',
  kickoffPower: 'Kickoff power'
};

const PENALTY_LABELS: Record<PenaltySlider, string> = {
  offside: 'Offside',
  falseStart: 'False start',
  offensiveHolding: 'Offensive holding',
  defensiveHolding: 'Defensive holding',
  facemask: 'Facemask',
  defensivePassInterference: 'Defensive pass interference',
  offensivePassInterference: 'Offensive pass interference',
  illegalBlockInBack: 'Illegal block in the back',
  roughingThePasser: 'Roughing the passer',
  intentionalGrounding: 'Intentional grounding',
  kickCatchInterference: 'Kick catch interference'
};

const OUTPUT_LABELS: Record<OutputSlider, string> = {
  passingVolume: 'Passing volume',
  passingEfficiency: 'Passing efficiency',
  rushingVolume: 'Rushing volume',
  rushingEfficiency: 'Rushing efficiency',
  turnovers: 'Turnovers',
  penalties: 'Penalties',
  scoring: 'Scoring'
};

/** A slider's step: five percentage points. */
const STEP = 0.05;
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const clamp = (value: number): number => Math.min(SLIDER_RANGE.max, Math.max(SLIDER_RANGE.min, value));

/** Where a slider's value lives in the league's settings. */
type SliderPath =
  | ['general', GeneralSlider]
  | ['gameplay', GameplaySlider, 'user' | 'ai']
  | ['penalties', PenaltySlider, 'user' | 'ai']
  | ['output', OutputSlider];

function read(sim: SimSliders, path: SliderPath): number {
  switch (path[0]) {
    case 'general':
      return sim.general[path[1]];
    case 'gameplay':
      return sim.gameplay[path[1]][path[2]];
    case 'penalties':
      return sim.penalties[path[1]][path[2]];
    case 'output':
      return sim.output[path[1]];
  }
}

function write(sim: SimSliders, path: SliderPath, value: number): void {
  switch (path[0]) {
    case 'general':
      sim.general[path[1]] = value;
      return;
    case 'gameplay':
      sim.gameplay[path[1]][path[2]] = value;
      return;
    case 'penalties':
      sim.penalties[path[1]][path[2]] = value;
      return;
    case 'output':
      sim.output[path[1]] = value;
  }
}

const idOf = (path: SliderPath): string => `slider-${path.join('-')}`;

/**
 * A labeled range with its value beside it, committed when released. `name` is its full name ("QB accuracy,
 * your team") where the visible label leans on a group's legend; the value reads out as a percentage.
 */
function slider(app: AppState, league: League, path: SliderPath, label: string, name = label): HTMLElement {
  const id = idOf(path);
  const value = read(league.settings.sim, path);
  const output = h('output', { for: id, class: 'slider-value' }, percent(value));
  const input = h('input', { type: 'range', id, min: String(SLIDER_RANGE.min), max: String(SLIDER_RANGE.max), step: String(STEP), value: String(value), 'aria-valuetext': percent(value), 'aria-label': name === label ? null : name });
  input.addEventListener('input', () => {
    output.textContent = percent(Number(input.value));
    input.setAttribute('aria-valuetext', percent(Number(input.value)));
  });
  // The range announces its own value as it moves, so a change needs no status message.
  input.addEventListener('change', () => {
    const next = clamp(Number(input.value));
    app.edit(l => write(l.settings.sim, path, next), ['slider', ...path, next]);
  });
  return h('div', { class: 'slider' }, h('label', { for: id }, label), input, output);
} // prettier-ignore

/** A slider set, with a user's-team and AI-teams value for each where the spec has both. */
function group(title: string, open: boolean, ...rows: HTMLElement[]): HTMLElement {
  return h(
    'details',
    { class: 'slider-group', open },
    h('summary', null, title),
    h('div', { class: 'slider-list' }, ...rows)
  );
}

/** Sliders away from 100%. */
function changed(sim: SimSliders): number {
  const values = [
    ...Object.values(sim.general),
    ...Object.values(sim.gameplay).flatMap(s => [s.user, s.ai]),
    ...Object.values(sim.penalties).flatMap(s => [s.user, s.ai]),
    ...Object.values(sim.output)
  ];
  return values.filter(v => Math.abs(v - 1) > 1e-9).length;
}

/** Asks before putting every slider back to 100%; `done` runs after a reset. */
function confirmReset(app: AppState, trigger: HTMLElement, done: () => void): void {
  const count = app.league ? changed(app.league.settings.sim) : 0;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel');
  const reset = h('button', { class: 'btn btn-danger', type: 'button' }, `Reset ${count} ${count === 1 ? 'slider' : 'sliders'}`);
  const dialog = dialogFrame('resetSlidersDialog', 'Reset the sliders', h('p', null, `${count} ${count === 1 ? 'slider is' : 'sliders are'} away from 100%. Resetting puts every one back to the calibrated league.`), h('div', { class: 'btn-row' }, reset, cancel));
  document.getElementById('resetSlidersDialog')?.remove();
  document.body.append(dialog);
  reset.addEventListener('click', () => {
    app.edit(l => {
      l.settings.sim = defaultSliders();
    }, ['slidersReset']);
    dialog.close();
    done();
  });
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  openDialog(dialog, trigger);
} // prettier-ignore

/**
 * The sliders card for Settings. `status` is its live region, kept outside the card's redraws; `onReset`
 * redraws the card after the values return to normal.
 */
export function slidersCard(app: AppState, status: HTMLElement, onReset: () => void): HTMLElement[] {
  const league = app.league;
  if (!league) return [];
  const sides = (path: (side: 'user' | 'ai') => SliderPath, label: string) =>
    h('fieldset', { class: 'slider-pair' }, h('legend', { class: 'field-label' }, label), slider(app, league, path('user'), 'Your team', `${label}, your team`), slider(app, league, path('ai'), 'AI teams', `${label}, AI teams`)); // prettier-ignore
  const reset = h(
    'button',
    { class: 'btn btn-outline', type: 'button', id: 'resetSliders' },
    'Reset every slider to 100%'
  );
  reset.addEventListener('click', () => {
    if (!changed(league.settings.sim)) {
      status.textContent = 'Every slider is already at 100%.';
      return;
    }
    confirmReset(app, reset, onReset);
  });
  return [
    h('p', { class: 'muted' }, 'Each slider is a percentage of normal play; 100% is the calibrated league. Changes apply from the next game.'),
    group('General', true, ...(Object.keys(GENERAL_LABELS) as GeneralSlider[]).map(k => slider(app, league, ['general', k], GENERAL_LABELS[k]))),
    group('Gameplay', false, ...GAMEPLAY_SLIDERS.map(k => sides(side => ['gameplay', k, side], GAMEPLAY_LABELS[k]))),
    group('Penalty frequency', false, ...PENALTY_SLIDERS.map(k => sides(side => ['penalties', k, side], PENALTY_LABELS[k]))),
    group('League stat output', false, ...OUTPUT_SLIDERS.map(k => slider(app, league, ['output', k], OUTPUT_LABELS[k]))),
    h('div', { class: 'btn-row' }, reset)
  ]; // prettier-ignore
}
