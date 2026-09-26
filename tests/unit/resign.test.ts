import { describe, expect, it } from 'vitest';
import { resignDecisions } from '../../src/engine/ai/decisions/resign';
import { capSheet } from '../../src/engine/cap/sheet';
import { capCharge, capHit } from '../../src/engine/contracts/cap';
import { extensionContract } from '../../src/engine/contracts/build';
import {
  creditedNextYear,
  expiring,
  extensionAsk,
  freeAgentKind,
  optionOpen,
  optionSalary,
  snapShare,
  tagSalary,
  tenderLevels,
  tenderSalary
} from '../../src/engine/contracts/resign';
import { emptyYear, type Contract, type ContractType } from '../../src/engine/contracts/types';
import { openLeagueYear } from '../../src/engine/league/league-year';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { makeMove } from '../../src/engine/roster/moves';
import { situationLeague } from '../helpers/situations';

// The re-sign window (spec 11.4, 11.5): tags, tenders, fifth-year options, and extensions. Amounts are
// worked by hand from contracts set up here; the 2026 league year runs until free agency opens.
const at = (phase: Phase, season = 2026): GameDate => ({ season, phase, week: 1 });
const deal = (
  id: string,
  player: Player,
  years: [number, number][],
  change: Partial<Contract> = {}
): Contract => ({
  id,
  playerId: player.id,
  team: player.team ?? 'MIN',
  signed: at('freeAgency', 2024),
  type: 'veteran' as ContractType,
  years: years.map(([year, base]) => ({ ...emptyYear(year), base })),
  signingBonus: 0,
  signingBonusYears: null,
  vesting: [],
  noTrade: false,
  fifthYearOption: 'none',
  restructures: [],
  weeklyPay: 0,
  ended: null,
  ...change
});
const give = (league: League, player: Player, contract: Contract) => {
  league.contracts[contract.id] = contract;
  player.contractId = contract.id;
};

/**
 * A league in the 2026 re-sign window whose quarterbacks under contract have 2026 cap hits of 50, 45, 40,
 * 35, 30, 25, 20, 15, 10, and 5 million dollars, then 1 million for the rest, on one-year deals.
 */
function window(): { league: League; qbs: Player[] } {
  const league = structuredClone(situationLeague);
  league.date = at('resign');
  const qbs = Object.values(league.players)
    .filter(p => p.position === 'QB' && p.team && p.contractId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  qbs.forEach((p, i) =>
    give(league, p, deal(`q${i}`, p, [[2026, i < 10 ? (50 - 5 * i) * 1_000_000 : 1_000_000]]))
  );
  return { league, qbs };
}

describe('tags and tenders (spec 11.5)', () => {
  it('prices a tag at the top of the position, or above his salary, and more for a tag again', () => {
    const { league, qbs } = window();
    const backup = qbs[12] as Player;
    // Top 5: (50 + 45 + 40 + 35 + 30) / 5 = 40M; top 10 adds 25, 20, 15, 10, 5: 27.5M.
    expect(tagSalary(league, backup, 'exclusive')).toBe(40_000_000);
    expect(tagSalary(league, backup, 'transition')).toBe(27_500_000);
    // The best-paid quarterback: 120% of 50M is 60M, more than the average.
    expect(tagSalary(league, qbs[0] as Player, 'nonExclusive')).toBe(60_000_000);
    // Tagged in 2026 at 45M: a second straight tag is 120% of it, 54M.
    const tagged = qbs[1] as Player;
    give(league, tagged, deal('tag26', tagged, [[2026, 45_000_000]], { type: 'franchiseTag' }));
    expect(tagSalary(league, tagged, 'exclusive')).toBe(54_000_000);
    // A third straight tag: 144% of 45M, 64.8M.
    league.contracts.tag25 = deal('tag25', tagged, [[2025, 40_000_000]], { type: 'franchiseTag' });
    expect(tagSalary(league, tagged, 'exclusive')).toBe(64_800_000);
  });

  it('tenders restricted free agents by level, and exclusive-rights players at the minimum', () => {
    const { league } = window();
    const [rfa, erfa] = Object.values(league.players).filter(p => p.team === 'MIN' && p.position !== 'QB' && p.status === 'active') as [Player, Player];
    Object.assign(rfa, { experience: 3, accrued: 3 });
    Object.assign(erfa, { experience: 2, accrued: 2 });
    give(league, rfa, deal('r1', rfa, [[2026, 5_000_000]]));
    give(league, erfa, deal('e1', erfa, [[2026, 1_000_000]]));
    expect(freeAgentKind(league, rfa)).toBe('restricted');
    expect(freeAgentKind(league, erfa)).toBe('exclusive');
    expect(tenderLevels(league, rfa)).toEqual(['first', 'second', 'original', 'refusal']);
    expect(tenderLevels(league, erfa)).toEqual(['exclusive']);
    // A tender pays at least 110% of his 5M base: 5.5M beats the 3.52M original-round amount.
    expect(tenderSalary(league, rfa, 'first')).toBe(8_046_000);
    expect(tenderSalary(league, rfa, 'second')).toBe(5_767_000);
    expect(tenderSalary(league, rfa, 'original')).toBe(5_500_000);
    expect(tenderSalary(league, erfa, 'exclusive')).toBe(league.rules.pay.minimumSalary[2]);
  }); // prettier-ignore

  it('makes tags and tenders deals for next year, one tag a team, and only in the window', () => {
    const { league, qbs } = window();
    const team = league.meta.start.userTeam;
    const [star, other] = Object.values(league.players).filter(p => p.team === team && p.position !== 'QB' && p.status === 'active') as [Player, Player];
    for (const [p, id] of [[star, 's1'], [other, 's2']] as const) {
      Object.assign(p, { experience: 6, accrued: 6 });
      give(league, p, deal(id, p, [[2026, 2_000_000]]));
    }
    league.date = at('awards');
    expect(makeMove(league, { kind: 'tag', team, playerId: star.id, tag: 'exclusive' }, stream(1)).ok).toBe(false);
    league.date = at('resign');
    const done = makeMove(league, { kind: 'tag', team, playerId: star.id, tag: 'exclusive' }, stream(1));
    expect(done.ok && done.value.year).toBe(2027);
    const tag = league.contracts[star.nextContractId ?? ''] as Contract;
    expect(tag).toMatchObject({ type: 'franchiseTag', rights: 'exclusive' });
    expect(tag.years).toMatchObject([{ year: 2027, guaranteedBase: tag.years[0]?.base }]);
    expect(expiring(league, star)).toBe(false);
    expect(makeMove(league, { kind: 'tag', team, playerId: other.id, tag: 'transition' }, stream(1))).toMatchObject({ ok: false, reason: 'You can tag one player a year, and you already have.' });
    expect(qbs.length).toBeGreaterThan(10);
  }); // prettier-ignore
});

describe('fifth-year options (spec 11.4)', () => {
  it('opens after the third year of a first-round deal, priced by tier, and adds a guaranteed fifth year', () => {
    const { league } = window();
    const team = league.meta.start.userTeam;
    const p = Object.values(league.players).find(q => q.team === team && q.position === 'WR' && q.status === 'active') as Player;
    give(league, p, deal('rk', p, [[2024, 1_000_000], [2025, 1_000_000], [2026, 1_000_000], [2027, 1_000_000]], { type: 'rookie', fifthYearOption: 'eligible' }));
    expect(optionOpen(league, p)).toBe(true);
    p.ovr = 99;
    expect(optionSalary(league, p)).toMatchObject({ tier: 'franchise', salary: tagSalary(league, p, 'nonExclusive') });
    p.ovr = 40;
    // Playing time is his share of his team's offensive or defensive snaps; special teams don't count.
    league.season.teamScrimmage[team] = [1_000, 1_050];
    league.season.scrimmage[p.id] = [750, 0];
    league.season.snaps[p.id] = 1_200;
    expect(snapShare(league, p)).toBeCloseTo(0.75, 5);
    expect(optionSalary(league, p).tier).toBe('playingTime');
    league.season.scrimmage[p.id] = [749, 0];
    expect(optionSalary(league, p).tier).toBe('basic');
    const salary = optionSalary(league, p).salary;
    expect(makeMove(league, { kind: 'option', team, playerId: p.id, exercise: true }, stream(2)).ok).toBe(true);
    const c = league.contracts.rk as Contract;
    expect(c.fifthYearOption).toBe('exercised');
    expect(c.years.at(-1)).toMatchObject({ year: 2028, base: salary, guaranteedBase: salary });
    expect(optionOpen(league, p)).toBe(false);
  }); // prettier-ignore
});

describe('extensions', () => {
  it('signs at his asking price, counts on next year, takes over with the league year, and ends if he leaves', () => {
    const { league } = window();
    const team = league.meta.start.userTeam;
    const [kept, cut] = Object.values(league.players).filter(p => p.team === team && p.position !== 'QB' && p.status === 'active') as [Player, Player];
    for (const [p, id] of [[kept, 'k1'], [cut, 'k2']] as const) {
      Object.assign(p, { experience: 6, accrued: 6 });
      give(league, p, deal(id, p, [[2026, 2_000_000]]));
    }
    const ask = extensionAsk(league, kept);
    const low = { years: 3, salary: ask - 100_000, signingBonus: 0 };
    expect(makeMove(league, { kind: 'extend', team, playerId: kept.id, offer: low }, stream(3))).toMatchObject({ ok: false });
    const before = capSheet(league, team, 2027).space;
    expect(makeMove(league, { kind: 'extend', team, playerId: kept.id, offer: { years: 3, salary: ask, signingBonus: 0 } }, stream(3)).ok).toBe(true);
    const ext = league.contracts[kept.nextContractId ?? ''] as Contract;
    expect(ext.type).toBe('extension');
    expect(ext.years.map(y => y.year)).toEqual([2027, 2028, 2029]);
    expect(capSheet(league, team, 2027).space).toBe(before - capHit(ext, 2027, league.rules));
    // A 3M bonus on the second one's extension over 2027 to 2029; releasing him now accelerates it all.
    makeMove(league, { kind: 'extend', team, playerId: cut.id, offer: { years: 3, salary: extensionAsk(league, cut), signingBonus: 3_000_000 } }, stream(4));
    const cutExt = cut.nextContractId as string;
    expect(makeMove(league, { kind: 'release', team, playerId: cut.id }, stream(5)).ok).toBe(true);
    expect(league.contracts[cutExt]?.ended?.how).toBe('released');
    expect(capCharge(league.contracts[cutExt] as Contract, 2027, league.rules).dead).toBe(3_000_000);
    // The league year opens: the kept player plays on his extension.
    openLeagueYear(league, at('freeAgency'), stream(6));
    expect(kept).toMatchObject({ team, contractId: ext.id, status: 'active' });
    expect(kept.nextContractId).toBeUndefined();
  }); // prettier-ignore
});

describe("the new league year's pay scales (spec 11.1, 11.5)", () => {
  it('raises running years to the new minimums and tenders to the new amounts', () => {
    const { league } = window();
    const team = league.meta.start.userTeam;
    const [young, sure, rfa, erfa] = Object.values(league.players).filter(p => p.team === team && p.position !== 'QB' && p.status === 'active') as [Player, Player, Player, Player];
    const min = [...league.rules.pay.minimumSalary];
    const second = league.rules.tags.tenders.secondRound;
    // An undrafted deal priced at the old minimums, a fully guaranteed one, and two tenders.
    Object.assign(young, { experience: 1 });
    give(league, young, deal('y1', young, [[2026, min[0] as number], [2027, min[1] as number]], { type: 'udfa' }));
    Object.assign(sure, { experience: 2 });
    give(league, sure, deal('g1', sure, [[2026, min[1] as number], [2027, min[2] as number]], { type: 'rookie' }));
    (league.contracts.g1 as Contract).years.forEach(y => (y.guaranteedBase = y.base));
    Object.assign(rfa, { experience: 3, accrued: 3 });
    give(league, rfa, deal('r1', rfa, [[2026, 1_000_000]]));
    Object.assign(erfa, { experience: 2, accrued: 2 });
    give(league, erfa, deal('e1', erfa, [[2026, 900_000]]));
    expect(makeMove(league, { kind: 'tender', team, playerId: rfa.id, level: 'second' }, stream(1)).ok).toBe(true);
    expect(makeMove(league, { kind: 'tender', team, playerId: erfa.id, level: 'exclusive' }, stream(1)).ok).toBe(true);
    openLeagueYear(league, at('freeAgency'), stream(7));
    const now = league.rules.pay.minimumSalary;
    expect(now[1]).toBeGreaterThan(min[1] as number);
    expect(league.contracts.y1?.years[1]).toMatchObject({ year: 2027, base: now[1] });
    expect(league.contracts.g1?.years[1]).toMatchObject({ base: now[2], guaranteedBase: now[2] });
    expect(league.rules.tags.tenders.secondRound).toBeGreaterThan(second);
    expect(league.contracts[rfa.contractId ?? '']?.years[0]?.base).toBe(league.rules.tags.tenders.secondRound);
    expect(league.contracts[erfa.contractId ?? '']?.years[0]?.base).toBe(now[2]);
    // Years already played stay as they were.
    expect(league.contracts.y1?.years[0]?.base).toBe(min[0]);
  }); // prettier-ignore

  it("prices an extension's minimums by the seasons he'll have when it starts", () => {
    const { league } = window();
    const [p] = Object.values(league.players).filter(q => q.team === 'MIN' && q.position !== 'QB') as [Player];
    Object.assign(p, { experience: 3 });
    // In the window the season just played is already credited; during a season it counts when it ends.
    expect(creditedNextYear(league, p)).toBe(3);
    const low = { years: 2, salary: 0, signingBonus: 0 };
    const base = { id: 'x', playerId: p.id, team: 'MIN' as const };
    const min = league.rules.pay.minimumSalary;
    expect(extensionContract(league.rules, base, league.date, low, creditedNextYear(league, p)).years.map(y => y.base)).toEqual([min[3], min[4]]);
    league.date = at('regularSeason');
    expect(creditedNextYear(league, p)).toBe(4);
    league.date = at('draft');
    expect(creditedNextYear(league, p)).toBe(4);
  }); // prettier-ignore
});

describe('AI decisions in the window', () => {
  it('keeps the players AI teams want and leaves the user to decide', () => {
    const league = structuredClone(situationLeague);
    league.date = at('resign');
    // Every deal runs out after 2026.
    for (const c of Object.values(league.contracts)) c.years = c.years.filter(y => y.year <= 2026);
    const user = league.meta.start.userTeam;
    resignDecisions(league, 'KC', stream(7));
    const kept = Object.values(league.players).filter(p => p.team === 'KC' && p.nextContractId);
    expect(kept.length).toBeGreaterThan(10);
    expect(kept.every(p => (league.contracts[p.nextContractId ?? '']?.years[0]?.year ?? 0) === 2027)).toBe(
      true
    );
    expect(Object.values(league.players).some(p => p.team === user && p.nextContractId)).toBe(false);
    expect(capSheet(league, 'KC', 2027).space).toBeGreaterThanOrEqual(0);
  });
});
