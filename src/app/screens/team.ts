/**
 * A club's page (spec 19.1, League): its record and division place, its roster by position, and its
 * season's schedule and results. The user's own roster is managed from the Roster screen.
 */
import { isTeamAbbr, teamFullName, type TeamAbbr } from '../../data/team-colors';
import { team as teamInfo } from '../../data/teams';
import type { League } from '../../engine/league/types';
import { ageOn, type Player } from '../../engine/model/player';
import { POSITIONS } from '../../engine/model/positions';
import { calendarDay } from '../../engine/model/calendar';
import { leagueStandings } from '../../engine/season/state';
import { h, mount } from '../dom';
import { record } from '../format';
import { href } from '../router';
import { clubSeason } from '../ui/games';
import { playerLink, statusTag, tierPlate } from '../ui/players';
import { scrollRegion, statHeader } from '../ui/stat-table';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import type { Screen } from './types';

type TeamTab = 'roster' | 'schedule';
const TEAM_TABS: readonly TeamTab[] = ['roster', 'schedule'];
const isTeamTab = (tab: string | undefined): tab is TeamTab =>
  (TEAM_TABS as readonly string[]).includes(tab ?? '');

const ORDER = new Map<string, number>(POSITIONS.map((p, i) => [p, i]));
const RESERVE: readonly Player['status'][] = ['ir', 'pup', 'nfi', 'suspended'];

/** The roster by position, best first within each; reserve lists and the practice squad after. */
function rosterTable(league: League, abbr: TeamAbbr): HTMLElement {
  const today = calendarDay(league.date);
  const byPosition = (a: Player, b: Player) =>
    (ORDER.get(a.position) ?? 99) - (ORDER.get(b.position) ?? 99) || b.ovr - a.ovr || (a.id < b.id ? -1 : 1);
  const players = Object.values(league.players).filter(p => p.team === abbr);
  const groups: [string, Player[]][] = [
    ['Active roster', players.filter(p => p.status === 'active').sort(byPosition)],
    ['Reserve lists', players.filter(p => RESERVE.includes(p.status)).sort(byPosition)],
    ['Practice squad', players.filter(p => p.status === 'practice').sort(byPosition)]
  ];
  const columns = 6;
  const table = h(
    'table',
    { class: 'stat-table team-roster' },
    h('caption', { class: 'sr-only' }, `${teamFullName(abbr)} roster`),
    h('thead', null, h('tr', null, statHeader('#', 'Jersey number'), h('th', { scope: 'col' }, 'Player'), h('th', { scope: 'col' }, 'Pos'), statHeader('Age', 'Age'), h('th', { scope: 'col' }, 'OVR'), h('th', { scope: 'col' }, 'Status'))),
    ...groups.filter(([, list]) => list.length).map(([label, list]) =>
      h('tbody', null, h('tr', { class: 'group-row' }, h('th', { scope: 'rowgroup', colspan: String(columns) }, `${label} (${list.length})`)), ...list.map(p =>
        h('tr', null, h('td', { class: 'num' }, String(p.jersey)), h('th', { scope: 'row' }, playerLink(p)), h('td', null, p.position), h('td', { class: 'num' }, String(ageOn(p.birthDate, today))), h('td', null, tierPlate(p.ovr)), h('td', null, statusTag(p.status)))
      ))
    )
  ); // prettier-ignore
  return scrollRegion(`${teamFullName(abbr)} roster`, table);
}

export function teamScreen(): Screen {
  return {
    title: 'Team',
    render: ({ app, route }) => {
      const view = h('section', { class: 'view' });
      const league = app.league;
      if (!league) return view;
      const abbr = route.params.abbr;
      if (!abbr || !isTeamAbbr(abbr)) {
        mount(view, pageHead('Team'), card('Team not found', h('p', null, 'There is no club with that abbreviation.'), h('a', { href: href('leagueTab', { tab: 'standings' }) }, 'Standings')));
        return view;
      } // prettier-ignore
      const user = league.meta.start.userTeam;
      const standings = leagueStandings(league);
      const r = standings.table.records[abbr].overall;
      const info = teamInfo(abbr);
      const division = standings.divisions.find(d => d.division === `${info.conf} ${info.div}`);
      const place = (division?.teams.findIndex(t => t.abbr === abbr) ?? -1) + 1;
      const PLACES = ['first', 'second', 'third', 'fourth'];
      const summary = `${record(r.wins, r.losses, r.ties)}, ${PLACES[place - 1] ?? `number ${place}`} in the ${info.conf} ${info.div}`;
      const teamTabs = tabs(
        'Team',
        [
          { id: 'team-roster', label: 'Roster', render: () => rosterTable(league, abbr) },
          { id: 'team-schedule', label: 'Schedule', render: () => clubSeason(league, abbr) }
        ],
        `team-${isTeamTab(route.params.tab) ? route.params.tab : 'roster'}`
      );
      mount(
        view,
        pageHead(teamFullName(abbr), String(league.season.season)),
        h('p', null, summary),
        abbr === user
          ? h(
              'div',
              { class: 'btn-row' },
              h('a', { class: 'btn btn-outline', href: href('roster') }, 'Manage your roster')
            )
          : null,
        teamTabs.element
      );
      return view;
    }
  };
}
