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

/** A labeled range with its value beside it; it commits when released, and reads out as a percentage. */
function slider(app: AppState, league: League, path: SliderPath, label: string, status: HTMLElement): HTMLElement {
  const id = idOf(path);
  const value = read(league.settings.sim, path);
  const output = h('output', { for: id, class: 'slider-value' }, percent(value));
  const input = h('input', { type: 'range', id, min: String(SLIDER_RANGE.min), max: String(SLIDER_RANGE.max), step: String(STEP), value: String(value), 'aria-valuetext': percent(value) });
  input.addEventListener('input', () => {
    output.textContent = percent(Number(input.value));
    input.setAttribute('aria-valuetext', percent(Number(input.value)));
  });
  input.addEventListener('change', () => {
    const next = clamp(Number(input.value));
    app.edit(l => write(l.settings.sim, path, next), ['slider', ...path, next]);
    status.textContent = `${label}: ${percent(next)}.`;
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

/** The sliders card for Settings; `onReset` rebuilds it after the values return to normal. */
export function slidersCard(app: AppState, onReset: () => void): HTMLElement[] {
  const league = app.league;
  if (!league) return [];
  const status = h('p', { class: 'sr-only', role: 'status' });
  const sides = (path: (side: 'user' | 'ai') => SliderPath, label: string) =>
    h('fieldset', { class: 'slider-pair' }, h('legend', { class: 'field-label' }, label), slider(app, league, path('user'), 'Your team', status), slider(app, league, path('ai'), 'AI teams', status)); // prettier-ignore
  const reset = h('button', { class: 'btn btn-outline', type: 'button' }, 'Reset every slider to 100%');
  reset.addEventListener('click', () => {
    app.edit(
      l => {
        l.settings.sim = defaultSliders();
      },
      ['slidersReset']
    );
    onReset();
  });
  return [
    h('p', { class: 'muted' }, 'Each slider is a percentage of normal play; 100% is the calibrated league. Changes apply from the next game.'),
    group('General', true, ...(Object.keys(GENERAL_LABELS) as GeneralSlider[]).map(k => slider(app, league, ['general', k], GENERAL_LABELS[k], status))),
    group('Gameplay', false, ...GAMEPLAY_SLIDERS.map(k => sides(side => ['gameplay', k, side], GAMEPLAY_LABELS[k]))),
    group('Penalty frequency', false, ...PENALTY_SLIDERS.map(k => sides(side => ['penalties', k, side], PENALTY_LABELS[k]))),
    group('League stat output', false, ...OUTPUT_SLIDERS.map(k => slider(app, league, ['output', k], OUTPUT_LABELS[k], status))),
    h('div', { class: 'btn-row' }, reset),
    status
  ]; // prettier-ignore
}
