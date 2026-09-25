/**
 * Team hub (spec 19.2, style guide 7.6): in order, the next game and game plan with the advance controls,
 * roster and injuries, the inbox, the news, and the division standings with the playoff picture. An advance
 * keeps running if the user leaves the screen; coming back shows its progress.
 */
import { superBowlName } from '../../data/super-bowl';
import { TEAM_COLORS, teamFullName, type TeamAbbr } from '../../data/team-colors';
import { team as teamInfo } from '../../data/teams';
import type { League } from '../../engine/league/types';
import { capFacts, capSheet } from '../../engine/cap/sheet';
import { capHit } from '../../engine/contracts/cap';
import { contractSummary } from '../../engine/contracts/view';
import { calendarDay, leagueYear, PHASE_LABELS, type Phase } from '../../engine/model/calendar';
import { ageOn, type Player } from '../../engine/model/player';
import { RATING_LABELS, type RatingKey } from '../../engine/model/ratings';
import { HAND_SET_FORMULAS } from '../../engine/ratings/overall';
import { designation } from '../../engine/season/injuries';
import { nextStep, offseasonBlock, offseasonStep, stepLabel } from '../../engine/season/offseason';
import { gameWeek, leagueStandings } from '../../engine/season/state';
import type { WinLoss } from '../../engine/season/standings';
import { h, type Child } from '../dom';
import { toast } from '../feedback';
import { focusKeyOf, refocus } from '../focus';
import { gameDay, kickoff, money, record } from '../format';
import { href } from '../router';
import { dateLine } from '../shell';
import type { AdvanceTarget, AppState } from '../state';
import { weekLabel } from '../ui/games';
import { inboxList, inboxOrder } from '../ui/inbox';
import { attributeRow, devTag, playerLink, stat, tierPlate } from '../ui/players';
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
  const offseason = offseasonStep(app.league.date) > 0;
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
        const played = offseason
          ? league && offseasonStep(league.date) > 0
            ? `Now: ${stepLabel(league.date)}`
            : `The ${league?.date.season ?? ''} season is here: week 1`
          : report.weeks === 1
            ? 'Played a week'
            : `Played ${report.weeks} weeks`;
        const paused = report.pauses[0];
        const message = report.blocked
          ? report.blocked
          : paused
            ? `${played}. Stopped for: ${paused.title}.`
            : report.stopped
              ? `${played}. Stopped as you asked.`
              : !offseason && league && gameWeek(league) === null && league.season.champion
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

/** What each offseason phase is for, in a line; the phases later builds fill say so. */
const STEP_NOTES: Record<Exclude<Phase, 'regularSeason' | 'wildCard' | 'divisional' | 'conference' | 'superBowl'>, string> = {
  staff: 'Coaching and staff moves arrive in a later build.',
  awards: 'Season awards and the Hall of Fame arrive in a later build. Players decide whether to retire as this phase ends.',
  resign: 'Extensions, tags, and tenders arrive in a later build. Contracts that run out end when free agency opens.',
  combine: 'The combine arrives with the draft in a later build.',
  annualMeeting: 'The new league year starts when free agency opens: contracts that run out end, and the cap grows.',
  freeAgency: 'Sign free agents from the Free agency screen. The other teams sign theirs as each week ends.',
  proDays: 'The draft is next: your picks join your roster when it opens.',
  draft: 'Your draft picks are on your roster. The draft room arrives in a later build.',
  udfa: 'The other teams have signed undrafted rookies; the rest are on the Free agency screen.',
  otas: "Next season's schedule is out.",
  trainingCamp: 'Training camp arrives in a later build.',
  preseason: 'Preseason games arrive in a later build.',
  cutdown: 'Every team cuts to the in-season limit before the season starts.'
}; // prettier-ignore

/** The offseason's current step (spec 4.1), with the advance controls. */
function offseasonCard(app: AppState, league: League): HTMLElement {
  const user = league.meta.start.userTeam;
  const date = league.date;
  const next = nextStep(date);
  const season = next.phase === 'regularSeason' ? next.season : date.season + 1;
  const body: Child[] = [
    h('p', { class: 'label' }, `${date.season} offseason`),
    h('p', { class: 'hero-title' }, stepLabel(date)),
    h('p', null, STEP_NOTES[date.phase as keyof typeof STEP_NOTES] ?? '')
  ];
  if (league.season.champion)
    body.push(
      h('p', { class: 'muted' }, `The ${nick(league.season.champion)} won ${superBowlName(date.season)}.`)
    );
  const opener = league.upcoming?.find(g => g.week === 1 && (g.home === user || g.away === user));
  if (opener)
    body.push(h('p', { class: 'muted' }, `Your ${season} opener: ${opener.home === user ? `the ${nick(opener.away)} at home` : `at the ${nick(opener.home)}`}, ${gameDay(opener.date, opener.day)}.`)); // prettier-ignore
  const blocked = offseasonBlock(league);
  if (date.phase === 'cutdown') {
    const active = Object.values(league.players).filter(p => p.team === user && p.status === 'active').length;
    body.push(h('p', null, `You have ${active} active players; the limit is ${league.rules.roster.active}.`));
  }
  if (blocked) body.push(h('p', { class: 'delta-bad' }, blocked));
  const actions = h('div', { class: 'btn-row' });
  actions.append(
    h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency'),
    h('a', { class: 'btn btn-outline', href: href('training') }, 'Set training')
  );
  if (date.phase === 'cutdown')
    actions.append(h('a', { class: 'btn btn-outline', href: '#/roster' }, 'Roster'));
  if (run) {
    const stop = h('button', { class: 'btn btn-outline', type: 'button', 'data-focus': 'stop' }, 'Stop after this step');
    stop.addEventListener('click', () => {
      run?.controller.abort();
      stop.disabled = true;
      view?.announce('Stopping after this step.');
    });
    body.push(
      h('p', { role: 'status', class: 'advance-progress' }, `Working${run.weeks ? `: ${run.weeks} ${run.weeks === 1 ? 'step' : 'steps'} done` : '…'}`),
      h('progress', { class: 'progress', 'aria-label': 'Advance progress' })
    );
    actions.append(stop);
  } else {
    const label = next.phase === 'regularSeason' ? `Start the ${next.season} season` : `Advance to ${stepLabel(next)}`;
    const play = h('button', { class: 'btn btn-primary', type: 'button', 'data-focus': 'play' }, label);
    play.addEventListener('click', () => startAdvance(app, 'week'));
    actions.prepend(play);
    if (next.phase !== 'regularSeason') {
      const far = h('button', { class: 'btn btn-outline', type: 'button', 'data-focus': 'far' }, `Sim to the ${season} season`);
      far.addEventListener('click', () => startAdvance(app, 'nextSeason'));
      actions.append(far);
    }
  } // prettier-ignore
  body.push(actions);
  return homeCard('The offseason', {}, ...body);
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
  const nextWeek = next ? weekLabel(league, next.week) : '';
  const body: Child[] = [];
  if (next && opponent) {
    body.push(
      h('p', { class: 'label' }, `${nextWeek} · ${next.home === user ? 'Home' : next.siteType === 'home' ? 'Away' : 'Neutral site'}`),
      h('p', { class: 'hero-title' }, teamFullName(opponent)),
      h('p', null, `Your record: ${winLoss(standings[user]?.overall)} · ${nick(opponent)}: ${winLoss(standings[opponent]?.overall)}`),
      h('p', null, `${gameDay(next.date, next.day)} · ${kickoff(next.timeEt)}`),
      h('p', { class: 'muted' }, plan === 'Auto' ? `Game plan: Auto, tailored to the ${nick(opponent)}.` : 'Game plan: Custom.')
    ); // prettier-ignore
  } else if (inSeason) {
    body.push(h('p', null, 'Your season is over. The playoffs go on without you.'));
  }

  const actions = h('div', { class: 'btn-row' });
  if (next && opponent)
    actions.append(h('a', { class: 'btn btn-outline', href: '#/game-plan' }, 'Set game plan'));
  actions.append(h('a', { class: 'btn btn-outline', href: href('training') }, 'Set training'));
  // Quick actions (spec 19.2): the lineup is on the roster card; offers to free agents start here.
  actions.append(h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency'));
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
  const items = inboxOrder(league.inbox);
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
  return homeCard(
    unread ? `Inbox (${unread} new)` : 'Inbox',
    { arrow: ['All messages', href('inbox')] },
    shown.length ? inboxList(league, shown, 'Latest messages') : h('p', { class: 'empty' }, 'No messages yet. Results, injuries, and awards for your team arrive here each week.'),
    h('div', { class: 'btn-row' }, markRead)
  ); // prettier-ignore
}

const CATEGORY_WORDS = { offense: 'Offense', defense: 'Defense', special: 'Special teams' } as const;

function newsCard(league: League): HTMLElement {
  const last = league.season.news.at(-1)?.week;
  const stories = league.season.news.filter(n => n.week === last && n.kind !== 'award');
  const awards = league.season.awards.filter(a => a.week === last);
  const award = (a: (typeof awards)[number]) => {
    const p = league.players[a.playerId];
    const label = a.category === 'rookie' ? 'Rookie' : `${a.conference} ${CATEGORY_WORDS[a.category].toLowerCase()}`;
    return h('li', null, `${label}: `, p ? playerLink(p) : '', `, ${nick(a.team)}`);
  }; // prettier-ignore
  return homeCard(
    last ? `News: ${weekLabel(league, last)}` : 'News',
    { arrow: ['All news', href('leagueTab', { tab: 'news' })] },
    stories.length
      ? h('ul', { class: 'preview-list news-list' }, ...stories.slice(0, 8).map(n => h('li', null, n.headline)))
      : h('p', { class: 'empty' }, "The week's biggest stories appear here once games are played."),
    awards.length ? h('h3', { class: 'label' }, 'Players of the week') : null,
    awards.length ? h('ul', { class: 'preview-list news-list' }, ...awards.map(award)) : null
  ); // prettier-ignore
}

/** The cap summary (style guide 4.4): space left this league year, and where the money goes. */
function capCard(league: League): HTMLElement {
  const sheet = capSheet(league, league.meta.start.userTeam);
  const row = (label: string, value: string) =>
    h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, value));
  return homeCard(
    `${sheet.year} cap`,
    { arrow: ['Cap sheet', href('finances')] },
    h('span', { class: 'label' }, 'Cap space'),
    h('p', { class: `big-number${sheet.space < 0 ? ' delta-bad' : ''}` }, money(sheet.space)),
    h('div', { class: 'stack' }, row('Salary cap', money(sheet.cap)), row('Used', money(sheet.used)), row('Dead money', money(sheet.dead)))
  ); // prettier-ignore
}

/** Players featured on the hub in turn, one a week. */
const FEATURED_POOL = 5;

/** A featured player (style guide 7.6): one of the club's best, a different one each week. */
function featuredCard(league: League): HTMLElement | null {
  const user = league.meta.start.userTeam;
  const best = Object.values(league.players)
    .filter(p => p.team === user && p.status === 'active')
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))
    .slice(0, FEATURED_POOL);
  const week = gameWeek(league) ?? league.date.week;
  const p = best[(week - 1 + best.length) % Math.max(1, best.length)];
  if (!p) return null;
  const contract = p.contractId ? league.contracts[p.contractId] : undefined;
  const year = leagueYear(league.date);
  const hit = contract ? money(capHit(contract, year, league.rules, capFacts(league, p.id))) : 'No contract';
  const left = contract ? contractSummary(contract, league.date).remaining : 0;
  const remaining = contract ? `${left} ${left === 1 ? 'year' : 'years'}` : 'No contract';
  const d = designation(p.injury);
  const weeks = p.injury?.weeksOut ?? 0;
  const health = d
    ? `${STATUS_WORDS[d]}${d === 'out' ? `, ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : ''}`
    : 'Healthy';
  // The ratings his overall weighs most.
  const key = (Object.entries(HAND_SET_FORMULAS[p.position].coefficients) as [RatingKey, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  return homeCard(
    'Featured player',
    { arrow: ['Player page', href('player', { id: p.id })] },
    h('div', { class: 'featured-head' }, tierPlate(p.ovr, { large: true }), h('div', null, h('p', { class: 'hero-title' }, playerLink(p)), h('p', { class: 'muted' }, `${p.position} · #${p.jersey} · age ${ageOn(p.birthDate, calendarDay(league.date))}`))),
    h('div', { class: 'stat-grid' }, stat('Development', devTag(p.dev)), stat(`${year} cap hit`, hit), stat('Years remaining', remaining), stat('Health', health)),
    h('div', { class: 'stack' }, ...key.map(k => attributeRow(RATING_LABELS[k], p.ratings[k])))
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
      { arrow: ['Full standings', href('leagueTab', { tab: 'standings' })] },
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
        { arrow: ['Playoffs', href('leagueTab', { tab: 'playoffs' })] },
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
        // Links (a box score, an arrow) come back by their address.
        const other = key ? null : focusKeyOf(cards);
        const lead = offseasonStep(l.date) > 0 ? offseasonCard(app, l) : nextGameCard(app, l);
        cards.replaceChildren(...[lead, rosterCard(l), inboxCard(app, l), newsCard(l), ...standingsCards(l), capCard(l), featuredCard(l)].filter(c => c !== null));
        // Keep focus on the control the user was using: the advance buttons hand it to Stop while a run goes
        // and take it back when it ends; a disabled button hands it to the play button.
        if (key) {
          const wanted = key === 'play' || key === 'far' ? (run ? 'stop' : key) : key === 'stop' && !run ? 'play' : key;
          const next = cards.querySelector<HTMLButtonElement>(`[data-focus="${wanted}"]`);
          if (next && !next.disabled) next.focus();
          else cards.querySelector<HTMLElement>('[data-focus="play"]')?.focus();
        } else if (other && !refocus(cards, other)) head.querySelector<HTMLElement>('h1')?.focus();
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
