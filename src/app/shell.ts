/**
 * App shell (style guide 4.1, 4.4, 11): sidebar on desktop, icon rail on tablet, bottom tab bar on phone,
 * and a top bar everywhere. All three navigations are built from one destination list; CSS shows the one
 * that matches the layout, so a layout change never rebuilds the main content. League destinations
 * appear only while a league is open.
 */
import { TEAM_COLORS } from '../data/team-colors';
import type { League } from '../engine/league/types';
import { PHASE_LABELS } from '../engine/model/calendar';
import { offseasonStep, stepLabel } from '../engine/season/offseason';
import { h, mount } from './dom';
import { dialogFrame, openDialog, toastRegion } from './feedback';
import { icon } from './icons';
import { DESTINATIONS, PHONE_TABS, href, sectionOf, type Destination, type Route } from './router';
import type { PrefsController } from './theme/controller';

export interface Shell {
  main: HTMLElement;
  /** Marks the current destination in every navigation. */
  setCurrent(route: Route): void;
  /** Shows league destinations and the league's brand block, or the no-league navigation. */
  setLeague(league: League | null): void;
}

const navLink = (d: Destination, className: string, compact: boolean) =>
  h(
    'a',
    {
      class: className,
      href: href(d.route),
      'data-nav': d.route,
      'data-league': d.league === undefined ? null : String(d.league)
    },
    icon(d.icon, { size: compact ? 22 : 20 }),
    h('span', null, compact ? (d.short ?? d.label) : d.label)
  );

/** A short date line: "2026 season · Week 1". */
export function dateLine(league: League): string {
  const { season, phase, week } = league.date;
  if (phase === 'regularSeason') return `${season} season · Week ${week}`;
  return `${season} season · ${offseasonStep(league.date) ? stepLabel(league.date) : PHASE_LABELS[phase]}`;
}

export function createShell(root: HTMLElement, prefs: PrefsController): Shell {
  const twill = h('span', { class: 'twill twill-sm', 'aria-hidden': 'true' });
  const teamName = h('strong', null);
  const brandNote = h('span', null, 'No league open');
  const sidebar = h(
    'nav',
    { class: 'sidebar on-team', 'aria-label': 'Main' },
    h('div', { class: 'sidebar-brand' }, twill, teamName, brandNote),
    h('div', { class: 'sidebar-items' }, ...DESTINATIONS.map(d => navLink(d, 'nav-item', false)))
  );

  const themeButton = h('button', { class: 'icon-btn', type: 'button', 'data-theme-toggle': true });
  themeButton.addEventListener('click', () => prefs.set('theme', prefs.mode === 'night' ? 'day' : 'night'));
  const title = h('span', { class: 'topbar-title' }, 'Franchise GM');
  const topbar = h('header', { class: 'topbar on-team' }, title, themeButton);

  const rail = h(
    'nav',
    { class: 'rail', 'aria-label': 'Main' },
    ...DESTINATIONS.map(d => navLink(d, 'rail-item', true))
  );

  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });

  const moreItems = DESTINATIONS.filter(d => !PHONE_TABS.includes(d.route));
  const moreList = h(
    'ul',
    { class: 'more-list' },
    ...moreItems.map(d => h('li', null, navLink(d, 'nav-item', false)))
  );
  const moreDialog = dialogFrame(
    'moreDialog',
    'More',
    h('nav', { 'aria-label': 'More destinations' }, moreList)
  );
  moreList.addEventListener('click', event => {
    if ((event.target as Element).closest('a')) moreDialog.close();
  });
  const moreButton = h(
    'button',
    { type: 'button', 'aria-haspopup': 'dialog', 'data-nav-more': true },
    icon('more', { size: 22 }),
    h('span', null, 'More')
  );
  moreButton.addEventListener('click', () => openDialog(moreDialog, moreButton));
  const settings = DESTINATIONS.find(d => d.route === 'settings') as Destination;
  const settingsTab = navLink({ ...settings, league: false }, 'tab-item', true);
  const tabbar = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Main' },
    ...DESTINATIONS.filter(d => PHONE_TABS.includes(d.route)).map(d => navLink(d, 'tab-item', true)),
    settingsTab,
    moreButton
  );

  const skip = h('a', { class: 'skip-link', href: '#main' }, 'Skip to content');
  skip.addEventListener('click', event => {
    event.preventDefault();
    main.focus();
  });

  root.classList.add('app');
  mount(root, sidebar, topbar, rail, main, tabbar);
  root.before(skip);
  root.after(moreDialog, toastRegion());

  let league: League | null = null;
  const refreshBrand = () => {
    const team = TEAM_COLORS[prefs.team];
    twill.textContent = prefs.team;
    teamName.textContent = `${team.city} ${team.name}`;
    brandNote.textContent = league ? dateLine(league) : 'No league open';
    title.textContent = league ? league.meta.name : 'Franchise GM';
    const night = prefs.mode === 'night';
    themeButton.replaceChildren(icon(night ? 'sun' : 'moon'));
    themeButton.setAttribute('aria-label', night ? 'Switch to Day' : 'Switch to Night');
  };
  prefs.onChange(refreshBrand);
  refreshBrand();

  const applyVisibility = () => {
    const open = league !== null;
    for (const scope of [root, moreList]) {
      for (const link of scope.querySelectorAll<HTMLElement>('[data-league]')) {
        link.hidden = link.dataset.league !== String(open);
      }
    }
    for (const item of moreList.querySelectorAll<HTMLElement>('li')) {
      item.hidden = Boolean(item.querySelector<HTMLElement>('[data-league]')?.hidden);
    }
    moreButton.hidden = !open;
  };
  applyVisibility();

  return {
    main,
    setLeague(next) {
      league = next;
      applyVisibility();
      refreshBrand();
    },
    setCurrent(route) {
      const section = sectionOf(route);
      for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
        if (link.dataset.nav === section) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      for (const link of moreList.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
        if (link.dataset.nav === section) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      const inMore = moreItems.some(d => d.route === section);
      if (inMore && league) moreButton.setAttribute('aria-current', 'page');
      else moreButton.removeAttribute('aria-current');
    }
  };
}
