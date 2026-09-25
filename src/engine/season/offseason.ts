/**
 * The offseason (spec 4.1), from the Super Bowl through the final cutdown, a step at a time: each phase once,
 * free agency's four weeks, and the preseason's three. A step clears the waiver wire, finishes the step the
 * league is in, heals the weeks that pass, and opens the next one: the new league year when free agency
 * opens (spec 11.1), retirements after the awards (spec 10.7), the stand-in rookie class at the draft and
 * the undrafted rookies after it (D-27), the next season's schedule with the OTAs (spec 5.2), the AI's
 * cutdown at the deadline, and the next season after it. The re-sign window (spec 11.4, 11.5) opens with a
 * message about the user's decisions and closes with the AI's (D-29). Phases later milestones fill (staff
 * moves, awards and the Hall of Fame, the combine, the rules meeting) pass through.
 */
import { TEAM_ABBRS, TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { capCompliance, cutdown, freeAgencySignings, offseasonClaims } from '../ai/decisions/offseason';
import { resignDecisions } from '../ai/decisions/resign';
import type { DecisionLog } from '../ai/framework';
import type { NameData } from '../generate/player';
import { draftOrder, rookieReserve, signUndrafted, standInDraft } from '../generate/rookies';
import { windowDecisions } from '../contracts/resign';
import { openLeagueYear } from '../league/league-year';
import { capSheet, seasonSpace } from '../cap/sheet';
import { activeRoster, freeAgents, type TransactionKind } from '../league/transactions';
import type { League } from '../league/types';
import { calendarDay, leagueYear, PHASE_LABELS, type GameDate, type Phase } from '../model/calendar';
import { fullName, type Player } from '../model/player';
import type { RatingChange } from '../progression/change';
import { campDevelopment, coachTraining } from '../progression/develop';
import { retirePlayers } from '../progression/retirement';
import { advanceLeagueRandom, leagueStream, stream, type AdvanceInput } from '../rng';
import { activeLimit } from '../roster/rules';
import { processWaivers, waiverOrder, type WaiverResult } from '../roster/waivers';
import { dollars, plural } from '../text';
import { generateSchedule } from './generate-schedule';
import { addToInbox, pausing, type InboxItem, type PauseEvent } from './inbox';
import { healWeek } from './injuries';
import type { NewsItem } from './news';
import { emptySeason, leagueStandings, PLAYOFF_PHASES } from './state';
import { winPct } from './standings';

/** The offseason's steps in order: each phase and how many weeks it lasts. */
export const OFFSEASON_PHASES: readonly (readonly [Phase, number])[] = [
  ['staff', 1],
  ['awards', 1],
  ['resign', 1],
  ['combine', 1],
  ['annualMeeting', 1],
  ['freeAgency', 4],
  ['proDays', 1],
  ['draft', 1],
  ['udfa', 1],
  ['otas', 1],
  ['trainingCamp', 1],
  ['preseason', 3],
  ['cutdown', 1]
];

/** Every offseason step as a date within its season. */
const STEPS: readonly Pick<GameDate, 'phase' | 'week'>[] = OFFSEASON_PHASES.flatMap(([phase, weeks]) =>
  Array.from({ length: weeks }, (_, i) => ({ phase, week: i + 1 }))
);

/** A date's offseason step, counted from 1, or 0 outside the offseason. */
export const offseasonStep = (date: Pick<GameDate, 'phase' | 'week'>): number =>
  STEPS.findIndex(s => s.phase === date.phase && s.week === date.week) + 1;

/** An offseason step by number, or null. */
export const stepAt = (step: number): Pick<GameDate, 'phase' | 'week'> | null => STEPS[step - 1] ?? null;

export const inOffseasonSteps = (date: GameDate): boolean => offseasonStep(date) > 0;

/** A step's name: the phase, with its week when it lasts more than one. */
export function stepLabel(date: Pick<GameDate, 'phase' | 'week'>): string {
  const weeks = OFFSEASON_PHASES.find(([phase]) => phase === date.phase)?.[1] ?? 1;
  return weeks > 1 ? `${PHASE_LABELS[date.phase]}, week ${date.week}` : PHASE_LABELS[date.phase];
}

/** The date after an offseason step: the phase's next week, the next phase, or the next season's week 1. */
export function nextStep(date: GameDate): GameDate {
  const step = offseasonStep(date);
  if (step === 0) throw new Error(`${date.phase} isn't an offseason phase.`);
  const next = STEPS[step];
  return next
    ? { season: date.season, ...next }
    : { season: date.season + 1, phase: 'regularSeason', week: 1 };
}

/** What the offseason's steps need beyond the league: name lists for the rookie class. */
export interface OffseasonData {
  names: NameData;
}

export interface StepOutcome {
  league: League;
  decisions: DecisionLog[];
  news: NewsItem[];
  inbox: InboxItem[];
  pauses: InboxItem[];
  ratings: RatingChange[];
  /** What the user must do before the league can move on; null when the step happened. */
  blocked: string | null;
}

const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;
const named = (p: Player): string => `${fullName(p)} (${p.position})`;
/** Re-sign window moves in the user's message, after his name. */
const RESIGN_WORDS: Partial<Record<TransactionKind, string>> = {
  extended: 'extended',
  tagged: 'tagged',
  tendered: 'tendered',
  optionExercised: 'fifth-year option exercised',
  optionDeclined: 'fifth-year option declined'
};
/** The teams the AI runs this step: all but the user's, unless the user's roster management is on auto. */
const aiTeams = (league: League): TeamAbbr[] =>
  TEAM_ABBRS.filter(t => league.settings.auto.roster || t !== league.meta.start.userTeam);

/**
 * The end of the season (spec 4.1, 12.1), when the Super Bowl week ends: undrafted rookies nobody signed
 * leave the game, and every player on a roster earns a credited season.
 */
export function closeSeason(league: League): void {
  for (const p of Object.values(league.players))
    if (p.status === 'freeAgent' && p.experience === 0 && 'undrafted' in p.draft) delete league.players[p.id];
  const credited = new Set<Player['status']>(['active', 'ir', 'pup', 'nfi', 'suspended']);
  for (const p of Object.values(league.players)) if (p.team && credited.has(p.status)) p.experience++;
}

/** The next season's schedule (spec 5.2), from the season just played: its standings, records, and champion. */
export function nextSchedule(league: League, season: number): ReturnType<typeof generateSchedule> {
  const standings = leagueStandings(league);
  const places: Partial<Record<TeamAbbr, number>> = {};
  for (const d of standings.divisions) d.teams.forEach((t, i) => (places[t.abbr] = i + 1));
  const strength = Object.fromEntries(TEAM_ABBRS.map(t => [t, winPct(standings.table.records[t].overall)]));
  return generateSchedule(
    { season, seed: league.seedSchedule, places, strength, champion: league.season.champion },
    stream(league.random.baseSeed, 'schedule', season)
  );
}

/** Starts the next season on its week 1: its schedule, a fresh season record, and the new league year's moves. */
function startSeason(league: League, date: GameDate): void {
  const moves = league.season.transactions.filter(t => leagueYear(t) === date.season);
  const schedule = league.upcoming ?? nextSchedule(league, date.season);
  league.season = { ...emptySeason(date.season), transactions: moves };
  league.schedule = schedule;
  league.upcoming = null;
  league.date = { ...date };
}

/** Why the user can't leave this step yet, or null. */
export function offseasonBlock(league: League): string | null {
  if (league.date.phase !== 'cutdown' || league.settings.auto.roster) return null;
  const user = league.meta.start.userTeam;
  const over = activeRoster(league, user).length - league.rules.roster.active;
  if (over > 0)
    return `Cut your active roster to ${league.rules.roster.active} before the season starts: release ${plural(over, 'more player')}, or put roster moves on auto in Settings.`;
  const space = seasonSpace(capSheet(league, user));
  return space < 0
    ? `Get under the salary cap before the season starts: you're ${dollars(-space)} over. Release or restructure a contract, or put roster moves on auto in Settings.`
    : null;
}

/**
 * Takes the league one offseason step on (spec 4.1). The step's randomness comes from the league's advance
 * seed, so a fixed-seed league replays it exactly.
 */
export function advanceOffseason(league: League, data: OffseasonData, input: AdvanceInput): StepOutcome {
  const from = { ...league.date };
  const step = offseasonStep(from);
  if (step === 0) throw new Error(`The ${from.phase} phase isn't part of the offseason.`);
  const blocked = offseasonBlock(league);
  if (blocked) return { league, decisions: [], news: [], inbox: [], pauses: [], ratings: [], blocked };
  const to = nextStep(from);
  const user = league.meta.start.userTeam;
  const rng = (key: string) => leagueStream(league.random, 'offseason', step, key);
  const news: NewsItem[] = [];
  const messages: (Omit<InboxItem, 'id' | 'season' | 'week' | 'read' | 'event'> & { event?: PauseEvent })[] =
    [];
  const decisions: DecisionLog[] = [];
  const ratings: RatingChange[] = [];
  const headline = (
    kind: NewsItem['kind'],
    text: string,
    teams: TeamAbbr[],
    players: string[],
    score: number
  ) =>
    news.push({
      id: '',
      season: from.season,
      week: 0,
      kind,
      headline: text,
      teams,
      players,
      score,
      template: kind
    });

  // The waiver wire clears first, as it does each week (spec 12.1).
  const order = waiverOrder(league, stream(league.random.baseSeed, 'waivers', from.season));
  const waived: WaiverResult[] = processWaivers(league, rng('waivers'), order, (entry, player) =>
    offseasonClaims(league, player, entry.from, activeLimit(league))
  );
  for (const w of waived) {
    const p = league.players[w.playerId];
    if (p && w.claimedBy === user) messages.push({ kind: 'waivers', title: `You claimed ${named(p)} off waivers`, body: 'He joins your roster on his contract.', players: [p.id] });
  } // prettier-ignore

  // The step the league is in finishes.
  if (from.phase === 'awards') {
    const retired = retirePlayers(league, rng('retirement'));
    for (const { player, team } of retired) {
      if (team === user) messages.push({ kind: 'retirement', title: `${named(player)} retired`, body: 'His contract ended with him; what it still prorates comes onto your cap.', players: [player.id] }); // prettier-ignore
      if (team && player.ovr >= 80)
        headline(
          'retirement',
          `${named(player)} retires from the ${nick(team)}`,
          [team],
          [player.id],
          player.ovr
        );
    }
    const count = retired.length;
    if (count) headline('retirement', `${plural(count, 'player')} retire this offseason`, [], [], 0);
  }
  if (from.phase === 'resign') {
    // The window closes: the AI's extensions, tags, tenders, and options, and the user's with contracts on auto.
    const before = league.season.transactions.length;
    for (const abbr of TEAM_ABBRS.filter(t => league.settings.auto.contracts || t !== user))
      resignDecisions(league, abbr, rng(`resign-${abbr}`));
    const made = league.season.transactions.slice(before);
    for (const t of made) {
      const p = league.players[t.playerId];
      if (p && t.kind === 'tagged')
        headline('transaction', `The ${nick(t.team)} tag ${named(p)}`, [t.team], [p.id], p.ovr);
    }
    const mine = made.filter(t => t.team === user && league.players[t.playerId]);
    if (mine.length)
      messages.push({
        kind: 'contracts',
        title: `Your staff made ${plural(mine.length, 'contract decision')}`,
        body: `${mine.map(t => `${named(league.players[t.playerId] as Player)}: ${RESIGN_WORDS[t.kind] ?? ''}`).join('. ')}.`,
        players: mine.map(t => t.playerId)
      });
  }
  if (from.phase === 'freeAgency') {
    // Teams take turns in draft order, each keeping room for its draft class.
    const pool = freeAgents(league);
    const turns = draftOrder(league);
    for (const abbr of turns.filter(t => aiTeams(league).includes(t)))
      decisions.push(...freeAgencySignings(league, abbr, pool, rookieReserve(league, abbr, turns), rng(`fa-${abbr}`)));
  } // prettier-ignore

  // The weeks between the two dates pass for every injury.
  const days = (Date.parse(calendarDay(to)) - Date.parse(calendarDay(from))) / 86_400_000;
  for (let w = Math.round(days / 7); w > 0; w--) healWeek(league);

  // The next step opens.
  if (to.phase === 'freeAgency' && to.week === 1) {
    const change = openLeagueYear(league, to, rng('leagueYear'));
    for (const abbr of aiTeams(league)) capCompliance(league, abbr, rng(`cap-${abbr}`));
    const mine = change.expired.filter(e => e.team === user).map(e => league.players[e.playerId]).filter((p): p is Player => !!p); // prettier-ignore
    messages.push({
      kind: 'contracts',
      title: `The ${change.year} league year opens with a ${dollars(change.cap)} cap`,
      body: `You carry over ${dollars(change.carryover[user])} of unused space. ${mine.length ? `${plural(mine.length, 'contract')} ran out: ${mine.map(named).join(', ')}. They're free agents now.` : 'None of your contracts ran out.'}`,
      players: mine.map(p => p.id)
    });
    headline(
      'transaction',
      `Free agency opens: ${plural(change.expired.length, 'player')} hit the market`,
      [],
      [],
      0
    );
  } else if (to.phase === 'resign' && !league.settings.auto.contracts) {
    league.date = { ...to };
    const open = windowDecisions(league, user);
    const count = open.expiring.length + open.options.length;
    if (count)
      messages.push({
        kind: 'contracts',
        event: 'deadlines',
        title: 'The re-sign window is open',
        body: `${open.expiring.length ? `${plural(open.expiring.length, 'contract')} of yours ${open.expiring.length === 1 ? 'runs' : 'run'} out when the ${to.season + 1} league year opens. ` : ''}${open.options.length ? `${plural(open.options.length, 'fifth-year option')} ${open.options.length === 1 ? 'is' : 'are'} yours to decide. ` : ''}Extend, tag, or tender players, and decide options, on the Contracts screen. The window closes when you advance to the ${stepLabel(nextStep(to)).toLowerCase()}.`,
        players: [...open.options, ...open.expiring].slice(0, 5).map(p => p.id)
      });
  } else if (to.phase === 'draft') {
    league.date = { ...to };
    const picks = standInDraft(league, data.names, rng('draft'));
    const mine = picks
      .filter(p => p.team === user)
      .map(p => ({ pick: p, player: league.players[p.playerId] }));
    messages.push({
      kind: 'draft',
      title: `Your ${to.season + 1} draft class`,
      body: mine.map(({ pick, player }) => (player ? `Round ${pick.round}, pick ${pick.pick}: ${named(player)}` : '')).filter(Boolean).join('. '),
      players: mine.map(m => m.pick.playerId)
    }); // prettier-ignore
    const first = picks[0] ? league.players[picks[0].playerId] : undefined;
    if (first && picks[0])
      headline(
        'transaction',
        `The ${nick(picks[0].team)} take ${named(first)} first overall`,
        [picks[0].team],
        [first.id],
        90
      );
  } else if (to.phase === 'udfa') {
    league.date = { ...to };
    const signed = signUndrafted(league, rng('udfa'));
    const mine = signed.filter(p => p.team === user);
    if (mine.length)
      messages.push({ kind: 'draft', title: `You signed ${plural(mine.length, 'undrafted rookie')}`, body: mine.map(named).join(', '), players: mine.map(p => p.id) }); // prettier-ignore
  } else if (to.phase === 'trainingCamp') {
    // Training camp (spec 10.5): the offseason's development, under each team's program.
    league.date = { ...to };
    coachTraining(league);
    ratings.push(...campDevelopment(league, rng('camp')));
  } else if (to.phase === 'otas') {
    league.upcoming = nextSchedule(league, to.season + 1);
    const opener = league.upcoming.find(g => g.week === 1 && (g.home === user || g.away === user));
    messages.push({
      kind: 'schedule',
      title: `The ${to.season + 1} schedule is out`,
      body: opener
        ? `You open ${opener.home === user ? `at home against the ${nick(opener.away)}` : `at the ${nick(opener.home)}`} on ${opener.date}.`
        : '',
      players: []
    });
  } else if (to.phase === 'cutdown') {
    league.date = { ...to };
    for (const abbr of aiTeams(league)) {
      const cut = cutdown(league, abbr, rng(`cut-${abbr}`));
      capCompliance(league, abbr, rng(`cap-${abbr}`), true);
      if (abbr === user && cut.length)
        messages.push({ kind: 'roster', title: `You cut ${plural(cut.length, 'player')} to reach ${league.rules.roster.active}`, body: cut.map(named).join(', '), players: cut.map(p => p.id) }); // prettier-ignore
    }
    if (!league.settings.auto.roster && activeRoster(league, user).length > league.rules.roster.active)
      messages.push({ kind: 'roster', title: `Cut your roster to ${league.rules.roster.active}`, body: 'The regular season starts after the final cutdown.', players: [] }); // prettier-ignore
  } else if (to.phase === 'regularSeason') startSeason(league, to);
  league.date = { ...to };

  // Messages and news carry the step they arrive with; the next season's first ones, its week 1.
  const at =
    to.phase === 'regularSeason'
      ? { season: to.season, week: 1 }
      : { season: to.season, week: league.rules.season.weeks + PLAYOFF_PHASES.length + offseasonStep(to) };
  news.forEach((n, i) => Object.assign(n, { ...at, id: `${at.season}-o${step}-${i}` }));
  league.season.news.push(...news);
  const inbox: InboxItem[] = messages.map((m, i) => ({ ...m, ...at, id: `${at.season}-o${step}-${i}`, event: m.event ?? null, read: false })); // prettier-ignore
  league.inbox = addToInbox(league.inbox, inbox);
  league.random = advanceLeagueRandom(league.random, input);
  return {
    league,
    decisions,
    news,
    inbox,
    pauses: pausing(inbox, league.settings.pause),
    ratings,
    blocked: null
  };
}
