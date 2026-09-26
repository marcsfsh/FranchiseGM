import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import {
  draftUnderWay,
  finishDraft,
  gradeDraft,
  letterFor,
  makePick,
  onTheClock,
  openDraft,
  pickProblem,
  runDraft,
  staffChoice
} from '../../src/engine/draft/draft';
import { draftMediaWeek } from '../../src/engine/draft/media';
import { picksIn } from '../../src/engine/draft/picks';
import { scoutWeek } from '../../src/engine/draft/scouting';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { advanceOffseason, draftBlock, draftRoomPick } from '../../src/engine/season/offseason';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// The draft (spec 10.4; D-48): pick by pick on the numbered records, the AI by grade and need, the user by
// hand or by the staff, rookie deals by pick, the media's grades, and the offseason waiting for the user.
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });
const fresh = (phase: Phase): League =>
  Object.assign(structuredClone(situationLeague), { date: at(2026, phase) });
const step = (league: League, entropy = 1) => advanceOffseason(league, { names: nameData() }, { actions: 0, entropy }); // prettier-ignore

/** A league whose draft has opened, the AI's picks made up to the user's first. */
function opened(): League {
  const league = fresh('proDays');
  expect(step(league).blocked).toBeNull();
  expect(league.date).toEqual(at(2026, 'draft'));
  return league;
}

describe('the draft (spec 10.4)', () => {
  it('opens with the media board final, and the AI picks by grade and need until the user is on the clock', () => {
    const league = fresh('proDays');
    const user = league.meta.start.userTeam;
    // Pick by pick, each AI team takes the prospect its staff values most with the pick.
    const copy = structuredClone(league);
    copy.date = at(2026, 'draft');
    openDraft(copy, nameData(), stream(1, 'class'));
    const first = onTheClock(copy);
    const expected = first ? staffChoice(copy, first.owner) : null;
    const outcome = step(league);
    expect(outcome.blocked).toBeNull();
    const draft = draftUnderWay(league);
    expect(draft?.board).toHaveLength(TUNING.draft.classSize);
    const clock = onTheClock(league);
    expect(clock?.owner).toBe(user);
    const made = picksIn(league, 2027).filter(p => p.playerId);
    expect(made).toHaveLength((clock?.number ?? 0) - 1);
    expect(made.every(p => p.owner !== user)).toBe(true);
    if (first?.owner !== user) expect(made[0]?.playerId).toBe(expected);
    expect(outcome.inbox.some(m => m.title.startsWith("The draft is on: you're on the clock with the"))).toBe(true);
    // The scouting and the media's coverage are over.
    const bank = JSON.stringify(draft?.scouting);
    scoutWeek(league);
    expect(JSON.stringify(draft?.scouting)).toBe(bank);
    expect(draftMediaWeek(league, 40, null, TEAM_ABBRS, stream(1, 'media'))).toEqual([]);
  }, 60_000); // prettier-ignore

  it('waits for the user, whose pick joins the team on the rookie deal for its number', () => {
    const league = opened();
    const user = league.meta.start.userTeam;
    const clock = onTheClock(league);
    if (!clock) throw new Error('no pick');
    // The league can't leave the draft while the user is on the clock.
    const before = { ...league.date };
    const blocked = step(league, 2);
    expect(blocked.blocked).toMatch(/^You're on the clock with the \d+(st|nd|rd|th) pick\. Make your pick in the Draft room/);
    expect(league.date).toEqual(before);
    // Only the team on the clock picks, and only a prospect still in the class.
    const taken = picksIn(league, 2027)[0]?.playerId ?? '';
    const prospect = draftUnderWay(league)?.prospects.at(-1)?.player.id ?? '';
    expect(pickProblem(league, 'KC', prospect)).toBe('The Vikings are on the clock, not you.');
    expect(draftRoomPick(league, { prospectId: taken })).toEqual({ ok: false, reason: "He isn't available: he's been drafted, or he isn't in this class." });
    const result = draftRoomPick(league, { prospectId: prospect });
    expect(result.ok).toBe(true);
    const player = league.players[prospect];
    const contract = league.contracts[player?.contractId ?? ''];
    expect(player).toMatchObject({ team: user, status: 'active', draft: { year: 2027, round: clock.round, pick: clock.number, team: user } });
    expect(contract).toMatchObject({ type: 'rookie', team: user, playerId: prospect });
    expect(contract?.years.map(y => y.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(draftUnderWay(league)?.prospects.some(p => p.player.id === prospect)).toBe(false);
    expect(league.season.transactions.at(-1)?.kind).toBe('drafted');
    // The AI picked on to the user's next pick.
    const next = onTheClock(league);
    expect(next?.owner).toBe(user);
    expect(picksIn(league, 2027).filter(p => (p.number ?? 0) < (next?.number ?? 0)).every(p => p.playerId)).toBe(true);
    // The staff's pick is its choice.
    const staff = staffChoice(league, user);
    expect(draftRoomPick(league, { staff: 'pick' }).ok).toBe(true);
    expect(league.players[staff ?? '']?.team).toBe(user);
  }, 60_000); // prettier-ignore

  it('lets the staff draft the rest, then grades every class and frees the rest to sign', () => {
    const league = opened();
    const user = league.meta.start.userTeam;
    const left = draftUnderWay(league)?.prospects.length ?? 0;
    const result = draftRoomPick(league, { staff: 'rest' });
    expect(result.ok && result.value.length).toBe(7 * 32 - (450 - left));
    expect(league.draft).toBeNull();
    expect(draftBlock(league)).toBeNull();
    expect(league.draftGrades?.year).toBe(2027);
    expect(league.draftGrades?.teams).toHaveLength(32);
    const undrafted = Object.values(league.players).filter(p => p.draft.year === 2027 && 'undrafted' in p.draft);
    expect(undrafted).toHaveLength(450 - 224);
    expect(undrafted.every(p => p.status === 'freeAgent' && p.team === null)).toBe(true);
    expect(league.picks.filter(p => p.year === 2030)).toHaveLength(7 * 32);
    const grade = league.draftGrades?.teams.find(g => g.team === user);
    expect(league.inbox.at(-1)?.title).toBe(`Your 2027 draft class: ${grade?.letter} from the media`);
    expect(league.inbox.at(-1)?.body).toMatch(/^Round 1, pick \d+: /);
    expect(league.season.news.some(n => n.headline.startsWith('Draft grades: the '))).toBe(true);
    // Now the league moves on.
    expect(step(league, 3).blocked).toBeNull();
    expect(league.date.phase).toBe('udfa');
  }, 60_000); // prettier-ignore

  it("makes the user's picks by the staff on auto, without stopping", () => {
    const league = fresh('proDays');
    league.settings.auto.draft = true;
    const outcome = step(league);
    expect(outcome.blocked).toBeNull();
    expect(league.draft).toBeNull();
    expect(picksIn(league, 2027).every(p => p.playerId)).toBe(true);
    expect(outcome.inbox.some(m => m.title.startsWith('Your 2027 draft class'))).toBe(true);
    expect(outcome.news.some(n => / first overall$/.test(n.headline))).toBe(true);
  }, 60_000);

  it('ends when the class runs out, with the picks left unused', () => {
    const league = fresh('draft');
    league.settings.auto.draft = true;
    const draft = openDraft(league, nameData(), stream(2, 'class'));
    draft.prospects.splice(40);
    expect(runDraft(league, stream(2, 'draft'))).toHaveLength(40);
    expect(onTheClock(league)).toBeNull();
    expect(makePick(league, 'nobody', stream(3, 'draft')).ok).toBe(false);
    expect(finishDraft(league)?.teams.length).toBeGreaterThan(0);
    expect(picksIn(league, 2027).filter(p => p.playerId)).toHaveLength(40);
  }, 60_000);
});

describe("the media's grades (spec 10.4)", () => {
  it('score a class by the board places it took against the picks it used', () => {
    const league = fresh('draft');
    league.settings.auto.draft = true;
    openDraft(league, nameData(), stream(4, 'class'));
    runDraft(league, stream(4, 'draft'));
    const picks = picksIn(league, 2027);
    const ids = picks.map(p => p.playerId as string);
    // A board in the order the players went: every class breaks even, a B.
    const even = gradeDraft(league, 2027, ids);
    expect(even.teams.every(g => Math.abs(g.score - 1) < 1e-9 && g.letter === 'B')).toBe(true);
    expect(even.teams[0]?.blurb).toMatch(
      /^First pick: [A-Z]+ .+ at pick \d+, \d+(st|nd|rd|th) on the media's board\.$/
    );
    // Minnesota's players at the top of the board are value; its first pick at the bottom, a reach.
    const mine = picks.filter(p => p.owner === 'MIN').map(p => p.playerId as string);
    const value = gradeDraft(league, 2027, [...mine, ...ids.filter(id => !mine.includes(id))]);
    const top = value.teams.find(g => g.team === 'MIN');
    expect(top?.letter).toBe('A');
    expect(top?.blurb).toMatch(/^Best value: /);
    const reach = gradeDraft(league, 2027, [...ids.filter(id => id !== mine[0]), mine[0] as string]);
    const low = reach.teams.find(g => g.team === 'MIN');
    expect(low?.score).toBeLessThan(1);
    expect(low?.blurb).toMatch(/Biggest reach: .+, 224th on the board\.$/);
    expect(reach.teams[0]?.score).toBeGreaterThanOrEqual(reach.teams.at(-1)?.score ?? 0);
  }, 60_000);

  it('turn scores into letters', () => {
    expect(letterFor(2)).toBe('A');
    expect(letterFor(1.6)).toBe('A');
    expect(letterFor(1.59)).toBe('A-');
    expect(letterFor(1)).toBe('B');
    expect(letterFor(0.5)).toBe('C');
    expect(letterFor(0.1)).toBe('D');
  });
});
