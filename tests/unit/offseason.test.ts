import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { cutdown } from '../../src/engine/ai/decisions/offseason';
import { capSheet, seasonSpace } from '../../src/engine/cap/sheet';
import { capCharge, capHit } from '../../src/engine/contracts/cap';
import { endContract } from '../../src/engine/contracts/moves';
import { emptyYear, type Contract, type ContractYear } from '../../src/engine/contracts/types';
import { draftOrder, signUndrafted, standInDraft } from '../../src/engine/generate/rookies';
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
  offseasonBlock,
  offseasonStep,
  stepLabel
} from '../../src/engine/season/offseason';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// The offseason (spec 4.1): the calendar, the new league year (spec 11.1), retirements (spec 10.7), and the
// stand-ins for the draft and free agency until M11 and M12 (D-27). Cap numbers are worked by hand.
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

  it('removes undrafted rookies nobody signed and credits a season to everyone on a roster', () => {
    const league = fresh(at(2026, 'superBowl'));
    const [onRoster, free] = [roster(league, 'MIN')[0], Object.values(league.players).find(p => p.status === 'freeAgent')];
    if (!onRoster || !free) throw new Error('no players');
    Object.assign(free, { experience: 0, draft: { year: 2026, undrafted: true } });
    const before = onRoster.experience;
    closeSeason(league);
    expect(league.players[free.id]).toBeUndefined();
    expect(onRoster.experience).toBe(before + 1);
  }); // prettier-ignore
});

describe('the re-sign window (spec 4.1, 11.4, 11.5)', () => {
  /** A league at the awards with every deal running out when the 2027 league year opens. */
  const expiringLeague = (): League => {
    const league = fresh(at(2026, 'awards'));
    for (const c of Object.values(league.contracts)) c.years = c.years.filter(y => y.year <= 2026);
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
  }); // prettier-ignore

  it("lets the staff make the user's decisions with contracts on auto", () => {
    const league = expiringLeague();
    league.settings.auto.contracts = true;
    const user = league.meta.start.userTeam;
    const open = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(open.inbox.some(m => m.title === 'The re-sign window is open')).toBe(false);
    const close = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(kept(league, user)).toBeGreaterThan(0);
    expect(close.inbox[0]?.title).toMatch(/^Your staff made \d+ contract decisions?$/);
  });
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
      league.contracts[c.id] = c;
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
  }); // prettier-ignore

  it('drops contracts with nothing left to charge, and keeps two league years of history', () => {
    const league = fresh(at(2026, 'annualMeeting'));
    const [held] = roster(league, 'MIN') as [Player];
    const gone = deal('old1', held, { team: 'MIN', signed: at(2022, 'freeAgency'), years: [year(2023)], ended: { date: at(2023, 'regularSeason', 5), how: 'released', designated: false, injured: false, terminationPay: false } });
    const tag = deal('old2', held, { type: 'franchiseTag', signed: at(2024, 'resign'), years: [year(2025)] });
    const expired = deal('old3', held, { signed: at(2021, 'freeAgency'), years: [year(2022), year(2024)] });
    for (const c of [gone, tag, expired]) league.contracts[c.id] = c;
    const own = held.contractId as string;
    openLeagueYear(league, at(2026, 'freeAgency'), stream(1, 'year'));
    // The 2027 league year keeps 2025 on: the 2025 tag counts toward a third straight one.
    expect(league.contracts.old1).toBeUndefined();
    expect(league.contracts.old3).toBeUndefined();
    expect(league.contracts.old2).toBeDefined();
    expect(league.contracts[own]).toBeDefined();
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

describe('stand-in draft and rosters (D-27)', () => {
  it('drafts in reverse order of finish, seven rounds on rookie deals, then signs undrafted rookies', () => {
    const league = fresh(at(2026, 'draft'));
    league.season.champion = 'ARI';
    const order = draftOrder(league);
    expect(order.at(-1)).toBe('ARI');
    const before = Object.keys(league.players).length;
    const picks = standInDraft(league, nameData(), stream(2, 'draft'));
    expect(Object.keys(league.players)).toHaveLength(before + 450);
    expect(picks).toHaveLength(32 * 7);
    expect(picks[0]).toMatchObject({ team: order[0], round: 1, pick: 1 });
    expect(picks.at(-1)).toMatchObject({ team: 'ARI', round: 7, pick: 224 });
    const first = league.players[picks[0]?.playerId ?? ''] as Player;
    const contract = league.contracts[first.contractId ?? ''] as Contract;
    expect(first).toMatchObject({ experience: 0, status: 'active', draft: { year: 2027, round: 1, pick: 1 } });
    expect(contract).toMatchObject({ type: 'rookie', fifthYearOption: 'eligible' });
    expect(contract.years.map(y => y.year)).toEqual([2027, 2028, 2029, 2030]);
    league.date = at(2026, 'udfa');
    const user = league.meta.start.userTeam;
    const userBefore = activeRoster(league, user).length;
    const signed = signUndrafted(league, stream(3, 'udfa'));
    expect(signed.length).toBeGreaterThan(0);
    expect(signed.every(p => p.team !== user && p.draft.year === 2027 && 'undrafted' in p.draft)).toBe(true);
    expect(activeRoster(league, user)).toHaveLength(userBefore);
  }); // prettier-ignore

  it('cuts AI rosters to the limit, and holds the user until theirs is legal', () => {
    const league = fresh(at(2026, 'cutdown'));
    const user = league.meta.start.userTeam;
    const extra = Object.values(league.players)
      .filter(p => p.status === 'freeAgent')
      .slice(0, 20);
    for (const [i, p] of extra.entries()) Object.assign(p, { team: i < 10 ? user : 'KC', status: 'active' });
    expect(offseasonBlock(league)).toMatch(/^Cut your active roster to 53/);
    const cut = cutdown(league, 'KC', stream(4, 'cut'));
    expect(cut).toHaveLength(10);
    expect(activeRoster(league, 'KC')).toHaveLength(53);
    league.settings.auto.roster = true;
    expect(offseasonBlock(league)).toBeNull();
  });

  it('plays a whole offseason into the next season with legal rosters and a new schedule', () => {
    const league = fresh(at(2026, 'staff'));
    league.settings.auto.roster = true;
    for (let i = 0; league.date.phase !== 'regularSeason'; i++) {
      const step = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: i });
      expect(step.blocked).toBeNull();
    }
    expect(league.date).toEqual(at(2027, 'regularSeason'));
    expect(league.season.season).toBe(2027);
    expect(league.schedule).toHaveLength(272);
    expect(league.schedule.every(g => g.season === 2027)).toBe(true);
    expect(league.upcoming).toBeNull();
    for (const abbr of TEAM_ABBRS) {
      expect(activeRoster(league, abbr), abbr).toHaveLength(53);
      expect(seasonSpace(capSheet(league, abbr)), abbr).toBeGreaterThanOrEqual(0);
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
