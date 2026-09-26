import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { cutdown } from '../../src/engine/ai/decisions/offseason';
import { closeFloorYear, teamCash } from '../../src/engine/cap/floor';
import { capSheet } from '../../src/engine/cap/sheet';
import { capCharge, capHit, prorationYears } from '../../src/engine/contracts/cap';
import { endContract } from '../../src/engine/contracts/moves';
import { emptyYear, type Contract, type ContractYear } from '../../src/engine/contracts/types';
import { finishDraft, openDraft, runDraft } from '../../src/engine/draft/draft';
import { draftOrder } from '../../src/engine/generate/rookies';
import { aiOffers, signUdfas } from '../../src/engine/draft/udfa';
import { nextCap, openLeagueYear, withCap } from '../../src/engine/league/league-year';
import { activeRoster } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { retirementChance } from '../../src/engine/progression/retirement';
import { stream } from '../../src/engine/rng';
import { DEFAULT_RULES as R } from '../../src/engine/rules/ruleset';
import { TUNING } from '../../src/engine/tuning';
import {
  advanceOffseason,
  closeSeason,
  nextStep,
  offseasonStep,
  stepLabel
} from '../../src/engine/season/offseason';
import { advanceBlock } from '../../src/engine/roster/legality';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';
import { dropContract, putContract } from '../../src/engine/league/contract-index';

// The offseason (spec 4.1): the calendar, the new league year (spec 11.1), retirements (spec 10.7), the
// draft's place in it (D-48), and the stand-in for free agency until M12 (D-27). Cap numbers are worked by
// hand.
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });
const fresh = (date: GameDate): League => {
  const league = structuredClone(situationLeague);
  league.date = date;
  return league;
};
const year = (y: number, change: Partial<ContractYear> = {}): ContractYear => ({
  ...emptyYear(y),
  ...change
});
const deal = (id: string, player: Player, change: Partial<Contract>): Contract => ({
  id,
  playerId: player.id,
  team: player.team ?? 'MIN',
  signed: at(2025, 'freeAgency'),
  type: 'veteran',
  years: [],
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
const roster = (league: League, abbr: string) =>
  Object.values(league.players)
    .filter(p => p.team === abbr && p.status === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : 1));

describe('offseason calendar (spec 4.1)', () => {
  it('walks from the Super Bowl to the next season a step at a time', () => {
    const labels: string[] = [];
    let date = at(2026, 'staff');
    while (date.phase !== 'regularSeason') {
      labels.push(stepLabel(date));
      date = nextStep(date);
    }
    expect(labels).toHaveLength(18);
    expect(labels.slice(4, 10)).toEqual([
      'Annual meeting',
      'Free agency, week 1',
      'Free agency, week 2',
      'Free agency, week 3',
      'Free agency, week 4',
      'Pro days'
    ]);
    expect(labels.at(-1)).toBe('Final cutdown');
    expect(date).toEqual(at(2027, 'regularSeason'));
    expect(offseasonStep(at(2026, 'regularSeason', 5))).toBe(0);
    expect(() => nextStep(at(2026, 'regularSeason'))).toThrow();
  });

  it('removes undrafted rookies nobody signed and credits seasons by games on full pay status', () => {
    const league = fresh(at(2026, 'superBowl'));
    const [free, cut] = Object.values(league.players).filter(p => p.status === 'freeAgent');
    const [onRoster, late, brief] = roster(league, 'MIN');
    if (!onRoster || !late || !brief || !free || !cut) throw new Error('no players');
    for (const p of [free, cut]) Object.assign(p, { experience: 0, draft: { year: 2026, undrafted: true } });
    // One signed in camp and cut in week 5 has games on record, so he stays.
    league.contracts.u1 = deal('u1', cut, { team: 'MIN', signed: at(2025, 'udfa'), years: [year(2026, { base: 885_000 })], ended: { date: at(2026, 'regularSeason', 5), how: 'released', designated: false, injured: false, terminationPay: false } });
    // A whole season, 4 games, and 2: 6 earn an accrued season as well as a credited one, 3 a credited one.
    Object.assign(league.season.fullPay, { [onRoster.id]: 17, [late.id]: 4, [brief.id]: 2 });
    const before = [onRoster, late, brief].map(p => [p.experience, p.accrued]);
    closeSeason(league);
    expect(league.players[free.id]).toBeUndefined();
    expect(league.players[cut.id]).toBeDefined();
    const after = [onRoster, late, brief].map((p, i) => [p.experience - (before[i]?.[0] ?? 0), p.accrued - (before[i]?.[1] ?? 0)]);
    expect(after).toEqual([[1, 1], [1, 0], [0, 0]]);
  }); // prettier-ignore
});

describe('the re-sign window (spec 4.1, 11.4, 11.5)', () => {
  /** A league at the awards with every deal running out when the 2027 league year opens. */
  // Every deal runs out after 2026, its signing bonus still prorated as signed, so 2026's cap is as it was.
  const expiringLeague = (): League => {
    const league = fresh(at(2026, 'awards'));
    for (const c of Object.values(league.contracts)) {
      c.signingBonusYears = prorationYears(c, league.rules);
      c.years = c.years.filter(y => y.year <= 2026);
    }
    return league;
  };
  const kept = (league: League, abbr: string) =>
    Object.values(league.players).filter(p => p.team === abbr && p.nextContractId).length;

  it("opens with a message that pauses a sim, and closes with the AI teams' decisions", () => {
    const league = expiringLeague();
    const user = league.meta.start.userTeam;
    const open = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(league.date.phase).toBe('resign');
    const message = open.inbox.find(m => m.title === 'The re-sign window is open');
    expect(message).toMatchObject({ kind: 'contracts', event: 'deadlines' });
    expect(message?.body).toMatch(/run out when the 2027 league year opens\. .*The window closes when you advance to the combine\.$/);
    expect(open.pauses).toContain(message);
    const close = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(league.date.phase).toBe('combine');
    expect(TEAM_ABBRS.filter(t => t !== user).every(t => kept(league, t) > 0)).toBe(true);
    expect(kept(league, user)).toBe(0);
    expect(close.inbox).toHaveLength(0);
    expect(league.season.transactions.filter(t => t.phase === 'resign').map(t => t.kind)).toEqual(expect.arrayContaining(['extended', 'tendered']));
  }, 60_000); // prettier-ignore

  it("lets the staff make the user's decisions with contracts on auto", () => {
    const league = expiringLeague();
    league.settings.auto.contracts = true;
    const user = league.meta.start.userTeam;
    const open = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(open.inbox.some(m => m.title === 'The re-sign window is open')).toBe(false);
    const close = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(kept(league, user)).toBeGreaterThan(0);
    expect(close.inbox[0]?.title).toMatch(/^Your staff made \d+ contract decisions?$/);
  }, 60_000);
});

describe('new league year (spec 11.1)', () => {
  it('grows the cap by the fixed-rate and revenue blend, within the floor and ceiling', () => {
    // 301.2M x (1 + 0.5 x 0.07 + 0.5 x 0.05) = 301.2M x 1.06 = 319,272,000, to the nearest 100,000.
    expect(nextCap(R, 0.05)).toBe(319_300_000);
    // 0.035 + 0.5 x 0.2 = 0.135, held to the 10% ceiling: 331,320,000.
    expect(nextCap(R, 0.2)).toBe(331_300_000);
    // 0.035 - 0.1 = -0.065, held to the 0% floor.
    expect(nextCap(R, -0.2)).toBe(301_200_000);
    // Pay grows by 319.3 / 301.2 = 1.0600929: 885,000 -> 938,182 -> 940,000 (to 5,000); 13,750 -> 14,576
    // -> 14,600 (to 50); the top rookie bonus 33,000,000 -> 34,983,067 -> 34,985,000.
    const grown = withCap(R, 319_300_000);
    expect(grown.cap.amount).toBe(319_300_000);
    expect(grown.pay.minimumSalary[0]).toBe(940_000);
    expect(grown.pay.practiceSquadWeekly).toBe(14_600);
    expect(grown.rookieScale.topSigningBonus).toBe(34_985_000);
    expect(R.cap.amount).toBe(301_200_000);
  });

  it('carries over unused space, ends expired deals, declines unexercised options, and clears reserve lists', () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const [expiring, hurt, optioned] = roster(league, 'MIN') as [Player, Player, Player];
    // A deal whose last year is 2026; one running to 2027 for a player on injured reserve; and one whose
    // 2027 is a team option nobody exercised, with a 3,000,000 signing bonus over 2025 to 2027.
    const deals = [
      deal('x1', expiring, { years: [year(2025, { base: 1_000_000 }), year(2026, { base: 1_000_000 })] }),
      deal('x2', hurt, { years: [year(2026, { base: 2_000_000 }), year(2027, { base: 2_000_000 })] }),
      deal('x3', optioned, {
        signingBonus: 3_000_000,
        years: [year(2025, { base: 1_000_000 }), year(2026, { base: 1_000_000 }), year(2027, { base: 5_000_000, option: 'team' })]
      })
    ];
    for (const c of deals) {
      putContract(league, c);
      const p = league.players[c.playerId] as Player;
      p.contractId = c.id;
    }
    hurt.status = 'ir';
    const space = capSheet(league, 'MIN').space;
    const change = openLeagueYear(league, at(2026, 'freeAgency'), stream(1, 'year'));
    expect(change.year).toBe(2027);
    expect(league.teams.MIN.carryover).toBe(Math.max(0, space));
    expect(league.rules.cap.amount).toBe(change.cap);
    expect(expiring).toMatchObject({ team: null, status: 'freeAgent', contractId: null });
    expect(hurt).toMatchObject({ team: 'MIN', status: 'active', contractId: 'x2' });
    expect(optioned.status).toBe('freeAgent');
    expect(league.contracts.x3?.ended?.how).toBe('declined');
    // The declined deal's 2027 proration (1,000,000) stays on the 2027 cap; its 2027 base doesn't.
    expect(capHit(league.contracts.x3 as Contract, 2027, league.rules)).toBe(1_000_000);
    expect(change.expired.map(e => e.playerId)).toEqual(expect.arrayContaining([expiring.id, optioned.id]));
    // 2026 counts toward the salary floor's first window, which runs to 2029.
    expect(change.shortfalls).toEqual([]);
    expect(league.teams.MIN.spending).toMatchObject([{ year: 2026 }]);
    expect(league.caps).toEqual({ 2026: R.cap.amount, 2027: change.cap });
  }); // prettier-ignore

  it("counts a deal's incentives for the new league year as likely when last regular season reached them", () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const [reached, short] = roster(league, 'MIN') as [Player, Player];
    const sacks = [{ condition: '10 sacks', amount: 500_000, likely: false, stat: { key: 'sacks' as const, atLeast: 10 }, earned: null }];
    for (const p of [reached, short]) {
      const c = deal(`i-${p.id}`, p, { years: [year(2026, { base: 1_000_000 }), year(2027, { base: 1_000_000, incentives: sacks })] });
      putContract(league, c);
      p.contractId = c.id;
    }
    league.season.totals = { [reached.id]: { sacks: 12 }, [short.id]: { sacks: 6 } };
    openLeagueYear(league, at(2026, 'freeAgency'), stream(1, 'year'));
    // 12 sacks reach the mark, so its 500,000 counts on the 2027 cap from the start (Article 13); 6 don't. The
    // base is his 2027 salary, raised to the new minimum where it falls under it.
    const entry = (p: Player) => league.contracts[`i-${p.id}`] as Contract;
    const base = (p: Player) => entry(p).years.find(y => y.year === 2027)?.base ?? 0;
    expect(capHit(entry(reached), 2027, league.rules)).toBe(base(reached) + 500_000);
    expect(capHit(entry(short), 2027, league.rules)).toBe(base(short));
  }); // prettier-ignore

  it("counts each team's cash toward the salary floor, and finds shortfalls when a window closes", () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const [paid, cut] = roster(league, 'MIN') as [Player, Player];
    // Minnesota's only deals: one for 2026 and 2027 with a 1,000,000 signing bonus, and one released
    // before the 2026 season that still owes its guarantees, 4,000,000 in 2026 and 5,000,000 in 2027.
    for (const c of Object.values(league.contracts)) if (c.team === 'MIN') dropContract(league, c.id);
    const released = { date: at(2025, 'preseason'), how: 'released', designated: false, injured: false, terminationPay: false } as const;
    const deals = [
      deal('f1', paid, { signingBonus: 1_000_000, years: [year(2026, { base: 2_000_000 }), year(2027, { base: 3_000_000 })] }),
      deal('f2', cut, { years: [year(2026, { base: 4_000_000, guaranteedBase: 4_000_000 }), year(2027, { base: 5_000_000, guaranteedBase: 5_000_000 })], ended: released })
    ];
    for (const c of deals) putContract(league, c);
    expect(teamCash(league, 'MIN', 2026)).toBe(7_000_000);
    expect(teamCash(league, 'MIN', 2027)).toBe(8_000_000);
    // An extension signed in the 2026 re-sign window pays its bonus then, though its first year is 2027.
    const extension = deal('f3', paid, { type: 'extension', signed: at(2026, 'resign'), signingBonus: 600_000, years: [year(2028, { base: 1_000_000 })] });
    putContract(league, extension);
    expect(teamCash(league, 'MIN', 2026)).toBe(7_600_000);
    expect(teamCash(league, 'MIN', 2028)).toBe(1_000_000);
    dropContract(league, 'f3');
    league.caps = { 2026: 10_000_000, 2027: 10_000_000, 2028: 10_000_000, 2029: 10_000_000 };
    // The league's first window is its first four league years; the years before the last only count.
    expect(league.meta.start.startSeason).toBe(2026);
    for (const y of [2026, 2027, 2028]) expect(closeFloorYear(league, y).some(s => s.team === 'MIN')).toBe(false);
    expect(league.teams.MIN.spending.map(s => s.cash)).toEqual([7_000_000, 8_000_000, 0]);
    // 15,000,000 against four 10,000,000 caps: 20,600,000 short of 89%. The next window starts afresh.
    expect(closeFloorYear(league, 2029).find(s => s.team === 'MIN')).toEqual({ team: 'MIN', from: 2026, to: 2029, spent: 15_000_000, floor: 35_600_000, shortfall: 20_600_000 });
    expect(league.teams.MIN.spending).toEqual([]);
  }); // prettier-ignore

  it('drops contracts with nothing left to charge, and keeps two league years of tags', () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const [held] = roster(league, 'MIN') as [Player];
    const gone = deal('old1', held, { team: 'MIN', signed: at(2022, 'freeAgency'), signingBonus: 2_000_000, years: [year(2023, { base: 3_000_000, guaranteedBase: 1_000_000 })], ended: { date: at(2023, 'regularSeason', 5), how: 'released', designated: false, injured: false, terminationPay: false } });
    const tag = deal('old2', held, { type: 'franchiseTag', signed: at(2024, 'resign'), years: [year(2025)] });
    const expired = deal('old3', held, { signed: at(2021, 'freeAgency'), years: [year(2022), year(2024)] });
    // Two deals to 2027 released as the 2024 league year opened, before June 1: the first owes nothing after
    // 2024, the second 2027's guaranteed salary.
    const cutEarly = { date: at(2023, 'freeAgency'), how: 'released', designated: false, injured: false, terminationPay: false } as const;
    const long = [2023, 2024, 2025, 2026, 2027];
    const cut = deal('old4', held, { signed: at(2022, 'freeAgency'), years: long.map(y => year(y, { base: 2_000_000 })), ended: cutEarly });
    const owing = deal('old5', held, { signed: at(2022, 'freeAgency'), years: long.map(y => year(y, { base: 2_000_000, guaranteedBase: y === 2027 ? 2_000_000 : 0 })), ended: cutEarly });
    for (const c of [gone, tag, expired, cut, owing]) putContract(league, c);
    const own = held.contractId as string;
    const change = openLeagueYear(league, at(2026, 'freeAgency'), stream(1, 'year'));
    // The 2027 league year keeps deals that charge it, and tags from 2025 on, which count toward a third
    // straight one.
    expect(league.contracts.old1).toBeUndefined();
    expect(league.contracts.old3).toBeUndefined();
    expect(league.contracts.old2).toBeDefined();
    expect(league.contracts[own]).toBeDefined();
    // A released deal's years to come charge nothing once its dead money is counted, apart from salary owed.
    expect(league.contracts.old4).toBeUndefined();
    expect(league.contracts.old5).toBeDefined();
    // Each dropped deal leaves a record for the player's history (D-35): the first priced against the
    // league's first cap, since it was signed before the league began.
    const records = change.records.map(r => r.id);
    expect(records).toEqual(expect.arrayContaining(['old1', 'old3', 'old4']));
    for (const id of ['old2', 'old5', own]) expect(records).not.toContain(id);
    expect(change.records.find(r => r.id === 'old1')).toEqual({ id: 'old1', playerId: held.id, team: 'MIN', type: 'veteran', signed: 2023, from: 2023, to: 2023, years: 1, total: 5_000_000, apy: 5_000_000, guaranteed: 3_000_000, capShare: Math.round((5_000_000 / R.cap.amount) * 10_000) / 10_000, ended: 'released', endedYear: 2023 });
    expect(change.records.find(r => r.id === 'old3')).toMatchObject({ from: 2022, to: 2024, years: 2, ended: 'expired', endedYear: 2024 });
  }); // prettier-ignore
});

describe('retirement (spec 10.7)', () => {
  it('rises with age, no contract, and the setting, and leaves rookies alone', () => {
    const league = fresh(at(2026, 'awards'));
    const vet = roster(league, 'MIN').find(p => p.experience > 3 && p.position !== 'K' && p.position !== 'P') as Player;
    const born = (age: number) => `${2027 - age}-01-01`;
    const chance = (age: number, change: Partial<Player> = {}) => retirementChance(league, { ...vet, birthDate: born(age), ...change }, null);
    expect(chance(28)).toBeLessThan(chance(32));
    expect(chance(32)).toBeLessThan(chance(36));
    expect(chance(33, { contractId: null, team: null, status: 'freeAgent' })).toBeGreaterThan(chance(33));
    league.settings.development.retirementAge = 3;
    const later = chance(33);
    league.settings.development.retirementAge = 0;
    expect(later).toBeLessThan(chance(33));
    expect(chance(24, { experience: 0 })).toBe(0);
    expect(chance(24)).toBeGreaterThan(0);
  }); // prettier-ignore

  it("ends a retiring player's deal, moving its later proration to the next league year", () => {
    const league = fresh(at(2026, 'awards'));
    const p = roster(league, 'MIN')[0] as Player;
    // A 3,000,000 bonus over 2026 to 2028. Retiring in February 2027 (after June 1 of the 2026 league
    // year) leaves 2026 as it was and puts 2027's and 2028's shares, 2,000,000, on the 2027 cap.
    const c = deal('r1', p, { signingBonus: 3_000_000, years: [year(2026, { base: 1_000_000 }), year(2027, { base: 1_000_000 }), year(2028, { base: 1_000_000 })] }); // prettier-ignore
    const retired = endContract(c, { date: league.date, how: 'retired', designated: false, injured: false, terminationPay: false }); // prettier-ignore
    expect(capHit(retired, 2026, R)).toBe(2_000_000);
    expect(capCharge(retired, 2027, R)).toMatchObject({ dead: 2_000_000, total: 2_000_000 });
    expect(capHit(retired, 2028, R)).toBe(0);
  });
});

describe('the draft and rosters (D-27, D-48, D-49)', () => {
  it('drafts in reverse order of finish, seven rounds on rookie deals, then signs undrafted rookies', () => {
    const league = fresh(at(2026, 'draft'));
    league.season.champion = 'ARI';
    league.settings.auto.draft = true;
    const order = draftOrder(league);
    expect(order.at(-1)).toBe('ARI');
    const before = Object.keys(league.players).length;
    openDraft(league, nameData(), stream(2, 'class'));
    const picks = runDraft(league, stream(2, 'draft'));
    expect(finishDraft(league)).not.toBeNull();
    expect(Object.keys(league.players)).toHaveLength(before + 450);
    expect(picks).toHaveLength(32 * 7);
    expect(picks[0]).toMatchObject({ owner: order[0], round: 1, number: 1 });
    expect(picks.at(-1)).toMatchObject({ owner: 'ARI', round: 7, number: 224 });
    const first = league.players[picks[0]?.playerId ?? ''] as Player;
    const contract = league.contracts[first.contractId ?? ''] as Contract;
    expect(first).toMatchObject({ experience: 0, status: 'active', draft: { year: 2027, round: 1, pick: 1 } });
    expect(contract).toMatchObject({ type: 'rookie', fifthYearOption: 'eligible' });
    expect(contract.years.map(y => y.year)).toEqual([2027, 2028, 2029, 2030]);
    // The rookies nobody drafted go to the teams the AI runs that offer, not to the user's (D-49).
    league.date = at(2026, 'udfa');
    const user = league.meta.start.userTeam;
    const userBefore = activeRoster(league, user).length;
    aiOffers(league, TEAM_ABBRS.filter(t => t !== user), stream(3, 'udfaOffers'));
    const signed = signUdfas(league, stream(3, 'udfa'));
    expect(signed.length).toBeGreaterThan(0);
    expect(signed.every(s => s.team !== user && s.player.draft.year === 2027 && 'undrafted' in s.player.draft)).toBe(true);
    expect(activeRoster(league, user)).toHaveLength(userBefore);
  }); // prettier-ignore

  it('cuts AI rosters to the limit, and holds the user until theirs is legal', () => {
    const league = fresh(at(2026, 'cutdown'));
    const user = league.meta.start.userTeam;
    const extra = Object.values(league.players)
      .filter(p => p.status === 'freeAgent')
      .slice(0, 20);
    for (const [i, p] of extra.entries()) Object.assign(p, { team: i < 10 ? user : 'KC', status: 'active' });
    expect(advanceBlock(league)).toMatch(/^You have 63 players on the active roster; the limit is 53\./);
    const cut = cutdown(league, 'KC', stream(4, 'cut'));
    expect(cut).toHaveLength(10);
    expect(activeRoster(league, 'KC')).toHaveLength(53);
    // On auto, the user's staff makes the cuts as the step begins, and the season can start.
    league.settings.auto.roster = true;
    expect(advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 }).blocked).toBeNull();
    expect(activeRoster(league, user)).toHaveLength(53);
  });

  it("keeps a recent draft pick over a veteran who's a little better now", () => {
    const league = fresh(at(2026, 'cutdown'));
    const wrs = roster(league, 'KC').filter(p => p.position === 'WR');
    const weakest = wrs.reduce((a, b) => (b.ovr < a.ovr ? b : a));
    const pick = Object.values(league.players).find(p => p.status === 'freeAgent' && p.position === 'WR') as Player;
    // A first-round rookie a point short of what the team's investment in him covers.
    const ovr = weakest.ovr - (TUNING.offseason.cutDraftBonus[0] ?? 0) + 1;
    Object.assign(pick, { team: 'KC', status: 'active', experience: 0, ovr, potential: ovr, injury: null, draft: { year: 2026, round: 1, pick: 20, team: 'KC' } });
    const cut = cutdown(league, 'KC', stream(5, 'cut'));
    expect(cut).toHaveLength(1);
    expect(cut[0]?.id).toBe(weakest.id);
    expect(pick.team).toBe('KC');
  }); // prettier-ignore

  it('plays a whole offseason into the next season with legal rosters and a new schedule', () => {
    const league = fresh(at(2026, 'staff'));
    league.settings.auto.roster = true;
    league.settings.auto.draft = true;
    // The 2027 class, made with the league, is drafted; the 2028 class arrives with the new season (D-41).
    const drafted = new Set(league.draft?.prospects.map(p => p.player.id));
    expect(league.draft?.year).toBe(2027);
    for (let i = 0; league.date.phase !== 'regularSeason'; i++) {
      const step = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: i });
      expect(step.blocked).toBeNull();
      if (league.date.phase === 'draft') expect(league.draft).toBeNull();
    }
    expect(league.draft?.year).toBe(2028);
    expect(
      league.season.transactions.filter(t => t.kind === 'drafted').every(t => drafted.has(t.playerId))
    ).toBe(true);
    expect(league.date).toEqual(at(2027, 'regularSeason'));
    expect(league.season.season).toBe(2027);
    expect(league.schedule).toHaveLength(272);
    expect(league.schedule.every(g => g.season === 2027)).toBe(true);
    expect(league.upcoming).toBeNull();
    for (const abbr of TEAM_ABBRS) {
      expect(activeRoster(league, abbr), abbr).toHaveLength(53);
      expect(capSheet(league, abbr).space, abbr).toBeGreaterThanOrEqual(0);
    }
    expect(Object.values(league.players).some(p => p.draft.year === 2027 && p.team)).toBe(true);
    expect(league.inbox.some(m => m.kind === 'contracts')).toBe(true);
    expect(league.season.transactions.some(t => t.kind === 'drafted')).toBe(true);
    // After the cutdown, a few waiver claims a team, and practice squads formed.
    const claims = league.season.transactions.filter(t => t.kind === 'claimed' && t.phase === 'cutdown');
    for (const abbr of TEAM_ABBRS) {
      expect(claims.filter(t => t.team === abbr).length).toBeLessThanOrEqual(TUNING.camp.cutdownClaims);
      expect(
        Object.values(league.players).some(p => p.team === abbr && p.status === 'practice'),
        abbr
      ).toBe(true);
    }
    expect(league.preseason).toBeNull();
  }, 60_000);
});
