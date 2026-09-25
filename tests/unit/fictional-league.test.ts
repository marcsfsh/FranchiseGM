import { describe, expect, it } from 'vitest';
import { balanceShift, generateFictionalLeague, typicalStarter } from '../../src/engine/generate/league';
import type { Position } from '../../src/engine/model/positions';
import { TUNING } from '../../src/engine/tuning';
import { capHit } from '../../src/engine/contracts/cap';
import { DEFAULT_RULES, changeRules } from '../../src/engine/rules/ruleset';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { ageOn } from '../../src/engine/model/player';
import { STAFF_ROLES } from '../../src/engine/model/staff';
import { nameData } from '../helpers/base-data';

const league = generateFictionalLeague({ seed: 2026, season: 2026, names: nameData(), rules: DEFAULT_RULES });
const contractById = new Map(league.contracts.map(c => [c.id, c]));

describe('fictional league (build order no-CSV path)', () => {
  it('fills every team with 53 active and 16 practice squad players', () => {
    for (const team of TEAM_ABBRS) {
      const roster = league.players.filter(p => p.team === team);
      expect(
        roster.filter(p => p.status === 'active'),
        team
      ).toHaveLength(53);
      expect(
        roster.filter(p => p.status === 'practice'),
        team
      ).toHaveLength(16);
      const qbs = roster.filter(p => p.status === 'active' && p.position === 'QB').length;
      expect(qbs, team).toBeGreaterThanOrEqual(2);
      expect(
        roster.filter(p => p.status === 'active' && p.position === 'K'),
        team
      ).toHaveLength(1);
      const jerseys = roster.map(p => p.jersey);
      expect(new Set(jerseys).size, `${team} jerseys`).toBe(jerseys.length);
    }
  });

  it('has about 300 unsigned free agents', () => {
    const fas = league.players.filter(p => p.status === 'freeAgent');
    expect(fas).toHaveLength(300);
    expect(fas.every(p => p.team === null && p.contractId === null)).toBe(true);
  });

  it('fits every team under the 2026 cap with realistic cap use', () => {
    for (const team of TEAM_ABBRS) {
      const roster = league.players.filter(p => p.team === team);
      const total = roster.reduce(
        (sum, p) => sum + capHit(contractById.get(p.contractId ?? '')!, 2026, DEFAULT_RULES),
        0
      );
      expect(total, team).toBeLessThanOrEqual(DEFAULT_RULES.cap.amount);
      expect(total, team).toBeGreaterThan(DEFAULT_RULES.cap.amount * 0.8);
    }
  });

  it('gives every rostered player one contract with his team', () => {
    for (const p of league.players.filter(x => x.team)) {
      const c = contractById.get(p.contractId ?? '');
      expect(c?.playerId).toBe(p.id);
      expect(c?.team).toBe(p.team);
    }
    expect(new Set(league.contracts.map(c => c.id)).size).toBe(league.contracts.length);
  });

  it('spreads overall and age like a real league', () => {
    const active = league.players.filter(p => p.status === 'active');
    const share = (f: (o: number) => boolean) => active.filter(p => f(p.ovr)).length / active.length;
    const elite = active.filter(p => p.ovr >= 90).length / 32;
    expect(elite).toBeGreaterThan(0.8);
    expect(elite).toBeLessThan(4);
    expect(share(o => o >= 80 && o < 90)).toBeGreaterThan(0.1);
    expect(share(o => o < 60)).toBeLessThan(0.15);
    const ages = active.map(p => ageOn(p.birthDate, '2026-09-01'));
    const meanAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    expect(meanAge).toBeGreaterThan(25.5);
    expect(meanAge).toBeLessThan(27.5);
    const devShare = (d: string) => league.players.filter(p => p.dev === d).length / league.players.length;
    expect(devShare('Normal')).toBeGreaterThan(0.6);
    expect(devShare('X-Factor')).toBeLessThan(0.04);
  });

  it('staffs every team and gives each an owner', () => {
    for (const team of TEAM_ABBRS) {
      const s = league.staff.filter(m => m.team === team);
      for (const role of STAFF_ROLES)
        expect(
          s.some(m => m.role === role),
          `${team} ${role}`
        ).toBe(true);
      expect(league.owners.filter(o => o.team === team)).toHaveLength(1);
    }
  });

  it('never repeats a name and is deterministic for a seed', () => {
    const names = [...league.players, ...league.staff, ...league.owners].map(
      x => `${x.firstName} ${x.lastName}`
    );
    expect(new Set(names).size).toBe(names.length);
    const again = generateFictionalLeague({
      seed: 2026,
      season: 2026,
      names: nameData(),
      rules: DEFAULT_RULES
    });
    expect(again.players.slice(0, 50)).toEqual(league.players.slice(0, 50));
    expect(again.contracts.at(-1)).toEqual(league.contracts.at(-1));
  });
});

describe('fictional league follows the rule set (spec 12.1, 16)', () => {
  it('keeps practice squad veterans within the limit across seeds', () => {
    const { practiceSquadVeterans, practiceSquadVeteranSeasons } = DEFAULT_RULES.roster;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const l = generateFictionalLeague({ seed, season: 2026, names: nameData(), rules: DEFAULT_RULES });
      for (const team of TEAM_ABBRS) {
        const veterans = l.players.filter(
          p => p.team === team && p.status === 'practice' && p.experience > practiceSquadVeteranSeasons
        );
        expect(veterans.length, `${team} seed ${seed}`).toBeLessThanOrEqual(practiceSquadVeterans);
      }
    }
  });

  it('sizes rosters and practice squads from the rules', () => {
    const rules = changeRules(changeRules(DEFAULT_RULES, 'roster', { active: 55 }), 'roster', {
      practiceSquad: 12
    });
    const l = generateFictionalLeague({ seed: 9, season: 2026, names: nameData(), rules });
    for (const team of TEAM_ABBRS) {
      expect(
        l.players.filter(p => p.team === team && p.status === 'active'),
        team
      ).toHaveLength(55);
      expect(
        l.players.filter(p => p.team === team && p.status === 'practice'),
        team
      ).toHaveLength(12);
    }
    const smaller = changeRules(DEFAULT_RULES, 'roster', { active: 46, gameDayActives: 45 });
    const s = generateFictionalLeague({ seed: 9, season: 2026, names: nameData(), rules: smaller });
    expect(s.players.filter(p => p.team === 'MIN' && p.status === 'active')).toHaveLength(46);
    expect(
      s.players.filter(p => p.team === 'MIN' && p.status === 'active' && p.position === 'K')
    ).toHaveLength(1);
  });
});

describe('roster balance in generated leagues (D-19)', () => {
  const L = TUNING.league;
  const STARTERS: readonly Position[] = [
    'QB',
    'HB',
    'WR',
    'WR',
    'TE',
    'LT',
    'C',
    'DT',
    'LE',
    'MLB',
    'CB',
    'FS'
  ];
  /** A starting lineup at typical quality, moved by `delta` everywhere or by position. */
  const lineup = (delta: number | Partial<Record<Position, number>>) =>
    STARTERS.map(position => ({
      position,
      depth: 0,
      starters: 1,
      quality: typicalStarter(position) + (typeof delta === 'number' ? delta : (delta[position] ?? 0))
    }));

  it('leaves rosters near typical as drawn', () => {
    expect(balanceShift(lineup(0))).toBe(0);
    expect(balanceShift(lineup(L.balanceFrom * 0.9))).toBe(0);
    expect(balanceShift(lineup(-L.balanceFrom * 0.9))).toBe(0);
  });

  it('keeps only balanceKeep of the excess beyond balanceFrom, either way', () => {
    for (const strength of [0.5, -0.5, 1.2]) {
      const kept =
        Math.sign(strength) * (L.balanceFrom + (Math.abs(strength) - L.balanceFrom) * L.balanceKeep);
      expect(strength + balanceShift(lineup(strength))).toBeCloseTo(kept, 10);
    }
  });

  it('weights the quarterback most and ignores backups and specialists', () => {
    const qbOnly = balanceShift(lineup({ QB: 1 }));
    const backOnly = balanceShift(lineup({ HB: 1 }));
    const others = STARTERS.length - 1;
    const strength = L.balanceQbWeight / (L.balanceQbWeight + others);
    expect(qbOnly).toBeCloseTo(-(strength - L.balanceFrom) * (1 - L.balanceKeep), 10);
    expect(Math.abs(qbOnly)).toBeGreaterThan(Math.abs(backOnly));
    const extras = [
      { position: 'QB' as const, depth: 1, starters: 1, quality: 5 },
      { position: 'K' as const, depth: 0, starters: 1, quality: 5 }
    ];
    expect(balanceShift([...lineup(0.5), ...extras])).toBe(balanceShift(lineup(0.5)));
  });
});
