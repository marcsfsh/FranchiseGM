/** Hash routing (spec 2.3), so the single file can deep-link to screens: #/team/MIN/roster. */
import type { IconName } from './icons';

export type RouteName =
  | 'home'
  | 'roster'
  | 'depth'
  | 'gameplan'
  | 'training'
  | 'staff'
  | 'scouting'
  | 'freeagency'
  | 'trades'
  | 'finances'
  | 'league'
  | 'leagueTab'
  | 'game'
  | 'inbox'
  | 'history'
  | 'settings'
  | 'player'
  | 'team'
  | 'start'
  | 'newLeague'
  | 'dev';

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
  { name: 'training', path: 'training' },
  { name: 'staff', path: 'staff' },
  { name: 'scouting', path: 'scouting' },
  { name: 'freeagency', path: 'free-agency' },
  { name: 'trades', path: 'trades' },
  { name: 'finances', path: 'finances' },
  { name: 'league', path: 'league' },
  { name: 'leagueTab', path: 'league/:tab' },
  { name: 'game', path: 'game/:id' },
  { name: 'inbox', path: 'inbox' },
  { name: 'history', path: 'history' },
  { name: 'settings', path: 'settings' },
  { name: 'player', path: 'player/:id' },
  { name: 'team', path: 'team/:abbr/:tab' },
  { name: 'start', path: 'leagues' },
  { name: 'newLeague', path: 'leagues/new' },
  { name: 'dev', path: 'dev' }
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
  /** Shown only while a league is open (true), only while none is (false), or always (absent). */
  league?: boolean;
}

/** Main sections, in spec 19.1 order. */
export const DESTINATIONS: readonly Destination[] = [
  { route: 'start', label: 'Leagues', icon: 'leagues', league: false },
  { route: 'home', label: 'Home', icon: 'home', league: true },
  { route: 'roster', label: 'Roster', icon: 'roster', league: true },
  { route: 'depth', label: 'Depth chart', icon: 'depth', league: true },
  { route: 'gameplan', label: 'Game plan', icon: 'gamePlan', league: true },
  { route: 'staff', label: 'Staff', icon: 'staff', league: true },
  { route: 'scouting', label: 'Scouting and draft', short: 'Scout', icon: 'scouting', league: true },
  { route: 'freeagency', label: 'Free agency', icon: 'addPerson', league: true },
  { route: 'trades', label: 'Trades', icon: 'trades', league: true },
  { route: 'finances', label: 'Finances', icon: 'finances', league: true },
  { route: 'league', label: 'League', icon: 'league', league: true },
  { route: 'history', label: 'History', icon: 'history', league: true },
  { route: 'settings', label: 'Settings', icon: 'settings' }
];

/** Routes that need an open league. */
export const needsLeague = (name: RouteName): boolean =>
  !['start', 'newLeague', 'settings', 'dev'].includes(name);

/** The phone tab bar shows these, then More (style guide 4.4). Without a league: Leagues and Settings. */
export const PHONE_TABS: readonly RouteName[] = ['home', 'roster', 'staff', 'scouting', 'start'];

/** The destination a route highlights in navigation. */
export function sectionOf(route: Route): RouteName {
  if (route.name === 'player') return 'roster';
  if (route.name === 'inbox') return 'home';
  if (route.name === 'training') return 'gameplan';
  if (route.name === 'team' || route.name === 'leagueTab' || route.name === 'game') return 'league';
  if (route.name === 'newLeague') return 'start';
  if (route.name === 'dev') return 'settings';
  return route.name;
}
