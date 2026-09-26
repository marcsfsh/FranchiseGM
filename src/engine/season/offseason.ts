/**
 * The offseason (spec 4.1), from the Super Bowl through the final cutdown, a step at a time: each phase once,
 * free agency's four weeks, and the preseason's three. A step clears the waiver wire, finishes the step the
 * league is in, heals the weeks that pass, and opens the next one: the new league year when free agency
 * opens (spec 11.1), retirements after the awards (spec 10.7), the draft (spec 10.4; D-48), which waits for
 * the user's picks, and the undrafted rookies after it (D-27), the next season's schedule with the OTAs (spec
 * 5.2), the AI's cutdown at the deadline, and the next season after it. The re-sign window (spec 11.4, 11.5)
 * opens with a message about the user's decisions and closes with the AI's (D-29). The OTAs set depth charts
 * for the new rosters; training camp brings its development, position battles, and injuries, and the
 * preseason's games (D-30); after the cutdown, waiver claims and practice squads fill out the rosters. Phases
 * later milestones fill (staff moves, awards and the Hall of Fame, the rules meeting) pass through.
 */
import type { ClimateTable } from '../../data/climate';
import { TEAM_ABBRS, TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { makeLegal } from '../ai/decisions/compliance';
import { cutdown, offseasonClaims } from '../ai/decisions/offseason';
import { resignDecisions } from '../ai/decisions/resign';
import { fillPracticeSquad, waiverClaims } from '../ai/decisions/roster-moves';
import type { DecisionLog } from '../ai/framework';
import { generateClass, type Prospect } from '../draft/class';
import {
  draftUnderWay,
  finishDraft,
  makePick,
  onTheClock,
  openDraft,
  runDraft,
  staffChoice,
  type DraftGrades
} from '../draft/draft';
import { closeDraftYear, picksIn, type DraftPickRecord } from '../draft/picks';
import { draftMediaWeek } from '../draft/media';
import { scoutsItself, scoutWeek } from '../draft/scouting';
import { aiOffers, signUdfas } from '../draft/udfa';
import { autoVisits, workOut } from '../draft/workouts';
import type { NameData } from '../generate/player';
import { draftOrder } from '../generate/rookies';
import type { Outcome } from '../contracts/moves';
import { offerValue } from '../contracts/decision';
import {
  aiBids,
  closeBidding,
  decideWeek,
  pendingFor,
  signingWords,
  weighing
} from '../contracts/free-agency';
import { windowDecisions } from '../contracts/resign';
import { depthChanges, startersByTeam, type DepthChange } from '../league/depth-changes';
import type { ContractRecord } from '../contracts/history';
import { openLeagueYear } from '../league/league-year';
import { activeRoster, newId, type TransactionKind } from '../league/transactions';
import { advanceBlock } from '../roster/legality';
import type { League } from '../league/types';
import { calendarDay, leagueYear, PHASE_LABELS, type GameDate, type Phase } from '../model/calendar';
import { fullName, type Player } from '../model/player';
import type { RatingChange } from '../progression/change';
import { campDevelopment, coachTraining } from '../progression/develop';
import { retirePlayers } from '../progression/retirement';
import { programOf } from '../progression/training';
import { advanceLeagueRandom, leagueStream, stream, type AdvanceInput, type Rng } from '../rng';
import { activeLimit } from '../roster/rules';
import { processWaivers, waiverOrder, type WaiverResult } from '../roster/waivers';
import type { GameResult } from '../sim/types';
import type { GameMeta } from '../stats/record';
import { dollars, ordinal, plural } from '../text';
import { TUNING } from '../tuning';
import { campInjuries, playPreseasonWeek, positionBattles, preseasonSchedule, setDepthCharts } from './camp';
import { generateSchedule } from './generate-schedule';
import { addToInbox, pausing, type InboxItem, type PauseEvent } from './inbox';
import { applyInjuries, healWeek } from './injuries';
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

/** What the offseason's steps need beyond the league: name lists for the rookie class, climate for games. */
export interface OffseasonData {
  names: NameData;
  climate?: ClimateTable | null;
}

export interface StepOutcome {
  league: League;
  decisions: DecisionLog[];
  news: NewsItem[];
  inbox: InboxItem[];
  pauses: InboxItem[];
  ratings: RatingChange[];
  /** Preseason games played this step, for history. */
  games: { result: GameResult; meta: GameMeta }[];
  /** Starting jobs that changed hands this step, with reasons (post-M42 section 1.1). */
  depth: DepthChange[];
  /** Records of the spent deals that left the league this step, for the players' histories (D-35). */
  contracts: ContractRecord[];
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

/** A prospect's standout drill for a headline: a lineman's bench reps, everyone else's 40. */
function highlight(p: Prospect): string {
  const m = p.measurables;
  if (!m) return 'his workout';
  return LINEMEN.has(p.player.position) ? `${m.bench} reps on the bench` : `a ${m.forty.toFixed(2)} 40`;
}
const LINEMEN = new Set<string>(['LT', 'LG', 'C', 'RG', 'RT', 'LE', 'RE', 'DT']);

/** A preseason result from the user's side: "You beat the Bears 24-17". */
function preseasonWords(result: GameResult, user: TeamAbbr): string {
  const home = result.home === user;
  const us = home ? result.score.home : result.score.away;
  const them = home ? result.score.away : result.score.home;
  const opponent = nick(home ? result.away : result.home);
  if (us > them) return `You beat the ${opponent} ${us}-${them}`;
  return us < them ? `You lost to the ${opponent} ${them}-${us}` : `You tied the ${opponent} ${us}-${them}`;
}

/** A message for the user's inbox, before it takes its step's place. */
type Message = Omit<InboxItem, 'id' | 'season' | 'week' | 'read' | 'event'> & { event?: PauseEvent };
/** A headline, before it takes its step's place. */
type Story = Pick<NewsItem, 'kind' | 'headline' | 'teams' | 'players' | 'score'>;

/** A step's week on the league's timeline, after the regular season and the playoffs. */
const timelineWeek = (league: League, date: GameDate): number =>
  league.rules.season.weeks + PLAYOFF_PHASES.length + offseasonStep(date);

/**
 * The draft's news from the picks just made (spec 10.4): the first overall pick, and once the draft is over
 * the media's grades and the user's class. With `clock`, a message when the user is on the clock.
 */
function draftStories(
  league: League,
  made: readonly DraftPickRecord[],
  grades: DraftGrades | null,
  clock: boolean
): { news: Story[]; messages: Message[] } {
  const user = league.meta.start.userTeam;
  const news: Story[] = [];
  const messages: Message[] = [];
  const first = made.find(p => p.number === 1);
  const top = first?.playerId ? league.players[first.playerId] : undefined;
  if (first && top) news.push({ kind: 'transaction', headline: `The ${nick(first.owner)} take ${named(top)} first overall`, teams: [first.owner], players: [top.id], score: 90 }); // prettier-ignore
  if (grades) {
    const best = grades.teams[0];
    if (best) news.push({ kind: 'draft', headline: `Draft grades: the ${nick(best.team)} earn the top grade, ${best.letter}`, teams: [best.team], players: [], score: 50 }); // prettier-ignore
    const mine = picksIn(league, grades.year).filter(p => p.owner === user && p.playerId);
    const grade = grades.teams.find(g => g.team === user);
    const lines = mine.map(p => {
      const player = league.players[p.playerId as string];
      return `Round ${p.round}, pick ${p.number}: ${player ? named(player) : 'a prospect'}`;
    });
    messages.push({
      kind: 'draft',
      title: grade ? `Your ${grades.year} draft class: ${grade.letter} from the media` : `Your ${grades.year} draft class`,
      body: `${lines.length ? `${lines.join('. ')}.` : 'You had no picks in this draft.'}${grade ? ` The media: ${grade.blurb}` : ''}`,
      players: mine.map(p => p.playerId as string)
    }); // prettier-ignore
    return { news, messages };
  }
  const next = onTheClock(league);
  if (clock && next?.owner === user)
    messages.push({ kind: 'draft', title: `The draft is on: you're on the clock with the ${ordinal(next.number ?? 0)} pick`, body: 'Make your pick in the Draft room, or let your staff make it. The draft waits for you; Automation in Settings can have your staff make every pick.', players: [] }); // prettier-ignore
  return { news, messages };
}

/** Why the league can't leave the draft yet: the user on the clock with the picks off auto. Null otherwise. */
export function draftBlock(league: League): string | null {
  const clock = onTheClock(league);
  if (!clock || clock.owner !== league.meta.start.userTeam || league.settings.auto.draft) return null;
  return `You're on the clock with the ${ordinal(clock.number ?? 0)} pick. Make your pick in the Draft room, or let your staff make it.`; // prettier-ignore
}

/** A choice in the draft room: a prospect to take, or the staff's choice for this pick or every pick left. */
export type DraftRoomChoice = { prospectId: string } | { staff: 'pick' | 'rest' };

/**
 * The user's turn in the draft room (spec 10.4): the pick on the clock, by the user's choice or the staff's,
 * or every pick the user has left by the staff's; then the AI's picks until the user is on the clock again
 * or the draft is over, when the media grade it. The draft's news and messages join the league. Returns the
 * picks made, or why none could be.
 */
export function draftRoomPick(league: League, choice: DraftRoomChoice): Outcome<DraftPickRecord[]> {
  const user = league.meta.start.userTeam;
  const clock = onTheClock(league);
  if (!clock) return { ok: false, reason: "The draft isn't under way." };
  if (clock.owner !== user)
    return { ok: false, reason: `The ${nick(clock.owner)} are on the clock, not you.` };
  const step = offseasonStep(league.date);
  const rng = leagueStream(league.random, 'offseason', step, 'draftRoom', clock.number ?? 0);
  const made: DraftPickRecord[] = [];
  if ('prospectId' in choice || choice.staff === 'pick') {
    const id = 'prospectId' in choice ? choice.prospectId : staffChoice(league, user);
    if (!id) return { ok: false, reason: 'Nobody is left to draft.' };
    const result = makePick(league, id, rng);
    if (!result.ok) return result;
    made.push(result.value);
  }
  made.push(...runDraft(league, rng, 'staff' in choice && choice.staff === 'rest'));
  const stories = draftStories(league, made, finishDraft(league), false);
  const at = { season: league.date.season, week: timelineWeek(league, league.date) };
  const id = (i: number) => `${at.season}-o${step}-p${clock.number ?? 0}-${i}`;
  league.season.news.push(...stories.news.map((n, i) => ({ ...n, ...at, id: id(i), template: n.kind })));
  league.inbox = addToInbox(league.inbox, stories.messages.map((m, i) => ({ ...m, ...at, id: id(i), event: m.event ?? null, read: false }))); // prettier-ignore
  return { ok: true, value: made };
}

/**
 * The end of the season (spec 4.1, 12.1), when the Super Bowl week ends: undrafted rookies nobody ever
 * signed leave the game (one signed and cut stays, with his history), players earn their seasons by
 * regular-season games on full pay status (3 for a credited season, 6 for an accrued one, D-37), and the
 * next draft is numbered by the finish.
 */
export function closeSeason(league: League): void {
  const signed = new Set(Object.values(league.contracts).map(c => c.playerId));
  for (const p of Object.values(league.players))
    if (p.status === 'freeAgent' && p.experience === 0 && 'undrafted' in p.draft && !signed.has(p.id))
      delete league.players[p.id];
  const { creditedSeasonGames, accruedSeasonGames } = league.rules.roster;
  for (const p of Object.values(league.players)) {
    const games = league.season.fullPay[p.id] ?? 0;
    if (games >= creditedSeasonGames) p.experience++;
    if (games >= accruedSeasonGames) p.accrued++;
  }
  // The next draft's order is set by the finish (D-42).
  closeDraftYear(league, league.season.season + 1, draftOrder(league));
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

/**
 * Starts the next season on its week 1: its schedule, a fresh season record, the new league year's moves,
 * and the next spring's draft class, to scout all season (spec 10.3).
 */
function startSeason(league: League, date: GameDate, names: NameData, rng: Rng): void {
  const moves = league.season.transactions.filter(t => leagueYear(t) === date.season);
  const schedule = league.upcoming ?? nextSchedule(league, date.season);
  league.season = { ...emptySeason(date.season), transactions: moves };
  league.schedule = schedule;
  league.upcoming = null;
  league.preseason = null;
  league.date = { ...date };
  league.draft = generateClass(league, date.season + 1, { names, rng, newId: () => newId(league, 'p') }, rng);
}

/**
 * Takes the league one offseason step on (spec 4.1). The step's randomness comes from the league's advance
 * seed, so a fixed-seed league replays it exactly.
 */
export function advanceOffseason(league: League, data: OffseasonData, input: AdvanceInput): StepOutcome {
  const from = { ...league.date };
  const step = offseasonStep(from);
  if (step === 0) throw new Error(`The ${from.phase} phase isn't part of the offseason.`);
  const user = league.meta.start.userTeam;
  const rng = (key: string) => leagueStream(league.random, 'offseason', step, key);
  // Every team the AI runs gets legal first (the user's with roster management on auto), and the user's
  // team must be legal to move on (D-46).
  for (const abbr of aiTeams(league)) makeLegal(league, abbr, rng(`legal-${abbr}`));
  // The draft waits for the user's pick (spec 10.4; D-48).
  const blocked = advanceBlock(league) ?? draftBlock(league);
  if (blocked) return { league, decisions: [], news: [], inbox: [], pauses: [], ratings: [], games: [], depth: [], contracts: [], blocked }; // prettier-ignore
  const to = nextStep(from);
  const news: NewsItem[] = [];
  const messages: Message[] = [];
  const decisions: DecisionLog[] = [];
  const ratings: RatingChange[] = [];
  const games: StepOutcome['games'] = [];
  const depth: DepthChange[] = [];
  const contracts: ContractRecord[] = [];
  const timeline = (date: GameDate) => timelineWeek(league, date);
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

  // The waiver wire clears first, as it does each week (spec 12.1). Offseason claims need roster room. After
  // the cutdown a team claims as in the season, a few players at most, and cuts back to the limit; then the
  // practice squads form.
  const order = waiverOrder(league, stream(league.random.baseSeed, 'waivers', from.season));
  const movesBefore = league.season.transactions.length;
  const claimed = (abbr: TeamAbbr) =>
    league.season.transactions.slice(movesBefore).filter(t => t.kind === 'claimed' && t.team === abbr).length;
  const waived: WaiverResult[] = processWaivers(league, rng('waivers'), order, (entry, player) =>
    from.phase === 'cutdown'
      ? waiverClaims(league, entry, player).filter(abbr => claimed(abbr) < TUNING.camp.cutdownClaims)
      : offseasonClaims(league, player, entry.from, activeLimit(league))
  );
  for (const w of waived) {
    const p = league.players[w.playerId];
    if (p && w.claimedBy === user) messages.push({ kind: 'waivers', title: `You claimed ${named(p)} off waivers`, body: 'He joins your roster on his contract.', players: [p.id] });
  } // prettier-ignore
  if (from.phase === 'cutdown')
    for (const abbr of aiTeams(league)) {
      cutdown(league, abbr, rng(`recut-${abbr}`));
      fillPracticeSquad(league, abbr, rng(`squad-${abbr}`));
    }

  // The step the league is in finishes: a draft still under way runs to its end, the user's picks made by
  // the staff (the gate above stops it otherwise).
  if (draftUnderWay(league)) {
    const made = runDraft(league, rng('draftRest'));
    const stories = draftStories(league, made, finishDraft(league), false);
    for (const n of stories.news) headline(n.kind, n.headline, n.teams, n.players, n.score);
    messages.push(...stories.messages);
  }
  if (from.phase === 'udfa') {
    // The scramble ends: each rookie signs with his best offer from a team with room (D-49).
    const offered = Object.keys(league.udfaOffers).filter(id => league.udfaOffers[id]?.some(o => o.team === user)); // prettier-ignore
    const signed = signUdfas(league, rng('udfa'));
    const mine = signed.filter(s => s.team === user);
    const elsewhere = signed.filter(s => s.team !== user && offered.includes(s.player.id));
    if (offered.length || mine.length)
      messages.push({
        kind: 'draft',
        title: `Undrafted rookies: ${mine.length ? `${plural(mine.length, 'rookie')} signed with you` : 'none signed with you'}`,
        body: [mine.length ? `${mine.map(s => `${named(s.player)}, ${dollars(s.bonus)} bonus`).join('; ')}.` : null, elsewhere.length ? `Chose other teams: ${elsewhere.map(s => `${named(s.player)}, the ${nick(s.team)}`).join('; ')}.` : null].filter(Boolean).join(' '),
        players: mine.map(s => s.player.id)
      }); // prettier-ignore
  }
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
  if (from.phase === 'preseason' && league.preseason) {
    // The week's preseason games (spec 4.1): the backups play, the lines count only as preseason.
    const played = playPreseasonWeek(league, from.week, data.climate ?? null, rng('preseason'));
    games.push(...played);
    for (const { result } of played) league.preseason.results[result.id] = { ...result.score };
    const hurt = played.flatMap(p => p.result.injuries);
    ratings.push(...applyInjuries(league, hurt, from.season, timeline(from), rng('preseasonInjuries')));
    const mine = played.find(p => p.result.home === user || p.result.away === user)?.result;
    const injured = hurt.filter(e => e.team === user && e.weeks > 0).map(e => league.players[e.playerId]).filter((p): p is Player => !!p); // prettier-ignore
    if (mine)
      messages.push({
        kind: 'result',
        title: `Preseason, week ${from.week}: ${preseasonWords(mine, user)}`,
        gameId: mine.id,
        body: `Your starters rested, and the backups and rookies played; the game counts only in the preseason.${injured.length ? ` Hurt: ${injured.map(named).join(', ')}.` : ''}`,
        players: injured.map(p => p.id)
      });
  }
  if (from.phase === 'freeAgency') {
    // The week ends (spec 11.8; D-53): each free agent with offers takes the one worth most to him once one is
    // worth his demand, or waits; after the fourth week the offers left fall away.
    const offered = pendingFor(league, user).players;
    const signed = decideWeek(league, rng('freeAgency'));
    if (from.week === 4) closeBidding(league);
    const mine = signed.filter(s => s.team === user);
    const elsewhere = signed.filter(s => s.team !== user && offered.includes(s.player.id));
    const waiting = weighing(league, user);
    if (offered.length || mine.length)
      messages.push({
        kind: 'contracts',
        title: `Free agency, week ${from.week}: ${mine.length ? `${plural(mine.length, 'player')} signed with you` : 'nobody signed with you'}`,
        body: [mine.length ? `${mine.map(signingWords).join('; ')}.` : null, elsewhere.length ? `Chose other teams: ${elsewhere.map(s => `${named(s.player)}, the ${nick(s.team)}`).join('; ')}.` : null, waiting.length ? `Still weighing your offers: ${waiting.map(named).join(', ')}.` : from.week === 4 && offered.length > mine.length + elsewhere.length ? 'The bidding is over: your offers nobody took have lapsed.' : null].filter(Boolean).join(' '),
        players: mine.map(s => s.player.id)
      });
    for (const s of signed)
      if (s.player.ovr >= TUNING.news.freeAgentFrom)
        headline('transaction', `The ${nick(s.team)} sign ${named(s.player)}: ${plural(s.offer.years, 'year')}, ${dollars(offerValue(s.offer))} a year`, [s.team], [s.player.id], s.player.ovr);
    if (signed.length) headline('transaction', `${plural(signed.length, 'free agent')} ${signed.length === 1 ? 'signs' : 'sign'} in week ${from.week} of free agency`, [], [], 0);
  } // prettier-ignore

  // The weeks between the two dates pass for every injury.
  const days = (Date.parse(calendarDay(to)) - Date.parse(calendarDay(from))) / 86_400_000;
  for (let w = Math.round(days / 7); w > 0; w--) healWeek(league);

  // The next step opens.
  if (to.phase === 'freeAgency' && to.week === 1) {
    const change = openLeagueYear(league, to, rng('leagueYear'));
    contracts.push(...change.records);
    // Teams over the cap as the league year opens get under it before anything else (D-46).
    for (const abbr of aiTeams(league)) makeLegal(league, abbr, rng(`cap-${abbr}`));
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
    // A window of the salary floor closed with the old league year (spec 11.1).
    const share = Math.round(league.rules.cap.salaryFloorShare * 100);
    for (const s of change.shortfalls) {
      if (s.team === user)
        messages.push({ kind: 'contracts', title: `You pay ${dollars(s.shortfall)} to meet the salary floor`, body: `Your cash spending from ${s.from} to ${s.to} was ${dollars(s.spent)}, short of the floor of ${dollars(s.floor)}, ${share}% of the caps in those years. The shortfall goes to your players.`, players: [] }); // prettier-ignore
      headline('transaction', `The ${nick(s.team)} pay ${dollars(s.shortfall)} to their players to meet the salary floor`, [s.team], [], 0); // prettier-ignore
    }
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
  } else if ((to.phase === 'combine' || to.phase === 'proDays') && league.draft) {
    // The combine and the pro days (spec 10.4): workouts, and the biggest risers and fallers in the news;
    // after the pro days, teams scouting on their own have made their top-30 visits.
    league.date = { ...to };
    const where = to.phase === 'combine' ? 'combine' : 'proDay';
    const moved = workOut(league.draft, where, rng(where));
    const at = where === 'combine' ? 'at the combine' : 'at his pro day';
    for (const p of moved.risers) headline('draft', `${named(p.player)} helps himself ${at} with ${highlight(p)}`, [], [], 40); // prettier-ignore
    for (const p of moved.fallers) headline('draft', `${named(p.player)}'s stock slips ${at}`, [], [], 30);
    if (where === 'proDay')
      for (const team of TEAM_ABBRS) if (scoutsItself(league, team)) autoVisits(league, league.draft, team);
  } else if (to.phase === 'draft') {
    // The draft opens (spec 10.4; D-48): the AI picks until the user is on the clock, or to the end.
    league.date = { ...to };
    openDraft(league, data.names, rng('draftClass'));
    const made = runDraft(league, rng('draft'));
    const stories = draftStories(league, made, finishDraft(league), true);
    for (const n of stories.news) headline(n.kind, n.headline, n.teams, n.players, n.score);
    messages.push(...stories.messages);
  } else if (to.phase === 'udfa') {
    // The UDFA scramble (spec 10.4; D-49): the AI's offers go out, and the rookies choose as the step ends.
    league.date = { ...to };
    aiOffers(league, aiTeams(league), rng('udfaOffers'));
    if (!league.settings.auto.roster)
      messages.push({ kind: 'draft', title: 'The scramble for undrafted rookies is on', body: 'Offer undrafted rookies a signing bonus on the Free agency screen. They choose as this step ends, weighing their chance to make your roster more than the money.', players: [] }); // prettier-ignore
  } else if (to.phase === 'trainingCamp') {
    // Training camp (spec 4.1, 10.5): the offseason's development under each team's program, then the
    // position battles and camp injuries, the depth charts that follow, and the preseason schedule.
    league.date = { ...to };
    coachTraining(league);
    ratings.push(...campDevelopment(league, rng('camp')));
    const hurt = campInjuries(league, rng('campInjuries'));
    ratings.push(...applyInjuries(league, hurt, to.season, timeline(to), rng('campCareer')));
    // The coaches chart the healthy rosters, and the battles decide the close jobs on those charts.
    const before = startersByTeam(league);
    decisions.push(...setDepthCharts(league, stream(league.random.baseSeed, 'ai', to.season + 1)));
    const battles = positionBattles(league, rng('battles'));
    for (const b of battles) if (b.change) ratings.push(b.change);
    const upsets = new Set(battles.filter(b => b.upset).map(b => `${b.team} ${b.slot}`));
    for (const c of depthChanges(league, before))
      depth.push(upsets.has(`${c.team} ${c.slot}`) ? { ...c, reason: 'camp' } : c);
    const weeks = OFFSEASON_PHASES.find(([phase]) => phase === 'preseason')?.[1] ?? 0;
    league.preseason = { games: preseasonSchedule(to.season, weeks, rng('preseasonSchedule')), results: {} };
    const won = battles.filter(b => b.team === user);
    const manual = !league.teams[user].depth.auto && won.some(b => b.upset);
    if (won.length)
      messages.push({ kind: 'roster', title: `${plural(won.length, 'camp battle')} for starting jobs`, body: `${won.map(b => `${b.winner.position}: ${named(b.winner)} ${b.upset ? 'won the job from' : 'held off'} ${fullName(b.loser)}`).join('. ')}.${manual ? ' Your depth chart is yours to set: start the winners on the Depth chart screen.' : ''}`, players: won.map(b => b.winner.id) }); // prettier-ignore
    const mine = hurt.filter(e => e.team === user).map(e => ({ e, p: league.players[e.playerId] })).filter((x): x is { e: (typeof hurt)[number]; p: Player } => !!x.p); // prettier-ignore
    if (mine.length)
      messages.push({ kind: 'injury', title: `${plural(mine.length, 'player')} hurt at camp`, body: `${mine.map(({ e, p }) => `${named(p)}: ${e.bodyPart}, out ${plural(e.weeks, 'week')}`).join('. ')}.`, players: mine.map(({ p }) => p.id) }); // prettier-ignore
    for (const b of battles)
      if (b.upset && b.winner.position === 'QB')
        headline('transaction', `${named(b.winner)} wins the ${nick(b.team)} quarterback job`, [b.team], [b.winner.id], b.winner.ovr); // prettier-ignore
    for (const e of hurt) {
      const p = league.players[e.playerId];
      if (p && e.severity === 'season' && p.ovr >= 80)
        headline('injury', `${named(p)} is hurt at the ${nick(e.team)} camp: ${e.bodyPart}, out ${plural(e.weeks, 'week')}`, [e.team], [p.id], p.ovr); // prettier-ignore
    }
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
    // OTAs and minicamp (spec 4.1): the staffs set each auto plan and depth chart for the new rosters.
    league.date = { ...to };
    coachTraining(league);
    const before = startersByTeam(league);
    decisions.push(...setDepthCharts(league, stream(league.random.baseSeed, 'ai', to.season + 1)));
    depth.push(...depthChanges(league, before));
    const plan = league.teams[user].training;
    messages.push({
      kind: 'roster',
      title: 'OTAs and minicamp are underway',
      body: `${plan.auto ? 'Your coaches picked' : 'Your offseason program is'} ${programOf(plan.program).label.toLowerCase()} for training camp. Change it on the Training screen, and set your depth chart, before camp opens.`,
      players: []
    });
  } else if (to.phase === 'cutdown') {
    league.date = { ...to };
    for (const abbr of aiTeams(league)) {
      const cut = cutdown(league, abbr, rng(`cut-${abbr}`));
      makeLegal(league, abbr, rng(`cap-${abbr}`));
      if (abbr === user && cut.length)
        messages.push({ kind: 'roster', title: `You cut ${plural(cut.length, 'player')} to reach ${league.rules.roster.active}`, body: cut.map(named).join(', '), players: cut.map(p => p.id) }); // prettier-ignore
    }
    if (!league.settings.auto.roster && activeRoster(league, user).length > league.rules.roster.active)
      messages.push({ kind: 'roster', title: `Cut your roster to ${league.rules.roster.active}`, body: 'The regular season starts after the final cutdown.', players: [] }); // prettier-ignore
  } else if (to.phase === 'regularSeason') startSeason(league, to, data.names, rng('draftClass'));
  league.date = { ...to };
  // A week of free agency opens: the AI teams make their offers (spec 11.8; D-53).
  if (to.phase === 'freeAgency') aiBids(league, aiTeams(league), draftOrder(league));
  // The scouts work the class until its draft, and the media cover it (spec 10.4).
  scoutWeek(league);
  for (const d of draftMediaWeek(
    league,
    timeline(to),
    to.phase === 'regularSeason' ? 1 : null,
    draftOrder(league),
    rng('draftMedia')
  ))
    headline('draft', d.headline, d.teams, [], d.score);

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
    games,
    depth,
    contracts,
    blocked: null
  };
}
