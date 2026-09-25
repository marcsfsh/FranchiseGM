/**
 * Free agency (spec 19.3, 19.4): the free agents with what each asks for, offers made in a contract dialog
 * that previews the cap effect and says whether he'll sign, practice squad signings, and the waiver wire
 * with claims. M12's market and negotiation build on this.
 */
import { TEAM_COLORS, teamFullName } from '../../data/team-colors';
import { capSheet } from '../../engine/cap/sheet';
import { askingSalary } from '../../engine/contracts/acceptance';
import { capHit } from '../../engine/contracts/cap';
import { freeAgents } from '../../engine/league/transactions';
import type { League } from '../../engine/league/types';
import { calendarDay, leagueYear } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { POSITION_GROUP, type PositionGroup } from '../../engine/model/positions';
import { minimumSalary } from '../../engine/rules/ruleset';
import { rosterCounts } from '../../engine/roster/rules';
import { claimedContract } from '../../engine/roster/waivers';
import { PLAYOFF_PHASES } from '../../engine/season/state';
import { TUNING } from '../../engine/tuning';
import { h, mount } from '../dom';
import { money } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { dollarField, openMoveDialog, placeOf, refocus, WAIT_FOR_GAMES } from '../ui/moves';
import { playerLink, tierPlate } from '../ui/players';
import { card, pageHead } from './common';
import type { Screen } from './types';

const PAGE = 40;
const GROUP_LABELS: Record<PositionGroup, string> = {
  QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', OL: 'Offensive line',
  DL: 'Defensive line', LB: 'Linebackers', DB: 'Defensive backs', ST: 'Specialists'
}; // prettier-ignore
const SQUAD_PHASES = new Set<string>(['cutdown', 'regularSeason', ...PLAYOFF_PHASES]);
const OFFER = 'Make an offer to ';

/** The filter and page length, kept while the user moves around the app. */
let group: PositionGroup | 'all' = 'all';
let shown = PAGE;

/** Opens the contract offer dialog for a free agent (style guide 7.7: an explicit Send offer). */
function openOffer(app: AppState, league: League, player: Player, trigger: HTMLElement, done: () => void): void {
  const name = fullName(player);
  const ask = askingSalary(league, player);
  const minimum = minimumSalary(league.rules, player.experience);
  const years = h('select', { class: 'select', id: 'offer-years' }, ...Array.from({ length: TUNING.contracts.acceptance.maxYears }, (_, i) => h('option', { value: i + 1 }, `${i + 1} ${i === 0 ? 'year' : 'years'}`)));
  const salary = dollarField('offer-salary', 'Salary each year, dollars', `His minimum is ${money(minimum, true)}. Each year pays at least the minimum for his experience then.`, ask);
  const bonus = dollarField('offer-bonus', 'Signing bonus, dollars', 'Paid now and spread over the contract on the cap, up to 5 years.', 0);
  const totals = h('p', { class: 'hint' });
  const inputs = h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', { for: 'offer-years' }, 'Contract length'), years), salary.field, bonus.field, totals);
  const terms = () => {
    const s = salary.input.valueAsNumber;
    const b = bonus.input.valueAsNumber;
    const n = Number(years.value);
    salary.setError(!Number.isFinite(s) ? 'Enter a salary in dollars.' : s < minimum ? `His minimum salary is ${money(minimum, true)} a year.` : null);
    bonus.setError(!Number.isFinite(b) ? 'Enter a signing bonus in dollars, or 0.' : b < 0 ? "The signing bonus can't be negative." : null);
    if (!Number.isFinite(s) || s < minimum || !Number.isFinite(b) || b < 0) {
      totals.textContent = '';
      return null;
    }
    const total = Math.round(s) * n + Math.round(b);
    totals.textContent = `Total: ${money(total, true)} over ${n} ${n === 1 ? 'year' : 'years'}. AAV: ${money(Math.round(total / n), true)}.`;
    return { years: n, salary: Math.round(s), signingBonus: Math.round(b) };
  }; // prettier-ignore
  openMoveDialog(
    app,
    {
      id: 'offerDialog',
      title: `Offer ${name} a contract`,
      intro: `${name}, ${player.position}, OVR ${player.ovr}. He asks for ${money(ask, true)} a year; free agents ask for less as the season goes on.`,
      choices: [
        {
          label: 'Offer',
          confirm: 'Send offer',
          inputs,
          incomplete: 'Fix the highlighted details to see what this offer does.',
          move: () => {
            const offer = terms();
            return offer ? { kind: 'sign', team: league.meta.start.userTeam, playerId: player.id, offer } : null;
          }
        }
      ]
    },
    trigger,
    done
  );
} // prettier-ignore

export function freeAgencyScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Free agency',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      // Rebuilds replace the content; the status stays put, so screen readers hear the count change.
      const content = h('div');
      const status = h('p', { class: 'sr-only', role: 'status' });
      view.append(content, status);
      let shownLeague: League | null = null;
      off = app.onChange(() => {
        if (!app.league || app.league === shownLeague) return;
        const label = document.activeElement?.getAttribute('aria-label') ?? null;
        build();
        refocus(view, label, null, 0);
      });
      /** Rebuilds after a move, keeping focus on the same control or the next row's. */
      const after = (trigger: HTMLElement, prefix: string) => {
        const label = trigger.getAttribute('aria-label');
        const index = placeOf(view, trigger, prefix);
        return () => {
          build();
          refocus(view, label, prefix, index);
        };
      };
      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shownLeague = league;
        const abbr = league.meta.start.userTeam;
        const year = leagueYear(league.date);
        const today = calendarDay(league.date);

        const counts = rosterCounts(league, abbr);
        const space = capSheet(league, abbr).space;
        const summary = card(
          'Your roster and cap',
          h('span', { class: 'label' }, `${year} cap space`),
          h('p', { class: `big-number${space < 0 ? ' delta-bad' : ''}` }, money(space)),
          h('p', null, `${counts.active} of ${counts.limit} on the active roster · ${counts.practice} of ${league.rules.roster.practiceSquad} on the practice squad`),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('finances') }, 'Cap sheet')),
          app.advancing ? h('p', { class: 'hint' }, WAIT_FOR_GAMES) : null
        ); // prettier-ignore

        // The waiver wire: claims are awarded in waiver order when the week is played.
        const waivers = league.waivers.flatMap(w => {
          const p = league.players[w.playerId];
          const old = league.contracts[w.contractId];
          return p && old ? [{ w, p, hit: capHit(claimedContract(old, abbr, 'preview', league.date, league.rules), year, league.rules) }] : [];
        }); // prettier-ignore
        const waiverCard = card(
          'Waiver wire',
          waivers.length
            ? h(
                'ul',
                { class: 'roster-list', 'aria-label': 'Players on waivers' },
                ...waivers.map(({ w, p, hit }) => {
                  const name = fullName(p);
                  let action: HTMLElement;
                  if (w.from === abbr) action = h('p', { class: 'hint' }, 'You released him.');
                  else if (w.claims.includes(abbr)) action = h('p', { class: 'hint' }, 'Claim placed. Claims are decided when the week is played.');
                  else {
                    const claim = h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `Claim ${name}` }, 'Claim');
                    claim.addEventListener('click', () =>
                      openMoveDialog(app, { id: 'claimDialog', title: `Claim ${name}`, intro: `Released by the ${TEAM_COLORS[w.from].name}. A claim takes over his contract: ${money(hit, true)} on your ${year} cap.`, choices: [{ label: 'Claim', confirm: `Claim ${name}`, move: () => ({ kind: 'claim', team: abbr, playerId: p.id }) }] }, claim, after(claim, 'Claim '))
                    );
                    action = claim;
                  }
                  return h('li', { class: 'list-row' }, h('span', { class: 'pos' }, p.position), h('div', { class: 'list-main' }, playerLink(p), h('p', { class: 'list-sub' }, `Released by the ${teamFullName(w.from)} · ${money(hit)} on your ${year} cap`)), tierPlate(p.ovr), h('div', { class: 'btn-row' }, action));
                })
              )
            : h('p', { class: 'empty' }, 'No one is on waivers. Players teams release show here before they can sign elsewhere.')
        ); // prettier-ignore

        // Free agents by overall, filtered by position group, a page at a time.
        const all = freeAgents(league).sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
        const filtered = group === 'all' ? all : all.filter(p => POSITION_GROUP[p.position] === group);
        const filter = h(
          'select',
          { class: 'select', id: 'fa-group' },
          h('option', { value: 'all', selected: group === 'all' }, 'All positions'),
          ...(Object.keys(GROUP_LABELS) as PositionGroup[]).map(g => h('option', { value: g, selected: group === g }, GROUP_LABELS[g]))
        ); // prettier-ignore
        filter.addEventListener('change', () => {
          group = filter.value as PositionGroup | 'all';
          shown = PAGE;
          build();
          view.querySelector<HTMLElement>('#fa-group')?.focus();
          status.textContent = view.querySelector('.fa-count')?.textContent ?? '';
        });
        const squadOpen = SQUAD_PHASES.has(league.date.phase);
        const rows = filtered.slice(0, shown).map(p => {
          const name = fullName(p);
          const offer = h('button', { class: 'btn btn-solid', type: 'button', 'aria-label': `${OFFER}${name}` }, 'Make an offer');
          offer.addEventListener('click', () => openOffer(app, league, p, offer, after(offer, OFFER)));
          const squad = squadOpen ? h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `Sign ${name} to the practice squad` }, 'Practice squad') : null;
          squad?.addEventListener('click', () =>
            openMoveDialog(app, { id: 'squadDialog', title: `Sign ${name} to the practice squad`, intro: `${name}, ${p.position}, age ${ageOn(p.birthDate, today)}. Practice squad players are paid weekly and can be elevated for games or signed to the roster.`, choices: [{ label: 'Practice squad', confirm: `Sign ${name} to the practice squad`, move: () => ({ kind: 'signPracticeSquad', team: abbr, playerId: p.id }) }] }, squad, after(squad, OFFER))
          );
          return h('li', { class: 'list-row' }, h('span', { class: 'pos' }, p.position), h('div', { class: 'list-main' }, playerLink(p), h('p', { class: 'list-sub' }, `Age ${ageOn(p.birthDate, today)} · asks ${money(askingSalary(league, p))} a year`)), tierPlate(p.ovr), h('div', { class: 'btn-row' }, offer, squad));
        }); // prettier-ignore
        const more = h(
          'button',
          { class: 'btn btn-outline', type: 'button' },
          `Show ${Math.min(PAGE, filtered.length - shown)} more`
        );
        more.addEventListener('click', () => {
          const first = shown;
          shown += PAGE;
          build();
          view.querySelectorAll<HTMLElement>('.fa-list .list-row a')[first]?.focus();
        });
        const countText = `${filtered.length} free ${filtered.length === 1 ? 'agent' : 'agents'}${group === 'all' ? '' : ` among the ${GROUP_LABELS[group].toLowerCase()}`}, best first.`;
        const empty =
          group === 'all'
            ? 'No free agents are left. Players teams release show up here once they clear waivers.'
            : 'No free agents at this position. Choose another position to see the rest.';
        const agents = card(
          'Free agents',
          h('div', { class: 'filterbar' }, h('div', { class: 'field' }, h('label', { for: 'fa-group' }, 'Position'), filter)),
          h('p', { class: 'fa-count' }, countText),
          filtered.length ? h('ul', { class: 'roster-list fa-list', 'aria-label': 'Free agents' }, ...rows) : h('p', { class: 'empty' }, empty),
          filtered.length > shown ? more : null
        ); // prettier-ignore

        mount(
          content,
          pageHead('Free agency', teamFullName(abbr)),
          h('div', { class: 'stack' }, summary, waiverCard, agents)
        );
      };
      build();
      return view;
    }
  };
}
