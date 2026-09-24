/**
 * Applies UI preferences to the document and keeps them current (style guide 4.1, 7.8, 13.3).
 * Layout and theme changes only touch root attributes and tokens, so game state and screen state survive.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Mode } from './tokens';
import {
  TOKEN_CACHE_KEY,
  applyTeamTheme,
  effectiveLayout,
  isValidPref,
  loadPrefs,
  resolveTeam,
  resolveTheme,
  savePrefs,
  type KeyValueStore,
  type Layout,
  type UiPrefs
} from './prefs';

/** localStorage, or null when the browser blocks it. */
export function safeLocalStorage(): KeyValueStore | null {
  try {
    const storage = window.localStorage;
    const probe = '__gm_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export class PrefsController {
  prefs: UiPrefs;
  /** The franchise's team, once a league is loaded. */
  franchiseTeam: TeamAbbr | null = null;
  /** False when preferences can't be stored; they still apply for this session. */
  readonly persistent: boolean;
  private readonly storage: KeyValueStore | null;
  private readonly dark: MediaQueryList;
  private readonly listeners = new Set<() => void>();
  private frame = 0;

  constructor(storage: KeyValueStore | null = safeLocalStorage()) {
    this.storage = storage;
    this.persistent = storage !== null;
    this.prefs = loadPrefs(storage);
    this.dark = window.matchMedia('(prefers-color-scheme: dark)');
    this.dark.addEventListener('change', () => {
      if (this.prefs.theme === 'system') this.apply();
    });
    const schedule = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.apply());
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
  }

  get mode(): Mode {
    return resolveTheme(this.prefs.theme, this.dark.matches);
  }

  get layout(): Layout {
    return effectiveLayout(this.prefs.layout, window.innerWidth, window.innerHeight);
  }

  get team(): TeamAbbr {
    return resolveTeam(this.prefs.team, this.franchiseTeam);
  }

  set<K extends keyof UiPrefs>(key: K, value: unknown): void {
    if (!isValidPref(key, value)) return;
    this.prefs = { ...this.prefs, [key]: value };
    savePrefs(this.storage, this.prefs);
    this.apply();
  }

  setFranchiseTeam(team: TeamAbbr | null): void {
    this.franchiseTeam = team;
    this.apply();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply(): void {
    const root = document.documentElement;
    const mode = this.mode;
    const layout = this.layout;
    const tokens = applyTeamTheme(root, this.team, mode);
    if (root.dataset.layout !== layout) root.dataset.layout = layout;
    root.dataset.density = this.prefs.density;
    try {
      this.storage?.setItem(TOKEN_CACHE_KEY, JSON.stringify({ mode, tokens }));
    } catch {
      // The cache only prevents a color flash on the next load.
    }
    for (const listener of this.listeners) listener();
  }
}
