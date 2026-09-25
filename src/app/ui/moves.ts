/**
 * Roster moves from the screens (spec 19.4, style guide 7.1, 7.7): a dialog lists the moves open to a
 * player, previews the chosen one's effect on the cap and the roster before the user confirms with a button
 * that names it, and says why a move the rules don't allow can't be made. Moves go through the engine's
 * checked transactions, and wait while a week is being played.
 */
import type { Outcome } from '../../engine/contracts/moves';
import { afterJune1 } from '../../engine/contracts/cap';
import type { League } from '../../engine/league/types';
import { fullName, type Player } from '../../engine/model/player';
import { stream } from '../../engine/rng';
import { makeMove, previewMove, type Move, type MovePreview } from '../../engine/roster/moves';
import { possessive } from '../../engine/text';
import { h } from '../dom';
import { actionDialogFrame, openDialog, toast } from '../feedback';
import { money } from '../format';
import type { AppState } from '../state';

export const WAIT_FOR_GAMES = "This week's games are being played. Make roster moves when they finish.";

/** Makes a move on the open league, returning its preview or the reason it couldn't be made. */
export function applyMove(app: AppState, move: Move): Outcome<MovePreview> {
  if (app.advancing) return { ok: false, reason: WAIT_FOR_GAMES };
  let result: Outcome<MovePreview> = { ok: false, reason: 'Open a league first.' };
  app.edit(
    l => {
      const rng = stream(l.random.baseSeed, 'userMoves', l.season.season, l.season.transactions.length);
      result = makeMove(l, move, rng);
    },
    { move: move.kind, player: move.playerId }
  );
  return result;
}

/** A move's preview, or the reason it can't be made; moves wait while a week is being played. */
export function preview(app: AppState, league: League, move: Move): Outcome<MovePreview> {
  return app.advancing ? { ok: false, reason: WAIT_FOR_GAMES } : previewMove(league, move);
}

/** A space change in exact dollars, colored by meaning: more space is good (style guide 9). */
function spaceChange(p: MovePreview): HTMLElement {
  const delta = p.spaceAfter - p.spaceBefore;
  if (delta === 0) return h('span', null, `${money(p.spaceBefore, true)}, unchanged`);
  return h(
    'span',
    { class: delta > 0 ? 'delta-good' : 'delta-bad' },
    `${money(p.spaceBefore, true)} to ${money(p.spaceAfter, true)} (${delta > 0 ? '+' : '−'}${money(Math.abs(delta), true)})`
  );
}

/** The preview as label and value rows, then what happens. */
export function previewDetails(p: MovePreview): HTMLElement {
  const row = (label: string, value: Node | string) =>
    h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, value));
  const dead = p.deadNow || p.deadNext;
  return h(
    'div',
    { class: 'stack' },
    row(`${p.year} cap space`, spaceChange(p)),
    dead
      ? row('Dead money', h('span', { class: 'delta-bad' }, `${money(p.deadNow, true)} in ${p.year}${p.deadNext ? `, ${money(p.deadNext, true)} in ${p.year + 1}` : ''}`))
      : null,
    row('Active roster', `${p.active} of ${p.limit}`),
    row('Practice squad', String(p.practice)),
    ...p.notes.map(n => h('p', null, n))
  );
} // prettier-ignore

export interface MoveChoice {
  label: string;
  /** The confirm button's label, naming the move and the player. */
  confirm: string;
  /** A destructive move gets the danger button. */
  danger?: boolean;
  /** The move to make, from the choice's inputs; null while they're incomplete or invalid. */
  move: () => Move | null;
  /** Inputs the choice needs, shown while it's selected. */
  inputs?: HTMLElement;
  /** What to say while the inputs are incomplete. */
  incomplete?: string;
}

/**
 * Opens a dialog to choose a move and confirm it after its preview (style guide 7.1, 7.7). With several
 * choices none is selected at first and focus starts on Cancel; a single choice with inputs starts on its
 * first field. `done` runs after a move is made.
 */
export function openMoveDialog(
  app: AppState,
  options: { id: string; title: string; intro: string; choices: MoveChoice[] },
  trigger: HTMLElement,
  done: () => void
): void {
  const league = app.league;
  if (!league) return;
  const { id, choices } = options;
  const previewId = `${id}-preview`;
  const output = h('output', { class: 'stack', 'aria-live': 'polite', id: previewId });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const confirm = h('button', { class: 'btn btn-primary', type: 'button', 'aria-describedby': previewId });
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true }, 'Cancel');
  const single = choices.length === 1;
  let selected: number | null = single ? 0 : null;
  const radios = choices.map((choice, i) => {
    const radio = h('input', { type: 'radio', name: `${id}-choice`, id: `${id}-${i}` });
    radio.addEventListener('change', () => {
      selected = i;
      update();
    });
    return h('div', null, h('label', { class: 'check-target check-left', for: `${id}-${i}` }, radio, choice.label), choice.inputs ?? null);
  }); // prettier-ignore
  const update = () => {
    error.hidden = true;
    choices.forEach((c, i) => {
      if (c.inputs) c.inputs.hidden = i !== selected;
    });
    const choice = selected === null ? undefined : choices[selected];
    confirm.textContent = choice?.confirm ?? 'Confirm move';
    confirm.className = `btn ${choice?.danger ? 'btn-danger' : 'btn-primary'}`;
    const move = choice?.move() ?? null;
    if (!choice || !move) {
      output.replaceChildren(
        h('p', { class: 'hint' }, choice ? (choice.incomplete ?? 'Fill in the details to see what this move does.') : 'Choose a move to see what it does to your cap and roster.')
      );
      confirm.disabled = true;
      return;
    }
    const p = preview(app, app.league ?? league, move);
    output.replaceChildren(p.ok ? previewDetails(p.value) : h('p', { class: 'hint' }, p.reason));
    confirm.disabled = !p.ok;
  }; // prettier-ignore
  // Typing waits for a pause before the preview (and its announcement) changes; a finished change doesn't.
  let timer = 0;
  for (const c of choices) {
    c.inputs?.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 500);
    });
    c.inputs?.addEventListener('change', () => {
      window.clearTimeout(timer);
      update();
    });
  }
  const body: Node[] = [h('p', null, options.intro)];
  if (!single)
    body.push(
      h('fieldset', { class: 'field stack' }, h('legend', { class: 'label' }, 'Choose a move'), ...radios)
    );
  else if (choices[0]?.inputs) body.push(choices[0].inputs);
  body.push(output, error);
  const dialog = actionDialogFrame(id, options.title, body, [confirm, cancel]);
  confirm.addEventListener('click', () => {
    const move = selected === null ? null : (choices[selected]?.move() ?? null);
    if (!move) return;
    const result = applyMove(app, move);
    if (!result.ok) {
      error.textContent = result.reason;
      error.hidden = false;
      return;
    }
    dialog.close();
    toast(result.value.notes.join(' '));
    done();
  }); // prettier-ignore
  // Consequential moves start on Cancel; an offer starts on its first field.
  const first = single ? choices[0]?.inputs?.querySelector<HTMLElement>('select, input') : null;
  (first ?? cancel).setAttribute('data-autofocus', '');
  document.getElementById(id)?.remove();
  document.body.append(dialog);
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  update();
  openDialog(dialog, trigger, () => document.querySelector<HTMLElement>('main h1'));
}

export interface DollarField {
  field: HTMLElement;
  input: HTMLInputElement;
  /** Shows a problem with the value, or clears it with null. */
  setError(message: string | null): void;
}

/** A whole-dollar amount field with its label, hint, and error (style guide 7.2). */
export function dollarField(id: string, label: string, hint: string, value: number, step = 5000): DollarField {
  const error = h('p', { class: 'field-error', id: `${id}-error`, hidden: true });
  const input = h('input', { class: 'input', id, type: 'number', inputmode: 'numeric', min: 0, step, value, 'aria-describedby': `${id}-hint ${id}-error` });
  return {
    input,
    field: h('div', { class: 'field' }, h('label', { for: id }, label), input, h('p', { class: 'hint', id: `${id}-hint` }, hint), error),
    setError: message => {
      error.textContent = message ?? '';
      error.hidden = message === null;
      if (message === null) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    }
  };
} // prettier-ignore

/** The roster moves open to one of the user's players, by his status (spec 19.4). */
export function rosterMoveChoices(league: League, player: Player): MoveChoice[] {
  const team = league.meta.start.userTeam;
  const base = { team, playerId: player.id };
  const name = fullName(player);
  const release: MoveChoice = { label: 'Release him', confirm: `Release ${name}`, danger: true, move: () => ({ kind: 'release', ...base }) };
  switch (player.status) {
    case 'active': {
      const amount = dollarField(`restructure-amount-${player.id}`, 'Salary to convert, dollars', 'Converted salary becomes a bonus spread over the rest of the contract, up to 5 years.', 0, 50_000);
      const voids = h('select', { class: 'select', id: `restructure-voids-${player.id}` }, ...[0, 1, 2, 3].map(n => h('option', { value: n }, n === 0 ? 'No void years' : `${n} void ${n === 1 ? 'year' : 'years'}`)));
      const inputs = h('div', { class: 'stack' }, amount.field, h('div', { class: 'field' }, h('label', { for: voids.id }, 'Void years to add'), voids));
      const choices: MoveChoice[] = [
        release,
        { label: 'Place him on injured reserve', confirm: `Place ${name} on injured reserve`, move: () => ({ kind: 'injuredReserve', ...base }) },
        {
          label: 'Restructure his contract',
          confirm: `Restructure ${possessive(name)} contract`,
          inputs,
          incomplete: 'Enter the salary to convert to see what the restructure does.',
          move: () => {
            const value = amount.input.valueAsNumber;
            amount.setError(Number.isFinite(value) && value < 0 ? 'Enter an amount of zero or more.' : null);
            return Number.isFinite(value) && value > 0
              ? { kind: 'restructure', ...base, amount: Math.round(value), voidYears: Number(voids.value) }
              : null;
          }
        }
      ];
      if (!afterJune1(league.date, league.rules))
        choices.splice(1, 0, { label: 'Release him with a June 1 designation', confirm: `Release ${name} with a June 1 designation`, danger: true, move: () => ({ kind: 'release', ...base, designated: true }) });
      return choices;
    }
    case 'practice':
      return [
        { label: 'Sign him to the active roster', confirm: `Sign ${name} to the active roster`, move: () => ({ kind: 'promote', ...base }) },
        { label: "Elevate him for this week's game", confirm: `Elevate ${name}`, move: () => ({ kind: 'elevate', ...base }) },
        release
      ];
    case 'ir':
    case 'pup':
    case 'nfi':
      return [{ label: 'Return him to the active roster', confirm: `Return ${name} to the active roster`, move: () => ({ kind: 'activate', ...base }) }, release];
    default:
      return [release];
  }
} // prettier-ignore

/** Opens the roster moves dialog for one of the user's players. */
export function openRosterMoves(app: AppState, player: Player, trigger: HTMLElement, done: () => void): void {
  const league = app.league;
  if (!league) return;
  openMoveDialog(
    app,
    {
      id: 'rosterMovesDialog',
      title: `Moves for ${fullName(player)}`,
      intro: `${fullName(player)}, ${player.position}. Choose a move to see what it does to your cap and roster before you confirm it.`,
      choices: rosterMoveChoices(league, player)
    },
    trigger,
    done
  );
}

/**
 * After a rebuild, focus the visible control with the same label, else the one in the same place in its
 * list (the next row's, when the row left), else the list's heading, else the page heading.
 */
export function refocus(view: HTMLElement, label: string | null, prefix: string | null, index: number): void {
  const visible = (el: Element | null | undefined): el is HTMLElement =>
    el instanceof HTMLElement && el.getClientRects().length > 0;
  const same = label
    ? [...view.querySelectorAll<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`)].find(visible)
    : undefined;
  const peers = prefix
    ? [...view.querySelectorAll<HTMLElement>(`[aria-label^="${CSS.escape(prefix)}"]`)].filter(visible)
    : [];
  const next = peers[Math.min(index, peers.length - 1)];
  const target = same ?? next ?? view.querySelector<HTMLElement>('h1');
  target?.focus();
}

/** Where a control sits among its visible peers, for `refocus`. */
export function placeOf(view: HTMLElement, control: HTMLElement, prefix: string): number {
  const peers = [...view.querySelectorAll<HTMLElement>(`[aria-label^="${CSS.escape(prefix)}"]`)].filter(
    el => el.getClientRects().length > 0
  );
  return Math.max(0, peers.indexOf(control));
}
