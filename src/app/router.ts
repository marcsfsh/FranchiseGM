/** Hash routing (spec 2.3), so the single file can deep-link to screens: #/team/MIN/roster. */
import type { IconName } from './icons';

export type RouteName =
  | 'home'
  | 'roster'
  | 'depth'
  | 'gameplan'
  | 'staff'
  | 'scouting'
  | 'freeagency'
  | 'trades'
  | 'finances'
  | 'league'
  | 'history'
  | 'settings'
  | 'player'
  | 'team';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
}

interface RouteDef {
  name: RouteName;
  /** Path segments; a leading colon marks a parameter. */
  path: string;
}

const ROUTES: readonly RouteDef[] = [
  { name: 'home', path: '' },
  { name: 'roster', path: 'roster' },
  { name: 'depth', path: 'depth-chart' },
  { name: 'gameplan', path: 'game-plan' },
  { name: 'staff', path: 'staff' },
  { name: 'scouting', path: 'scouting' },
  { name: 'freeagency', path: 'free-agency' },
  { name: 'trades', path: 'trades' },
  { name: 'finances', path: 'finances' },
  { name: 'league', path: 'league' },
  { name: 'history', path: 'history' },
  { name: 'settings', path: 'settings' },
  { name: 'player', path: 'player/:id' },
  { name: 'team', path: 'team/:abbr/:tab' }
];

const PARAM = /^[A-Za-z0-9_-]{1,64}$/;

/** Decodes a path segment. A malformed escape becomes a value no route accepts. */
function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return '\u0000';
  }
}

/** Parses a location hash. Unknown or malformed routes go home. */
export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(part => part.length > 0);
  for (const def of ROUTES) {
    const pattern = def.path.split('/').filter(part => part.length > 0);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    pattern.forEach((segment, i) => {
      const part = safeDecode(parts[i] ?? '');
      if (segment.startsWith(':')) {
        if (PARAM.test(part)) params[segment.slice(1)] = part;
        else matched = false;
      } else if (segment !== part) matched = false;
    });
    if (matched) return { name: def.name, params };
  }
  return { name: 'home', params: {} };
}

/** Builds a hash for a route. */
export function href(name: RouteName, params: Record<string, string> = {}): string {
  const def = ROUTES.find(r => r.name === name);
  if (!def) throw new Error(`Unknown route ${name}`);
  const path = def.path
    .split('/')
    .map(segment => (segment.startsWith(':') ? encodeURIComponent(params[segment.slice(1)] ?? '') : segment))
    .join('/');
  return `#/${path}`;
}

export interface Destination {
  route: RouteName;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  icon: IconName;
}

/** Main sections, in spec 19.1 order. */
export const DESTINATIONS: readonly Destination[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'roster', label: 'Roster', icon: 'roster' },
  { route: 'depth', label: 'Depth chart', icon: 'depth' },
  { route: 'gameplan', label: 'Game plan', icon: 'gamePlan' },
  { route: 'staff', label: 'Staff', icon: 'staff' },
  { route: 'scouting', label: 'Scouting and draft', short: 'Scout', icon: 'scouting' },
  { route: 'freeagency', label: 'Free agency', icon: 'addPerson' },
  { route: 'trades', label: 'Trades', icon: 'trades' },
  { route: 'finances', label: 'Finances', icon: 'finances' },
  { route: 'league', label: 'League', icon: 'league' },
  { route: 'history', label: 'History', icon: 'history' },
  { route: 'settings', label: 'Settings', icon: 'settings' }
];

/** The phone tab bar shows these, then More (style guide 4.4). */
export const PHONE_TABS: readonly RouteName[] = ['home', 'roster', 'staff', 'scouting'];

/** The destination a route highlights in navigation. */
export function sectionOf(route: Route): RouteName {
  if (route.name === 'player') return 'roster';
  if (route.name === 'team') return 'league';
  return route.name;
}
