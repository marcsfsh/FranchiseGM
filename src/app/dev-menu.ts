/**
 * The hidden dev menu (spec 23.5): always on in the debug build; in the shipped game, tapping the version
 * number in Settings seven times unlocks it for the rest of the visit.
 */
const TAPS = 7;
const KEY = 'gm-dev-menu';
let taps = 0;
let unlocked = false;

export function devMenuOn(): boolean {
  if (__GM_DEBUG__ || unlocked) return true;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Counts a tap on the version number. Returns the taps still needed, 0 once the menu is on. */
export function tapVersion(): number {
  if (devMenuOn()) return 0;
  taps++;
  if (taps < TAPS) return TAPS - taps;
  unlocked = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // The menu stays on for this page load.
  }
  return 0;
}
