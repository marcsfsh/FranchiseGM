import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS, TEAM_COLORS } from '../../src/data/team-colors';
import { contrast, hexToRgb, luminance, mix, uiPrimary } from '../../src/app/theme/colors';
import { NIGHT_SHADE_FLOOR, computeTeamTokens, type Mode } from '../../src/app/theme/tokens';
import {
  autoLayout,
  effectiveLayout,
  layoutNote,
  loadPrefs,
  parsePrefs,
  resolveTeam,
  savePrefs,
  type KeyValueStore
} from '../../src/app/theme/prefs';

const hue = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('palette data', () => {
  it('has all 32 teams in 8 divisions of 4', () => {
    expect(TEAM_ABBRS).toHaveLength(32);
    const divisions = new Map<string, number>();
    for (const abbr of TEAM_ABBRS) {
      const t = TEAM_COLORS[abbr];
      const key = `${t.conf} ${t.div}`;
      divisions.set(key, (divisions.get(key) ?? 0) + 1);
    }
    expect([...divisions.values()]).toEqual(new Array(8).fill(4));
  });
});

describe('theme matrix: 32 teams x Day and Night (style guide 14.1)', () => {
  for (const abbr of TEAM_ABBRS) {
    for (const mode of ['day', 'night'] as Mode[]) {
      it(`${abbr} ${mode}`, () => {
        const { primary, accent } = TEAM_COLORS[abbr];
        const t = computeTeamTokens(primary, accent, mode);
        const get = (k: `--${string}`) => {
          const v = t[k];
          if (!v) throw new Error(`missing ${k}`);
          return v;
        };
        const surfaces = [get('--ground'), get('--surface'), get('--surface-2')];
        // Normal text on every supported surface.
        for (const s of surfaces) {
          expect(contrast(get('--text'), s)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(get('--text-2'), s)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(get('--focus'), s)).toBeGreaterThanOrEqual(3);
        }
        // White text on the adjusted team primary, and focus on team headers.
        expect(contrast(get('--on-team'), get('--team'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(get('--focus-on-team'), get('--team'))).toBeGreaterThanOrEqual(3);
        // Action and rating foregrounds on the accent.
        expect(contrast(get('--on-accent'), get('--accent'))).toBeGreaterThanOrEqual(4.5);
        // Control boundaries and selection indicators against both control surfaces.
        for (const s of [get('--surface'), get('--surface-2')]) {
          expect(contrast(get('--control-border'), s)).toBeGreaterThanOrEqual(3);
          expect(contrast(get('--selection-indicator'), s)).toBeGreaterThanOrEqual(3);
        }
        expect(contrast(get('--selection-text'), get('--selection-bg'))).toBeGreaterThanOrEqual(4.5);
        if (mode === 'night') {
          // Ordered, distinct Night surfaces.
          const scale = ['--dk-ground', '--dk-panel', '--dk-raised', '--dk-rule'].map(k =>
            luminance(get(k as `--${string}`))
          );
          for (let i = 1; i < scale.length; i++) expect(scale[i]).toBeGreaterThan(scale[i - 1] as number);
          expect(
            new Set(['--dk-ground', '--dk-panel', '--dk-raised'].map(k => get(k as `--${string}`))).size
          ).toBe(3);
          // Style guide 2.2: white on raised above 9:1, secondary on raised above 6:1.
          expect(contrast('#FFFFFF', get('--dk-raised'))).toBeGreaterThan(9);
          expect(contrast(get('--dk-tint'), get('--dk-raised'))).toBeGreaterThan(6);
          // Night starter plate text.
          const starterBg = get('--n-starter-bg');
          if (starterBg !== 'transparent') {
            expect(contrast(get('--n-starter-text'), starterBg)).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it('keeps the team hue in Night surfaces above the luminance floor', () => {
    for (const abbr of TEAM_ABBRS) {
      const p = uiPrimary(TEAM_COLORS[abbr].primary);
      if (luminance(p) < NIGHT_SHADE_FLOOR) continue;
      const [r, g, b] = hexToRgb(p);
      if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue; // effectively gray
      const t = computeTeamTokens(TEAM_COLORS[abbr].primary, TEAM_COLORS[abbr].accent, 'night');
      expect(hueGap(hue(t['--dk-panel'] as string), hue(p)), abbr).toBeLessThan(12);
    }
  });

  it('keeps black primaries distinct (CIN and LV)', () => {
    for (const abbr of ['CIN', 'LV'] as const) {
      const t = computeTeamTokens(TEAM_COLORS[abbr].primary, TEAM_COLORS[abbr].accent, 'night');
      expect(t['--dk-ground']).not.toBe(t['--dk-panel']);
      expect(t['--dk-panel']).not.toBe(t['--dk-raised']);
    }
  });

  it('matches the Vikings reference values from style guide 2.2', () => {
    const t = computeTeamTokens('#4F2683', '#FFC62F', 'night');
    expect(t['--dk-ground']).toBe('#160B25');
    expect(t['--dk-panel']).toBe('#211037');
    expect(t['--dk-raised']).toBe('#2E164C');
    expect(t['--dk-rule']).toBe('#3B1D62');
    expect(t['--dk-tint']).toBe('#CEC2DC');
    expect(t['--lt-wash']).toBe('#F3F0F6');
    expect(t['--lt-tint']).toBe('#DCD4E6');
    expect(mix('#4F2683', '#000000', 0)).toBe('#4F2683');
  });

  it('rejects invalid inputs', () => {
    expect(() => computeTeamTokens('purple', '#FFC62F', 'day')).toThrow(TypeError);
    expect(() => computeTeamTokens('#4F2683', '#FFC62F', 'system' as Mode)).toThrow(TypeError);
  });
});

describe('layout rules (style guide 4.1)', () => {
  it('matches the reference results', () => {
    expect(autoLayout(390, 844)).toBe('phone');
    expect(autoLayout(844, 390)).toBe('phone');
    expect(autoLayout(834, 1194)).toBe('tablet');
    expect(autoLayout(1194, 834)).toBe('desktop');
    expect(autoLayout(1440, 900)).toBe('desktop');
  });

  it('respects the boundaries', () => {
    expect(autoLayout(519, 900)).toBe('phone');
    expect(autoLayout(520, 900)).toBe('tablet');
    expect(autoLayout(1099, 700)).toBe('tablet');
    expect(autoLayout(1100, 700)).toBe('desktop');
    expect(autoLayout(1200, 1009)).toBe('tablet'); // aspect 1.19
    expect(autoLayout(1200, 1000)).toBe('desktop'); // aspect 1.20
  });

  it('always honors a manual choice', () => {
    expect(effectiveLayout('desktop', 390, 844)).toBe('desktop');
    expect(effectiveLayout('phone', 1440, 900)).toBe('phone');
    expect(effectiveLayout('auto', 834, 1194)).toBe('tablet');
    const prefs = parsePrefs({ layout: 'tablet' });
    expect(layoutNote(prefs, 'tablet')).toBe('Set to tablet.');
    expect(layoutNote(parsePrefs({}), 'phone')).toBe('Auto: showing phone.');
  });
});

describe('preferences', () => {
  it('validates stored values', () => {
    expect(parsePrefs({ theme: 'neon', layout: 'watch', density: 'tiny', team: 'XXX' })).toEqual({
      theme: 'system',
      layout: 'auto',
      density: 'comfortable',
      team: 'mine'
    });
    expect(parsePrefs(null).theme).toBe('system');
    // A team preview never survives a reload: the theme follows the user's team (spec 22.7).
    expect(parsePrefs({ team: 'DET' }).team).toBe('mine');
  });

  it('works in memory when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    };
    expect(loadPrefs(broken).layout).toBe('auto');
    expect(savePrefs(broken, parsePrefs({}))).toBe(false);
    expect(loadPrefs(null).theme).toBe('system');
  });

  it('round-trips through storage', () => {
    const map = new Map<string, string>();
    const store: KeyValueStore = { getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
    const prefs = parsePrefs({ theme: 'night', layout: 'desktop', density: 'compact', team: 'LV' });
    expect(savePrefs(store, prefs)).toBe(true);
    expect(loadPrefs(store)).toEqual({ ...prefs, team: 'mine' });
  });

  it('resolves the theme team', () => {
    expect(resolveTeam('mine', null)).toBe('MIN');
    expect(resolveTeam('mine', 'GB')).toBe('GB');
    expect(resolveTeam('CIN', 'GB')).toBe('CIN');
  });
});
