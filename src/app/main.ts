import '../styles/index.css';
import { SaveStore } from '../storage/saves';
import { loadBaseDb } from './base-db-loader';
import { byId, h, mount } from './dom';
import { toast } from './feedback';
import { needsLeague, parseHash, type Route } from './router';
import { SCREENS } from './screens';
import type { Screen } from './screens/types';
import { createShell } from './shell';
import { AppState } from './state';
import { PrefsController } from './theme/controller';
import { WorkerClient, type Progress } from './worker-client';

const prefs = new PrefsController();
prefs.apply();
const shell = createShell(byId('app'), prefs);

// Rail and sticky offsets follow the measured top bar height.
const topbar = document.querySelector<HTMLElement>('.topbar');
if (topbar) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  }).observe(topbar);
}

const worker = new WorkerClient();
void worker
  .run('ping', null)
  .result.then(() => (document.documentElement.dataset.worker = worker.mode))
  .catch(() => (document.documentElement.dataset.worker = 'failed'));

const gm: Record<string, unknown> = {
  version: __GM_VERSION__,
  workerMode: worker.mode,
  async runJob(job: string, payload: unknown) {
    const progress: Progress[] = [];
    const result = await worker.run(job, payload, p => progress.push(p)).result;
    return { result, progress };
  }
};
/** Console and test access to the job runner. It exposes nothing that isn't already in the page. */
Object.assign(globalThis, { __gm: gm });

let app: AppState | null = null;
let current: Screen | null = null;
let currentRoute: Route | null = null;
let first = true;
/** Where the roster was when a player page opened from it, so returning restores it (style guide 13.5). */
let rosterReturn: { scroll: number; playerId: string } | null = null;

const visible = (node: HTMLElement) => node.getClientRects().length > 0;

function go(hash: string): void {
  if (location.hash === hash) show(parseHash(hash));
  else location.hash = hash;
}

function show(route: Route): void {
  if (!app) return;
  if (!app.league && needsLeague(route.name)) {
    history.replaceState(null, '', '#/leagues');
    route = parseHash('#/leagues');
  } else if (app.league && (route.name === 'start' || route.name === 'newLeague')) {
    // The league list is for choosing a league; Settings > Switch league saves and closes this one first.
    history.replaceState(null, '', '#/');
    route = parseHash('#/');
  }
  if (currentRoute?.name === 'roster' && route.name === 'player')
    rosterReturn = { scroll: window.scrollY, playerId: route.params.id ?? '' };
  else if (route.name !== 'roster' && route.name !== 'player') rosterReturn = null;
  current?.dispose?.();
  current = SCREENS[route.name]();
  shell.main.replaceChildren(current.render({ route, prefs, app, go }));
  shell.setCurrent(route);
  document.title = `${current.title} · Franchise GM`;
  currentRoute = route;
  if (first) {
    first = false;
    return;
  }
  // Back on the roster from a player page: the same scroll position, with focus on that player's link.
  const back = route.name === 'roster' ? rosterReturn : null;
  const link = back
    ? [...shell.main.querySelectorAll<HTMLElement>(`[data-player-link="${CSS.escape(back.playerId)}"]`)].find(
        visible
      )
    : undefined;
  rosterReturn = route.name === 'roster' ? null : rosterReturn;
  if (back && link) {
    window.scrollTo(0, back.scroll);
    link.focus({ preventScroll: true });
    return;
  }
  window.scrollTo(0, 0);
  shell.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
}

async function boot(): Promise<void> {
  mount(shell.main, h('p', { class: 'muted', role: 'status' }, 'Loading Franchise GM…'));
  let baseDb;
  try {
    const loaded = await loadBaseDb();
    baseDb = loaded.db;
    document.documentElement.dataset.baseDb = 'ready';
    gm.baseDbReadyMs = Math.round(loaded.readyAtMs);
    gm.baseDbInfo = {
      season: baseDb.season,
      source: baseDb.source,
      games: baseDb.schedule.length,
      staff: baseDb.staff.length
    };
  } catch (error) {
    document.documentElement.dataset.baseDb = 'failed';
    mount(
      shell.main,
      h(
        'p',
        { class: 'empty', role: 'alert' },
        error instanceof Error ? error.message : 'The base database could not be read.'
      )
    );
    return;
  }
  const store = await SaveStore.open();
  const state = new AppState(store, baseDb, worker, __GM_VERSION__);
  app = state;
  gm.app = state;
  state.onChange(() => {
    shell.setLeague(state.league);
    prefs.setFranchiseTeam(state.league?.meta.start.userTeam ?? null);
  });
  await state.refreshList();
  if (!store.available) {
    toast(
      `Saving isn't available in this browser (${store.unavailableReason}). Export your league to keep it.`,
      {
        persistent: true
      }
    );
  }
  const last = await state.lastLeagueId();
  if (last) {
    try {
      await state.open(last);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { persistent: true });
    }
  }
  document.documentElement.dataset.ready = 'true';
  window.addEventListener('hashchange', () => show(parseHash(location.hash)));
  // Choosing the destination that's already open moves focus to its heading, as a screen change would.
  document.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#/"]');
    if (!link || link.getAttribute('href') !== location.hash) return;
    event.preventDefault();
    window.scrollTo(0, 0);
    shell.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  });
  show(parseHash(location.hash));
}

void boot();
