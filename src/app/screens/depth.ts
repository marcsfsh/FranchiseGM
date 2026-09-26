/**
 * Depth chart (spec 12.2, 12.3, style guide 7.4): each slot's starter and backups, with Move up and Move
 * down on every player and a starter menu on every slot; packages and rotations; and the switch that hands
 * the chart to the head coach. Changes apply from the next game and save shortly after. Editing while the
 * coach is in charge takes the chart back and says so.
 */
import { teamFullName } from '../../data/team-colors';
import { coachProfile, staffIn } from '../../engine/ai/profile';
import { recipeFor } from '../../engine/fit/role-rating';
import { decideDepthChart } from '../../engine/ai/decisions/depth-chart';
import { dressable } from '../../engine/roster/rules';
import { depthAdvice, depthRows, moveInDepth, type DepthRow } from '../../engine/league/depth-view';
import { leagueFitContext } from '../../engine/league/fit';
import type { League } from '../../engine/league/types';
import { calendarDay } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  SLOT_LABELS,
  SPECIAL_SLOTS,
  type Slot
} from '../../engine/schemes/slots';
import { stream } from '../../engine/rng';
import { designation } from '../../engine/season/injuries';
import { gameWeek } from '../../engine/season/state';
import { PLAN_LIMITS, type Rotation, type SituationalSubs } from '../../engine/sim/plan';
import { joinList } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { ordinal } from '../format';
import { icon } from '../icons';
import { playerLink, tierPlate } from '../ui/players';
import { tabs } from '../ui/tabs';
import { pageHead } from './common';
import type { Screen } from './types';

/** Players shown per slot before "Show all". */
const SHOWN = 4;
const UNITS = [
  { id: 'offense', label: 'Offense', slots: OFFENSE_SLOTS },
  { id: 'defense', label: 'Defense', slots: DEFENSE_SLOTS },
  { id: 'special', label: 'Special teams', slots: SPECIAL_SLOTS }
] as const;

/** The visit's state, kept across renders and layout changes: the open tab and the slots shown in full. */
const visit: { tab: string; expanded: Set<Slot> } = { tab: 'offense', expanded: new Set() };

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** Why a player can't play this week, or null. */
function unavailableReason(league: League, player: Player): string | null {
  const d = designation(player.injury);
  if (d === 'out' || d === 'doubtful') return d === 'out' ? 'Out, injured' : 'Doubtful, injured';
  if (league.teams[player.team ?? 'MIN']?.resting.includes(player.id)) return 'Resting this week';
  return null;
}

/** How the head coach sets a depth chart, in words. */
function coachStyle(league: League, abbr: League['meta']['start']['userTeam']): string {
  const hc = staffIn(league, abbr, 'HC');
  const profile = coachProfile(hc);
  const styles = [
    ['plays the best role rating', profile.meritocrat],
    ['trusts experience', profile.veteran],
    ['gives young players snaps', profile.developer],
    ['sticks with his starters', profile.loyalist],
    ['plays the players the team pays', profile.contract]
  ] as const;
  const [lead, ...rest] = [...styles].sort((a, b) => b[1] - a[1]).filter(([, share]) => share >= 0.15);
  const name = hc ? `${hc.firstName} ${hc.lastName}` : 'Your head coach';
  if (!lead) return `${name} plays the best role rating.`;
  const also = rest.map(([text]) => text);
  return `${name} mostly ${lead[0]}${also.length ? `, and also ${joinList(also)}` : ''}.`;
}

/** A key for the focused control that survives a redraw: its ID or its accessible name. */
function focusKey(within: Element): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !within.contains(active)) return null;
  return active.id ? `#${CSS.escape(active.id)}` : active.getAttribute('aria-label') ? `[aria-label="${CSS.escape(active.getAttribute('aria-label') ?? '')}"]` : null;
} // prettier-ignore

export function depthScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Depth chart',
    dispose: () => off?.(),
    render: ({ app }) => {
      const opened = app.league;
      if (!opened) return h('section', { class: 'view' }, pageHead('Depth chart'));
      let league: League = opened;
      const abbr = league.meta.start.userTeam;
      let team = league.teams[abbr];
      const status = h('p', { class: 'sr-only', role: 'status' });
      const announce = (message: string) => {
        status.textContent = message;
      };

      const autoHint = h('p', { class: 'muted', id: 'depth-auto-hint' });
      const autoSwitch = h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-labelledby': 'depth-auto-label',
        'aria-describedby': 'depth-auto-hint'
      });
      const syncAuto = () => {
        autoSwitch.setAttribute('aria-checked', String(team.depth.auto));
        autoHint.textContent = team.depth.auto
          ? `${coachStyle(league, abbr)} He sets the lineup, rotations, and situational subs each week. Any change you make takes the chart back.`
          : 'You set the lineup. Turn this on to hand the depth chart, rotations, and situational subs to your head coach; he takes over before the next game.';
      };
      autoSwitch.addEventListener('click', () => {
        app.edit(l => {
          l.teams[abbr].depth.auto = !l.teams[abbr].depth.auto;
        });
        syncAuto();
        drawAdvice();
        announce(
          team.depth.auto
            ? 'Your head coach will set the depth chart before the next game.'
            : 'You set the depth chart now.'
        );
      });
      syncAuto();

      /** Applies a user change, taking the chart back from the coach if he had it. */
      const change = (apply: (l: League) => void): string => {
        const took = team.depth.auto;
        app.edit(l => {
          apply(l);
          l.teams[abbr].depth.auto = false;
        });
        if (took) syncAuto();
        return took ? ' You now set the depth chart; your coach stopped making changes.' : '';
      };

      /**
       * Moves a player and keeps focus where the user is working: the same Up or Down button on the moved
       * player (the other one when the list ends), or `focusId` for the starter menu's button.
       */
      const move = (slot: Slot, id: string, to: number, dir: 'up' | 'down' | null, focusId?: string) => {
        const player = league.players[id];
        if (!player) return;
        let result: { starter: string | null; notes: string[] } = { starter: null, notes: [] };
        const tookOver = change(l => {
          const moved = moveInDepth(l, abbr, slot, id, to);
          l.teams[abbr].depth.order = moved.order;
          result = moved;
        });
        if (to >= SHOWN) visit.expanded.add(slot);
        panels.refresh();
        drawAdvice();
        const label = SLOT_LABELS[slot].toLowerCase();
        const name = fullName(player);
        const starter = result.starter ? league.players[result.starter] : undefined;
        const where =
          to !== 0
            ? `${name} moved to ${ordinal(to + 1)} at ${label}.`
            : result.starter === id || !starter
              ? `${name} is first at ${label}.`
              : `${name} is first at ${label}, but he can't play this week (${(unavailableReason(league, player) ?? 'unavailable').toLowerCase()}), so ${fullName(starter)} starts.`;
        announce([where, ...result.notes].join(' ') + tookOver);
        if (focusId) {
          document.getElementById(focusId)?.focus();
          return;
        }
        const row = panels.element.querySelector<HTMLElement>(`[data-slot="${slot}"] [data-player="${CSS.escape(id)}"]`);
        const buttons = row ? [...row.querySelectorAll<HTMLButtonElement>('button[data-dir]')] : [];
        (buttons.find(b => !b.disabled && b.dataset.dir === dir) ?? buttons.find(b => !b.disabled))?.focus();
      }; // prettier-ignore

      /** A drag in progress: the row, where it started, and the row it would land on. */
      const startDrag = (event: PointerEvent, handle: HTMLElement, list: HTMLElement, slot: Slot, id: string, from: number) => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const rows = () => [...list.querySelectorAll<HTMLElement>(':scope > li.depth-slot')];
        const dragged = rows()[from];
        dragged?.classList.add('is-dragging');
        let over: number | null = null;
        const mark = (index: number | null) => {
          rows().forEach((li, i) => li.classList.toggle('is-drop-target', i === index && index !== from));
          over = index;
        };
        const onMove = (e: PointerEvent) => {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('li.depth-slot');
          const index = target && target.parentElement === list ? rows().indexOf(target as HTMLElement) : null;
          if (index !== null && index >= 0) mark(index);
        };
        const end = (drop: boolean) => {
          handle.removeEventListener('pointermove', onMove);
          dragged?.classList.remove('is-dragging');
          const to = over;
          mark(null);
          if (drop && to !== null && to !== from) move(slot, id, to, null);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', () => end(true), { once: true });
        handle.addEventListener('pointercancel', () => end(false), { once: true });
      }; // prettier-ignore

      /** The head coach's suggestions while the user has the chart (spec 19.3's advisor). */
      const adviceHost = h('div');
      const drawAdvice = () => {
        if (team.depth.auto) {
          adviceHost.replaceChildren();
          return;
        }
        const playing = dressable(league, abbr).filter(p => !team.resting.includes(p.id));
        // A stream fixed for the team and week, so the advice holds still while the user reads it.
        const coach = decideDepthChart(league, abbr, playing, stream(league.random.baseSeed, 'advice', abbr, league.season.season, gameWeek(league) ?? 0));
        const advice = depthAdvice(league, abbr, coach.starters);
        if (!advice.length) {
          adviceHost.replaceChildren(h('p', { class: 'muted advice-none' }, 'Your head coach would start the same players.'));
          return;
        }
        const items = advice.map((a, i) => {
          const p = league.players[a.playerId];
          const other = a.replaces ? league.players[a.replaces] : undefined;
          if (!p) return null;
          const where = SLOT_LABELS[a.slot].toLowerCase();
          const apply = h('button', { class: 'btn btn-outline', type: 'button', id: `advice-${i}`, 'aria-label': `Start ${fullName(p)} at ${where}` }, 'Apply');
          apply.addEventListener('click', () => move(a.slot, a.playerId, 0, null, `advice-${i}`));
          return h('li', null, h('span', { class: 'list-main' }, `Start ${fullName(p)} (${p.position}) at ${where}`, other ? `, ahead of ${fullName(other)}` : '', '.'), apply);
        });
        adviceHost.replaceChildren(
          h('section', { class: 'card' },
            h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, "Your head coach's suggestions")),
            h('div', { class: 'card-body' },
              h('p', { class: 'muted' }, `${coachStyle(league, abbr)} These are the starters he'd pick from who can play this week.`),
              h('ul', { class: 'preview-list advice-list' }, ...items)
            )
          )
        );
      }; // prettier-ignore

      /** Players a slot's list shows: the first few, or all of them once expanded. */
      const shownRows = (slot: Slot, rows: DepthRow[]): DepthRow[] =>
        visit.expanded.has(slot) ? rows : rows.slice(0, SHOWN);

      /**
       * One slot's column. `places` is the most players any column in the panel shows: every column spans
       * that many row tracks, so a panel's rows line up across its columns whatever each one holds.
       */
      const slotSection = (slot: Slot, rows: DepthRow[], places: number): HTMLElement => {
        const label = SLOT_LABELS[slot];
        const role = recipeFor(leagueFitContext(league, abbr), slot).label;
        const expanded = visit.expanded.has(slot);
        const shown = shownRows(slot, rows);
        const starterIndex = rows.findIndex(r => r.available);
        const list = h('ol', { class: 'depth-list', 'aria-label': `${label} depth` });
        list.style.setProperty('--depth-rows', String(Math.max(1, shown.length)));
        shown.forEach((row, i) => {
          const player = league.players[row.id];
          if (!player) return;
          const name = fullName(player);
          const reason = unavailableReason(league, player);
          const up = h('button', { class: 'icon-btn', type: 'button', 'data-dir': 'up', disabled: i === 0, 'aria-label': `Move ${name} up at ${label.toLowerCase()}` }, icon('arrowUp', { size: 20, stroke: 2.5 })); // prettier-ignore
          const down = h('button', { class: 'icon-btn', type: 'button', 'data-dir': 'down', disabled: i === rows.length - 1, 'aria-label': `Move ${name} down at ${label.toLowerCase()}` }, icon('arrowDown', { size: 20, stroke: 2.5 })); // prettier-ignore
          up.addEventListener('click', () => move(slot, row.id, i - 1, 'up'));
          down.addEventListener('click', () => move(slot, row.id, i + 1, 'down'));
          // Dragging by the handle is a shortcut for pointers (style guide 7.4); Up and Down do the same.
          const handle = h(
            'span',
            { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to move' },
            icon('grip', { size: 20, stroke: 3 })
          );
          handle.addEventListener('pointerdown', event => startDrag(event, handle, list, slot, row.id, i));
          const note = [
            player.position,
            reason ?? (i === starterIndex ? 'Starts' : null),
            designation(player.injury) === 'questionable' ? 'Questionable' : null
          ].filter(Boolean);
          list.append(
            h(
              'li',
              {
                class: `depth-slot${i === starterIndex ? ' is-starter' : ''}${reason ? ' is-out' : ''}`,
                'data-player': row.id
              },
              handle,
              h('span', { class: 'depth-rank' }, i + 1),
              h(
                'div',
                { class: 'list-main' },
                playerLink(player),
                h('p', { class: 'list-sub' }, note.join(' · '))
              ),
              tierPlate(row.rating, { what: `Role rating at ${label.toLowerCase()}` }),
              h('div', { class: 'depth-actions' }, up, down)
            )
          );
        });
        const more =
          rows.length > SHOWN
            ? h(
                'button',
                {
                  class: 'btn btn-text',
                  type: 'button',
                  'aria-expanded': String(expanded),
                  'aria-label': expanded
                    ? `Show fewer at ${label.toLowerCase()}`
                    : `Show all ${rows.length} at ${label.toLowerCase()}`
                },
                expanded ? 'Show fewer' : `Show all ${rows.length}`
              )
            : null;
        more?.addEventListener('click', () => {
          if (visit.expanded.has(slot)) visit.expanded.delete(slot);
          else visit.expanded.add(slot);
          panels.refresh();
          panels.element.querySelector<HTMLButtonElement>(`[data-slot="${slot}"] .depth-more`)?.focus();
        });
        more?.classList.add('depth-more');
        const pick = h(
          'select',
          { class: 'select', id: `starter-${slot}`, 'aria-describedby': `starter-${slot}-hint` },
          ...[...rows]
            .sort((a, b) => b.rating - a.rating)
            .map(r => {
              const p = league.players[r.id];
              const out = p ? unavailableReason(league, p) : null;
              return h(
                'option',
                { value: r.id, selected: r.id === rows[0]?.id },
                p
                  ? `${fullName(p)} (${p.position}, role ${r.rating}${out ? `, ${out.toLowerCase()}` : ''})`
                  : r.id
              );
            })
        );
        const makeFirst = h(
          'button',
          {
            class: 'btn btn-outline',
            type: 'button',
            id: `starter-${slot}-go`,
            'aria-label': `Make the chosen player first at ${label.toLowerCase()}`
          },
          'Make first'
        );
        makeFirst.addEventListener('click', () => move(slot, pick.value, 0, null, `starter-${slot}-go`)); // prettier-ignore
        const section = h(
          'section',
          { class: 'depth-group', 'data-slot': slot },
          h(
            'div',
            { class: 'depth-slot-head' },
            h('h2', { class: 'depth-title' }, label),
            h('span', { class: 'muted' }, role)
          ),
          rows.length
            ? h(
                'div',
                { class: 'field depth-pick' },
                h('label', { for: `starter-${slot}` }, `First at ${label.toLowerCase()}`),
                h('div', { class: 'pick-row' }, pick, makeFirst),
                h('p', { class: 'muted', id: `starter-${slot}-hint` }, 'Players are listed by role rating.')
              )
            : h('div', { class: 'depth-pick' }),
          rows.length
            ? list
            : h('p', { class: 'empty depth-empty' }, `Nobody on the roster can play ${label.toLowerCase()}.`),
          more ?? h('div', { class: 'depth-foot' })
        );
        // The heading, the picker, the list's places, and the footer each take a row track.
        section.style.setProperty('--depth-span', String(Math.max(1, places) + 3));
        return section;
      };

      /** Questionable players (spec 10.8 playing hurt): each plays hurt unless the user rests him. */
      const restHost = h('div');
      const drawRest = () => {
        const questionable = Object.values(league.players)
          .filter(p => p.team === abbr && p.status === 'active' && designation(p.injury) === 'questionable')
          .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
        if (!questionable.length) {
          restHost.replaceChildren();
          return;
        }
        const boxes = questionable.map(p => {
          const box = h('input', { type: 'checkbox', id: `rest-${p.id}`, checked: team.resting.includes(p.id) });
          box.addEventListener('change', () => {
            const tookOver = change(l => {
              const resting = l.teams[abbr].resting.filter(id => id !== p.id);
              l.teams[abbr].resting = box.checked ? [...resting, p.id] : resting;
            });
            drawAdvice();
            announce(`${fullName(p)} ${box.checked ? 'rests' : 'plays hurt'} this week.${tookOver}`);
          });
          return h('label', { class: 'check-target check-left' }, box, `Rest ${fullName(p)} (${p.position}, OVR ${p.ovr})`);
        });
        restHost.replaceChildren(
          h(
            'section',
            { class: 'card' },
            h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Questionable this week')),
            h(
              'div',
              { class: 'card-body' },
              h('p', { class: 'muted' }, 'A questionable player plays hurt unless you rest him: he loses a few rating points and is likelier to get hurt again.'),
              ...boxes
            )
          )
        );
      }; // prettier-ignore
      drawRest();
      drawAdvice();

      const unitPanel = (slots: readonly Slot[]) => () => {
        const rows = depthRows(league, abbr);
        const places = Math.max(...slots.map(slot => shownRows(slot, rows[slot] ?? []).length));
        return h(
          'div',
          { class: 'depth-grid' },
          ...slots.map(slot => slotSection(slot, rows[slot] ?? [], places))
        );
      };

      const panels = tabs(
        'Depth chart units',
        [
          ...UNITS.map(u => ({ id: u.id, label: u.label, render: unitPanel(u.slots) })),
          {
            id: 'packages',
            label: 'Packages and rotations',
            render: () =>
              packagesPanel(league, abbr, change, announce, focus => {
                panels.refresh();
                focus?.();
              })
          }
        ],
        visit.tab,
        id => {
          visit.tab = id;
        }
      );

      // A week played in the background brings a new league: redraw from it, keeping focus.
      off = app.onChange(() => {
        const next = app.league;
        if (!next || next === league) return;
        league = next;
        team = next.teams[abbr];
        const key = focusKey(panels.element) ?? focusKey(restHost);
        syncAuto();
        drawRest();
        drawAdvice();
        panels.refresh();
        if (key)
          (
            panels.element.querySelector<HTMLElement>(key) ?? restHost.querySelector<HTMLElement>(key)
          )?.focus();
      });

      return h(
        'section',
        { class: 'view' },
        pageHead('Depth chart', teamFullName(abbr)),
        h(
          'p',
          { class: 'muted' },
          'Who starts and who comes in next at every spot. Changes apply from your next game.'
        ),
        h(
          'div',
          { class: 'card depth-auto' },
          h(
            'div',
            { class: 'switch-row' },
            h('span', { class: 'field-label', id: 'depth-auto-label' }, 'Coach sets the depth chart'),
            autoSwitch
          ),
          autoHint
        ),
        adviceHost,
        restHost,
        panels.element,
        status
      );
    }
  };
}

/** Situational subs, the backfield split, line rotation, snap limits, and development snaps (spec 12.3). */
function packagesPanel(
  league: League,
  abbr: League['meta']['start']['userTeam'],
  change: (apply: (l: League) => void) => string,
  announce: (message: string) => void,
  /** Redraws the panel, then moves focus where `focus` puts it. */
  refresh: (focus?: () => void) => void
): HTMLElement {
  const rotation = league.teams[abbr].rotation;
  const roster = Object.values(league.players)
    .filter(p => p.team === abbr && p.status === 'active')
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  const today = calendarDay(league.date);
  const setRotation = (patch: (r: Rotation) => void, message: string) => {
    const tookOver = change(l => patch(l.teams[abbr].rotation));
    announce(message + tookOver);
  };

  // The menus change nothing until Apply, so browsing one with the arrow keys is safe.
  const subSelects: { key: keyof SituationalSubs; label: string; select: HTMLSelectElement }[] = [];
  const applySubs = h('button', { class: 'btn btn-solid', type: 'button' }, 'Apply situational subs');
  applySubs.addEventListener('click', () => {
    const changed = subSelects.filter(f => (f.select.value || null) !== rotation.subs[f.key]);
    if (!changed.length) {
      announce('Situational subs are unchanged.');
      return;
    }
    setRotation(
      r => {
        for (const f of changed) r.subs[f.key] = f.select.value || null;
      },
      changed
        .map(f => (f.select.value ? `${fullName(league.players[f.select.value] as Player)} is your ${f.label.toLowerCase()}.` : `No ${f.label.toLowerCase()}.`))
        .join(' ')
    );
  }); // prettier-ignore
  const subField = (
    key: keyof SituationalSubs,
    label: string,
    hint: string,
    fits: (p: Player) => boolean
  ) => {
    const id = `sub-${key}`;
    const select = h(
      'select',
      { class: 'select', id, 'aria-describedby': `${id}-hint` },
      h('option', { value: '' }, 'Nobody'),
      ...roster
        .filter(fits)
        .map(p =>
          h(
            'option',
            { value: p.id, selected: rotation.subs[key] === p.id },
            `${fullName(p)} (${p.position}, OVR ${p.ovr})`
          )
        )
    );
    subSelects.push({ key, label, select });
    return h(
      'div',
      { class: 'field' },
      h('label', { for: id }, label),
      select,
      h('p', { class: 'muted', id: `${id}-hint` }, hint)
    );
  };

  const range = (
    id: string,
    label: string,
    hint: string,
    [lo, hi]: readonly [number, number],
    value: number,
    text: (v: number) => string,
    apply: (r: Rotation, v: number) => void
  ) => {
    const output = h('output', { for: id, class: 'range-value' }, text(value));
    const input = h('input', { class: 'range', type: 'range', id, min: Math.round(lo * 100), max: Math.round(hi * 100), step: 5, value: Math.round(value * 100), 'aria-describedby': `${id}-hint`, 'aria-valuetext': text(value) }); // prettier-ignore
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      output.textContent = text(v);
      input.setAttribute('aria-valuetext', text(v));
    });
    input.addEventListener('change', () => {
      const v = Number(input.value) / 100;
      setRotation(r => apply(r, v), `${label}: ${text(v)}.`);
    });
    return h(
      'div',
      { class: 'field' },
      h('label', { for: id }, label),
      h('div', { class: 'range-row' }, input, output),
      h('p', { class: 'muted', id: `${id}-hint` }, hint)
    );
  };

  /** A list of players with a share each, with a way to add and remove them. */
  const shareList = (
    key: 'snapLimits' | 'devSnaps',
    title: string,
    names: { player: string; share: string; add: string },
    hint: string,
    [lo, hi]: readonly [number, number],
    fits: (p: Player) => boolean,
    words: (name: string, share: number) => string
  ) => {
    const entries = Object.entries(rotation[key]).filter(([id]) => league.players[id]?.team === abbr);
    const list = h('ul', { class: 'preview-list' });
    for (const [id, share] of entries) {
      const p = league.players[id] as Player;
      const remove = h('button', { class: 'btn btn-text', type: 'button', 'aria-label': `Remove ${fullName(p)} from ${title.toLowerCase()}` }, 'Remove'); // prettier-ignore
      remove.addEventListener('click', () => {
        const next = entries[entries.findIndex(([e]) => e === id) + 1]?.[0] ?? entries[entries.findIndex(([e]) => e === id) - 1]?.[0];
        setRotation(
          r => {
            delete r[key][id];
          },
          `${fullName(p)} removed from ${title.toLowerCase()}.`
        );
        // Focus the next Remove button, or Add when the list is empty.
        refresh(() => document.getElementById(next ? `${key}-remove-${next}` : `${key}-add`)?.focus());
      }); // prettier-ignore
      remove.id = `${key}-remove-${id}`;
      list.append(
        h('li', null, h('span', { class: 'list-main' }, playerLink(p), ` ${words('', share)}`), remove)
      );
    }
    const who = h(
      'select',
      { class: 'select', id: `${key}-who` },
      ...roster.filter(fits).map(p => h('option', { value: p.id }, `${fullName(p)} (${p.position})`))
    );
    const shares: number[] = [];
    for (let v = Math.round(lo * 100); v <= Math.round(hi * 100); v += 5) if (v > 0) shares.push(v / 100);
    const how = h(
      'select',
      { class: 'select', id: `${key}-share` },
      ...shares.map(v => h('option', { value: String(v) }, percent(v)))
    );
    const add = h('button', { class: 'btn btn-solid', type: 'button', id: `${key}-add` }, names.add);
    add.addEventListener('click', () => {
      const p = league.players[who.value];
      if (!p) return;
      const share = Number(how.value);
      setRotation(
        r => {
          r[key][p.id] = share;
        },
        `${words(fullName(p), share)}.`
      );
      // Focus the new row's Remove button.
      refresh(() => document.getElementById(`${key}-remove-${p.id}`)?.focus());
    });
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, title)),
      h(
        'div',
        { class: 'card-body' },
        h('p', { class: 'muted' }, hint),
        entries.length ? list : h('p', { class: 'empty' }, 'Nobody yet.'),
        h('div', { class: 'field' }, h('label', { for: `${key}-who` }, names.player), who),
        h('div', { class: 'field' }, h('label', { for: `${key}-share` }, names.share), how),
        h('div', { class: 'btn-row' }, add)
      )
    );
  };

  const young = (p: Player) => ageOn(p.birthDate, today) <= TUNING.ai.depth.youngAge;
  const isBack = (p: Player) => p.position === 'HB' || p.position === 'FB';
  const rusher = (p: Player) => ['LE', 'RE', 'DT', 'LOLB', 'ROLB'].includes(p.position);
  const target = (p: Player) => p.position === 'WR' || p.position === 'TE';
  const linebacker = (p: Player) => ['MLB', 'LOLB', 'ROLB'].includes(p.position);

  return h(
    'div',
    { class: 'depth-packages' },
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Situational subs')),
      h(
        'div',
        { class: 'card-body' },
        subField('thirdDownBack', 'Third-down back', 'Comes in at running back on third down. A goal-line back, if you name one, takes third and short.', isBack),
        subField('passRusher', 'Pass-rush specialist', 'Comes in for your weaker edge rusher on passing downs.', rusher),
        subField('redZoneTarget', 'Red zone target', 'Comes in at tight end or slot receiver inside the 20.', target),
        subField('goalLineBack', 'Goal-line back', 'Comes in at running back at the goal line and on third or fourth and short.', isBack),
        subField('dimeBacker', 'Dime linebacker', 'Plays the lone linebacker spot in your dime package.', linebacker),
        h('div', { class: 'btn-row' }, applySubs)
      )
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Rotations')),
      h(
        'div',
        { class: 'card-body' },
        range('rb1Share', "Lead back's share", 'The share of running back snaps your lead back plays.', PLAN_LIMITS.rb1Share, rotation.rb1Share, percent, (r, v) => {
          r.rb1Share = v;
        }),
        range('lineRotation', 'Defensive line rotation', 'Low rides your starters longer; high rotates fresh linemen in sooner.', PLAN_LIMITS.lineRotation, rotation.lineRotation, v => (v <= 0.3 ? 'Ride the starters' : v >= 0.7 ? 'Rotate heavily' : 'Balanced'), (r, v) => {
          r.lineRotation = v;
        })
      )
    ),
    shareList('snapLimits', 'Snap limits', { player: 'Player to limit', share: 'Most of his snaps', add: 'Add snap limit' }, "The most of his unit's snaps a player plays, for players back from an injury or tiring veterans.", PLAN_LIMITS.snapLimit, () => true, (name, share) => `${name ? `${name} plays ` : 'Plays '}at most ${percent(share)} of snaps`),
    shareList('devSnaps', 'Development snaps', { player: 'Young player', share: 'His share of snaps', add: 'Add development snaps' }, "Snaps planned for a young backup at his starter's expense.", PLAN_LIMITS.devSnaps, young, (name, share) => `${name ? `${name} gets ` : 'Gets '}${percent(share)} of his slot's snaps`)
  ); // prettier-ignore
}
