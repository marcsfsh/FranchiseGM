import { TEAM_ABBRS, teamFullName } from '../../data/team-colors';
import { h } from '../dom';
import { layoutNote } from '../theme/prefs';
import type { PrefsController } from '../theme/controller';
import { card, pageHead } from './common';
import type { Screen } from './types';

const select = (
  id: string,
  label: string,
  options: readonly [value: string, text: string][],
  value: string,
  onChange: (value: string) => void,
  ...after: Node[]
) => {
  const control = h(
    'select',
    { class: 'select', id },
    ...options.map(([v, text]) => h('option', { value: v }, text))
  );
  control.value = value;
  control.addEventListener('change', () => onChange(control.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, ...after);
};

function displaySettings(prefs: PrefsController): { node: HTMLElement; sync: () => void } {
  const note = h('p', { class: 'hint', id: 'layoutNote', role: 'status' });
  const storageNote = prefs.persistent
    ? null
    : h('p', { class: 'hint' }, "This browser won't store preferences. They apply until you close the page.");
  const node = card(
    'Display',
    select(
      'themeSel',
      'Appearance',
      [
        ['system', 'System'],
        ['day', 'Day'],
        ['night', 'Night']
      ],
      prefs.prefs.theme,
      v => prefs.set('theme', v)
    ),
    select(
      'layoutSel',
      'Layout',
      [
        ['auto', 'Auto'],
        ['phone', 'Phone'],
        ['tablet', 'Tablet'],
        ['desktop', 'Desktop']
      ],
      prefs.prefs.layout,
      v => prefs.set('layout', v),
      note
    ),
    select(
      'densitySel',
      'Density',
      [
        ['comfortable', 'Comfortable'],
        ['compact', 'Compact']
      ],
      prefs.prefs.density,
      v => prefs.set('density', v)
    ),
    select(
      'teamSel',
      'Team colors',
      [
        ['mine', 'My team'],
        ...[...TEAM_ABBRS]
          .sort((a, b) => teamFullName(a).localeCompare(teamFullName(b)))
          .map(abbr => [abbr, teamFullName(abbr)] as [string, string])
      ],
      prefs.prefs.team,
      v => prefs.set('team', v),
      h('p', { class: 'hint' }, "Changes appearance only. Your franchise doesn't change.")
    ),
    storageNote
  );
  const sync = () => {
    note.textContent = layoutNote(prefs.prefs, prefs.layout);
    for (const [id, value] of [
      ['themeSel', prefs.prefs.theme],
      ['layoutSel', prefs.prefs.layout],
      ['densitySel', prefs.prefs.density],
      ['teamSel', prefs.prefs.team]
    ] as const) {
      const control = node.querySelector<HTMLSelectElement>(`#${id}`);
      if (control && control.value !== value) control.value = value;
    }
  };
  sync();
  return { node, sync };
}

export function settingsScreen(): Screen {
  let unsubscribe: (() => void) | null = null;
  return {
    title: 'Settings',
    render: ({ prefs }) => {
      const display = displaySettings(prefs);
      unsubscribe = prefs.onChange(display.sync);
      return h(
        'section',
        { class: 'view' },
        pageHead('Settings'),
        h('div', { class: 'cards-host' }, h('div', { class: 'cards' }, display.node)),
        h('p', { class: 'muted small' }, `Franchise GM version ${__GM_VERSION__}`)
      );
    },
    dispose: () => unsubscribe?.()
  };
}
