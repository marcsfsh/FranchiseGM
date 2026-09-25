import { TEAM_ABBRS, teamFullName } from '../../data/team-colors';
import { toast, whileBusy, type ToastAction } from '../feedback';
import { savedAgo } from '../format';
import { EXPORT_REMINDER, clearsSiteData } from '../platform';
import { dateLine } from '../shell';
import { exportToDevice, type AppState } from '../state';
import { h } from '../dom';
import { layoutNote } from '../theme/prefs';
import type { PrefsController } from '../theme/controller';
import { card, pageHead } from './common';
import type { Screen, ScreenContext } from './types';

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
      'Preview team colors',
      [
        ['mine', 'My team'],
        ...[...TEAM_ABBRS]
          .sort((a, b) => teamFullName(a).localeCompare(teamFullName(b)))
          .map(abbr => [abbr, teamFullName(abbr)] as [string, string])
      ],
      prefs.prefs.team,
      v => prefs.set('team', v),
      h('p', { class: 'hint' }, "Changes appearance for this visit only. Your franchise doesn't change.")
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

function saveStatusText(app: AppState): string {
  const status = app.saveStatus;
  if (status.state === 'saving') return 'Saving…';
  if (status.state === 'failed')
    return `Couldn't save: ${status.message}. Export the league to keep your progress.`;
  if (status.state === 'saved') return `Saved ${savedAgo(status.at)}.`;
  return '';
}

function leagueSettings(ctx: ScreenContext): { node: HTMLElement; sync: () => void } | null {
  const { app } = ctx;
  const league = app.league;
  if (!league) return null;
  const name = h('input', {
    class: 'input',
    id: 'leagueRename',
    type: 'text',
    maxlength: '40',
    value: league.meta.name,
    'aria-describedby': 'leagueRename-error'
  });
  const nameError = h(
    'p',
    { class: 'field-error', id: 'leagueRename-error', role: 'alert', hidden: true },
    'Enter a league name.'
  );
  name.addEventListener('change', () => {
    const ok = app.rename(name.value);
    nameError.hidden = ok;
    if (ok) name.removeAttribute('aria-invalid');
    else name.setAttribute('aria-invalid', 'true');
  });
  const status = h('p', { class: 'hint', role: 'status' });
  const exportAction: ToastAction = {
    label: 'Export league',
    run: () =>
      void exportToDevice(app).catch(() =>
        toast("Couldn't export the league. Try again.", { persistent: true })
      )
  };
  const saveButton = h('button', { class: 'btn btn-solid', type: 'button' }, 'Save now');
  saveButton.addEventListener('click', () =>
    whileBusy(saveButton, 'Saving…', async () => {
      if (await app.save()) toast('League saved.');
    })
  );
  const exportButton = h('button', { class: 'btn btn-outline', type: 'button' }, 'Export league');
  exportButton.addEventListener('click', () =>
    whileBusy(exportButton, 'Exporting…', async () => {
      try {
        await exportToDevice(app);
        toast(`Exported ${league.meta.name}.`);
      } catch (e) {
        toast(`Couldn't export: ${e instanceof Error ? e.message : String(e)}. Try again.`, {
          persistent: true
        });
      }
    })
  );
  const switchButton = h('button', { class: 'btn btn-outline', type: 'button' }, 'Switch league');
  switchButton.addEventListener('click', () =>
    whileBusy(switchButton, 'Saving…', async () => {
      // Closing an unsaved league would lose it, so a failed save keeps it open with a way out.
      if (!(await app.save())) {
        toast(
          `Couldn't save ${league.meta.name}, so it's still open. Export it to keep your progress, then try again.`,
          { persistent: true, action: exportAction }
        );
        return;
      }
      await app.close();
      ctx.go('#/leagues');
    })
  );
  const start = league.meta.start;
  const node = card(
    'League',
    h('div', { class: 'field' }, h('label', { for: 'leagueRename' }, 'League name'), name, nameError),
    h('p', null, `${teamFullName(start.userTeam)} · ${dateLine(league)}`),
    h('p', { class: 'muted small' }, `Seed ${start.seed} · Fictional league · Started ${start.startSeason}`),
    status,
    clearsSiteData(navigator.userAgent) ? h('p', { class: 'hint' }, EXPORT_REMINDER) : null,
    h('div', { class: 'btn-row' }, saveButton, exportButton, switchButton)
  );
  const sync = () => {
    status.textContent = saveStatusText(app);
  };
  sync();
  return { node, sync };
}

export function settingsScreen(): Screen {
  const offs: (() => void)[] = [];
  return {
    title: 'Settings',
    render: ctx => {
      const display = displaySettings(ctx.prefs);
      offs.push(ctx.prefs.onChange(display.sync));
      const league = leagueSettings(ctx);
      if (league) offs.push(ctx.app.onChange(league.sync));
      return h(
        'section',
        { class: 'view' },
        pageHead('Settings'),
        h('div', { class: 'cards-host' }, h('div', { class: 'cards' }, league?.node ?? null, display.node)),
        h('p', { class: 'muted small' }, `Franchise GM version ${__GM_VERSION__}`)
      );
    },
    dispose: () => offs.forEach(off => off())
  };
}
