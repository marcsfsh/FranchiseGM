/**
 * New league form (spec 3.2): the choices locked at start, with defaults for everything else. Options
 * this build can't offer yet stay visible, disabled, with the reason next to them.
 */
import { TEAM_ABBRS, teamFullName, type TeamAbbr } from '../../data/team-colors';
import { defaultStartOptions } from '../../engine/league/create';
import type { Permission, StartOptions } from '../../engine/league/types';
import { freshSeed } from '../../engine/rng';
import { h } from '../dom';
import { showBusy, toast } from '../feedback';
import { exportToDevice } from '../state';
import { JobError } from '../worker-client';
import { pageHead } from './common';
import type { Screen } from './types';

const radioGroup = (
  name: string,
  legend: string,
  options: readonly { value: string; label: string; disabledReason?: string }[],
  checked: string
) => {
  const hints: HTMLElement[] = [];
  const labels = options.map(o => {
    const input = h('input', {
      type: 'radio',
      name,
      value: o.value,
      checked: o.value === checked,
      disabled: Boolean(o.disabledReason),
      'aria-describedby': o.disabledReason ? `${name}-${o.value}-hint` : null
    });
    if (o.disabledReason)
      hints.push(h('p', { class: 'hint', id: `${name}-${o.value}-hint` }, `${o.label}: ${o.disabledReason}`));
    return h('label', null, input, o.label);
  });
  return h(
    'fieldset',
    { class: 'field' },
    h('legend', { class: 'field-label' }, legend),
    h('div', { class: 'seg' }, ...labels),
    ...hints
  );
};

const selectField = (
  id: string,
  label: string,
  options: readonly [string, string][],
  value: string,
  hint?: string
) => {
  const select = h(
    'select',
    { class: 'select', id, 'aria-describedby': hint ? `${id}-hint` : null },
    ...options.map(([v, t]) => h('option', { value: v }, t))
  );
  select.value = value;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    select,
    hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null
  );
};

const checkField = (id: string, label: string, checked: boolean, hint: string) =>
  h(
    'div',
    { class: 'field' },
    h(
      'label',
      { class: 'check-target check-left', for: id },
      h('input', { type: 'checkbox', id, checked, 'aria-describedby': `${id}-hint` }),
      label
    ),
    h('p', { class: 'hint', id: `${id}-hint` }, hint)
  );

const PERMISSIONS: [Permission, string][] = [
  ['none', 'Nobody'],
  ['user', 'Only my team'],
  ['any', 'Any team']
];

export function newLeagueScreen(): Screen {
  // Aborted when the user cancels or leaves the screen while the league is building.
  let building: AbortController | null = null;
  return {
    title: 'New league',
    dispose: () => building?.abort(),
    render: ctx => {
      const defaults = defaultStartOptions('MIN', 0);
      const teams = [...TEAM_ABBRS].sort((a, b) => teamFullName(a).localeCompare(teamFullName(b)));
      const name = h('input', {
        class: 'input',
        id: 'leagueName',
        type: 'text',
        maxlength: '40',
        value: 'My league',
        autocomplete: 'off'
      });
      const seed = h('input', {
        class: 'input',
        id: 'leagueSeed',
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        'aria-describedby': 'leagueSeed-hint leagueSeed-error'
      });
      const seedError = h('p', { class: 'field-error', id: 'leagueSeed-error', role: 'alert', hidden: true });
      const progress = h('progress', {
        max: '32',
        value: '0',
        class: 'progress',
        'aria-label': 'League creation progress',
        hidden: true
      });
      const status = h('p', { class: 'muted', role: 'status' });
      const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create league');
      // Cancel stops a build in progress; the league it was building is discarded.
      const cancel = h('a', { class: 'btn btn-outline', href: '#/leagues' }, 'Cancel');
      cancel.addEventListener('click', () => building?.abort());

      const form = h(
        'form',
        { class: 'card-body', novalidate: true },
        h('div', { class: 'field' }, h('label', { for: 'leagueName' }, 'League name'), name),
        selectField(
          'leagueTeam',
          'Your team',
          teams.map(t => [t, teamFullName(t)] as [string, string]),
          defaults.userTeam
        ),
        radioGroup(
          'dataSource',
          'Players',
          [
            { value: 'fictional', label: 'Fictional league' },
            {
              value: 'madden',
              label: 'Real rosters',
              disabledReason: "needs the Madden roster file, which isn't in this build."
            }
          ],
          'fictional'
        ),
        radioGroup(
          'startingRosters',
          'Starting rosters',
          [
            { value: 'actual', label: 'Generated rosters' },
            { value: 'fantasyDraft', label: 'Fantasy draft', disabledReason: 'arrives in a later build.' }
          ],
          'actual'
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'leagueSeed' }, 'Seed'),
          seed,
          h(
            'p',
            { class: 'hint', id: 'leagueSeed-hint' },
            'Leave blank for a random seed. The same seed and choices build the same league.'
          ),
          seedError
        ),
        selectField('leagueRelocation', 'Who can relocate a team', PERMISSIONS, defaults.relocation),
        selectField('leagueRebrand', 'Who can rebrand a team', PERMISSIONS, defaults.rebrand),
        checkField(
          'leagueDrift',
          'League style drift',
          defaults.styleDrift,
          'Winning schemes spread through the league over the decades.'
        ),
        checkField(
          'leagueRules',
          'AI owners can propose rules',
          defaults.aiOwnersProposeRules,
          'You can always propose rules yourself.'
        ),
        h(
          'p',
          { class: 'hint' },
          `The ${defaults.startSeason} season starts at Week 1. Every other setting starts at its default, and you can change it later in Settings.`
        ),
        progress,
        status,
        h('div', { class: 'btn-row' }, submit, cancel)
      );

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submit.getAttribute('aria-busy') === 'true') return;
        const seedText = seed.value.trim().replace(/,/g, '');
        const seedValue =
          seedText === '' ? freshSeed() : /^\d{1,10}$/.test(seedText) ? Number(seedText) : NaN;
        if (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 4294967295) {
          seed.setAttribute('aria-invalid', 'true');
          seedError.hidden = false;
          seedError.textContent = 'Enter a whole number from 0 to 4,294,967,295, or leave the seed blank.';
          seed.focus();
          return;
        }
        seed.removeAttribute('aria-invalid');
        seedError.hidden = true;
        const value = (id: string) =>
          (form.querySelector<HTMLSelectElement>(`#${id}`) as HTMLSelectElement).value;
        const checked = (id: string) =>
          (form.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement).checked;
        const start: StartOptions = {
          ...defaultStartOptions(value('leagueTeam') as TeamAbbr, seedValue),
          relocation: value('leagueRelocation') as Permission,
          rebrand: value('leagueRebrand') as Permission,
          styleDrift: checked('leagueDrift'),
          aiOwnersProposeRules: checked('leagueRules')
        };
        const idle = showBusy(submit, 'Creating league…');
        progress.hidden = false;
        // The status line announces phases; the progress bar carries the counts.
        status.textContent = 'Building teams, staff, and contracts.';
        const controller = new AbortController();
        building = controller;
        const reset = () => {
          idle();
          progress.hidden = true;
          status.textContent = '';
        };
        try {
          const league = await ctx.app.create(
            name.value,
            start,
            p => {
              progress.value = p.done;
              progress.max = p.total;
            },
            controller.signal
          );
          if (!league || controller.signal.aborted) return;
          const saveStatus = ctx.app.saveStatus;
          if (saveStatus.state === 'failed') {
            toast(
              `${league.meta.name} is ready, but it couldn't be saved (${saveStatus.message}). Export it to keep it.`,
              {
                persistent: true,
                action: {
                  label: 'Export league',
                  run: () =>
                    void exportToDevice(ctx.app).catch(() =>
                      toast("Couldn't export the league. Try again from Settings.", { persistent: true })
                    )
                }
              }
            );
          } else toast(`${league.meta.name} is ready. You run the ${teamFullName(start.userTeam)}.`);
          ctx.go('#/');
        } catch (error) {
          if (controller.signal.aborted || (error instanceof JobError && error.cancelled)) return;
          reset();
          toast(
            `Couldn't create the league. ${error instanceof Error ? error.message : String(error)} Try again, or choose a different seed.`,
            { persistent: true }
          );
        } finally {
          if (building === controller) building = null;
        }
      });

      return h(
        'section',
        { class: 'view' },
        pageHead('New league'),
        h(
          'section',
          { class: 'card form-card' },
          h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'League setup')),
          form
        )
      );
    }
  };
}
