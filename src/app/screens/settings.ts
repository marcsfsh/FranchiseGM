import { TEAM_ABBRS, teamFullName } from '../../data/team-colors';
import type { AutoJobs } from '../../engine/league/types';
import { LIVE_PAUSE_EVENTS, PAUSE_LABELS } from '../../engine/season/inbox';
import { toast, whileBusy, type ToastAction } from '../feedback';
import { savedAgo } from '../format';
import { EXPORT_REMINDER, clearsSiteData } from '../platform';
import { dateLine } from '../shell';
import { exportToDevice, type AppState } from '../state';
import { devMenuOn, tapVersion } from '../dev-menu';
import { h, mount } from '../dom';
import { layoutNote } from '../theme/prefs';
import { developmentCard } from '../ui/development';
import { draftSettingsCard } from '../ui/draft-settings';
import { slidersCard } from '../ui/sliders';
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

/** Which events stop a multi-week advance (spec 19.6): only the ones this build can raise. */
function pauseSettings(app: AppState): HTMLElement | null {
  const league = app.league;
  if (!league) return null;
  const status = h('p', { class: 'sr-only', role: 'status' });
  const boxes = LIVE_PAUSE_EVENTS.map(event => {
    const box = h('input', { type: 'checkbox', checked: league.settings.pause[event] });
    box.addEventListener('change', () => {
      app.edit(
        l => {
          l.settings.pause[event] = box.checked;
        },
        ['pause', event, box.checked]
      );
      status.textContent = `${PAUSE_LABELS[event]}: ${box.checked ? 'the sim stops' : 'they wait in your inbox'}.`;
    });
    return h('label', { class: 'check-target check-left' }, box, PAUSE_LABELS[event]);
  });
  return card(
    'Pause the sim for',
    h('p', { class: 'muted' }, 'Simming several weeks stops after a week with one of these. Everything else waits in your inbox.'),
    ...boxes,
    status
  ); // prettier-ignore
}

/** The user's jobs that run on auto (spec 22.7), beyond the switches on their own screens. */
const AUTO_JOBS: { job: keyof AutoJobs; label: string; hint: string }[] = [
  { job: 'roster', label: 'Roster moves', hint: 'Signings, cuts, injured reserve, the practice squad, waiver claims, and the final cutdown.' },
  { job: 'contracts', label: 'Contracts', hint: 'Extensions, tags, tenders, and fifth-year options in the re-sign window.' }
]; // prettier-ignore

function automationSettings(app: AppState): HTMLElement | null {
  const league = app.league;
  if (!league) return null;
  const status = h('p', { class: 'sr-only', role: 'status' });
  const rows = AUTO_JOBS.map(({ job, label, hint }) => {
    const id = `auto-${job}`;
    const button = h('button', { class: 'switch', type: 'button', role: 'switch', id, 'aria-checked': String(league.settings.auto[job]), 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-hint` });
    button.addEventListener('click', () => {
      const on = !(app.league ?? league).settings.auto[job];
      app.edit(l => {
        l.settings.auto[job] = on;
      }, ['auto', job, on]);
      button.setAttribute('aria-checked', String(on));
      status.textContent = `${label}: ${on ? 'your staff makes them' : 'you make them'}.`;
    });
    return h('div', null, h('div', { class: 'switch-row' }, h('span', { class: 'field-label', id: `${id}-label` }, label), button), h('p', { class: 'muted', id: `${id}-hint` }, hint));
  });
  return card(
    'Automation',
    h('p', { class: 'muted' }, 'Jobs on auto are done by your staff, with the same AI as the other teams. The game plan, depth chart, training, and scouting have their switches on their own screens.'),
    ...rows,
    status
  );
} // prettier-ignore

/** The game sim and stat sliders (spec 22.3). */
function sliderSettings(app: AppState): HTMLElement | null {
  if (!app.league) return null;
  const body = h('div', { class: 'stack' });
  // One live region for the card, outside what a reset redraws, so its message is read.
  const status = h('p', { class: 'sr-only', role: 'status' });
  const draw = () =>
    mount(
      body,
      ...slidersCard(app, status, () => {
        draw();
        body.querySelector<HTMLButtonElement>('#resetSliders')?.focus();
        status.textContent = 'Every slider is back to 100%.';
      })
    );
  draw();
  return card('Game sim and stat sliders', body, status);
}

/** Development settings (spec 22.4): the progression and regression curves and speeds, and retirement. */
function developmentSettings(app: AppState): HTMLElement | null {
  if (!app.league) return null;
  const body = h('div', { class: 'stack' });
  const status = h('p', { class: 'sr-only', role: 'status' });
  const draw = () =>
    mount(
      body,
      ...developmentCard(app, status, () => {
        draw();
        body.querySelector<HTMLButtonElement>('#resetDevelopment')?.focus();
        status.textContent = 'Every development setting is back to normal.';
      })
    );
  draw();
  return card('Development', body, status);
}

/** Draft class settings (spec 22.4): the class size, strength, busts and gems, position mix, and scouting. */
function draftSettings(app: AppState): HTMLElement | null {
  if (!app.league) return null;
  const body = h('div', { class: 'stack' });
  const status = h('p', { class: 'sr-only', role: 'status' });
  const draw = () =>
    mount(
      body,
      ...draftSettingsCard(app, status, () => {
        draw();
        body.querySelector<HTMLButtonElement>('#resetDraft')?.focus();
        status.textContent = 'Every draft class setting is back to normal.';
      })
    );
  draw();
  return card('Draft classes', body, status);
}

/** The developer tools entry (spec 23.5), shown once the menu is on. */
const devCard = () =>
  card(
    'Developer tools',
    h('p', { class: 'muted' }, 'Calibration runs and reports.'),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { class: 'btn btn-outline', href: '#/dev' }, 'Open developer tools')
    )
  );

/** The version line: tapping it seven times turns on the developer tools (spec 23.5). */
function versionLine(cards: HTMLElement): HTMLElement {
  const status = h('p', { class: 'sr-only', role: 'status' });
  const version = h(
    'button',
    { class: 'version-tap', type: 'button' },
    `Franchise GM version ${__GM_VERSION__}`
  );
  version.addEventListener('click', () => {
    if (devMenuOn()) return;
    const left = tapVersion();
    if (left === 0) {
      cards.append(devCard());
      // The toast announces it; the tap count clears so it isn't read again.
      status.textContent = '';
      toast('Developer tools are on.');
    } else if (left <= 3)
      status.textContent = `${left} more ${left === 1 ? 'tap' : 'taps'} to turn on developer tools.`;
  });
  return h('div', null, version, status);
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
      const cards = h(
        'div',
        { class: 'cards' },
        league?.node ?? null,
        pauseSettings(ctx.app),
        automationSettings(ctx.app),
        sliderSettings(ctx.app),
        developmentSettings(ctx.app),
        draftSettings(ctx.app),
        display.node,
        devMenuOn() ? devCard() : null
      );
      return h(
        'section',
        { class: 'view' },
        pageHead('Settings'),
        h('div', { class: 'cards-host' }, cards),
        versionLine(cards)
      );
    },
    dispose: () => offs.forEach(off => off())
  };
}
