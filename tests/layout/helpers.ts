import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const GAME_URL = pathToFileURL(path.resolve('dist/game.html')).href;

export type Size = 'phone' | 'tablet' | 'desktop';

export const sizeOf = (info: TestInfo): Size => (info.project.metadata as { size: Size }).size;

export interface OpenOptions {
  theme?: 'day' | 'night' | 'system';
  team?: string;
  layout?: 'auto' | 'phone' | 'tablet' | 'desktop';
  density?: 'comfortable' | 'compact';
  hash?: string;
}

/** Opens the built game with stored UI preferences. */
export async function openGame(page: Page, options: OpenOptions = {}): Promise<void> {
  const prefs = {
    theme: options.theme ?? 'day',
    layout: options.layout ?? 'auto',
    density: options.density ?? 'comfortable',
    team: options.team ?? 'mine'
  };
  await page.addInitScript(p => {
    try {
      localStorage.setItem('gm.ui.v2', JSON.stringify(p));
    } catch {
      // Storage may be blocked on purpose in some tests.
    }
  }, prefs);
  await page.goto(GAME_URL + (options.hash ?? ''));
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('main h1')).toBeVisible();
}

export interface LeagueOptions {
  name?: string;
  team?: string;
  seed?: string;
}

/** Creates a league through the new league form and waits for the team hub. */
export async function createLeague(page: Page, options: LeagueOptions = {}): Promise<void> {
  await page.evaluate(() => (location.hash = '#/leagues/new'));
  await expect(page.locator('#leagueName')).toBeVisible();
  await page.fill('#leagueName', options.name ?? 'Test league');
  await page.selectOption('#leagueTeam', options.team ?? 'MIN');
  await page.fill('#leagueSeed', options.seed ?? '2026');
  await page.click('form button[type=submit]');
  await expect(page.locator('main h1')).toHaveText('Team hub', { timeout: 30_000 });
}

/** The page never scrolls sideways (style guide 14.4). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { overflow, culprits } = await page.evaluate(() => {
    const width = window.innerWidth;
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map(c => `.${c}`).join('')}`;
    const snippet = (text: string | null) => `"${(text ?? '').trim().slice(0, 30)}"`;
    const past = (el: Element) => el.getBoundingClientRect().right > width + 0.5;
    // To name the cause in a failure: the deepest boxes reaching past the viewport, text that does (which
    // no box shows), and the deepest elements whose content is wider than the page (pseudo-elements).
    const boxes = [...document.querySelectorAll('body *')]
      .filter(el => past(el) && ![...el.children].some(past))
      .map(el => {
        const r = el.getBoundingClientRect();
        return `${name(el)} right=${Math.round(r.right)} width=${Math.round(r.width)} ${snippet(el.textContent)}`;
      });
    const texts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || !node.parentElement) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const right = Math.max(0, ...[...range.getClientRects()].map(r => r.right));
      if (right > width + 0.5)
        texts.push(
          `text in ${name(node.parentElement)} right=${Math.round(right)} ${snippet(node.textContent)}`
        );
    }
    // Elements that clip their content (scroll regions, screen reader text) can't widen the page.
    const wide = (el: Element) =>
      getComputedStyle(el).overflowX === 'visible' &&
      el.getBoundingClientRect().left + el.scrollWidth > width + 0.5;
    const contents = [...document.querySelectorAll('body *')]
      .filter(el => wide(el) && ![...el.children].some(wide))
      .map(el => {
        const kids = [...el.children]
          .map(c => {
            const r = c.getBoundingClientRect();
            return `${name(c)}[w=${Math.round(r.width)} sw=${c.scrollWidth} ${getComputedStyle(c).overflowX}]`;
          })
          .join(' ');
        return `content of ${name(el)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth} ${snippet(el.textContent)} children ${kids}`;
      });
    return {
      overflow: document.documentElement.scrollWidth - width,
      culprits: [...boxes.slice(0, 4), ...texts.slice(0, 4), ...contents.slice(0, 4)]
    };
  });
  expect(
    overflow,
    `page-level horizontal overflow from ${culprits.join('; ') || 'nothing visible'}`
  ).toBeLessThanOrEqual(0);
}

/** Visible interactive elements inside `scope` meet the target size (style guide 4.3). */
export async function expectTouchTargets(page: Page, scope: string, min: number): Promise<void> {
  const small = await page.evaluate(
    ([sel, size]) => {
      const out: string[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(
        `${sel} a, ${sel} button, ${sel} select, ${sel} input`
      )) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        // A control hidden from everyone (a file input a visible button opens) isn't a target.
        if (node.closest('[aria-hidden="true"]')) continue;
        const target = node.closest('label') ?? node;
        const t = target.getBoundingClientRect();
        if (t.width + 0.5 < size || t.height + 0.5 < size) {
          out.push(
            `${node.tagName.toLowerCase()} "${node.textContent?.trim() || node.getAttribute('aria-label') || ''}" ${Math.round(t.width)}x${Math.round(t.height)}`
          );
        }
      }
      return out;
    },
    [scope, min] as const
  );
  expect(small, `targets under ${min}px`).toEqual([]);
}

/** WCAG contrast ratio between two computed CSS colors. */
export async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`missing ${sel}`);
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // A decorative plate drawn in ::before (name plates, slanted buttons) is the text's background.
    let bg = getComputedStyle(node, '::before').backgroundColor;
    let bgNode: Element | null = /rgba\(0, 0, 0, 0\)|transparent/.test(bg) ? node : null;
    while (bgNode) {
      bg = getComputedStyle(bgNode).backgroundColor;
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) break;
      bgNode = bgNode.parentElement;
    }
    const fg = lum(parse(getComputedStyle(node).color));
    const back = lum(parse(bg));
    return (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05);
  }, selector);
}

/**
 * Imports a league export from the Leagues screen and opens it on the team hub. The first import opens the
 * game with `options`; a later one in the same page switches leagues from Settings first.
 */
export async function importLeagueFixture(
  page: Page,
  file: string,
  name: string,
  options: OpenOptions = {}
): Promise<void> {
  if (page.url().startsWith(GAME_URL)) {
    // A league is open: Settings > Switch league saves and closes it.
    await goTo(page, '#/settings', 'Settings');
    await page.getByRole('button', { name: 'Switch league' }).click();
    await expect(page.locator('main h1')).toHaveText('Leagues');
  } else await openGame(page, { ...options, hash: '#/leagues' });
  await page.setInputFiles('#importLeagueFile', {
    name: 'league.json.gz',
    mimeType: 'application/gzip',
    buffer: readFileSync(file)
  });
  const card = page.locator('[data-league-id]', { hasText: name });
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('main h1')).toHaveText('Team hub');
}

/** Goes to a route by its hash and waits for the screen's heading. */
export async function goTo(page: Page, hash: string, heading: string): Promise<void> {
  await page.evaluate(h => (location.hash = h), hash);
  await expect(page.locator('main h1')).toHaveText(heading);
}

/**
 * Every table scroll area is a labeled, focusable region exactly when its table overflows. Regions update
 * on the next frame after a table appears or resizes, so the check waits for them to settle.
 */
export async function expectRegionsMatchOverflow(page: Page): Promise<void> {
  const wrong = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main .table-scroll')].flatMap(el => {
        const scrolls = el.scrollWidth > el.clientWidth + 1;
        const region =
          el.getAttribute('role') === 'region' && !!el.getAttribute('aria-label') && el.tabIndex === 0;
        return scrolls === region
          ? []
          : [`${el.querySelector('caption')?.textContent ?? '?'} scrolls=${scrolls}`];
      })
    );
  await expect.poll(wrong).toEqual([]);
}
