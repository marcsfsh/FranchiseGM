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
import { CATEGORY_TITLES, STAT_COLUMNS } from '../ui/stat-columns';
import { scrollRegion, statCell, statHeader, statKey } from '../ui/stat-table';
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

/** The line score: points by quarter (and overtime) for each team. */
function lineScore(record: GameRecord): HTMLElement {
  const periods = Math.max(record.quarters.home.length, record.quarters.away.length);
  const row = (abbr: TeamAbbr, points: readonly number[], total: number) =>
    h('tr', null, h('th', { scope: 'row' }, nick(abbr)), ...Array.from({ length: periods }, (_, i) => h('td', { class: 'num' }, String(points[i] ?? 0))), h('td', { class: 'num' }, h('strong', null, String(total)))); // prettier-ignore
  return h(
    'table',
    { class: 'stat-table line-score' },
    h('caption', { class: 'sr-only' }, 'Points by quarter'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Team'), ...Array.from({ length: periods }, (_, i) => statHeader(shortQuarter(i + 1), quarterName(i + 1))), statHeader('T', 'Total'))),
    h('tbody', null, row(record.away, record.quarters.away, record.score.away), row(record.home, record.quarters.home, record.score.home))
  ); // prettier-ignore
}

function weatherText(record: GameRecord): string {
  const w = record.weather;
  if (w.indoor) return 'Indoors';
  const sky = w.precipitation === 'rain' ? 'rain' : w.precipitation === 'snow' ? 'snow' : 'dry';
  return `${w.tempF}°F, wind ${w.windMph} mph, ${sky}`;
}

function scoringSummary(record: GameRecord): HTMLElement {
  if (!record.scoring.length) return h('p', { class: 'empty' }, 'Neither team scored.');
  const table = h(
    'table',
    { class: 'stat-table scoring-table' },
    h('caption', { class: 'sr-only' }, 'Scoring summary'),
    h('thead', null, h('tr', null, statHeader('Qtr', 'Quarter', false), statHeader('Time', 'Time left in the quarter', false), h('th', { scope: 'col' }, 'Team'), h('th', { scope: 'col' }, 'Play'), statHeader(record.away, `${nick(record.away)} score`), statHeader(record.home, `${nick(record.home)} score`))),
    h('tbody', null, ...record.scoring.map((s: ScoringPlay) => h('tr', null, h('td', null, shortQuarter(s.quarter)), h('td', null, clock(s.clock)), h('th', { scope: 'row' }, nick(s.team)), h('td', null, s.description), h('td', { class: 'num' }, String(s.away)), h('td', { class: 'num' }, String(s.home)))))
  ); // prettier-ignore
  return scrollRegion('Scoring summary', table);
}

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
  return h(
    'table',
    { class: 'stat-table team-stats' },
    h('caption', { class: 'sr-only' }, 'Team stats'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Stat'), h('th', { scope: 'col', class: 'num' }, nick(record.away)), h('th', { scope: 'col', class: 'num' }, nick(record.home)))),
    h('tbody', null, ...rows.map(([label, value]) => h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'num' }, value(a)), h('td', { class: 'num' }, value(b)))))
  ); // prettier-ignore
}

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
  const columns = STAT_COLUMNS[category];
  const table = h(
    'table',
    { class: 'stat-table' },
    h('caption', null, CATEGORY_TITLES[category]),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Player'), ...columns.map(c => statHeader(c.label, c.title)))),
    h('tbody', null, ...rows.map(l => {
      const p = league.players[l.row.playerId];
      return h('tr', null, h('th', { scope: 'row' }, p ? playerLink(p) : 'Former player'), ...columns.map(c => statCell(c.value(l.row.values), c.format)));
    }))
  );
  return scrollRegion(`${nick(abbr)} ${CATEGORY_TITLES[category].toLowerCase()}`, table);
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
      : [h('p', { class: 'empty' }, "The player lines couldn't be read from this browser's storage.")])
  );
}

function drivesPanel(record: GameRecord): HTMLElement {
  if (!record.drives.length)
    return card('Drives', h('p', { class: 'empty' }, 'No drives are stored for this game.'));
  const table = h(
    'table',
    { class: 'stat-table drive-table' },
    h('caption', { class: 'sr-only' }, 'Drive summaries'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Team'), statHeader('Qtr', 'Quarter', false), statHeader('Start', 'Time left when the drive began', false), statHeader('Field', 'Starting field position', false), statHeader('Plays', 'Plays'), statHeader('Yds', 'Yards'), statHeader('Time', 'Time of possession'), h('th', { scope: 'col' }, 'Result'))),
    h('tbody', null, ...record.drives.map((d: DriveSummary) => {
      const other = d.team === record.home ? record.away : record.home;
      return h('tr', null, h('th', { scope: 'row' }, nick(d.team)), h('td', null, shortQuarter(d.quarter)), h('td', null, clock(d.clock)), h('td', null, yardLine(d.start, d.team, other)), h('td', { class: 'num' }, String(d.plays)), h('td', { class: 'num' }, String(d.yards)), h('td', { class: 'num' }, clock(d.seconds)), h('td', null, DRIVE_RESULTS[d.result]));
    }))
  ); // prettier-ignore
  return card('Drive summaries', scrollRegion('Drive summaries', table));
}

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
      mount(view, game ? heading(league, game.away, game.home, game.season, game.week) : pageHead('Game'), back, body);
      void app.store.history.game(league.meta.id, id).then(
        async record => {
          if (!record) {
            if (game) mount(body, card('Details', h('p', { class: 'empty' }, "This game's details aren't stored.")));
            else missing("This game isn't on the schedule or in the league's history.");
            return;
          }
          const lines = await app.store.history.gameLines(league.meta.id, record.season, id).catch(() => null);
          mount(view, heading(league, record.away, record.home, record.season, record.week), back, body);
          mount(body, ...played(league, game, record, lines));
        },
        () => mount(body, card('Details', h('p', { class: 'empty' }, "This game's details couldn't be read from this browser's storage. Reload the page to try again.")))
      );
      return view;
    }
  };
} // prettier-ignore
