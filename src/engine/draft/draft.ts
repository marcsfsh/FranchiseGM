/**
 * The draft (spec 10.4; D-48): the rule set's rounds plus compensatory picks, one pick at a time on the
 * numbered pick records (D-42). As it opens, the class moves into the draft room and the media's board is
 * final. The team on the clock takes a prospect: an AI team the one worth most to it by its grades and needs
 * (D-45), the user's team the user's choice, or its staff's with draft picks on auto. A drafted prospect
 * joins the team holding the pick on the rookie scale deal for its number (spec 11.3). After the last pick
 * the media grade every team's class, the prospects nobody took become free agents, and teams get their
 * picks three drafts on.
 */
import { TEAM_ABBRS, TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { rookieContract } from '../contracts/build';
import type { Outcome } from '../contracts/moves';
import type { NameData } from '../generate/player';
import { draftOrder, signRookie } from '../generate/rookies';
import { newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import { fullName } from '../model/player';
import type { Rng } from '../rng';
import { ordinal } from '../text';
import { TUNING } from '../tuning';
import { generateClass, type DraftClass } from './class';
import { mediaBoard } from './media';
import { aiChoice } from './needs';
import { issueNextYear, numberDraft, picksIn, type DraftPickRecord } from './picks';

const G = TUNING.draft.grades;

/** The draft under way: its class, from the draft's opening until its last pick; null otherwise. */
export const draftUnderWay = (league: League): DraftClass | null =>
  league.draft?.board ? league.draft : null;

/**
 * The pick on the clock: the first of the draft under way without a player. Null when no draft is under
 * way, and once every pick is made or the class has no one left.
 */
export function onTheClock(league: League): DraftPickRecord | null {
  const draft = draftUnderWay(league);
  if (!draft?.prospects.length) return null;
  return picksIn(league, draft.year).find(p => p.playerId === null && p.number !== null) ?? null;
}

/**
 * Opens the draft of this league year: its class (made a season ago, or now if the league has none), its
 * order numbered if the season's end didn't number it, and the media's board made final.
 */
export function openDraft(league: League, names: NameData, rng: Rng): DraftClass {
  const year = leagueYear(league.date);
  const draft =
    league.draft?.year === year
      ? league.draft
      : generateClass(league, year, { names, rng, newId: () => newId(league, 'p') }, rng);
  league.draft = draft;
  if (picksIn(league, year).some(p => p.number === null)) numberDraft(league, year, draftOrder(league));
  draft.board = mediaBoard(draft).map(p => p.player.id);
  return draft;
}

/** Why `team` can't take `prospectId` with the pick on the clock, or null. */
export function pickProblem(league: League, team: TeamAbbr, prospectId: string): string | null {
  const draft = draftUnderWay(league);
  const clock = onTheClock(league);
  if (!draft || !clock) return "The draft isn't under way.";
  if (clock.owner !== team) return `The ${TEAM_COLORS[clock.owner].name} are on the clock, not you.`;
  if (!draft.prospects.some(p => p.player.id === prospectId))
    return "He isn't available: he's been drafted, or he isn't in this class.";
  return null;
}

/**
 * Makes the pick on the clock with `prospectId`: he leaves the class for the team holding the pick, on the
 * rookie scale deal for its number (spec 11.3), whatever the team's cap space or roster size; it gets legal
 * before the league moves on (D-46). Returns the pick, or why it can't be made.
 */
export function makePick(league: League, prospectId: string, rng: Rng): Outcome<DraftPickRecord> {
  const clock = onTheClock(league);
  const problem = clock ? pickProblem(league, clock.owner, prospectId) : "The draft isn't under way.";
  if (problem || !clock) return { ok: false, reason: problem ?? "The draft isn't under way." };
  const prospects = league.draft?.prospects ?? [];
  const [prospect] = prospects.splice(
    prospects.findIndex(p => p.player.id === prospectId),
    1
  );
  if (!prospect) return { ok: false, reason: "He isn't available." };
  const { player } = prospect;
  const { owner: team, round, year } = clock;
  const pick = clock.number as number;
  const contract = rookieContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team }, year, pick); // prettier-ignore
  league.contracts[contract.id] = contract;
  player.draft = { year, round, pick, team };
  league.players[player.id] = player;
  signRookie(league, player, team, contract.id, rng);
  clock.playerId = player.id;
  recordTransaction(league, team, 'drafted', player.id, `round ${round}, pick ${pick}`);
  return { ok: true, value: clock };
}

/** The prospect a team's staff would take with the pick on the clock (D-45), or null. */
export function staffChoice(league: League, team: TeamAbbr): string | null {
  const draft = draftUnderWay(league);
  return draft ? (aiChoice(league, draft, team)?.player.id ?? null) : null;
}

/**
 * Runs the draft from the pick on the clock: each AI team takes its choice (D-45), and so does the user's
 * staff with draft picks on auto or when `staff` says so. Otherwise it stops with the user on the clock.
 * Returns the picks made.
 */
export function runDraft(league: League, rng: Rng, staff = false): DraftPickRecord[] {
  const user = league.meta.start.userTeam;
  const made: DraftPickRecord[] = [];
  for (let clock = onTheClock(league); clock; clock = onTheClock(league)) {
    if (clock.owner === user && !staff && !league.settings.auto.draft) break;
    const choice = staffChoice(league, clock.owner);
    const result = choice ? makePick(league, choice, rng) : null;
    if (!result?.ok) break;
    made.push(result.value);
  }
  return made;
}

/** A team's class as the media grade it (spec 10.4). */
export interface ClassGrade {
  team: TeamAbbr;
  /** "A" to "D", with "+" and "-" between. */
  letter: string;
  /** The chart value of its players' places on the media's board over its picks' (1 is even). */
  score: number;
  blurb: string;
}

/** The media's grades of a finished draft, best first; kept until the next draft finishes. */
export interface DraftGrades {
  year: number;
  teams: ClassGrade[];
}

/** A place in the draft on the media's chart, which halves every `halfEvery` picks. */
const chart = (n: number): number => 2 ** (-(n - 1) / G.halfEvery);

/** The letter for a class's score. */
export const letterFor = (score: number): string => G.letters.find(([least]) => score >= least)?.[1] ?? 'D';

/**
 * The media's grades (spec 10.4; D-48): each team's class scored by the chart value of the players it took,
 * at their places on the media's final board, over the chart value of the picks it used, with a line on its
 * best value and its biggest reach. Teams without a pick in the draft aren't graded.
 */
export function gradeDraft(league: League, year: number, board: readonly string[]): DraftGrades {
  const place = new Map(board.map((id, i) => [id, i + 1]));
  const made = picksIn(league, year).filter(p => p.playerId !== null && p.number !== null);
  const teams: ClassGrade[] = [];
  for (const team of TEAM_ABBRS) {
    const mine = made
      .filter(p => p.owner === team)
      .map(p => {
        const number = p.number as number;
        return { number, rank: place.get(p.playerId as string) ?? board.length, player: league.players[p.playerId as string] }; // prettier-ignore
      });
    if (!mine.length) continue;
    const score = mine.reduce((a, p) => a + chart(p.rank), 0) / mine.reduce((a, p) => a + chart(p.number), 0);
    const named = (p: (typeof mine)[number]) =>
      p.player ? `${p.player.position} ${fullName(p.player)} at pick ${p.number}` : `pick ${p.number}`;
    const value = mine
      .filter(p => p.rank <= p.number * G.valueShare && p.number - p.rank >= G.valueBy)
      .sort((a, b) => chart(b.rank) - chart(b.number) - (chart(a.rank) - chart(a.number)))[0];
    const reach = mine
      .filter(p => p.rank >= p.number * G.reachShare && p.rank - p.number >= G.reachBy)
      .sort((a, b) => chart(b.number) - chart(b.rank) - (chart(a.number) - chart(a.rank)))[0];
    const first = mine[0] as (typeof mine)[number];
    const lines = [
      value ? `Best value: ${named(value)}, ${ordinal(value.rank)} on the media's board.` : null,
      reach ? `Biggest reach: ${named(reach)}, ${ordinal(reach.rank)} on the board.` : null,
      !value && !reach ? `First pick: ${named(first)}, ${ordinal(first.rank)} on the media's board.` : null
    ];
    teams.push({ team, letter: letterFor(score), score: Math.round(score * 1000) / 1000, blurb: lines.filter(Boolean).join(' ') }); // prettier-ignore
  }
  teams.sort((a, b) => b.score - a.score || (a.team < b.team ? -1 : 1));
  return { year, teams };
}

/**
 * After the last pick (spec 10.4): the media grade each team's class, the prospects nobody took join the
 * league as undrafted free agents, teams get their picks three drafts on, and the class leaves the draft
 * room. Returns the grades, which the league keeps until the next draft.
 */
export function finishDraft(league: League): DraftGrades | null {
  const draft = draftUnderWay(league);
  if (!draft || onTheClock(league)) return null;
  const grades = gradeDraft(league, draft.year, draft.board ?? []);
  for (const p of draft.prospects) league.players[p.player.id] = p.player;
  issueNextYear(league, draft.year);
  league.draft = null;
  league.draftGrades = grades;
  return grades;
}
