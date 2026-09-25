import { teamFullName } from '../../data/team-colors';
import type { LeagueSummary } from '../../engine/league/types';
import { PHASE_LABELS } from '../../engine/model/calendar';
import { h, mount } from '../dom';
import { dialogFrame, openDialog, toast, whileBusy } from '../feedback';
import { savedAgo } from '../format';
import { EXPORT_REMINDER, clearsSiteData } from '../platform';
import { exportToDevice, type AppState } from '../state';
import { pageHead } from './common';
import type { Screen, ScreenContext } from './types';

const when = (s: LeagueSummary) =>
  s.phase === 'regularSeason'
    ? `${s.season} season · Week ${s.week}`
    : `${s.season} season · ${PHASE_LABELS[s.phase]}`;

function confirmDelete(app: AppState, summary: LeagueSummary, trigger: HTMLElement): void {
  const cancel = h(
    'button',
    { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true },
    'Cancel'
  );
  const remove = h('button', { class: 'btn btn-danger', type: 'button' }, `Delete ${summary.name}`);
  const dialog = dialogFrame(
    'deleteLeagueDialog',
    'Delete league',
    h(
      'p',
      null,
      `This removes ${summary.name} (${teamFullName(summary.userTeam)}, ${when(summary)}) from this browser.`
    ),
    h('p', { class: 'hint' }, "Export it first if you want to keep a copy. This can't be undone."),
    h('div', { class: 'btn-row' }, remove, cancel)
  );
  document.getElementById('deleteLeagueDialog')?.remove();
  document.body.append(dialog);
  remove.addEventListener('click', () =>
    whileBusy(remove, 'Deleting…', async () => {
      try {
        await app.remove(summary.id);
        dialog.close();
        toast(`Deleted ${summary.name}.`);
      } catch (error) {
        dialog.close();
        toast(
          `Couldn't delete the league: ${error instanceof Error ? error.message : String(error)}. Reload the page and try again.`,
          { persistent: true }
        );
      }
    })
  );
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  // Deleting removes the card, and its Delete button with it; focus moves to the next league or New league.
  openDialog(
    dialog,
    trigger,
    () =>
      document.querySelector<HTMLElement>('[data-league-id] .btn-primary') ??
      document.querySelector<HTMLElement>('a[href="#/leagues/new"]')
  );
}

function leagueCard(ctx: ScreenContext, summary: LeagueSummary, index: number): HTMLElement {
  const { app } = ctx;
  // Every card has Continue, Export, and Delete; the league name tells them apart for screen readers.
  const titleId = `league-card-${index}`;
  const button = (cls: string, label: string) =>
    h('button', { class: `btn ${cls}`, type: 'button', 'aria-describedby': titleId }, label);
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const open = button('btn-primary', 'Continue');
  open.addEventListener('click', () =>
    whileBusy(open, 'Opening…', async () => {
      try {
        await app.open(summary.id);
        ctx.go('#/');
      } catch (e) {
        error.hidden = false;
        error.textContent = `${e instanceof Error ? e.message : String(e)} Export the league to keep a copy, or delete it.`;
      }
    })
  );
  const exportButton = button('btn-outline', 'Export');
  exportButton.addEventListener('click', () =>
    whileBusy(exportButton, 'Exporting…', async () => {
      try {
        await exportToDevice(app, summary.id);
        toast(`Exported ${summary.name}.`);
      } catch (e) {
        toast(`Couldn't export: ${e instanceof Error ? e.message : String(e)}. Try again.`, {
          persistent: true
        });
      }
    })
  );
  const deleteButton = button('btn-text', 'Delete');
  deleteButton.addEventListener('click', () => confirmDelete(app, summary, deleteButton));
  return h(
    'section',
    { class: 'card', 'data-league-id': summary.id },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title', id: titleId }, summary.name)),
    h(
      'div',
      { class: 'card-body' },
      h('p', null, h('strong', null, teamFullName(summary.userTeam))),
      h('p', null, when(summary)),
      h('p', { class: 'muted small' }, `Saved ${savedAgo(summary.savedAt)}`),
      summary.edited ? h('span', { class: 'chip' }, 'Edited') : null,
      error,
      h('div', { class: 'btn-row' }, open, exportButton, deleteButton)
    )
  );
}

export function startScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Leagues',
    render: ctx => {
      const { app } = ctx;
      const list = h('div', { class: 'cards' });
      const count = h('p', { class: 'muted', role: 'status' });
      const draw = () => {
        if (app.leagues.length === 0) {
          mount(
            list,
            h('p', { class: 'empty' }, 'No leagues yet. Start a new league or import one you exported.')
          );
        } else mount(list, ...app.leagues.map((s, i) => leagueCard(ctx, s, i)));
        count.textContent =
          app.leagues.length === 1 ? '1 saved league.' : `${app.leagues.length} saved leagues.`;
      };
      off = app.onChange(draw);
      draw();

      // The visible Import league button opens this picker, so the input itself stays out of the way.
      const file = h('input', {
        type: 'file',
        accept: '.gz,.json,application/gzip,application/json',
        class: 'sr-only',
        id: 'importLeagueFile',
        tabindex: '-1',
        'aria-hidden': 'true'
      });
      const importButton = h('button', { class: 'btn btn-outline', type: 'button' }, 'Import league');
      importButton.addEventListener('click', () => {
        if (importButton.getAttribute('aria-busy') !== 'true') file.click();
      });
      file.addEventListener('change', () => {
        const chosen = file.files?.[0];
        file.value = '';
        if (!chosen) return;
        void whileBusy(importButton, 'Importing…', async () => {
          try {
            const league = await app.importFile(chosen);
            toast(`Imported ${league.meta.name}.`);
          } catch (e) {
            toast(
              `Couldn't import that file. ${e instanceof Error ? e.message : String(e)} Choose a league file exported from Franchise GM.`,
              { persistent: true }
            );
          }
        });
      });
      const storage = app.store.available
        ? clearsSiteData(navigator.userAgent)
          ? h('p', { class: 'hint', role: 'note' }, EXPORT_REMINDER)
          : null
        : h(
            'p',
            { class: 'empty', role: 'note' },
            `Saving isn't available in this browser (${app.store.unavailableReason}). Leagues last until you close the page, so export a league to keep it.`
          );
      return h(
        'section',
        { class: 'view' },
        pageHead('Leagues'),
        h(
          'div',
          { class: 'btn-row' },
          h('a', { class: 'btn btn-primary', href: '#/leagues/new' }, 'New league'),
          importButton,
          file
        ),
        storage,
        count,
        h('div', { class: 'cards-host' }, list)
      );
    },
    dispose: () => off?.()
  };
}
