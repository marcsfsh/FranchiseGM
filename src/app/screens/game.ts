/**
 * A game's page (spec 8.8, 19.3): the line score, then tabs for the recap with the scoring summary and
 * injuries, the box score (team totals and every player's lines), and the drive summaries. Details come
 * from stored history; a game not yet played shows a preview.
 */
import type { ScheduledGame } from '../../data/schedule';
import { venueById } from '../../data/stadiums';
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../../engine/league/types';
import { PENALTY_IDS } from '../../engine/rules/ruleset';
import { leagueStandings } from '../../engine/season/state';
import type { TeamTotals } from '../../engine/sim/stats';
import type { DriveResult, DriveSummary, InjuryEvent, ScoringPlay } from '../../engine/sim/types';
import { CATEGORY_IDS, type CategoryId } from '../../engine/stats/categories';
import type { GameLine, GameRecord } from '../../engine/stats/record';
import { h, mount, type Child } from '../dom';
import { gameDay, kickoff, record } from '../format';
import { href } from '../router';
import { nick, weekLabel } from '../ui/games';
import { playerLink } from '../ui/players';
import { CATEGORY_TITLES, formatStat, STAT_COLUMNS } from '../ui/stat-columns';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { spoken } from '../ui/sort-rows';
import { sortableStats, statKey } from '../ui/stat-table';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import type { Screen } from './types';

type GameTab = 'summary' | 'box' | 'drives';
/** The tab last chosen, kept for the session. */
let chosen: GameTab = 'summary';

const QUARTERS = ['first quarter', 'second quarter', 'third quarter', 'fourth quarter'];
/** "Quarter 2" for headers; `inText` gives "the second quarter" or "overtime". */
const quarterName = (q: number): string => (q > 4 ? 'Overtime' : `Quarter ${q}`);
const quarterInText = (q: number): string =>
  q > 4 ? 'overtime' : `the ${QUARTERS[q - 1] ?? `quarter ${q}`}`;
const shortQuarter = (q: number): string => (q > 4 ? 'OT' : `Q${q}`);
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** A yard line from the offense's own goal line: "MIN 25", "50", "GB 40". */
function yardLine(start: number, offense: TeamAbbr, defense: TeamAbbr): string {
  if (start === 50) return '50';
  return start < 50 ? `${offense} ${start}` : `${defense} ${100 - start}`;
}

const DRIVE_RESULTS: Record<DriveResult, string> = {
  touchdown: 'Touchdown',
  fieldGoal: 'Field goal',
  missedFieldGoal: 'Missed field goal',
  punt: 'Punt',
  interception: 'Interception',
  fumble: 'Fumble',
  downs: 'Turnover on downs',
  safety: 'Safety',
  endOfHalf: 'End of half',
  endOfGame: 'End of game'
};

interface Side {
  abbr: TeamAbbr;
  points: readonly number[];
  total: number;
}

/** The line score: points by quarter (and overtime) for each team. */
function lineScore(record: GameRecord): HTMLElement {
  const periods = Math.max(record.quarters.home.length, record.quarters.away.length);
  const sides: Side[] = [
    { abbr: record.away, points: record.quarters.away, total: record.score.away },
    { abbr: record.home, points: record.quarters.home, total: record.score.home }
  ];
  const columns: TableColumn<Side>[] = [
    { id: 'team', label: 'Team', name: 'team', type: 'text', value: s => nick(s.abbr), cell: s => h('th', { scope: 'row' }, nick(s.abbr)) },
    ...Array.from({ length: periods }, (_, i): TableColumn<Side> => ({ id: `q${i + 1}`, label: shortQuarter(i + 1), title: quarterName(i + 1), name: spoken(quarterName(i + 1)), type: 'number', numeric: true, value: s => s.points[i] ?? 0, cell: s => h('td', { class: 'num' }, String(s.points[i] ?? 0)) })),
    { id: 'total', label: 'T', title: 'Total', name: 'total', type: 'number', numeric: true, value: s => s.total, cell: s => h('td', { class: 'num' }, h('strong', null, String(s.total))) }
  ];
  return sortableTable({ key: 'game.lineScore', name: 'line score', caption: 'Points by quarter', captionClass: 'sr-only', className: 'stat-table line-score', columns, rows: sides, rowId: s => s.abbr, defaultOrder: 'with the visitors first', scroll: true }).element;
} // prettier-ignore

function weatherText(record: GameRecord): string {
  const w = record.weather;
  if (w.indoor) return 'Indoors';
  const sky = w.precipitation === 'rain' ? 'rain' : w.precipitation === 'snow' ? 'snow' : 'dry';
  return `${w.tempF}°F, wind ${w.windMph} mph, ${sky}`;
}

function scoringSummary(record: GameRecord): HTMLElement {
  if (!record.scoring.length) return h('p', { class: 'empty' }, 'Neither team scored.');
  const order = new Map(record.scoring.map((s, i) => [s, i]));
  const columns: TableColumn<ScoringPlay>[] = [
    { id: 'quarter', label: 'Qtr', title: 'Quarter', name: 'quarter', type: 'number', first: 'asc', value: s => s.quarter, cell: s => h('td', null, shortQuarter(s.quarter)) },
    { id: 'time', label: 'Time', title: 'Time left in the quarter', name: 'time left in the quarter', type: 'number', value: s => s.clock, cell: s => h('td', null, clock(s.clock)) },
    { id: 'team', label: 'Team', name: 'team', type: 'text', value: s => nick(s.team), cell: s => h('th', { scope: 'row' }, nick(s.team)) },
    { id: 'play', label: 'Play', name: 'play', type: 'text', value: s => s.description, cell: s => h('td', { class: 'play' }, s.description) },
    { id: 'away', label: record.away, title: `${nick(record.away)} score`, name: `${nick(record.away)} score`, type: 'number', numeric: true, value: s => s.away, cell: s => h('td', { class: 'num' }, String(s.away)) },
    { id: 'home', label: record.home, title: `${nick(record.home)} score`, name: `${nick(record.home)} score`, type: 'number', numeric: true, value: s => s.home, cell: s => h('td', { class: 'num' }, String(s.home)) }
  ];
  return sortableTable({ key: 'game.scoring', name: 'scoring summary', caption: 'Scoring summary', captionClass: 'sr-only', className: 'stat-table scoring-table', columns, rows: record.scoring, rowId: s => String(order.get(s) ?? 0).padStart(3, '0'), defaultOrder: 'in the order they happened', scroll: true }).element;
} // prettier-ignore

function injuryList(league: League, record: GameRecord): HTMLElement | null {
  if (!record.injuries.length && !record.ejections.length) return null;
  const who = (id: string, team: TeamAbbr): Child[] => {
    const p = league.players[id];
    return [p ? playerLink(p) : 'A former player', ` (${nick(team)})`];
  };
  const injury = (i: InjuryEvent) =>
    h('li', null, ...who(i.playerId, i.team), `, ${i.bodyPart}, in ${quarterInText(i.quarter)}: ${i.weeks > 0 ? `expected out ${i.weeks} ${i.weeks === 1 ? 'week' : 'weeks'}` : 'minor, no time missed'}.`); // prettier-ignore
  const ejection = (e: GameRecord['ejections'][number]) =>
    h('li', null, ...who(e.playerId, e.team), `, ejected in ${quarterInText(e.quarter)} for ${league.rules.game.penalties[e.penalty].name.toLowerCase()}.`); // prettier-ignore
  return h('ul', { class: 'plain-list' }, ...record.injuries.map(injury), ...record.ejections.map(ejection));
}

function summaryPanel(league: League, record: GameRecord): HTMLElement {
  const injuries = injuryList(league, record);
  return h(
    'div',
    { class: 'stack' },
    card('Recap', ...record.recap.map(p => h('p', null, p))),
    card('Scoring summary', scoringSummary(record)),
    injuries ? card(record.ejections.length ? 'Injuries and ejections' : 'Injuries', injuries) : null
  );
}

/** Team totals side by side (spec 9.2 team game stats). */
function teamStats(record: GameRecord): HTMLElement {
  const a = record.totals.away;
  const b = record.totals.home;
  const rows: [string, (t: TeamTotals) => string][] = [
    ['First downs', t => String(t.firstDowns)],
    ['Third downs', t => `${t.thirdDownConv} of ${t.thirdDownAtt}`],
    ['Fourth downs', t => `${t.fourthDownConv} of ${t.fourthDownAtt}`],
    ['Total plays', t => String(t.plays)],
    ['Total yards', t => String(t.totalYards)],
    ['Net passing yards', t => String(t.netPassYds)],
    ['Completions and attempts', t => `${t.passCmp} of ${t.passAtt}`],
    ['Sacked, yards lost', t => `${t.sacked}, ${t.sackYds}`],
    ['Rushing yards', t => String(t.rushYds)],
    ['Carries', t => String(t.rushAtt)],
    ['Red zone touchdowns', t => `${t.redZoneTd} of ${t.redZoneTrips}`],
    ['Turnovers', t => String(t.turnovers)],
    ['Penalties, yards', t => `${t.penalties}, ${t.penaltyYds}`],
    ['Time of possession', t => clock(t.timeOfPossession)]
  ];
  // Each figure sorts by its first number, or by the seconds in a clock time.
  const numberIn = (text: string): number | null => {
    const time = /^(\d+):(\d+)$/.exec(text);
    if (time) return Number(time[1]) * 60 + Number(time[2]);
    const first = /\d+/.exec(text);
    return first ? Number(first[0]) : null;
  };
  type Line = (typeof rows)[number];
  const side = (id: 'away' | 'home', abbr: TeamAbbr, totals: TeamTotals): TableColumn<Line> =>
    ({ id, label: nick(abbr), name: nick(abbr), type: 'number', numeric: true, value: ([, value]) => numberIn(value(totals)), cell: ([, value]) => h('td', { class: 'num' }, value(totals)) });
  const columns: TableColumn<Line>[] = [
    { id: 'stat', label: 'Stat', name: 'stat', type: 'text', value: ([label]) => label, cell: ([label]) => h('th', { scope: 'row' }, label) },
    side('away', record.away, a),
    side('home', record.home, b)
  ];
  return sortableTable({ key: 'game.teamStats', name: 'team stats', caption: 'Team stats', captionClass: 'sr-only', className: 'stat-table team-stats', columns, rows, rowId: ([label]) => label, defaultOrder: 'in the box score order' }).element;
} // prettier-ignore

/** How each category's lines are ordered: the most involved players first. */
const WEIGHT: Record<CategoryId, (v: Readonly<Record<string, number>>) => number> = {
  passing: v => v.passAtt ?? 0,
  rushing: v => v.rushAtt ?? 0,
  receiving: v => (v.receptions ?? 0) * 1000 + (v.recYds ?? 0),
  blocking: v => v.runBlockSnaps ?? 0,
  defense: v => (v.soloTackles ?? 0) + (v.assistedTackles ?? 0),
  kicking: v => (v.fgAtt ?? 0) + (v.xpAtt ?? 0) + (v.kickoffs ?? 0),
  punting: v => v.punts ?? 0,
  returns: v => (v.kickReturns ?? 0) + (v.puntReturns ?? 0),
  scoring: v => v.twoPointMade ?? 0,
  participation: v => (v.snapsOffense ?? 0) + (v.snapsDefense ?? 0) + (v.snapsSpecial ?? 0)
};

/** Categories shown at once; blocking and snap counts sit behind a disclosure. */
const MORE: readonly CategoryId[] = ['blocking', 'participation'];

/** One category's lines for a team, most involved player first. */
function categoryTable(league: League, abbr: TeamAbbr, category: CategoryId, lines: readonly GameLine[]): HTMLElement | null {
  const rows = lines.filter(l => l.table === category).sort((x, y) => WEIGHT[category](y.row.values) - WEIGHT[category](x.row.values) || (x.row.playerId < y.row.playerId ? -1 : 1));
  if (!rows.length) return null;
  const player = (l: GameLine) => league.players[l.row.playerId];
  const columns: TableColumn<GameLine>[] = [
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: l => { const p = player(l); return p ? `${p.lastName} ${p.firstName}` : null; }, cell: l => { const p = player(l); return h('th', { scope: 'row' }, p ? playerLink(p) : 'Former player'); } },
    ...sortableStats<GameLine>(STAT_COLUMNS[category], l => l.row.values)
  ];
  return sortableTable({ key: `game.${category}`, name: `${nick(abbr)} ${CATEGORY_TITLES[category].toLowerCase()}`, caption: CATEGORY_TITLES[category], className: 'stat-table', columns, rows, rowId: l => l.row.playerId, defaultOrder: 'with the most involved players first', scroll: true }).element;
} // prettier-ignore

/** One team's player lines, a table per category, and its accepted fouls. */
function teamBox(league: League, abbr: TeamAbbr, lines: readonly GameLine[]): HTMLElement {
  const mine = lines.filter(l => l.row.team === abbr);
  const tables = (categories: readonly CategoryId[]) =>
    categories.flatMap(c => categoryTable(league, abbr, c, mine) ?? []);
  const main = tables(CATEGORY_IDS.filter(c => !MORE.includes(c)));
  const more = tables(MORE);
  const fouls = mine.filter(l => l.table === 'penalties');
  const foulList = fouls.length
    ? h('div', { class: 'stack' }, h('h3', { class: 'label' }, 'Penalties'), h('ul', { class: 'plain-list' }, ...fouls.map(l => {
        const p = league.players[l.row.playerId];
        const id = PENALTY_IDS[l.row.values.penaltyType ?? 0] ?? 'falseStart';
        return h('li', null, p ? playerLink(p) : 'Former player', `: ${league.rules.game.penalties[id].name.toLowerCase()}, ${l.row.values.penaltyYds ?? 0} yards`);
      }))) // prettier-ignore
    : null;
  return card(
    `${nick(abbr)} box score`,
    ...(main.length ? main : [h('p', { class: 'empty' }, 'No player lines are stored for this team.')]),
    more.length
      ? h(
          'details',
          { class: 'box-more' },
          h('summary', null, 'Blocking and snaps'),
          h('div', { class: 'stack' }, ...more)
        )
      : null,
    foulList
  );
}

/** The team whose lines the box score shows, kept for the session; null picks the user's team or the visitors. */
let boxTeam: TeamAbbr | null = null;

function boxPanel(league: League, record: GameRecord, lines: readonly GameLine[] | null): HTMLElement {
  const columns = CATEGORY_IDS.flatMap(c => STAT_COLUMNS[c]);
  const user = league.meta.start.userTeam;
  const sides = [record.away, record.home];
  const first = boxTeam && sides.includes(boxTeam) ? boxTeam : sides.includes(user) ? user : record.away;
  const body = h('div', { class: 'stack' });
  const draw = (abbr: TeamAbbr) => {
    if (lines) mount(body, teamBox(league, abbr, lines), statKey(columns));
  };
  const picker = h(
    'fieldset',
    { class: 'view-switch' },
    h('legend', { class: 'field-label' }, 'Players'),
    h('div', { class: 'seg' }, ...sides.map(abbr => {
      const input = h('input', { type: 'radio', id: `box-${abbr}`, name: 'boxTeam', value: abbr, checked: abbr === first });
      input.addEventListener('change', () => {
        boxTeam = abbr;
        draw(abbr);
      });
      return h('label', null, input, nick(abbr));
    }))
  ); // prettier-ignore
  draw(first);
  return h(
    'div',
    { class: 'stack' },
    card('Team stats', teamStats(record)),
    ...(lines
      ? [picker, body]
      : [
          h(
            'p',
            { class: 'empty' },
            "The player lines couldn't be read from this browser's storage. Reload the page to try again."
          )
        ])
  );
}

function drivesPanel(record: GameRecord): HTMLElement {
  if (!record.drives.length)
    return card('Drives', h('p', { class: 'empty' }, 'No drives are stored for this game.'));
  const order = new Map(record.drives.map((d, i) => [d, i]));
  const other = (d: DriveSummary) => (d.team === record.home ? record.away : record.home);
  const columns: TableColumn<DriveSummary>[] = [
    { id: 'team', label: 'Team', name: 'team', type: 'text', value: d => nick(d.team), cell: d => h('th', { scope: 'row' }, nick(d.team)) },
    { id: 'quarter', label: 'Qtr', title: 'Quarter', name: 'quarter', type: 'number', first: 'asc', value: d => d.quarter, cell: d => h('td', null, shortQuarter(d.quarter)) },
    { id: 'start', label: 'Start', title: 'Time left when the drive began', name: 'time left when the drive began', type: 'number', value: d => d.clock, cell: d => h('td', null, clock(d.clock)) },
    { id: 'field', label: 'Field', title: 'Starting field position', name: 'starting field position', type: 'number', value: d => d.start, cell: d => h('td', null, yardLine(d.start, d.team, other(d))) },
    { id: 'plays', label: 'Plays', name: 'plays', type: 'number', numeric: true, value: d => d.plays, cell: d => h('td', { class: 'num' }, String(d.plays)) },
    { id: 'yards', label: 'Yds', title: 'Yards', name: 'yards', type: 'number', numeric: true, value: d => d.yards, cell: d => h('td', { class: 'num' }, formatStat(d.yards, 'int')) },
    { id: 'time', label: 'Time', title: 'Time of possession', name: 'time of possession', type: 'number', numeric: true, value: d => d.seconds, cell: d => h('td', { class: 'num' }, clock(d.seconds)) },
    { id: 'result', label: 'Result', name: 'result', type: 'text', value: d => DRIVE_RESULTS[d.result], cell: d => h('td', null, DRIVE_RESULTS[d.result]) }
  ];
  const table = sortableTable({ key: 'game.drives', name: 'drive summaries', caption: 'Drive summaries', captionClass: 'sr-only', className: 'stat-table drive-table', columns, rows: record.drives, rowId: d => String(order.get(d) ?? 0).padStart(3, '0'), defaultOrder: 'in the order they happened', scroll: true });
  return card('Drive summaries', table.element);
} // prettier-ignore

/** Before kickoff: when and where, and both records. */
function preview(league: League, game: ScheduledGame): HTMLElement {
  const records = leagueStandings(league).table.records;
  const user = league.meta.start.userTeam;
  const venue = venueById(game.venue);
  const winLoss = (abbr: TeamAbbr) => {
    const r = records[abbr].overall;
    return record(r.wins, r.losses, r.ties);
  };
  return card(
    'Preview',
    h('p', null, `${gameDay(game.date, game.day)} · ${kickoff(game.timeEt)}`),
    h('p', null, `${venue.name}, ${venue.city}`),
    h(
      'p',
      null,
      `${teamFullName(game.away)}: ${winLoss(game.away)} · ${teamFullName(game.home)}: ${winLoss(game.home)}`
    ),
    h('p', { class: 'muted' }, "This game hasn't been played yet."),
    game.home === user || game.away === user
      ? h(
          'div',
          { class: 'btn-row' },
          h('a', { class: 'btn btn-outline', href: href('gameplan') }, 'Set game plan')
        )
      : null
  );
}

function played(
  league: League,
  game: ScheduledGame | undefined,
  record: GameRecord,
  lines: readonly GameLine[] | null
): Node[] {
  // A game from an earlier season has left the schedule, and its venue with it.
  const venue = game ? venueById(game.venue) : null;
  const where = venue ? `${venue.name}, ${venue.city} · ` : '';
  const result = h(
    'section',
    { class: 'card' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, `Final${record.overtime ? ', overtime' : ''}`)),
    h('div', { class: 'card-body' }, lineScore(record), h('p', { class: 'muted' }, `${where}${weatherText(record)}`))
  ); // prettier-ignore
  const gameTabs = tabs(
    'Game',
    [
      { id: 'game-summary', label: 'Recap', render: () => summaryPanel(league, record) },
      { id: 'game-box', label: 'Box score', render: () => boxPanel(league, record, lines) },
      { id: 'game-drives', label: 'Drives', render: () => drivesPanel(record) }
    ],
    `game-${chosen}`,
    id => (chosen = id.replace('game-', '') as GameTab)
  );
  return [result, gameTabs.element];
}

const heading = (league: League, away: TeamAbbr, home: TeamAbbr, season: number, week: number): HTMLElement =>
  pageHead(`${nick(away)} at ${nick(home)}`, `${season} · ${weekLabel(league, week)}`);

export function gameScreen(): Screen {
  return {
    title: 'Game',
    render: ({ app, route }) => {
      const view = h('section', { class: 'view' });
      const league = app.league;
      if (!league) return view;
      const id = route.params.id ?? '';
      const game = league.schedule.find(g => g.id === id);
      const back = h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('leagueTab', { tab: 'schedule' }) }, 'Schedule'));
      const missing = (why: string) => mount(view, pageHead('Game'), back, card('Game not found', h('p', null, why)));
      if (game && !league.season.results[game.id]) {
        mount(view, heading(league, game.away, game.home, game.season, game.week), back, preview(league, game));
        return view;
      }
      // A played game, this season's or an earlier one's: its details come from stored history.
      const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading the box score…'));
      const head = game ? heading(league, game.away, game.home, game.season, game.week) : pageHead('Game', 'History');
      mount(view, head, back, body);
      void app.store.history.game(league.meta.id, id).then(
        async record => {
          if (!record) {
            if (game) mount(body, card('Details', h('p', { class: 'empty' }, "This game's details aren't stored.")));
            else missing("This game isn't on the schedule or in the league's history.");
            return;
          }
          const lines = await app.store.history.gameLines(league.meta.id, record.season, id).catch(() => null);
          // A game from an earlier season names itself once its record loads; the heading keeps its focus.
          if (!game) {
            const title = head.querySelector('h1');
            const tag = head.querySelector('.nameplate-tag');
            if (title) title.textContent = `${nick(record.away)} at ${nick(record.home)}`;
            if (tag) tag.textContent = `${record.season} · ${weekLabel(league, record.week)}`;
          }
          mount(body, ...played(league, game, record, lines));
        },
        () => mount(body, card('Details', h('p', { class: 'empty' }, "This game's details couldn't be read from this browser's storage. Reload the page to try again.")))
      );
      return view;
    }
  };
} // prettier-ignore
