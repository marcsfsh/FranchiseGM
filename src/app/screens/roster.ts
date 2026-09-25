/**
 * Roster (style guide 4.2, 7.3): the user's players with overall and fit in the team's schemes (spec
 * 7.7). The table and the phone list come from the same rows. Filters, sorting, and comparison arrive
 * with the full roster screen in M9.
 */
import { teamFullName } from '../../data/team-colors';
import { rolesFor, type RoleRating } from '../../engine/fit/role-rating';
import { leagueFitContext } from '../../engine/league/fit';
import { ageOn, type Player } from '../../engine/model/player';
import { POSITIONS } from '../../engine/model/positions';
import { resolveDefense, resolveOffense } from '../../engine/schemes/resolve';
import { FIT_SLOTS } from '../../engine/schemes/slots';
import { calendarDay } from '../../engine/model/calendar';
import { h } from '../dom';
import { fitNode, playerLink, statusTag, tierPlate } from '../ui/players';
import { pageHead } from './common';
import type { Screen } from './types';

const ORDER = new Map(POSITIONS.map((p, i) => [p, i]));

interface Row {
  player: Player;
  age: number;
  best: RoleRating | undefined;
}

export function rosterScreen(): Screen {
  return {
    title: 'Roster',
    render: ({ app }) => {
      const league = app.league;
      if (!league) return h('section', { class: 'view' }, pageHead('Roster'));
      const abbr = league.meta.start.userTeam;
      const ctx = leagueFitContext(league, abbr);
      const today = calendarDay(league.date);
      const rows: Row[] = Object.values(league.players)
        .filter(p => p.team === abbr && (p.status === 'active' || p.status === 'practice'))
        .map(player => ({
          player,
          age: ageOn(player.birthDate, today),
          best: rolesFor(player, ctx, FIT_SLOTS)[0]
        }))
        .sort(
          (a, b) =>
            (a.player.status === 'active' ? 0 : 1) - (b.player.status === 'active' ? 0 : 1) ||
            (ORDER.get(a.player.position) ?? 0) - (ORDER.get(b.player.position) ?? 0) ||
            b.player.ovr - a.player.ovr ||
            (a.player.id < b.player.id ? -1 : 1)
        );

      const body = h('tbody');
      const list = h('ul', { class: 'roster-list', 'aria-label': 'Roster' });
      for (const { player, age, best } of rows) {
        const role = best ? `${best.label}` : 'No role in these schemes';
        body.append(
          h(
            'tr',
            null,
            h('td', null, player.position),
            h('th', { scope: 'row' }, playerLink(player)),
            h('td', { class: 'wide num' }, age),
            h('td', null, tierPlate(player.ovr)),
            h('td', { class: 'wide' }, role),
            h('td', { class: 'num' }, best ? fitNode(best.fit) : '—'),
            h('td', null, statusTag(player.status))
          )
        );
        list.append(
          h(
            'li',
            { class: 'list-row' },
            h('span', { class: 'pos' }, player.position),
            h(
              'div',
              { class: 'list-main' },
              playerLink(player),
              h('p', { class: 'list-sub' }, `Age ${age} · ${role}`),
              h(
                'p',
                { class: 'list-sub' },
                'Fit ',
                best ? fitNode(best.fit) : '—',
                player.status === 'practice' ? ' · Practice squad' : ''
              )
            ),
            tierPlate(player.ovr)
          )
        );
      }
      const schemes = `${resolveOffense(league.teams[abbr].schemes.offense).name} offense and ${resolveDefense(league.teams[abbr].schemes.defense).name} defense`;
      const active = rows.filter(r => r.player.status === 'active').length;
      return h(
        'section',
        { class: 'view' },
        pageHead('Roster', teamFullName(abbr)),
        h(
          'p',
          { class: 'muted' },
          `Fit is for your ${schemes}: each player's best role, against his overall.`
        ),
        h(
          'p',
          { role: 'status' },
          `${active} active players and ${rows.length - active} on the practice squad.`
        ),
        h(
          'div',
          { class: 'roster-region' },
          h(
            'table',
            { class: 'roster-table' },
            h(
              'caption',
              { class: 'sr-only' },
              'Roster with overall ratings, best roles, and fit in your schemes'
            ),
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', { class: 'pos-col', scope: 'col' }, 'Pos'),
                h('th', { scope: 'col' }, 'Player'),
                h('th', { class: 'wide age-col', scope: 'col' }, 'Age'),
                h('th', { class: 'ovr-col', scope: 'col' }, 'OVR'),
                h('th', { class: 'wide', scope: 'col' }, 'Best role'),
                h('th', { class: 'ovr-col', scope: 'col' }, 'Fit'),
                h('th', { class: 'status-col', scope: 'col' }, 'Status')
              )
            ),
            body
          ),
          list
        )
      );
    }
  };
}
