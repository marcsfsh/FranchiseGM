/**
 * Free agency (spec 19.3, 19.4, 11.8): the free agents with what each asks of the user's team, practice
 * squad signings, and the waiver wire with claims, each a sortable table (a list on phones). Through the
 * four weeks of free agency the user's offers stand until the week ends, with the teams bidding and the
 * user's offer on each row (D-53); after them, an offer made in the contract dialog signs him at once when
 * it's good enough.
 */
import { TEAM_COLORS, teamFullName } from '../../data/team-colors';
import { capSheet } from '../../engine/cap/sheet';
import { scrambleOpen, undraftedRookies } from '../../engine/draft/udfa';
import { askingSalary } from '../../engine/contracts/acceptance';
import { biddingOpen, offersFor, pendingFor } from '../../engine/contracts/free-agency';
import { capHit } from '../../engine/contracts/cap';
import { freeAgents } from '../../engine/league/transactions';
import type { League } from '../../engine/league/types';
import { calendarDay, leagueYear } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { POSITION_GROUP, POSITIONS, type PositionGroup } from '../../engine/model/positions';
import { minimumSalary } from '../../engine/rules/ruleset';
import { rosterCounts } from '../../engine/roster/rules';
import { claimedContract } from '../../engine/roster/waivers';
import { PLAYOFF_PHASES } from '../../engine/season/state';
import { plural } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h, mount } from '../dom';
import { visibleMatch } from '../focus';
import { money } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { dollarField, openMoveDialog, placeOf, refocus, WAIT_FOR_GAMES } from '../ui/moves';
import { GROUP_LABELS, playerLink, tierPlate } from '../ui/players';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { offerWords, openBid } from '../ui/bidding';
import { udfaCard } from '../ui/udfa';
import { card, pageHead } from './common';
import type { Screen } from './types';

const PAGE = 40;
const SQUAD_PHASES = new Set<string>(['cutdown', 'regularSeason', ...PLAYOFF_PHASES]);
const OFFER = 'Make an offer to ';

/** The filter and page length, kept while the user moves around the app. */
let group: PositionGroup | 'all' = 'all';
let shown = PAGE;

/** Opens the contract offer dialog for a free agent (style guide 7.7: an explicit Send offer). */
function openOffer(app: AppState, league: League, player: Player, trigger: HTMLElement, done: () => void): void {
  const name = fullName(player);
  const ask = askingSalary(league, player, league.meta.start.userTeam);
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
      intro: `${name}, ${player.position}, OVR ${player.ovr}. He asks you for ${money(ask, true)} a year; free agents ask for less as the season goes on.`,
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
        // Free agency's weeks (D-53): offers stand until each week ends.
        const bidding = biddingOpen(league);
        const pending = pendingFor(league, abbr);
        const bidders = (p: Player) => offersFor(league, p.id).filter(o => o.team !== abbr).length;
        const summary = card(
          'Your roster and cap',
          h('span', { class: 'label' }, `${year} cap space`),
          h('p', { class: `big-number${space < 0 ? ' delta-bad' : ''}` }, money(space)),
          h('p', null, `${counts.active} of ${counts.limit} on the active roster · ${counts.practice} of ${league.rules.roster.practiceSquad} on the practice squad`),
          bidding ? h('p', { class: 'hint' }, `Free agency, week ${league.date.week}: offers stand until the week ends, when free agents decide. You have ${plural(pending.players.length, 'offer')} standing, ${money(pending.charge, true)} on your cap if all are taken.`) : null,
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('finances') }, 'Cap sheet')),
          app.advancing ? h('p', { class: 'hint' }, WAIT_FOR_GAMES) : null
        ); // prettier-ignore

        const byName = (p: Player) => `${p.lastName} ${p.firstName}`;
        const positionOrder = (p: Player) => POSITIONS.indexOf(p.position);

        // The waiver wire: claims are awarded in waiver order when the week is played.
        const waivers = league.waivers.flatMap(w => {
          const p = league.players[w.playerId];
          const old = league.contracts[w.contractId];
          return p && old
            ? [
                {
                  w,
                  p,
                  hit: capHit(
                    claimedContract(old, abbr, 'preview', league.date, league.rules),
                    year,
                    league.rules
                  )
                }
              ]
            : [];
        });
        type Waived = (typeof waivers)[number];
        // Each call makes a fresh control: the table and the phone list both show one.
        const waiverAction = ({ w, p, hit }: Waived): HTMLElement => {
          const name = fullName(p);
          if (w.from === abbr) return h('p', { class: 'hint' }, 'You released him.');
          if (w.claims.includes(abbr))
            return h('p', { class: 'hint' }, 'Claim placed. Claims are decided when the week is played.');
          const claim = h(
            'button',
            { class: 'btn btn-outline', type: 'button', 'aria-label': `Claim ${name}` },
            'Claim'
          );
          claim.addEventListener('click', () =>
            openMoveDialog(
              app,
              {
                id: 'claimDialog',
                title: `Claim ${name}`,
                intro: `Released by the ${TEAM_COLORS[w.from].name}. A claim takes over his contract: ${money(hit, true)} on your ${year} cap.`,
                choices: [
                  {
                    label: 'Claim',
                    confirm: `Claim ${name}`,
                    move: () => ({ kind: 'claim', team: abbr, playerId: p.id })
                  }
                ]
              },
              claim,
              after(claim, 'Claim ')
            )
          );
          return claim;
        };
        const waiverList = h('ul', { class: 'roster-list', 'aria-label': 'Players on waivers' });
        const waiverItems = new Map(
          waivers.map(entry => [
            entry.p.id,
            h(
              'li',
              { class: 'list-row' },
              h('span', { class: 'pos' }, entry.p.position),
              h(
                'div',
                { class: 'list-main' },
                playerLink(entry.p),
                h(
                  'p',
                  { class: 'list-sub' },
                  `Released by the ${teamFullName(entry.w.from)} · ${money(entry.hit)} on your ${year} cap`
                )
              ),
              tierPlate(entry.p.ovr),
              h('div', { class: 'btn-row' }, waiverAction(entry))
            )
          ])
        );
        const waiverColumns: TableColumn<Waived>[] = [
          {
            id: 'position',
            label: 'Pos',
            title: 'Position',
            name: 'position',
            type: 'number',
            first: 'asc',
            words: ['quarterbacks first', 'specialists first'],
            className: 'pos-col',
            value: e => positionOrder(e.p),
            cell: e => h('td', null, e.p.position)
          },
          {
            id: 'player',
            label: 'Player',
            name: 'player',
            type: 'text',
            value: e => byName(e.p),
            cell: e => h('th', { scope: 'row' }, playerLink(e.p))
          },
          {
            id: 'ovr',
            label: 'OVR',
            title: 'Overall',
            name: 'overall',
            type: 'rating',
            className: 'ovr-col',
            value: e => e.p.ovr,
            cell: e => h('td', null, tierPlate(e.p.ovr))
          },
          {
            id: 'from',
            label: 'Released by',
            name: 'team that released him',
            type: 'text',
            value: e => teamFullName(e.w.from),
            cell: e => h('td', null, teamFullName(e.w.from))
          },
          {
            id: 'hit',
            label: `${year} cap hit`,
            name: `${year} cap hit`,
            type: 'money',
            numeric: true,
            className: 'cap-col',
            value: e => e.hit,
            cell: e => h('td', { class: 'num' }, money(e.hit))
          },
          {
            id: 'claim',
            label: 'Claim',
            name: 'claim',
            type: 'custom',
            sortable: false,
            hideLabel: true,
            className: 'claim-col',
            cell: e => h('td', null, waiverAction(e))
          }
        ];
        const waiverTable = waivers.length
          ? sortableTable({
              key: 'fa.waivers',
              name: 'waiver wire',
              caption: 'Players on waivers',
              captionClass: 'sr-only',
              className: 'roster-table fa-table',
              columns: waiverColumns,
              rows: waivers,
              rowId: e => e.p.id,
              defaultOrder: 'in the order they were released',
              status,
              onSort: ordered =>
                waiverList.replaceChildren(...ordered.map(e => waiverItems.get(e.p.id) as HTMLElement))
            })
          : null;
        const waiverCard = card(
          'Waiver wire',
          waiverTable
            ? h('div', { class: 'roster-region' }, waiverTable.element, waiverList)
            : h(
                'p',
                { class: 'empty' },
                'No one is on waivers. Players teams release show here before they can sign elsewhere.'
              )
        );

        // The UDFA scramble (D-49): undrafted rookies weighing offers have their own card while it's open.
        const scramble = scrambleOpen(league);
        const weighing = new Set(scramble ? undraftedRookies(league).map(p => p.id) : []);
        const rookies = scramble
          ? udfaCard(app, league, status, key => {
              build();
              if (key) (visibleMatch(view, key) ?? view.querySelector<HTMLElement>('h1'))?.focus();
            })
          : null;

        // Free agents, filtered by position group and sorted, a page at a time.
        const all = freeAgents(league)
          .filter(p => !weighing.has(p.id))
          .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
        const filtered = group === 'all' ? all : all.filter(p => POSITION_GROUP[p.position] === group);
        const filter = h(
          'select',
          { class: 'select', id: 'fa-group' },
          h('option', { value: 'all', selected: group === 'all' }, 'All positions'),
          ...(Object.keys(GROUP_LABELS) as PositionGroup[]).map(g =>
            h('option', { value: g, selected: group === g }, GROUP_LABELS[g])
          )
        );
        filter.addEventListener('change', () => {
          group = filter.value as PositionGroup | 'all';
          shown = PAGE;
          build();
          view.querySelector<HTMLElement>('#fa-group')?.focus();
          status.textContent = view.querySelector('.fa-count')?.textContent ?? '';
        });
        const squadOpen = SQUAD_PHASES.has(league.date.phase);
        const asking = new Map(
          filtered.map(p => [p.id, askingSalary(league, p, league.meta.start.userTeam)])
        );
        // Each call makes fresh controls: the table and the phone list both show them.
        const actions = (p: Player): HTMLElement => {
          const name = fullName(p);
          const mine = bidding && offersFor(league, p.id).some(o => o.team === abbr);
          const offer = h(
            'button',
            { class: 'btn btn-solid', type: 'button', 'aria-label': `${OFFER}${name}` },
            mine ? 'Change your offer' : 'Make an offer'
          );
          offer.addEventListener('click', () =>
            (bidding ? openBid : openOffer)(app, league, p, offer, after(offer, OFFER))
          );
          const squad = squadOpen
            ? h(
                'button',
                {
                  class: 'btn btn-outline',
                  type: 'button',
                  'aria-label': `Sign ${name} to the practice squad`
                },
                'Practice squad'
              )
            : null;
          squad?.addEventListener('click', () =>
            openMoveDialog(
              app,
              {
                id: 'squadDialog',
                title: `Sign ${name} to the practice squad`,
                intro: `${name}, ${p.position}, age ${ageOn(p.birthDate, today)}. Practice squad players are paid weekly and can be elevated for games or signed to the roster.`,
                choices: [
                  {
                    label: 'Practice squad',
                    confirm: `Sign ${name} to the practice squad`,
                    move: () => ({ kind: 'signPracticeSquad', team: abbr, playerId: p.id })
                  }
                ]
              },
              squad,
              after(squad, OFFER)
            )
          );
          return h('div', { class: 'btn-row' }, offer, squad);
        };
        const agentList = h('ul', { class: 'roster-list fa-list', 'aria-label': 'Free agents' });
        const agentItems = new Map<string, HTMLElement>();
        const agentItem = (p: Player): HTMLElement => {
          let item = agentItems.get(p.id);
          if (!item) {
            item = h(
              'li',
              { class: 'list-row' },
              h('span', { class: 'pos' }, p.position),
              h(
                'div',
                { class: 'list-main' },
                playerLink(p),
                h(
                  'p',
                  { class: 'list-sub' },
                  [
                    `Age ${ageOn(p.birthDate, today)} · asks ${money(asking.get(p.id) ?? 0)} a year`,
                    bidding ? `${plural(bidders(p), 'team')} bidding` : null,
                    bidding && offerWords(league, p.id) ? `your offer: ${offerWords(league, p.id)}` : null
                  ]
                    .filter(Boolean)
                    .join(' · ')
                )
              ),
              tierPlate(p.ovr),
              actions(p)
            );
            agentItems.set(p.id, item);
          }
          return item;
        };
        const agentColumns: TableColumn<Player>[] = [
          {
            id: 'position',
            label: 'Pos',
            title: 'Position',
            name: 'position',
            type: 'number',
            first: 'asc',
            words: ['quarterbacks first', 'specialists first'],
            className: 'pos-col',
            value: positionOrder,
            cell: p => h('td', null, p.position)
          },
          {
            id: 'player',
            label: 'Player',
            name: 'player',
            type: 'text',
            value: byName,
            cell: p => h('th', { scope: 'row' }, playerLink(p))
          },
          {
            id: 'age',
            label: 'Age',
            name: 'age',
            type: 'number',
            numeric: true,
            className: 'age-col',
            value: p => ageOn(p.birthDate, today),
            cell: p => h('td', { class: 'num' }, ageOn(p.birthDate, today))
          },
          {
            id: 'ovr',
            label: 'OVR',
            title: 'Overall',
            name: 'overall',
            type: 'rating',
            className: 'ovr-col',
            value: p => p.ovr,
            cell: p => h('td', null, tierPlate(p.ovr))
          },
          {
            id: 'asking',
            label: 'Asks a year',
            name: 'asking salary',
            type: 'money',
            numeric: true,
            className: 'cap-col',
            value: p => asking.get(p.id),
            cell: p => h('td', { class: 'num' }, money(asking.get(p.id) ?? 0))
          },
          ...(bidding
            ? ([
                {
                  id: 'bidders',
                  label: 'Bidding',
                  title: 'Other teams bidding',
                  name: 'teams bidding',
                  type: 'number',
                  numeric: true,
                  value: bidders,
                  cell: p => h('td', { class: 'num' }, bidders(p))
                },
                {
                  id: 'mine',
                  label: 'Your offer',
                  name: 'your offer',
                  type: 'text',
                  value: p => offerWords(league, p.id) ?? '',
                  cell: p => h('td', null, offerWords(league, p.id) ?? '—')
                }
              ] satisfies TableColumn<Player>[])
            : []),
          {
            id: 'actions',
            label: 'Offers',
            name: 'offers',
            type: 'custom',
            sortable: false,
            hideLabel: true,
            className: 'fa-actions-col',
            cell: p => h('td', null, actions(p))
          }
        ];
        const agentTable = filtered.length
          ? sortableTable({
              key: 'fa.agents',
              name: 'free agents',
              caption: 'Free agents',
              captionClass: 'sr-only',
              className: 'roster-table fa-table',
              columns: agentColumns,
              rows: filtered,
              rowId: p => p.id,
              defaultOrder: 'by overall, best first',
              status,
              limit: shown,
              onSort: ordered => agentList.replaceChildren(...ordered.map(agentItem))
            })
          : null;
        const more = h(
          'button',
          { class: 'btn btn-outline', type: 'button' },
          `Show ${Math.min(PAGE, filtered.length - shown)} more`
        );
        more.addEventListener('click', () => {
          const first = shown;
          shown += PAGE;
          build();
          const links = [...view.querySelectorAll<HTMLElement>('.fa-table tbody a, .fa-list .list-row a')];
          links
            .filter(a => a.getClientRects().length > 0)
            .at(first)
            ?.focus();
        });
        const countText = `${filtered.length} free ${filtered.length === 1 ? 'agent' : 'agents'}${group === 'all' ? '' : ` among the ${GROUP_LABELS[group].toLowerCase()}`}.`;
        const empty =
          group === 'all'
            ? 'No free agents are left. Players teams release show up here once they clear waivers.'
            : 'No free agents at this position. Choose another position to see the rest.';
        const agents = card(
          'Free agents',
          h(
            'div',
            { class: 'filterbar' },
            h('div', { class: 'field' }, h('label', { for: 'fa-group' }, 'Position'), filter)
          ),
          h('p', { class: 'fa-count' }, countText),
          agentTable
            ? h('div', { class: 'roster-region' }, agentTable.element, agentList)
            : h('p', { class: 'empty' }, empty),
          filtered.length > shown ? more : null
        );

        mount(
          content,
          pageHead('Free agency', teamFullName(abbr)),
          h('div', { class: 'stack' }, summary, rookies, waiverCard, agents)
        );
      };
      build();
      return view;
    }
  };
}
