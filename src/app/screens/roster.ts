/**
 * Roster (style guide 4.2, 7.3, spec 19.3): the user's players, active first, then the reserve lists and
 * the practice squad, with overall, fit in the team's schemes (spec 7.7), this year's cap hit, and status.
 * Each player's roster moves open from here (spec 19.4). The table and the phone list come from the same
 * rows. Filters, sorting, and comparison arrive with the full roster screen in M9.
 */
import { teamFullName } from '../../data/team-colors';
import { capFacts, capSheet } from '../../engine/cap/sheet';
import { capHit } from '../../engine/contracts/cap';
import { rolesFor, type RoleRating } from '../../engine/fit/role-rating';
import { leagueFitContext } from '../../engine/league/fit';
import type { League } from '../../engine/league/types';
import { calendarDay, leagueYear } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { POSITIONS } from '../../engine/model/positions';
import { rosterCounts } from '../../engine/roster/rules';
import { resolveDefense, resolveOffense } from '../../engine/schemes/resolve';
import { FIT_SLOTS } from '../../engine/schemes/slots';
import { h, mount } from '../dom';
import { money } from '../format';
import { href } from '../router';
import { fitNode } from '../ui/fit';
import { openRosterMoves, placeOf, refocus } from '../ui/moves';
import { devTag, injuryTag, playerLink, statusTag, tierPlate } from '../ui/players';
import { pageHead } from './common';
import type { Screen } from './types';

const ORDER = new Map(POSITIONS.map((p, i) => [p, i]));
const MOVES = 'Moves for ';
/** Active players first, then the reserve lists, then the practice squad. */
const GROUP: Partial<Record<Player['status'], number>> = {
  active: 0,
  ir: 1,
  pup: 1,
  nfi: 1,
  suspended: 1,
  practice: 2
};

interface Row {
  player: Player;
  age: number;
  best: RoleRating | undefined;
  hit: number;
}

export function rosterScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Roster',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) {
        mount(view, pageHead('Roster'));
        return view;
      }
      let shown: League | null = null;
      off = app.onChange(() => {
        if (!app.league || app.league === shown) return;
        const label = document.activeElement?.getAttribute('aria-label') ?? null;
        build();
        refocus(view, label, null, 0);
      });
      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shown = league;
        const abbr = league.meta.start.userTeam;
        const ctx = leagueFitContext(league, abbr);
        const today = calendarDay(league.date);
        const year = leagueYear(league.date);
        const rows: Row[] = Object.values(league.players)
          .filter(p => p.team === abbr && GROUP[p.status] !== undefined)
          .map(player => {
            const contract = player.contractId ? league.contracts[player.contractId] : undefined;
            return {
              player,
              age: ageOn(player.birthDate, today),
              best: rolesFor(player, ctx, FIT_SLOTS)[0],
              hit: contract ? capHit(contract, year, league.rules, capFacts(league, player.id)) : 0
            };
          })
          .sort(
            (a, b) =>
              (GROUP[a.player.status] ?? 3) - (GROUP[b.player.status] ?? 3) ||
              (ORDER.get(a.player.position) ?? 0) - (ORDER.get(b.player.position) ?? 0) ||
              b.player.ovr - a.player.ovr ||
              (a.player.id < b.player.id ? -1 : 1)
          );

        const movesButton = (player: Player) => {
          const button = h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `${MOVES}${fullName(player)}` }, 'Moves');
          button.addEventListener('click', () => {
            // After the move, focus returns to his Moves button, or the next player's if he left the list.
            const label = button.getAttribute('aria-label');
            const index = placeOf(view, button, MOVES);
            openRosterMoves(app, player, button, () => {
              build();
              refocus(view, label, MOVES, index);
            });
          });
          return button;
        }; // prettier-ignore

        const body = h('tbody');
        const list = h('ul', { class: 'roster-list', 'aria-label': 'Roster' });
        for (const { player, age, best, hit } of rows) {
          const role = best ? `${best.label}` : 'No role in these schemes';
          body.append(
            h('tr', null,
              h('td', null, player.position),
              h('th', { scope: 'row' }, playerLink(player)),
              h('td', { class: 'wide num' }, age),
              h('td', null, tierPlate(player.ovr)),
              h('td', { class: 'wide' }, devTag(player.dev)),
              h('td', { class: 'wide' }, role),
              h('td', { class: 'num' }, best ? fitNode(best.fit) : 'Not applicable'),
              h('td', { class: 'wide num' }, money(hit)),
              h('td', null, statusTag(player.status), injuryTag(player) ? ' ' : null, injuryTag(player)),
              h('td', null, movesButton(player))
            )
          );
          list.append(
            h('li', { class: 'list-row' },
              h('span', { class: 'pos' }, player.position),
              h('div', { class: 'list-main' },
                playerLink(player),
                h('p', { class: 'list-sub' }, `Age ${age} · ${role}`),
                h('p', { class: 'list-sub' }, 'Fit ', best ? fitNode(best.fit) : 'not applicable', ` · ${year} cap hit ${money(hit)}`),
                player.status === 'active' && !injuryTag(player) ? null : h('p', { class: 'list-sub' }, player.status === 'active' ? null : statusTag(player.status), injuryTag(player))
              ),
              tierPlate(player.ovr),
              h('div', { class: 'btn-row' }, movesButton(player))
            )
          );
        } // prettier-ignore
        const schemes = `${resolveOffense(league.teams[abbr].schemes.offense).name} offense and ${resolveDefense(league.teams[abbr].schemes.defense).name} defense`;
        const counts = rosterCounts(league, abbr);
        const space = capSheet(league, abbr).space;
        mount(
          view,
          pageHead('Roster', teamFullName(abbr)),
          h('p', { class: 'muted' }, `Fit is for your ${schemes}: each player's best role, against his overall.`),
          h('p', null, `${counts.active} of ${counts.limit} on the active roster, ${counts.reserve} on reserve lists, and ${counts.practice} on the practice squad. ${year} cap space: ${money(space)}.`),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('finances') }, 'Cap sheet'), h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency')),
          rows.length === 0 ? h('p', { class: 'empty' }, 'Your roster is empty. Sign players in free agency to fill it.') : null,
          h('div', { class: 'roster-region', hidden: rows.length === 0 },
            h('table', { class: 'roster-table' },
              h('caption', { class: 'sr-only' }, 'Roster with overall ratings, best roles, fit in your schemes, cap hits, and status'),
              h('thead', null,
                h('tr', null,
                  h('th', { class: 'pos-col', scope: 'col' }, 'Pos'),
                  h('th', { scope: 'col' }, 'Player'),
                  h('th', { class: 'wide age-col', scope: 'col' }, 'Age'),
                  h('th', { class: 'ovr-col', scope: 'col' }, 'OVR'),
                  h('th', { class: 'wide dev-col', scope: 'col' }, 'Development'),
                  h('th', { class: 'wide', scope: 'col' }, 'Best role'),
                  h('th', { class: 'ovr-col', scope: 'col' }, 'Fit'),
                  h('th', { class: 'wide cap-col num', scope: 'col' }, `${year} cap hit`),
                  h('th', { class: 'status-col', scope: 'col' }, 'Status'),
                  h('th', { class: 'moves-col', scope: 'col' }, h('span', { class: 'sr-only' }, 'Roster moves'))
                )
              ),
              body
            ),
            list
          )
        ); // prettier-ignore
      };
      build();
      return view;
    }
  };
}
