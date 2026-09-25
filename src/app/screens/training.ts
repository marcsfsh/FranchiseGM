/**
 * Training (spec 10.5): the weekly focus for each unit, players' own focuses, and the offseason program,
 * with the switch that hands them to the coaching staff. A focus puts more of the week's development into
 * its ratings; the program does the same at training camp. Menus and choices change nothing until their
 * Apply button, and any change applied takes the plan back from the staff.
 */
import { teamFullName } from '../../data/team-colors';
import type { League } from '../../engine/league/types';
import { calendarDay } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { RATING_LABELS } from '../../engine/model/ratings';
import {
  FOCUSES,
  PROGRAMS,
  UNIT_LABELS,
  UNITS,
  focusOf,
  programOf,
  unitOf,
  type Focus,
  type TrainingPlan,
  type Unit
} from '../../engine/progression/training';
import { h, mount } from '../dom';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { playerLink, tierPlate } from '../ui/players';
import { pageHead } from './common';
import type { Screen } from './types';

const AND = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
const ratingsText = (f: Focus): string =>
  f.ratings.length ? AND.format(f.ratings.map(k => RATING_LABELS[k].toLowerCase())) : 'every rating alike';
const programHint = (p: Focus): string =>
  p.ratings.length ? `At camp: more growth in ${ratingsText(p)}.` : 'At camp: even growth across the board.';
const unitOption = (plan: TrainingPlan, unit: Unit): string => `Unit: ${focusOf(plan.units[unit]).label}`;

const FOCUSABLE = 'a[href], button, input, select, textarea';

/**
 * Finds, after a rebuild, the control that had focus before it: by ID, player link, or label, and
 * otherwise by its place among the view's controls.
 */
function focusFinder(view: Element): (() => HTMLElement | null) | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !view.contains(active)) return null;
  const player = active.getAttribute('data-player-link');
  const label = active.getAttribute('aria-label');
  const selector = active.id
    ? `#${CSS.escape(active.id)}`
    : player
      ? `[data-player-link="${CSS.escape(player)}"]`
      : label
        ? `${active.localName}[aria-label="${CSS.escape(label)}"]`
        : null;
  if (selector) return () => view.querySelector<HTMLElement>(selector);
  const at = [...view.querySelectorAll(FOCUSABLE)].indexOf(active);
  return () => view.querySelectorAll<HTMLElement>(FOCUSABLE)[at] ?? null;
}

/** Choices made in the menus but not yet applied. They stay through a rebuild. */
interface Drafts {
  units: Partial<Record<Unit, string>>;
  program: string | null;
  players: Record<string, string>;
}

const card = (title: string, ...body: (Node | null)[]) =>
  h('section', { class: 'card' }, h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, title)), h('div', { class: 'card-body' }, ...body)); // prettier-ignore

export function trainingScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Training',
    dispose: () => off?.(),
    render: ({ app }) => {
      const opened = app.league;
      if (!opened) return h('section', { class: 'view' }, pageHead('Training'));
      const status = h('p', { class: 'sr-only', role: 'status' });
      const announce = (message: string) => {
        status.textContent = message;
      };
      const view = h('section', { class: 'view' });
      const drafts: Drafts = { units: {}, program: null, players: {} };
      let shown: League = opened;
      // A week played in the background brings the staff's new plan: rebuild, keeping focus and drafts.
      off = app.onChange(() => {
        if (!app.league || app.league === shown) return;
        const find = focusFinder(view);
        build();
        find?.()?.focus();
      });

      const build = (): void => {
        const league: League = app.league ?? opened;
        shown = league;
        const abbr = league.meta.start.userTeam;
        const plan = league.teams[abbr].training;
        const today = calendarDay(league.date);

        const autoHint = h('p', { class: 'muted', id: 'training-auto-hint' });
        const autoSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', id: 'trainingAuto', 'aria-labelledby': 'training-auto-label', 'aria-describedby': 'training-auto-hint' }); // prettier-ignore
        const syncAuto = () => {
          autoSwitch.setAttribute('aria-checked', String(plan.auto));
          autoHint.textContent = plan.auto
            ? "Your coaches set each week's focus for each unit and for young players, and pick the offseason program. Any change you apply takes training back."
            : 'You set training. Turn this on to hand it to your coaches; they set it before each week and before camp.';
        };
        autoSwitch.addEventListener('click', () => {
          app.edit(l => {
            l.teams[abbr].training.auto = !l.teams[abbr].training.auto;
          });
          syncAuto();
          announce(
            plan.auto ? 'Your coaches will set training from the next week.' : 'You set training now.'
          );
        });
        syncAuto();

        /** Applies a user change to the plan, taking it back from the staff if they had it. */
        const change = (apply: (p: TrainingPlan) => void, message: string) => {
          const took = plan.auto;
          app.edit(l => {
            apply(l.teams[abbr].training);
            l.teams[abbr].training.auto = false;
          });
          if (took) syncAuto();
          announce(message + (took ? ' You now set training; your coaches stopped making changes.' : ''));
        };

        // Weekly focus: the menus change nothing until Apply, so browsing one with the arrow keys is safe.
        const unitSelects = UNITS.map(unit => {
          const id = `trainingUnit-${unit}`;
          const chosen = drafts.units[unit] ?? plan.units[unit];
          const select = h('select', { class: 'select', id, 'aria-describedby': `${id}-hint` }, ...FOCUSES.filter(f => f.units.includes(unit)).map(f => h('option', { value: f.id, selected: chosen === f.id }, f.label)));
          const hint = h('p', { class: 'muted', id: `${id}-hint` }, `Works on ${ratingsText(focusOf(chosen))}.`);
          select.addEventListener('change', () => {
            hint.textContent = `Works on ${ratingsText(focusOf(select.value))}.`;
            if (select.value === plan.units[unit]) delete drafts.units[unit];
            else drafts.units[unit] = select.value;
          });
          return { unit, select, node: h('div', { class: 'field' }, h('label', { for: id }, UNIT_LABELS[unit]), select, hint) };
        }); // prettier-ignore
        // Each player menu's first choice names his unit's focus, which follows an applied change.
        const unitChoices: { unit: Unit; option: HTMLOptionElement }[] = [];
        const applyUnits = h(
          'button',
          { class: 'btn btn-solid', type: 'button', id: 'applyUnits' },
          'Apply weekly focus'
        );
        applyUnits.addEventListener('click', () => {
          const moved = unitSelects.filter(u => u.select.value !== plan.units[u.unit]);
          drafts.units = {};
          if (!moved.length) return announce('The weekly focus is unchanged.');
          change(p => {
            for (const u of moved) p.units[u.unit] = u.select.value;
          }, moved.map(u => `${UNIT_LABELS[u.unit]}: ${focusOf(u.select.value).label}.`).join(' '));
          for (const { unit, option } of unitChoices) option.textContent = unitOption(plan, unit);
        }); // prettier-ignore

        // The offseason program: arrow keys move through the choices, and Apply takes the one chosen.
        const program = drafts.program ?? plan.program;
        const radios = PROGRAMS.map(p => {
          const input = h('input', { type: 'radio', name: 'program', value: p.id, id: `program-${p.id}`, checked: program === p.id, 'aria-describedby': `program-${p.id}-hint` });
          input.addEventListener('change', () => {
            drafts.program = p.id === plan.program ? null : p.id;
          });
          return { input, node: h('div', null, h('label', { class: 'check-target check-left' }, input, p.label), h('p', { class: 'muted', id: `program-${p.id}-hint` }, programHint(p))) };
        }); // prettier-ignore
        const applyProgram = h(
          'button',
          { class: 'btn btn-solid', type: 'button', id: 'applyProgram' },
          'Apply program'
        );
        applyProgram.addEventListener('click', () => {
          const chosen = radios.find(r => r.input.checked)?.input.value ?? plan.program;
          drafts.program = null;
          if (chosen === plan.program) return announce('The offseason program is unchanged.');
          change(
            t => {
              t.program = chosen;
            },
            `Offseason program: ${programOf(chosen).label}.`
          );
        });

        // Players' own focuses: a menu in each row, applied together.
        const players = Object.values(league.players)
          .filter(p => p.team === abbr && (p.status === 'active' || p.status === 'practice'))
          .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
        const menus = new Map<string, HTMLSelectElement>();
        const own = (p: Player): string => plan.players[p.id] ?? '';
        const menuValue = (p: Player): string => drafts.players[p.id] ?? own(p);
        const pending = h('p', { class: 'muted', id: 'playerFocusPending' });
        const syncPending = () => {
          const count = players.filter(p => (menus.get(p.id)?.value ?? '') !== own(p)).length;
          pending.textContent = count
            ? `${count} ${count === 1 ? 'change' : 'changes'} to apply.`
            : 'No changes to apply.';
        };
        const columns: TableColumn<Player>[] = [
          { id: 'player', label: 'Player', name: 'player', type: 'text', value: p => `${p.lastName} ${p.firstName}`, cell: p => h('th', { scope: 'row' }, playerLink(p)) },
          { id: 'focus', label: 'Focus', name: 'focus', type: 'text', value: p => focusOf(menuValue(p) || plan.units[unitOf(p.position)]).label, cell: p => {
            const unit = unitOf(p.position);
            const first = h('option', { value: '' }, unitOption(plan, unit));
            unitChoices.push({ unit, option: first });
            const select = h('select', { class: 'select focus-select', id: `trainingPlayer-${p.id}`, 'aria-label': `Focus for ${fullName(p)}` }, first, ...FOCUSES.filter(f => f.id !== 'balanced').map(f => h('option', { value: f.id, selected: menuValue(p) === f.id }, f.label)));
            select.addEventListener('change', () => {
              if (select.value === own(p)) delete drafts.players[p.id];
              else drafts.players[p.id] = select.value;
              syncPending();
            });
            menus.set(p.id, select);
            return h('td', null, select);
          } },
          { id: 'pos', label: 'Pos', title: 'Position', name: 'position', type: 'text', value: p => p.position, cell: p => h('td', null, p.position) },
          { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, value: p => ageOn(p.birthDate, today), cell: p => h('td', { class: 'num' }, String(ageOn(p.birthDate, today))) },
          { id: 'ovr', label: 'OVR', title: 'Overall', name: 'overall', type: 'rating', numeric: true, value: p => p.ovr, cell: p => h('td', { class: 'num' }, tierPlate(p.ovr)) }
        ]; // prettier-ignore
        const table = sortableTable({ key: 'training.players', name: 'players', caption: 'Players and their focus', captionClass: 'sr-only', className: 'stat-table', columns, rows: players, rowId: p => p.id, defaultOrder: 'by overall, highest first', scroll: true, status }); // prettier-ignore
        const applyPlayers = () => {
          const moved = players.filter(p => (menus.get(p.id)?.value ?? '') !== own(p));
          drafts.players = {};
          if (!moved.length) return announce('Player focus is unchanged.');
          change(t => {
            for (const p of moved) {
              const value = menus.get(p.id)?.value ?? '';
              if (value) t.players[p.id] = value;
              else delete t.players[p.id];
            }
          }, `Player focus set for ${moved.length} ${moved.length === 1 ? 'player' : 'players'}.`);
          syncPending();
        }; // prettier-ignore
        const applyButton = (id: string) => {
          const button = h('button', { class: 'btn btn-solid', type: 'button', id, 'aria-describedby': 'playerFocusPending' }, 'Apply player focus'); // prettier-ignore
          button.addEventListener('click', applyPlayers);
          return button;
        };
        syncPending();

        mount(
          view,
          pageHead('Training', teamFullName(abbr)),
          h('div', { class: 'card depth-auto' }, h('div', { class: 'switch-row' }, h('span', { class: 'field-label', id: 'training-auto-label' }, 'Coaches set training'), autoSwitch), autoHint),
          card('Weekly focus', h('p', { class: 'muted' }, "Each week in the season, a unit's focus puts more of its players' development into those ratings and a little less into the rest."), ...unitSelects.map(u => u.node), h('div', { class: 'btn-row' }, applyUnits)),
          card('Offseason program', h('p', { class: 'muted' }, "At training camp, the program puts more of the offseason's growth into its ratings and slows their decline."), h('fieldset', { class: 'field stack' }, h('legend', { class: 'field-label' }, 'Choose a program'), ...radios.map(r => r.node)), h('div', { class: 'btn-row' }, applyProgram)),
          card('Player focus', h('p', { class: 'muted' }, "A player's own focus takes the place of his unit's."), h('div', { class: 'btn-row' }, applyButton('applyPlayersTop'), pending), table.element, h('div', { class: 'btn-row' }, applyButton('applyPlayers'))),
          status
        ); // prettier-ignore
      };
      build();
      return view;
    }
  };
}
