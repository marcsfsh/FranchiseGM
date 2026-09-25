/**
 * The League section (spec 19.1, 19.3): standings by division and by conference, each with the tiebreakers
 * that ordered clubs tied on record, and the playoff picture, which becomes the bracket once the playoffs
 * are seeded. The chosen tab and view last while the user moves around the app.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { team as teamInfo, type Conference } from '../../data/teams';
import type { League } from '../../engine/league/types';
import { PHASE_LABELS } from '../../engine/model/calendar';
import {
  explainTiebreak,
  tiebreaks,
  winPct,
  type LeagueStandings,
  type Ranked,
  type WinLoss
} from '../../engine/season/standings';
import { byes as byeCount } from '../../engine/season/playoffs';
import { gameWeek, leagueStandings, PLAYOFF_PHASES } from '../../engine/season/state';
import { h, mount, type Child } from '../dom';
import { record } from '../format';
import { href } from '../router';
import { clubSeason, gameCard, nick, teamLink, weekLabel } from '../ui/games';
import { playerLink, signed } from '../ui/players';
import { scrollRegion, statHeader } from '../ui/stat-table';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import { statsPanel } from './league-stats';
import { focusKeyOf, refocusWhenReady } from '../focus';
import type { AppState } from '../state';
import type { Screen } from './types';

export const LEAGUE_TABS = ['standings', 'playoffs', 'schedule', 'stats', 'news'] as const;
export type LeagueTab = (typeof LEAGUE_TABS)[number];

type StandingsView = 'divisions' | 'conferences';

const STANDINGS_VIEWS: { id: StandingsView; label: string }[] = [
  { id: 'divisions', label: 'Divisions' },
  { id: 'conferences', label: 'Conferences' }
];

/** The tab, standings view, and schedule filters, kept for the session. A null week follows the season. */
const choice: {
  tab: LeagueTab;
  standings: StandingsView;
  week: number | null;
  team: TeamAbbr | 'all';
  newsWeek: number | null;
  newsMine: boolean;
} = { tab: 'standings', standings: 'divisions', week: null, team: 'all', newsWeek: null, newsMine: false };

const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];

const pct = (r: WinLoss): string => winPct(r).toFixed(3).replace(/^0/, '');
const winLoss = (r: WinLoss): string => record(r.wins, r.losses, r.ties);

/** A cell with nothing to show: a dash, read out as `meaning`. */
const noneCell = (meaning: string): HTMLElement =>
  h(
    'td',
    { class: 'num' },
    h('span', { 'aria-hidden': 'true' }, '—'),
    h('span', { class: 'sr-only' }, meaning)
  );

/** A team's row header: the nickname, marked when it's the user's team. */
function teamHeader(abbr: TeamAbbr, user: TeamAbbr): HTMLElement {
  return h(
    'th',
    { scope: 'row' },
    teamLink(abbr),
    abbr === user ? h('span', { class: 'sr-only' }, ' (your team)') : null
  );
}

/** Sentences for the tiebreakers behind ordered lists of clubs, or nothing when no tie was broken. */
function tiebreakNotes(
  standings: LeagueStandings,
  lists: readonly (readonly Ranked[])[]
): HTMLElement | null {
  // Before any game every club is 0–0, and only coin tosses order them: nothing worth explaining yet.
  const played = Object.values(standings.table.records).some(
    r => r.overall.wins + r.overall.losses + r.overall.ties > 0
  );
  const notes = played ? lists.flatMap(list => tiebreaks(list, standings.table)) : [];
  if (!notes.length) return null;
  return h(
    'div',
    { class: 'tiebreak-notes' },
    h('p', { class: 'label' }, 'Tiebreakers'),
    h(
      'ul',
      null,
      ...notes.map(n =>
        h(
          'li',
          null,
          explainTiebreak(n, standings.table, abbr => `the ${nick(abbr)}`)
        )
      )
    )
  );
}

const DIVISION_COLUMNS = [
  ['W', 'Wins'], ['L', 'Losses'], ['T', 'Ties'], ['Pct', 'Winning percentage'], ['PF', 'Points for'],
  ['PA', 'Points against'], ['Net', 'Point differential'], ['Home', 'Home record'], ['Road', 'Road record'],
  ['Div', 'Division record'], ['Conf', 'Conference record'], ['Strk', 'Streak']
] as const; // prettier-ignore

function divisionTable(standings: LeagueStandings, division: LeagueStandings['divisions'][number], user: TeamAbbr): HTMLElement {
  const records = standings.table.records;
  const table = h(
    'table',
    { class: 'stat-table standings-table' },
    h('caption', null, division.division),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Team'), ...DIVISION_COLUMNS.map(([label, title]) => statHeader(label, title)))),
    h(
      'tbody',
      null,
      ...division.teams.map(({ abbr }) => {
        const r = records[abbr];
        const o = r.overall;
        return h(
          'tr',
          { class: abbr === user ? 'is-us' : null },
          teamHeader(abbr, user),
          ...[o.wins, o.losses, o.ties].map(n => h('td', { class: 'num' }, String(n))),
          h('td', { class: 'num' }, pct(o)),
          h('td', { class: 'num' }, String(r.pointsFor)),
          h('td', { class: 'num' }, String(r.pointsAgainst)),
          h('td', { class: 'num' }, signed(r.pointsFor - r.pointsAgainst)),
          ...[r.home, r.away, r.division, r.conference].map(x => h('td', { class: 'num' }, winLoss(x))),
          r.streak ? h('td', { class: 'num' }, r.streak) : noneCell('No games yet')
        );
      })
    )
  );
  return h('div', { class: 'stack' }, scrollRegion(`${division.division} standings`, table), tiebreakNotes(standings, [division.teams]));
} // prettier-ignore

function divisionsView(standings: LeagueStandings, user: TeamAbbr): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    ...CONFERENCES.map(conference =>
      card(
        `${conference} divisions`,
        ...standings.divisions
          .filter(d => d.conference === conference)
          .map(d => divisionTable(standings, d, user))
      )
    )
  );
}

const CONFERENCE_COLUMNS = [
  ['Record', 'Record'], ['Pct', 'Winning percentage'], ['Div', 'Division record'], ['Conf', 'Conference record'],
  ['SOV', 'Strength of victory'], ['SOS', 'Strength of schedule']
] as const; // prettier-ignore

/** Division winners come first in the seeds; the rest of the conference is ordered by the wild card rules. */
const divisionCount = (standings: LeagueStandings, conference: Conference): number =>
  standings.divisions.filter(d => d.conference === conference).length;

function conferenceTable(standings: LeagueStandings, conference: Conference, user: TeamAbbr): HTMLElement {
  const conf = standings.conferences.find(c => c.conference === conference);
  if (!conf) return h('p', { class: 'empty' }, 'No standings yet.');
  const records = standings.table.records;
  const winners = divisionCount(standings, conference);
  const columns = CONFERENCE_COLUMNS.length + 3;
  const row = (r: Ranked, rank: number, status: string) => {
    const t = records[r.abbr];
    return h(
      'tr',
      { class: r.abbr === user ? 'is-us' : null },
      h('td', { class: 'num' }, String(rank)),
      teamHeader(r.abbr, user),
      status ? h('td', null, status) : noneCell('Outside the field'),
      h('td', { class: 'num' }, winLoss(t.overall)),
      h('td', { class: 'num' }, pct(t.overall)),
      h('td', { class: 'num' }, winLoss(t.division)),
      h('td', { class: 'num' }, winLoss(t.conference)),
      h('td', { class: 'num' }, t.sov.toFixed(3).replace(/^0/, '')),
      h('td', { class: 'num' }, t.sos.toFixed(3).replace(/^0/, ''))
    );
  };
  const group = (label: string) =>
    h('tr', { class: 'group-row' }, h('th', { scope: 'rowgroup', colspan: String(columns) }, label));
  const table = h(
    'table',
    { class: 'stat-table standings-table' },
    h('caption', null, `${conference} standings`),
    h('thead', null, h('tr', null, statHeader('#', 'Rank'), h('th', { scope: 'col' }, 'Team'), h('th', { scope: 'col' }, 'Status'), ...CONFERENCE_COLUMNS.map(([label, title]) => statHeader(label, title)))),
    h('tbody', null, group('In the playoff field'), ...conf.seeds.map((r, i) => row(r, i + 1, i < winners ? 'Division leader' : 'Wild card'))),
    h('tbody', null, group('Outside the field'), ...conf.rest.map((r, i) => row(r, conf.seeds.length + i + 1, '')))
  ); // prettier-ignore
  return h(
    'div',
    { class: 'stack' },
    scrollRegion(`${conference} standings`, table),
    tiebreakNotes(standings, [conf.seeds.slice(0, winners), [...conf.seeds.slice(winners), ...conf.rest]])
  );
}

function conferencesView(standings: LeagueStandings, user: TeamAbbr): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    ...CONFERENCES.map(c =>
      card(
        `${c} conference`,
        h('p', { class: 'hint' }, 'Division leaders take the top seeds; the wild cards follow by record.'),
        conferenceTable(standings, c, user)
      )
    )
  );
}

/** "(2) Bills" with the record, for playoff lists. */
const seeded = (seed: number, abbr: TeamAbbr, standings: LeagueStandings): string =>
  `(${seed}) ${nick(abbr)}, ${winLoss(standings.table.records[abbr].overall)}`;

/** If the season ended today: the seeds, the first-round matchups, and the clubs chasing them. */
function projectedPicture(standings: LeagueStandings, user: TeamAbbr): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    ...CONFERENCES.map(conference => {
      const conf = standings.conferences.find(c => c.conference === conference);
      const seeds = conf?.seeds ?? [];
      // Top seeds rest until the field is a power of two: one bye for seven clubs.
      const byes = seeds.length ? byeCount(seeds.length) : 0;
      const li = (abbr: TeamAbbr, text: string) => h('li', { class: abbr === user ? 'is-us' : null }, text);
      // The others pair best against worst.
      const games: [number, number][] = [];
      for (let hi = byes, lo = seeds.length - 1; hi < lo; hi++, lo--) games.push([hi, lo]);
      return card(
        `${conference} playoff picture`,
        h('p', { class: 'muted' }, 'If the season ended today.'),
        h('ul', { class: 'seed-list', 'aria-label': `${conference} seeds` }, ...seeds.map((r, i) => li(r.abbr, `${seeded(i + 1, r.abbr, standings)}${i < byes ? ': first-round bye' : ''}`))),
        games.length ? h('h3', { class: 'label' }, 'Wild Card matchups') : null,
        games.length ? h('ul', { class: 'matchup-list' }, ...games.map(([hi, lo]) => {
          const home = seeds[hi] as Ranked;
          const away = seeds[lo] as Ranked;
          return h('li', { class: home.abbr === user || away.abbr === user ? 'is-us' : null }, `${seeded(lo + 1, away.abbr, standings)} at ${seeded(hi + 1, home.abbr, standings)}`);
        })) : null,
        conf?.rest.length ? h('h3', { class: 'label' }, 'In the hunt') : null,
        conf?.rest.length ? h('ul', { class: 'matchup-list' }, ...conf.rest.slice(0, 4).map(r => li(r.abbr, `${nick(r.abbr)}, ${winLoss(standings.table.records[r.abbr].overall)}`))) : null
      ); // prettier-ignore
    })
  );
}

/** "AFC · " for a game inside a conference; nothing for the Super Bowl. */
const conferenceOf = (home: TeamAbbr, away: TeamAbbr): string =>
  teamInfo(home).conf === teamInfo(away).conf ? `${teamInfo(home).conf} · ` : '';

/** The bracket once the playoffs are seeded: every round's games, with scores once played. */
function bracket(league: League): HTMLElement {
  const seeds = league.season.seeds;
  const weeks = league.rules.season.weeks;
  const seedOf = (abbr: TeamAbbr): number => {
    for (const c of CONFERENCES) {
      const i = seeds?.[c].indexOf(abbr) ?? -1;
      if (i >= 0) return i + 1;
    }
    return 0;
  };
  const rounds = PLAYOFF_PHASES.map((phase, i) => ({
    label: PHASE_LABELS[phase],
    games: league.schedule.filter(g => g.week === weeks + i + 1)
  }));
  return card(
    'Playoff bracket',
    league.season.champion
      ? h('p', { class: 'hero-title' }, `The ${nick(league.season.champion)} are champions.`)
      : null,
    h(
      'div',
      { class: 'bracket-wrap' },
      h(
        'div',
        { class: 'bracket' },
        ...rounds.map(round =>
          h(
            'section',
            { class: 'bracket-round', 'aria-label': round.label },
            h('h3', { class: 'label' }, round.label),
            round.games.length
              ? h(
                  'ul',
                  { class: 'game-list' },
                  ...round.games.map(g =>
                    gameCard(league, g, { seedOf, prefix: conferenceOf(g.home, g.away) })
                  )
                )
              : h('p', { class: 'empty' }, 'Not set yet.')
          )
        )
      )
    )
  );
}

function standingsPanel(league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const standings = leagueStandings(league);
  const body = h('div', { class: 'stack' });
  const draw = () =>
    mount(
      body,
      choice.standings === 'divisions' ? divisionsView(standings, user) : conferencesView(standings, user)
    );
  const views = h(
    'fieldset',
    { class: 'view-switch' },
    h('legend', { class: 'field-label' }, 'Show'),
    h(
      'div',
      { class: 'seg' },
      ...STANDINGS_VIEWS.map(v => {
        const input = h('input', {
          type: 'radio',
          id: `standings-${v.id}`,
          name: 'standingsView',
          value: v.id,
          checked: v.id === choice.standings
        });
        input.addEventListener('change', () => {
          choice.standings = v.id;
          draw();
        });
        return h('label', null, input, v.label);
      })
    )
  );
  draw();
  const played = Object.values(league.season.results).some(g => !g.playoff);
  return h(
    'div',
    { class: 'stack' },
    views,
    played ? null : h('p', { class: 'muted' }, 'No games have been played yet, so every club is 0–0.'),
    body
  );
}

/** The playoff picture while the regular season runs, then the bracket. */
function playoffsPanel(league: League): HTMLElement {
  const standings = leagueStandings(league);
  const user = league.meta.start.userTeam;
  return league.season.seeds ? bracket(league) : projectedPicture(standings, user);
}

/** The week the schedule opens on: this week, or the last one once the season is over. */
function currentWeek(league: League): number {
  const weeks = [...new Set(league.schedule.map(g => g.week))].sort((a, b) => a - b);
  return gameWeek(league) ?? weeks.at(-1) ?? 1;
}

/** Schedule and results (spec 19.3): one week's games league-wide, or one club's season. */
function schedulePanel(league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const weeks = [...new Set(league.schedule.map(g => g.week))].sort((a, b) => a - b);
  if (choice.week !== null && !weeks.includes(choice.week)) choice.week = null;
  const week = h(
    'select',
    { class: 'select', id: 'scheduleWeek' },
    ...weeks.map(w => h('option', { value: String(w) }, weekLabel(league, w)))
  );
  const others = TEAM_ABBRS.filter(t => t !== user).sort((a, b) => nick(a).localeCompare(nick(b)));
  const team = h(
    'select',
    { class: 'select', id: 'scheduleTeam' },
    h('option', { value: 'all' }, 'All teams'),
    h('option', { value: user }, `${nick(user)} (your team)`),
    ...others.map(t => h('option', { value: t }, nick(t)))
  );
  const weekField = h('div', { class: 'field' }, h('label', { for: 'scheduleWeek' }, 'Week'), week);
  const body = h('div', { class: 'stack' });
  const status = h('p', { class: 'sr-only', role: 'status' });
  const draw = (announce: boolean) => {
    const shownWeek = choice.week ?? currentWeek(league);
    week.value = String(shownWeek);
    team.value = choice.team;
    // One club's season lists every week, so the week choice steps aside.
    weekField.hidden = choice.team !== 'all';
    if (choice.team === 'all') {
      const games = league.schedule.filter(g => g.week === shownWeek);
      const playing = new Set(games.flatMap(g => [g.home, g.away]));
      const byes = shownWeek <= league.rules.season.weeks ? TEAM_ABBRS.filter(t => !playing.has(t)).map(nick).sort() : [];
      mount(
        body,
        games.length ? h('ul', { class: 'game-list', 'aria-label': `${weekLabel(league, shownWeek)} games` }, ...games.map(g => gameCard(league, g))) : h('p', { class: 'empty' }, 'No games this week.'),
        byes.length ? h('p', { class: 'muted' }, `Byes: ${byes.join(', ')}.`) : null
      );
      if (announce) status.textContent = `${weekLabel(league, shownWeek)}: ${games.length} ${games.length === 1 ? 'game' : 'games'}.`;
    } else {
      const club = choice.team;
      const games = league.schedule.filter(g => g.home === club || g.away === club).length;
      mount(body, h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('team', { abbr: club, tab: 'roster' }) }, `${nick(club)} team page`)), clubSeason(league, club));
      if (announce) status.textContent = `${nick(club)} schedule: ${games} games.`;
    }
  }; // prettier-ignore
  week.addEventListener('change', () => {
    choice.week = Number(week.value);
    draw(true);
  });
  team.addEventListener('change', () => {
    choice.team = team.value === 'all' ? 'all' : (team.value as TeamAbbr);
    draw(true);
  });
  draw(false);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'filterbar' },
      weekField,
      h('div', { class: 'field' }, h('label', { for: 'scheduleTeam' }, 'Team'), team)
    ),
    status,
    body
  );
}

const AWARD_WORDS = { offense: 'offense', defense: 'defense', special: 'special teams' } as const;

/** The news feed (spec 18.1): a week's stories, most newsworthy first, and its players of the week. */
function newsPanel(league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const weeks = [
    ...new Set([...league.season.news.map(n => n.week), ...league.season.awards.map(a => a.week)])
  ].sort((a, b) => b - a);
  if (!weeks.length)
    return h('p', { class: 'empty' }, "The week's biggest stories appear here once games are played.");
  if (choice.newsWeek !== null && !weeks.includes(choice.newsWeek)) choice.newsWeek = null;
  const week = h(
    'select',
    { class: 'select', id: 'newsWeek' },
    ...weeks.map(w => h('option', { value: String(w) }, weekLabel(league, w)))
  );
  const mine = h('input', { type: 'checkbox', id: 'newsMine', checked: choice.newsMine });
  const body = h('div', { class: 'stack' });
  const status = h('p', { class: 'sr-only', role: 'status' });
  const draw = (announce: boolean) => {
    const shown = choice.newsWeek ?? weeks[0] ?? 1;
    week.value = String(shown);
    const stories = league.season.news.filter(n => n.week === shown && n.kind !== 'award' && (!choice.newsMine || n.teams.includes(user))).sort((a, b) => b.score - a.score);
    const awards = league.season.awards.filter(a => a.week === shown && (!choice.newsMine || a.team === user));
    const award = (a: (typeof awards)[number]) => {
      const p = league.players[a.playerId];
      const label = a.category === 'rookie' ? 'Rookie' : `${a.conference} ${AWARD_WORDS[a.category]}`;
      return h('li', null, `${label}: `, p ? playerLink(p) : 'A former player', `, ${nick(a.team)}: ${a.line}.`);
    };
    mount(
      body,
      card(`News: ${weekLabel(league, shown)}`, stories.length ? h('ul', { class: 'preview-list news-list' }, ...stories.map(n => h('li', null, n.headline))) : h('p', { class: 'empty' }, choice.newsMine ? `No stories about the ${nick(user)} this week.` : 'No stories this week.')),
      awards.length ? card('Players of the week', h('ul', { class: 'plain-list' }, ...awards.map(award))) : null
    );
    if (announce) status.textContent = `${weekLabel(league, shown)}: ${stories.length} ${stories.length === 1 ? 'story' : 'stories'}.`;
  }; // prettier-ignore
  week.addEventListener('change', () => {
    choice.newsWeek = Number(week.value);
    draw(true);
  });
  mine.addEventListener('change', () => {
    choice.newsMine = mine.checked;
    draw(true);
  });
  draw(false);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'filterbar' },
      h('div', { class: 'field' }, h('label', { for: 'newsWeek' }, 'Week'), week),
      h('label', { class: 'check-target check-left' }, mine, `Only the ${nick(user)}`)
    ),
    status,
    body
  );
}

const TAB_LABELS: Record<LeagueTab, string> = {
  standings: 'Standings',
  playoffs: 'Playoffs',
  schedule: 'Schedule',
  stats: 'Stats',
  news: 'News'
};
const PANELS: Record<LeagueTab, (league: League, app: AppState) => Child> = {
  standings: standingsPanel,
  playoffs: playoffsPanel,
  schedule: schedulePanel,
  stats: (league, app) => statsPanel(app, league),
  news: newsPanel
};

export const isLeagueTab = (tab: string | undefined): tab is LeagueTab =>
  (LEAGUE_TABS as readonly string[]).includes(tab ?? '');

export function leagueScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'League',
    dispose: () => off?.(),
    render: ({ app, route }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      if (isLeagueTab(route.params.tab)) choice.tab = route.params.tab;
      let shown: League | null = null;
      off = app.onChange(() => {
        if (!app.league || app.league === shown) return;
        // A week played in the background: rebuild, keeping focus on the same control, even one that comes
        // back only when its panel's data loads; failing that, on the tab panel.
        const key = focusKeyOf(view);
        build();
        refocusWhenReady(view, key, () => view.querySelector<HTMLElement>('[role="tabpanel"]')?.focus());
      });
      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shown = league;
        const leagueTabs = tabs(
          'League',
          LEAGUE_TABS.map(id => ({ id: `league-${id}`, label: TAB_LABELS[id], render: () => h('div', null, PANELS[id](league, app)) })),
          `league-${choice.tab}`,
          id => {
            const tab = id.replace('league-', '');
            if (!isLeagueTab(tab)) return;
            choice.tab = tab;
            // The address names the tab, so Back from a player or a game returns to it.
            history.replaceState(null, '', href('leagueTab', { tab }));
          }
        ); // prettier-ignore
        mount(view, pageHead('League', String(league.season.season)), leagueTabs.element);
      };
      build();
      return view;
    }
  };
}
