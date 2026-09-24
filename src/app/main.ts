import '../styles/index.css';
import { byId } from './dom';
import { parseHash, type Route } from './router';
import { SCREENS } from './screens';
import type { Screen } from './screens/types';
import { createShell } from './shell';
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

/** Console and test access to the job runner. It exposes nothing that isn't already in the page. */
Object.assign(globalThis, {
  __gm: {
    version: __GM_VERSION__,
    workerMode: worker.mode,
    async runJob(job: string, payload: unknown) {
      const progress: Progress[] = [];
      const result = await worker.run(job, payload, p => progress.push(p)).result;
      return { result, progress };
    }
  }
});

let current: Screen | null = null;
let first = true;

function show(route: Route): void {
  current?.dispose?.();
  current = SCREENS[route.name]();
  shell.main.replaceChildren(current.render({ route, prefs }));
  shell.setCurrent(route);
  document.title = `${current.title} · Franchise GM`;
  if (!first) {
    window.scrollTo(0, 0);
    shell.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
  first = false;
}

window.addEventListener('hashchange', () => show(parseHash(location.hash)));
show(parseHash(location.hash));
