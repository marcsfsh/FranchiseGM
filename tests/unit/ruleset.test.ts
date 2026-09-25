import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, changeRules, minimumSalary, validateRules } from '../../src/engine/rules/ruleset';

describe('rule set (spec 16, 12.1)', () => {
  it('ships valid 2026 defaults', () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
    expect(DEFAULT_RULES.cap.amount).toBe(301_200_000);
    expect(DEFAULT_RULES.roster.active).toBe(53);
    expect(DEFAULT_RULES.roster.practiceSquad).toBe(16);
  });

  it('looks up minimum salary by credited seasons', () => {
    expect(minimumSalary(DEFAULT_RULES, 0)).toBe(885_000);
    expect(minimumSalary(DEFAULT_RULES, 3)).toBe(1_145_000);
    expect(minimumSalary(DEFAULT_RULES, 5)).toBe(1_215_000);
    expect(minimumSalary(DEFAULT_RULES, 12)).toBe(1_300_000);
    expect(minimumSalary(DEFAULT_RULES, -1)).toBe(885_000);
  });

  it('changes a section immutably and bumps the version', () => {
    const next = changeRules(DEFAULT_RULES, 'roster', { active: 55 });
    expect(next.roster.active).toBe(55);
    expect(next.version).toBe(DEFAULT_RULES.version + 1);
    expect(DEFAULT_RULES.roster.active).toBe(53);
  });

  it('rejects invalid or fixed-format changes with readable reasons', () => {
    expect(() => changeRules(DEFAULT_RULES, 'roster', { gameDayActives: 60 })).toThrow(/exceed/);
    expect(() => changeRules(DEFAULT_RULES, 'season', { games: 16 })).toThrow(/fixed/);
    expect(() => changeRules(DEFAULT_RULES, 'cap', { amount: -5 })).toThrow(/salary cap/);
  });

  it('holds the 2025 on-field rules: clock, overtime, kickoffs, tries, and penalties (spec 16)', () => {
    const g = DEFAULT_RULES.game;
    expect(g.quarterSeconds).toBe(900);
    expect(g.overtime).toMatchObject({ regularSeasonSeconds: 600, bothTeamsPossess: true });
    expect(g.kickoff).toMatchObject({ spot: 35, touchback: 35, landingZone: 20, shortSpot: 40 });
    expect([g.extraPointSpot, g.twoPointSpot]).toEqual([15, 2]);
    expect(g.penalties.defensiveHolding).toMatchObject({ yards: 5, automaticFirstDown: true });
    expect(g.penalties.defensivePassInterference.spotFoul).toBe(true);
    expect(g.penalties.intentionalGrounding.lossOfDown).toBe(true);
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
  });

  it('lets the rules committee change penalty yardage, within limits', () => {
    const penalties = {
      ...DEFAULT_RULES.game.penalties,
      defensiveHolding: { ...DEFAULT_RULES.game.penalties.defensiveHolding, yards: 10 }
    };
    const next = changeRules(DEFAULT_RULES, 'game', { penalties });
    expect(next.game.penalties.defensiveHolding.yards).toBe(10);
    const bad = { ...penalties, facemask: { ...penalties.facemask, yards: 45 } };
    expect(() => changeRules(DEFAULT_RULES, 'game', { penalties: bad })).toThrow(/Face mask yardage/);
  });
});
