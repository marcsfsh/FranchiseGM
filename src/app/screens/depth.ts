/**
 * Depth chart (spec 12.2, 12.3, style guide 7.4): each slot's starter and backups, with Move up and Move
 * down on every player and a starter menu on every slot; packages and rotations; and the switch that hands
 * the chart to the head coach. Changes apply from the next game and save shortly after. Editing while the
 * coach is in charge takes the chart back and says so.
 */
import { teamFullName } from '../../data/team-colors';
import { coachProfile, staffIn } from '../../engine/ai/profile';
import { recipeFor } from '../../engine/fit/role-rating';
import { depthRows, moveInDepth, type DepthRow } from '../../engine/league/depth-view';
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
import { designation } from '../../engine/season/injuries';
import { PLAN_LIMITS, type Rotation, type SituationalSubs } from '../../engine/sim/plan';
import { joinList } from '../../engine/text';
import { h } from '../dom';
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

const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
};

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

      const slotSection = (slot: Slot, rows: DepthRow[]): HTMLElement => {
        const label = SLOT_LABELS[slot];
        const role = recipeFor(leagueFitContext(league, abbr), slot).label;
        const expanded = visit.expanded.has(slot);
        const shown = expanded ? rows : rows.slice(0, SHOWN);
        const starterIndex = rows.findIndex(r => r.available);
        const list = h('ol', { class: 'depth-list', 'aria-label': `${label} depth` });
        shown.forEach((row, i) => {
          const player = league.players[row.id];
          if (!player) return;
          const name = fullName(player);
          const reason = unavailableReason(league, player);
          const up = h('button', { class: 'btn btn-outline', type: 'button', 'data-dir': 'up', disabled: i === 0, 'aria-label': `Move ${name} up at ${label.toLowerCase()}` }, 'Up'); // prettier-ignore
          const down = h('button', { class: 'btn btn-outline', type: 'button', 'data-dir': 'down', disabled: i === rows.length - 1, 'aria-label': `Move ${name} down at ${label.toLowerCase()}` }, 'Down'); // prettier-ignore
          up.addEventListener('click', () => move(slot, row.id, i - 1, 'up'));
          down.addEventListener('click', () => move(slot, row.id, i + 1, 'down'));
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
        return h(
          'section',
          { class: 'depth-group', 'data-slot': slot },
          h(
            'div',
            { class: 'depth-slot-head' },
            h('h2', { class: 'depth-title' }, label),
            h('span', { class: 'muted' }, role)
          ),
          rows.length
            ? list
            : h('p', { class: 'empty' }, `Nobody on the roster can play ${label.toLowerCase()}.`),
          more,
          rows.length
            ? h(
                'div',
                { class: 'field depth-pick' },
                h('label', { for: `starter-${slot}` }, `First at ${label.toLowerCase()}`),
                h('div', { class: 'pick-row' }, pick, makeFirst),
                h('p', { class: 'muted', id: `starter-${slot}-hint` }, 'Players are listed by role rating.')
              )
            : null
        );
      };

      const unitPanel = (slots: readonly Slot[]) => () => {
        const rows = depthRows(league, abbr);
        return h('div', { class: 'depth-grid' }, ...slots.map(slot => slotSection(slot, rows[slot] ?? [])));
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
        const key = focusKey(panels.element);
        syncAuto();
        panels.refresh();
        if (key) panels.element.querySelector<HTMLElement>(key)?.focus();
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

  const young = (p: Player) => ageOn(p.birthDate, today) <= 25;
  const isBack = (p: Player) => p.position === 'HB' || p.position === 'FB';
  const rusher = (p: Player) => ['LE', 'RE', 'DT', 'LOLB', 'ROLB'].includes(p.position);
  const target = (p: Player) => p.position === 'WR' || p.position === 'TE';

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
        subField('thirdDownBack', 'Third-down back', 'Comes in at running back on third down.', isBack),
        subField('passRusher', 'Pass-rush specialist', 'Comes in for your weaker edge rusher on passing downs.', rusher),
        subField('redZoneTarget', 'Red zone target', 'Comes in at tight end or slot receiver inside the 20.', target),
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
