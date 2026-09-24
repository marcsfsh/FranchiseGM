/**
 * UI preferences, theme, and layout (style guide 4.1, 7.8, 13.3). Preferences are separate from franchise
 * state. Storage failure falls back to in-memory preferences for the session.
 */
import { TEAM_COLORS, isTeamAbbr, type TeamAbbr } from '../../data/team-colors';
import { computeTeamTokens, type Mode, type TeamTokens } from './tokens';

export type ThemeSetting = 'system' | Mode;
export type LayoutSetting = 'auto' | Layout;
export type Layout = 'phone' | 'tablet' | 'desktop';
export type Density = 'comfortable' | 'compact';
/** 'mine' follows the user's franchise; a team abbreviation previews that team's colors. */
export type TeamSetting = 'mine' | TeamAbbr;

export interface UiPrefs {
  theme: ThemeSetting;
  layout: LayoutSetting;
  density: Density;
  team: TeamSetting;
}

export const PREF_KEY = 'gm.ui.v2';
export const TOKEN_CACHE_KEY = 'gm.ui.tokens';
/** The default identity when no franchise is loaded (style guide title). */
export const DEFAULT_TEAM: TeamAbbr = 'MIN';

const ALLOWED = {
  theme: ['system', 'day', 'night'],
  layout: ['auto', 'phone', 'tablet', 'desktop'],
  density: ['comfortable', 'compact']
} as const;

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/** Validates stored preferences; anything unknown falls back to the default. */
export function parsePrefs(raw: unknown): UiPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    theme: isOneOf(ALLOWED.theme, r.theme) ? r.theme : 'system',
    layout: isOneOf(ALLOWED.layout, r.layout) ? r.layout : 'auto',
    density: isOneOf(ALLOWED.density, r.density) ? r.density : 'comfortable',
    team: r.team === 'mine' || isTeamAbbr(r.team) ? r.team : 'mine'
  };
}

export function isValidPref<K extends keyof UiPrefs>(key: K, value: unknown): value is UiPrefs[K] {
  if (key === 'team') return value === 'mine' || isTeamAbbr(value);
  return isOneOf(ALLOWED[key as Exclude<K, 'team'>], value);
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadPrefs(storage: KeyValueStore | null): UiPrefs {
  try {
    const stored = storage?.getItem(PREF_KEY);
    return parsePrefs(stored ? JSON.parse(stored) : {});
  } catch {
    return parsePrefs({});
  }
}

/** Returns false when storage is unavailable; the in-memory preferences still apply. */
export function savePrefs(storage: KeyValueStore | null, prefs: UiPrefs): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PREF_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Auto layout rules from style guide 4.1. The short side is checked first so a sideways phone stays a phone. */
export function autoLayout(width: number, height: number): Layout {
  if (Math.min(width, height) < 520) return 'phone';
  return width >= 1100 && width / height >= 1.2 ? 'desktop' : 'tablet';
}

/** A manual choice is always honored. */
export function effectiveLayout(setting: LayoutSetting, width: number, height: number): Layout {
  return setting === 'auto' ? autoLayout(width, height) : setting;
}

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): Mode {
  return setting === 'system' ? (prefersDark ? 'night' : 'day') : setting;
}

export function resolveTeam(setting: TeamSetting, franchiseTeam: TeamAbbr | null): TeamAbbr {
  return setting === 'mine' ? (franchiseTeam ?? DEFAULT_TEAM) : setting;
}

export function layoutNote(prefs: UiPrefs, layout: Layout): string {
  return prefs.layout === 'auto' ? `Auto: showing ${layout}.` : `Set to ${prefs.layout}.`;
}

/** Sets a team's computed tokens on the root element and returns them. */
export function applyTeamTheme(root: HTMLElement, team: TeamAbbr, mode: Mode): TeamTokens {
  const palette = TEAM_COLORS[team];
  const tokens = computeTeamTokens(palette.primary, palette.accent, mode);
  root.dataset.theme = mode;
  root.dataset.team = team;
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(key, value);
  return tokens;
}
