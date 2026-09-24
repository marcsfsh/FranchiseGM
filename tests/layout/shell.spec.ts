import { expect, test, type Page } from '@playwright/test';
import {
  contrastOf,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  openGame,
  sizeOf,
  type Size
} from './helpers';

const NAV: Record<Size, string> = { phone: '.tabbar', tablet: '.rail', desktop: '.sidebar' };
const TARGET: Record<Size, number> = { phone: 48, tablet: 44, desktop: 44 };
// Style guide 14.1 representative teams, including black primaries and light neutral accents.
const TEAMS = ['MIN', 'LV', 'CIN', 'HOU', 'MIA', 'LAC', 'IND', 'DET'];

async function expectOnlyNav(page: Page, size: Size) {
  for (const [s, selector] of Object.entries(NAV)) {
    if (s === size) await expect(page.locator(selector)).toBeVisible();
    else await expect(page.locator(selector)).toBeHidden();
  }
}

test.describe('app shell', () => {
  test('picks the shell for the viewport automatically', async ({ page }, info) => {
    const size = sizeOf(info);
    await openGame(page);
    await expect(page.locator('html')).toHaveAttribute('data-layout', size);
    await expectOnlyNav(page, size);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page, NAV[size], TARGET[size]);
    await expectTouchTargets(page, '.topbar', TARGET[size]);
  });

  for (const theme of ['day', 'night'] as const) {
    test(`renders ${theme} for every representative team`, async ({ page }, info) => {
      const size = sizeOf(info);
      await openGame(page, { theme });
      for (const team of TEAMS) {
        await page.goto(`${page.url().split('#')[0]}#/settings`);
        await page.selectOption('#teamSel', team);
        const root = page.locator('html');
        await expect(root).toHaveAttribute('data-theme', theme);
        await expect(root).toHaveAttribute('data-team', team);
        const colors = await page.evaluate(() => {
          const css = getComputedStyle(document.documentElement);
          const probe = (value: string) => {
            const el = document.createElement('i');
            el.style.color = value;
            document.body.append(el);
            const out = getComputedStyle(el).color;
            el.remove();
            return out;
          };
          return {
            ground: probe(css.getPropertyValue('--ground')),
            team: probe(css.getPropertyValue('--team')),
            body: getComputedStyle(document.body).backgroundColor,
            topbar: getComputedStyle(document.querySelector('.topbar') as Element).backgroundColor
          };
        });
        expect(colors.body, `${team} page background`).toBe(colors.ground);
        expect(colors.topbar, `${team} top bar`).toBe(colors.team);
        expect(await contrastOf(page, 'main h1'), `${team} heading`).toBeGreaterThanOrEqual(4.5);
        expect(await contrastOf(page, '.topbar-title'), `${team} top bar title`).toBeGreaterThanOrEqual(4.5);
        expect(await contrastOf(page, '.card-body p'), `${team} body text`).toBeGreaterThanOrEqual(4.5);
        await expectOnlyNav(page, size);
        await expectNoHorizontalOverflow(page);
      }
    });
  }

  test('honors a manual layout and returns to Auto', async ({ page }, info) => {
    const size = sizeOf(info);
    await openGame(page, { hash: '#/settings' });
    for (const forced of ['phone', 'tablet', 'desktop'] as const) {
      await page.selectOption('#layoutSel', forced);
      await expect(page.locator('html')).toHaveAttribute('data-layout', forced);
      await expect(page.locator('#layoutNote')).toHaveText(`Set to ${forced}.`);
      await expectOnlyNav(page, forced);
      // Every destination stays reachable in a forced shell.
      const nav = page.locator(NAV[forced]);
      await expect(nav.locator('[data-nav="settings"], [data-nav-more]').first()).toBeVisible();
    }
    await page.selectOption('#layoutSel', 'auto');
    await expect(page.locator('html')).toHaveAttribute('data-layout', size);
    await expect(page.locator('#layoutNote')).toHaveText(`Auto: showing ${size}.`);
  });

  test('re-runs Auto on resize and orientation change', async ({ page }, info) => {
    test.skip(!info.project.name.endsWith('desktop'), 'One resize sweep per browser is enough.');
    await openGame(page);
    const steps: [number, number, Size][] = [
      [1440, 900, 'desktop'],
      [834, 1194, 'tablet'],
      [390, 844, 'phone'],
      [844, 390, 'phone'],
      [1194, 834, 'desktop'],
      [1099, 700, 'tablet'],
      [1100, 700, 'desktop'],
      [519, 900, 'phone']
    ];
    for (const [width, height, layout] of steps) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('html'), `${width}x${height}`).toHaveAttribute('data-layout', layout);
      await expectOnlyNav(page, layout);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('keeps the manual layout after a reload', async ({ page }) => {
    await openGame(page, { layout: 'tablet' });
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tablet');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tablet');
  });

  test('navigates every destination and marks it current', async ({ page }, info) => {
    const size = sizeOf(info);
    await openGame(page);
    const routes = await page.locator('.sidebar [data-nav]').evaluateAll(links =>
      links.map(link => ({
        route: (link as HTMLElement).dataset.nav as string,
        label: link.textContent ?? ''
      }))
    );
    expect(routes.length).toBe(12);
    for (const { route } of routes) {
      const nav = page.locator(NAV[size]);
      const direct = nav.locator(`[data-nav="${route}"]`);
      if ((await direct.count()) > 0) {
        await direct.click();
      } else {
        await nav.locator('[data-nav-more]').click();
        await page.locator(`#moreDialog [data-nav="${route}"]`).click();
        await expect(page.locator('#moreDialog')).toBeHidden();
      }
      await expect(page.locator('main h1')).toBeFocused();
      if ((await direct.count()) > 0) await expect(direct).toHaveAttribute('aria-current', 'page');
      else await expect(nav.locator('[data-nav-more]')).toHaveAttribute('aria-current', 'page');
      await expectNoHorizontalOverflow(page);
    }
  });

  test('switches Day and Night from the top bar', async ({ page }) => {
    await openGame(page, { theme: 'day' });
    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to Night');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to Day');
  });

  test('works when storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        }
      });
    });
    await openGame(page, { hash: '#/settings' });
    await expect(page.getByText("This browser won't store preferences.")).toBeVisible();
    await page.selectOption('#themeSel', 'night');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });
});
