import { expect, type Page, type TestInfo } from '@playwright/test';
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
    const past = (el: Element) => el.getBoundingClientRect().right > width + 0.5;
    // The deepest elements reaching past the viewport, to name the cause in the failure.
    const culprits = [...document.querySelectorAll('body *')]
      .filter(el => past(el) && ![...el.children].some(past))
      .slice(0, 6)
      .map(el => {
        const r = el.getBoundingClientRect();
        const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map(c => `.${c}`).join('')}`;
        return `${name} right=${Math.round(r.right)} width=${Math.round(r.width)} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
      });
    return { overflow: document.documentElement.scrollWidth - width, culprits };
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
