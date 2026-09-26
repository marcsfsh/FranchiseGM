import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS, type TeamAbbr } from '../../src/data/team-colors';
import { emptyYear, type Contract } from '../../src/engine/contracts/types';
import { contractSummary } from '../../src/engine/contracts/view';
import {
  awardCompensatoryPicks,
  compensatoryPicks,
  qualifyingFreeAgents
} from '../../src/engine/draft/compensatory';
import { closeDraftYear, picksIn } from '../../src/engine/draft/picks';
import { openLeagueYear } from '../../src/engine/league/league-year';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { situationLeague } from '../helpers/situations';

// Compensatory picks (spec 11.8; D-58).
/** The league at the 2026 combine, before the annual meeting, with the 2027 draft numbered in team order. */
function atCombine(): League {
  const league = structuredClone(situationLeague);
  league.date = { season: 2026, phase: 'combine', week: 1 };
  closeDraftYear(league, 2027, TEAM_ABBRS);
  league.departures = { year: 2026, players: {} };
  return league;
}

/** The yearly values of the league's deals, practice squads apart, highest first. */
const values = (league: League): number[] =>
  Object.values(league.players)
    .flatMap(p => {
      const c = p.team && p.contractId ? league.contracts[p.contractId] : undefined;
      return c && c.type !== 'practiceSquad' ? [contractSummary(c, league.date).apy] : [];
    })
    .sort((a, b) => b - a);

let serial = 0;
/**
 * A free agent who left `from` and signed with `to` in 2026's free agency for `apy` a year, playing
 * `snaps` of his new team's offensive snaps last season.
 */
function moved(league: League, from: TeamAbbr, to: TeamAbbr, apy: number, snaps = 0.5): Player {
  const p = Object.values(league.players).find(q => q.team === 'NYJ' && q.status === 'active' && !Object.keys(league.departures?.players ?? {}).includes(q.id));
  if (!p) throw new Error('no player');
  const id = `cfa${serial++}`;
  const deal: Contract = {
    id, playerId: p.id, team: to, signed: { season: 2025, phase: 'freeAgency', week: 2 }, type: 'veteran',
    years: [{ ...emptyYear(2026), base: apy }, { ...emptyYear(2027), base: apy }],
    signingBonus: 0, signingBonusYears: null, vesting: [], noTrade: false, fifthYearOption: 'none', restructures: [], weeklyPay: 0, ended: null
  }; // prettier-ignore
  league.contracts[id] = deal;
  Object.assign(p, { team: to, contractId: id });
  (league.departures as NonNullable<League['departures']>).players[p.id] = from;
  league.season.scrimmage[p.id] = [Math.round(snaps * 1000), 0];
  league.season.teamScrimmage[to] = [1000, 1000];
  return p;
} // prettier-ignore

describe('qualifying free agents (spec 11.8)', () => {
  it('rank by their new deals, a round better for a starter and worse for a part-timer', () => {
    const league = atCombine();
    const top = (values(league)[0] ?? 0) + 1_000_000;
    const star = moved(league, 'MIN', 'GB', top, 0.5);
    const starter = moved(league, 'MIN', 'CHI', top, 0.9);
    const partTimer = moved(league, 'MIN', 'DET', top, 0.1);
    const cheap = moved(league, 'MIN', 'DAL', 885_000);
    const q = new Map(qualifyingFreeAgents(league).map(f => [f.playerId, f.round]));
    expect(q.get(star.id)).toBe(3);
    // Round 3 is the earliest.
    expect(q.get(starter.id)).toBe(3);
    expect(q.get(partTimer.id)).toBe(4);
    expect(q.has(cheap.id)).toBe(false);
    // A re-signing, or a player who's left his new team since, doesn't count.
    league.departures = { year: 2026, players: { [star.id]: 'GB' } };
    expect(qualifyingFreeAgents(league)).toEqual([]);
  });
});

describe('compensatory picks (spec 11.8)', () => {
  it('go to teams that lost more than they signed, after signings cancel losses, four at most', () => {
    const league = atCombine();
    const top = (values(league)[0] ?? 0) + 1_000_000;
    // Minnesota loses six and signs one; Green Bay loses one and signs two.
    for (let i = 0; i < 6; i++) moved(league, 'MIN', i < 2 ? 'GB' : 'CHI', top - i * 1000);
    moved(league, 'GB', 'MIN', top - 500);
    const picks = compensatoryPicks(league);
    const byTeam = (t: TeamAbbr) => picks.filter(p => p.team === t);
    expect(byTeam('GB')).toEqual([]);
    expect(byTeam('MIN')).toHaveLength(4);
    // The signing cancelled the best loss of its round; the best four of the other five remain.
    expect(byTeam('MIN').map(p => p.lost?.apy)).toEqual([top - 1000, top - 2000, top - 3000, top - 4000]);
    // The league awards at most its limit, the best first.
    league.rules.season.compensatoryPicks = 2;
    expect(compensatoryPicks(league).map(p => p.lost?.apy)).toEqual([top - 1000, top - 2000]);
  });

  it('add net value picks, then supplemental picks in draft order, to award exactly the limit', () => {
    const league = atCombine();
    const all = values(league);
    const top = (all[0] ?? 0) + 1_000_000;
    // Minnesota loses a third-round free agent and signs a sixth-round one from Chicago: as many signed as
    // lost, but three rounds less value.
    const star = moved(league, 'MIN', 'GB', top);
    moved(league, 'CHI', 'MIN', all[Math.floor(all.length * 0.2)] ?? 0);
    const picks = compensatoryPicks(league, TEAM_ABBRS);
    expect(picks).toHaveLength(32);
    expect(picks.slice(0, 2).map(p => [p.team, p.round, p.kind])).toEqual([['CHI', 6, 'netLoss'], ['MIN', 7, 'netValue']]);
    expect(picks[1]?.lost?.playerId).toBe(star.id);
    // The rest are supplemental, one a team in draft order, at the end of the seventh round.
    const rest = picks.slice(2);
    expect(rest.every(p => p.kind === 'supplemental' && p.round === 7 && p.lost === null)).toBe(true);
    expect(rest.map(p => p.team)).toEqual(TEAM_ABBRS.slice(0, 30));
  }); // prettier-ignore

  it('are awarded once at the annual meeting and numbered after the regular picks of their rounds', () => {
    const league = atCombine();
    const top = (values(league)[0] ?? 0) + 1_000_000;
    moved(league, 'MIN', 'GB', top);
    const awarded = awardCompensatoryPicks(league, 2027);
    expect(awarded.map(p => [p.team, p.round])[0]).toEqual(['MIN', 3]);
    expect(awarded).toHaveLength(32);
    const third = picksIn(league, 2027).filter(p => p.round === 3);
    expect(third.at(-1)).toMatchObject({
      id: '2027-3-MIN-c1',
      compensatory: true,
      owner: 'MIN',
      number: 3 * 32 + 1
    });
    expect(awardCompensatoryPicks(league, 2027)).toEqual([]);
    expect(league.picks.filter(p => p.compensatory)).toHaveLength(32);
    // The supplemental picks close the seventh round, after its regular picks: the last is the draft's 256th.
    const seventh = picksIn(league, 2027).filter(p => p.round === 7);
    expect(seventh.slice(32).every(p => p.compensatory)).toBe(true);
    expect(seventh.at(-1)?.number).toBe(7 * 32 + 32);
  });

  it('count the unrestricted free agents whose deals run out as the league year opens', () => {
    const league = structuredClone(situationLeague);
    league.date = { season: 2026, phase: 'annualMeeting', week: 1 };
    const [ufa, rfa] = Object.values(league.players).filter(p => p.team === 'MIN' && p.status === 'active');
    if (!ufa || !rfa) throw new Error('no players');
    Object.assign(ufa, { accrued: 6 });
    Object.assign(rfa, { accrued: 3 });
    for (const p of [ufa, rfa]) {
      const c = league.contracts[p.contractId ?? ''] as Contract;
      c.years = c.years.filter(y => y.year <= 2026);
      delete p.nextContractId;
    }
    openLeagueYear(league, { season: 2026, phase: 'freeAgency', week: 1 }, stream(4));
    expect(league.departures?.year).toBe(2027);
    expect(league.departures?.players[ufa.id]).toBe('MIN');
    expect(league.departures?.players[rfa.id]).toBeUndefined();
  });
});
