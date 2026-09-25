import { describe, expect, it } from 'vitest';
import { gameDay, kickoff, money, record, savedAgo } from '../../src/app/format';

describe('display formatting (style guide 9)', () => {
  it('formats money compactly and exactly', () => {
    expect(money(42_500_000)).toBe('$42.5M');
    expect(money(850_000)).toBe('$850K');
    expect(money(-2_000_000)).toBe('−$2.0M');
    expect(money(42_500_000, true)).toBe('$42,500,000');
    expect(money(null)).toBe('—');
    // Rounding never shows 1,000 of a unit; it moves up to the next one.
    expect(money(999_950)).toBe('$1.0M');
    expect(money(999_940)).toBe('$999.9K');
    expect(money(950_000_000)).toBe('$950.0M');
    expect(money(999_950_000)).toBe('$1.0B');
    expect(money(999.5)).toBe('$1K');
    expect(money(999)).toBe('$999');
  });

  it('formats records, schedule dates, kickoffs, and save times', () => {
    expect(record(5, 1)).toBe('5–1');
    expect(record(5, 1, 1)).toBe('5–1–1');
    expect(gameDay('2026-09-13', 'Sun')).toBe('Sunday, September 13');
    expect(kickoff('13:00')).toBe('1:00 PM ET');
    expect(kickoff('20:20')).toBe('8:20 PM ET');
    expect(kickoff('09:30')).toBe('9:30 AM ET');
    expect(savedAgo(1000, 1000 + 30_000)).toBe('just now');
    expect(savedAgo(0, 5 * 60_000)).toBe('5 minutes ago');
    expect(savedAgo(0, 60 * 60_000)).toBe('1 hour ago');
  });
});
