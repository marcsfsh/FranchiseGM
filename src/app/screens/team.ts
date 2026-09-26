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
import { sortableTable, type TableColumn } from '../ui/sortable';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import type { Screen } from './types';

type TeamTab = 'roster' | 'schedule';
const TEAM_TABS: readonly TeamTab[] = ['roster', 'schedule'];
const isTeamTab = (tab: string | undefined): tab is TeamTab =>
  (TEAM_TABS as readonly string[]).includes(tab ?? '');

const ORDER = new Map<string, number>(POSITIONS.map((p, i) => [p, i]));
const RESERVE: readonly Player['status'][] = ['ir', 'pup', 'nfi', 'suspended', 'holdout'];

/** The roster by position, best first within each; reserve lists and the practice squad after. */
function rosterTable(league: League, abbr: TeamAbbr): HTMLElement {
  const today = calendarDay(league.date);
  const GROUPS = ['Active roster', 'Reserve lists', 'Practice squad'];
  const groupOf = (p: Player) => (p.status === 'active' ? 0 : RESERVE.includes(p.status) ? 1 : 2);
  const players = Object.values(league.players)
    .filter(p => p.team === abbr)
    .sort(
      (a, b) =>
        groupOf(a) - groupOf(b) ||
        (ORDER.get(a.position) ?? 99) - (ORDER.get(b.position) ?? 99) ||
        b.ovr - a.ovr ||
        (a.id < b.id ? -1 : 1)
    );
  const columns: TableColumn<Player>[] = [
    { id: 'jersey', label: '#', title: 'Jersey number', name: 'jersey number', type: 'number', first: 'asc', numeric: true, value: p => p.jersey, cell: p => h('td', { class: 'num' }, String(p.jersey)) },
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: p => `${p.lastName} ${p.firstName}`, cell: p => h('th', { scope: 'row' }, playerLink(p)) },
    { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], value: p => ORDER.get(p.position), cell: p => h('td', null, p.position) },
    { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, value: p => ageOn(p.birthDate, today), cell: p => h('td', { class: 'num' }, String(ageOn(p.birthDate, today))) },
    { id: 'ovr', label: 'OVR', title: 'Overall', name: 'overall', type: 'rating', value: p => p.ovr, cell: p => h('td', null, tierPlate(p.ovr)) },
    { id: 'status', label: 'Status', name: 'status', type: 'number', first: 'asc', words: ['active first', 'practice squad first'], value: groupOf, cell: p => h('td', null, statusTag(p.status)) }
  ];
  return sortableTable({
    key: 'team.roster',
    name: `${teamFullName(abbr)} roster`,
    caption: `${teamFullName(abbr)} roster`,
    captionClass: 'sr-only',
    className: 'stat-table team-roster',
    columns,
    rows: players,
    rowId: p => p.id,
    defaultOrder: 'by roster group and position',
    group: { of: p => GROUPS[groupOf(p)] ?? '', heading: (group, count) => `${group} (${count})` },
    scroll: true
  }).element;
} // prettier-ignore

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
        `team-${isTeamTab(route.params.tab) ? route.params.tab : 'roster'}`,
        // The address names the tab, so Back from a player or a game returns to it.
        id => history.replaceState(null, '', href('team', { abbr, tab: id.replace('team-', '') }))
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
