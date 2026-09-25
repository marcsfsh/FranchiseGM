/**
 * Team hub (spec 19.2, style guide 7.6): in order, the next game and game plan with the advance controls,
 * roster and injuries, the inbox, the news, and the division standings with the playoff picture. An advance
 * keeps running if the user leaves the screen; coming back shows its progress.
 */
import { superBowlName } from '../../data/super-bowl';
import { TEAM_COLORS, teamFullName, type TeamAbbr } from '../../data/team-colors';
import { team as teamInfo } from '../../data/teams';
import type { League } from '../../engine/league/types';
import { PHASE_LABELS } from '../../engine/model/calendar';
import type { Player } from '../../engine/model/player';
import type { InboxItem, InboxKind } from '../../engine/season/inbox';
import { designation } from '../../engine/season/injuries';
import { gameWeek, leagueStandings, PLAYOFF_PHASES } from '../../engine/season/state';
import type { WinLoss } from '../../engine/season/standings';
import { h, type Child } from '../dom';
import { toast } from '../feedback';
import { gameDay, kickoff, record } from '../format';
import { dateLine } from '../shell';
import type { AdvanceTarget, AppState } from '../state';
import { playerLink, tierPlate } from '../ui/players';
import { pageHead } from './common';
import type { Screen } from './types';

/** An advance in progress, kept while the user is elsewhere. */
interface Run {
  controller: AbortController;
  target: AdvanceTarget;
  weeks: number;
}
let run: Run | null = null;
/** The mounted screen, so a running advance can refresh it. */
let view: { refresh(): void; announce(message: string): void } | null = null;

const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;
const winLoss = (r: WinLoss | undefined): string => (r ? record(r.wins, r.losses, r.ties) : record(0, 0));

const INBOX_LABELS: Record<InboxKind, string> = {
  result: 'Game result',
  injury: 'Injury update',
  award: 'Award',
  milestone: 'Milestone',
  playoffs: 'Playoffs'
};

/** A card with a sign bar and an optional arrow link (style guide 11). */
function homeCard(
  title: string,
  options: { arrow?: [string, string]; wide?: boolean },
  ...body: Child[]
): HTMLElement {
  return h(
    'section',
    { class: `card${options.wide ? ' span-2' : ''}` },
    h(
      'div',
      { class: 'signbar' },
      h('h2', { class: 'signbar-title' }, title),
      options.arrow ? h('a', { class: 'signbar-arrow', href: options.arrow[1] }, options.arrow[0]) : null
    ),
    h('div', { class: 'card-body' }, ...body)
  );
}

/** The label for the next advance: "Play week 5", "Play the Wild Card round". */
function nextStepLabel(league: League): string {
  const { phase, week } = league.date;
  return phase === 'regularSeason' ? `Play week ${week}` : `Play the ${PHASE_LABELS[phase]}`;
}

function startAdvance(app: AppState, target: AdvanceTarget): void {
  if (run || !app.league) return;
  const current: Run = { controller: new AbortController(), target, weeks: 0 };
  run = current;
  view?.refresh();
  app
    .advance(
      target,
      (_league, weeks) => {
        current.weeks = weeks;
        view?.refresh();
      },
      current.controller.signal
    )
    .then(
      report => {
        run = null;
        const league = app.league;
        const played = report.weeks === 1 ? 'Played a week' : `Played ${report.weeks} weeks`;
        const paused = report.pauses[0];
        const message = paused
          ? `${played}. Stopped for: ${paused.title}.`
          : report.stopped
            ? `${played}. Stopped as you asked.`
            : league && gameWeek(league) === null && league.season.champion
              ? `${played}. The ${nick(league.season.champion)} won ${superBowlName(league.season.season)}.`
              : `${played}.`;
        if (view) {
          view.refresh();
          view.announce(message);
        } else toast(message);
      },
      (error: unknown) => {
        run = null;
        view?.refresh();
        const reason = error instanceof Error ? error.message : String(error);
        toast(
          `The week couldn't be played: ${reason}. Your league is as it was before the week; try again.`,
          {
            persistent: true
          }
        );
      }
    );
}

function nextGameCard(app: AppState, league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const standings = leagueStandings(league).table.records;
  const plan = league.teams[user].plan.auto ? 'Auto' : 'Custom';
  const next = league.schedule
    .filter(g => (g.home === user || g.away === user) && !league.season.results[g.id])
    .sort((a, b) => a.week - b.week)[0];
  const opponent = next ? (next.home === user ? next.away : next.home) : null;
  const inSeason = gameWeek(league) !== null;
  const weekLabel = next
    ? next.week > league.rules.season.weeks
      ? PHASE_LABELS[PLAYOFF_PHASES[next.week - league.rules.season.weeks - 1] ?? 'wildCard']
      : `Week ${next.week}`
    : '';
  const body: Child[] = [];
  if (next && opponent) {
    body.push(
      h('p', { class: 'label' }, `${weekLabel} · ${next.home === user ? 'Home' : next.siteType === 'home' ? 'Away' : 'Neutral site'}`),
      h('p', { class: 'hero-title' }, teamFullName(opponent)),
      h('p', null, `Your record: ${winLoss(standings[user]?.overall)} · ${nick(opponent)}: ${winLoss(standings[opponent]?.overall)}`),
      h('p', null, `${gameDay(next.date, next.day)} · ${kickoff(next.timeEt)}`),
      h('p', { class: 'muted' }, plan === 'Auto' ? `Game plan: Auto, tailored to the ${nick(opponent)}.` : 'Game plan: Custom.')
    ); // prettier-ignore
  } else if (league.season.champion && !inSeason) {
    body.push(
      h(
        'p',
        { class: 'hero-title' },
        `The ${nick(league.season.champion)} won ${superBowlName(league.season.season)}`
      ),
      h('p', { class: 'muted' }, 'The season is over. The offseason arrives with a later build.')
    );
  } else if (inSeason) {
    body.push(h('p', null, 'Your season is over. The playoffs go on without you.'));
  }

  const actions = h('div', { class: 'btn-row' });
  if (next && opponent)
    actions.append(h('a', { class: 'btn btn-outline', href: '#/game-plan' }, 'Set game plan'));
  if (run) {
    const stop = h(
      'button',
      { class: 'btn btn-outline', type: 'button', 'data-focus': 'stop' },
      'Stop after this week'
    );
    stop.addEventListener('click', () => {
      run?.controller.abort();
      stop.disabled = true;
      view?.announce('Stopping after this week.');
    });
    body.push(
      h('p', { role: 'status', class: 'advance-progress' }, `Playing${run.weeks ? `: ${run.weeks} ${run.weeks === 1 ? 'week' : 'weeks'} done` : '…'}`),
      h('progress', { class: 'progress', 'aria-label': 'Advance progress' })
    ); // prettier-ignore
    actions.append(stop);
  } else if (inSeason) {
    const play = h(
      'button',
      { class: 'btn btn-primary', type: 'button', 'data-focus': 'play' },
      nextStepLabel(league)
    );
    play.addEventListener('click', () => startAdvance(app, 'week'));
    actions.prepend(play);
    const regular = league.date.phase === 'regularSeason';
    const far = h(
      'button',
      { class: 'btn btn-outline', type: 'button', 'data-focus': 'far' },
      regular ? 'Sim to the playoffs' : 'Sim through the Super Bowl'
    );
    far.addEventListener('click', () => startAdvance(app, regular ? 'playoffs' : 'season'));
    actions.append(far);
  }
  body.push(actions);
  return homeCard('Next game and game plan', {}, ...body);
}

const STATUS_WORDS: Record<string, string> = {
  out: 'Out',
  doubtful: 'Doubtful',
  questionable: 'Questionable',
  probable: 'Probable'
};

function rosterCard(league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const active = Object.values(league.players).filter(p => p.team === user && p.status === 'active');
  const onIr = Object.values(league.players).filter(p => p.team === user && p.status === 'ir').length;
  const hurt = active
    .filter(p => designation(p.injury))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  const stars = active
    .filter(p => !designation(p.injury))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(3, 8 - hurt.length));
  const row = (p: Player, status: string) =>
    h('li', null, h('span', { class: 'pos' }, p.position), h('span', { class: 'list-main' }, playerLink(p)), tierPlate(p.ovr), h('span', { class: 'muted' }, status)); // prettier-ignore
  const status = (p: Player) => {
    const d = designation(p.injury);
    const weeks = p.injury?.weeksOut ?? 0;
    return d
      ? `${STATUS_WORDS[d]}${d === 'out' ? `, ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : ''}`
      : 'Healthy';
  };
  return homeCard(
    'Roster and injuries',
    { arrow: ['Open roster', '#/roster'], wide: true },
    h('p', null, `${active.length} active players${onIr ? `, ${onIr} on injured reserve` : ''}. ${hurt.length ? `${hurt.length} hurt.` : 'Nobody hurt.'}`),
    h('ul', { class: 'preview-list', 'aria-label': 'Injured players, then key starters' }, ...hurt.map(p => row(p, status(p))), ...stars.map(p => row(p, 'Healthy'))),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: '#/depth-chart' }, 'Set lineup'))
  ); // prettier-ignore
}

function inboxCard(app: AppState, league: League): HTMLElement {
  const items = [...league.inbox].reverse();
  const unread = items.filter(i => !i.read).length;
  const shown = items.slice(0, 6);
  const markRead = h(
    'button',
    { class: 'btn btn-text', type: 'button', 'data-focus': 'read' },
    'Mark all as read'
  );
  markRead.addEventListener('click', () => {
    if (!unread) {
      view?.announce('No new messages.');
      return;
    }
    app.edit(l => {
      for (const item of l.inbox) item.read = true;
    }, 'inboxRead');
    view?.refresh();
    view?.announce('All messages marked as read.');
  });
  const message = (item: InboxItem) =>
    h(
      'div',
      { class: `inbox-item${item.read ? '' : ' is-unread'}` },
      h('p', { class: 'label' }, `${INBOX_LABELS[item.kind]} · ${weekText(league, item.week)}${item.read ? '' : ' · New'}`),
      h('p', null, h('strong', null, item.title)),
      item.body ? h('p', { class: 'muted' }, item.body) : null
    ); // prettier-ignore
  return homeCard(
    unread ? `Inbox (${unread} new)` : 'Inbox',
    {},
    shown.length ? h('div', null, ...shown.map(message)) : h('p', { class: 'empty' }, 'No messages yet. Results, injuries, and awards for your team arrive here each week.'),
    h('div', { class: 'btn-row' }, markRead)
  ); // prettier-ignore
}

/** "Week 5" or a playoff round's name. */
function weekText(league: League, week: number): string {
  const weeks = league.rules.season.weeks;
  return week > weeks ? PHASE_LABELS[PLAYOFF_PHASES[week - weeks - 1] ?? 'wildCard'] : `Week ${week}`;
}

const CATEGORY_WORDS = { offense: 'Offense', defense: 'Defense', special: 'Special teams' } as const;

function newsCard(league: League): HTMLElement {
  const last = league.season.news.at(-1)?.week;
  const stories = league.season.news.filter(n => n.week === last && n.kind !== 'award');
  const awards = league.season.awards.filter(a => a.week === last);
  const award = (a: (typeof awards)[number]) => {
    const p = league.players[a.playerId];
    return h('li', null, `${a.conference} ${CATEGORY_WORDS[a.category].toLowerCase()}: `, p ? playerLink(p) : '', `, ${nick(a.team)}`);
  }; // prettier-ignore
  return homeCard(
    last ? `News: ${weekText(league, last)}` : 'News',
    {},
    stories.length
      ? h('ul', { class: 'preview-list news-list' }, ...stories.slice(0, 8).map(n => h('li', null, n.headline)))
      : h('p', { class: 'empty' }, "The week's biggest stories appear here once games are played."),
    awards.length ? h('h3', { class: 'label' }, 'Players of the week') : null,
    awards.length ? h('ul', { class: 'preview-list news-list' }, ...awards.map(award)) : null
  ); // prettier-ignore
}

function standingsCards(league: League): HTMLElement[] {
  const user = league.meta.start.userTeam;
  const standings = leagueStandings(league);
  const info = teamInfo(user);
  const division = standings.divisions.find(
    d => d.conference === info.conf && d.division === `${info.conf} ${info.div}`
  );
  const records = standings.table.records;
  const row = (abbr: TeamAbbr, extra?: string) =>
    h('div', { class: `standing-row${abbr === user ? ' is-us' : ''}` }, h('span', null, extra ? `${extra} ${nick(abbr)}` : TEAM_COLORS[abbr].city === 'New York' || TEAM_COLORS[abbr].city === 'Los Angeles' ? teamFullName(abbr) : TEAM_COLORS[abbr].city), h('span', { class: 'num' }, winLoss(records[abbr]?.overall))); // prettier-ignore
  const cards = [
    homeCard(
      'Division standings',
      {},
      division ? h('div', { 'aria-label': `${info.conf} ${info.div} standings` }, ...division.teams.map(t => row(t.abbr))) : h('p', { class: 'empty' }, 'No standings yet.')
    )
  ]; // prettier-ignore
  // The playoff picture from the second half of the season on.
  if (league.date.phase !== 'regularSeason' || league.date.week > league.rules.season.weeks / 2) {
    const conference = standings.conferences.find(c => c.conference === info.conf);
    const seeds = league.season.seeds?.[info.conf].map((abbr, i) => ({ abbr, seed: i + 1 })) ?? conference?.seeds.map((s, i) => ({ abbr: s.abbr, seed: i + 1 })) ?? []; // prettier-ignore
    cards.push(
      homeCard(
        `${info.conf} playoff picture`,
        {},
        h('p', { class: 'muted' }, league.season.seeds ? 'The seeds are set.' : 'If the season ended today.'),
        h('div', null, ...seeds.map(s => row(s.abbr, `${s.seed}.`)))
      )
    );
  }
  return cards;
}

export function homeScreen(): Screen {
  return {
    title: 'Team hub',
    dispose: () => {
      view = null;
    },
    render: ({ app }) => {
      const league = app.league;
      if (!league) return h('section', { class: 'view' }, pageHead('Team hub'));
      const status = h('p', { class: 'sr-only', role: 'status' });
      const cards = h('div', { class: 'cards' });
      const head = pageHead('Team hub', teamFullName(league.meta.start.userTeam));
      const date = h('p', { class: 'label hub-date' }, dateLine(league));
      const draw = () => {
        const l = app.league;
        if (!l) return;
        date.textContent = dateLine(l);
        const active = document.activeElement;
        const key = active instanceof HTMLElement && cards.contains(active) ? active.dataset.focus : undefined;
        cards.replaceChildren(nextGameCard(app, l), rosterCard(l), inboxCard(app, l), newsCard(l), ...standingsCards(l));
        // Keep focus on the control the user was using: the advance buttons hand it to Stop while a run goes
        // and take it back when it ends; a disabled button hands it to the play button.
        if (key) {
          const wanted = key === 'play' || key === 'far' ? (run ? 'stop' : key) : key === 'stop' && !run ? 'play' : key;
          const next = cards.querySelector<HTMLButtonElement>(`[data-focus="${wanted}"]`);
          if (next && !next.disabled) next.focus();
          else cards.querySelector<HTMLElement>('[data-focus="play"]')?.focus();
        }
      }; // prettier-ignore
      view = {
        refresh: draw,
        announce: message => {
          status.textContent = message;
        }
      };
      draw();
      return h('section', { class: 'view' }, head, date, h('div', { class: 'cards-host' }, cards), status);
    }
  };
}
