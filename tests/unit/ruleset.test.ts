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
});
