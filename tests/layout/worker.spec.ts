import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test.describe('simulation worker', () => {
  test('runs a job in an inlined worker and reports progress', async ({ page }, info) => {
    test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
    await openGame(page);
    await expect(page.locator('html')).toHaveAttribute('data-worker', 'worker');
    const out = await page.evaluate(async () => {
      const gm = (
        globalThis as unknown as {
          __gm: {
            runJob(
              job: string,
              payload: unknown
            ): Promise<{ result: { checksum: number }; progress: { done: number; total: number }[] }>;
          };
        }
      ).__gm;
      return gm.runJob('selfTest', { seed: 7, draws: 200000 });
    });
    expect(out.progress.length).toBeGreaterThan(5);
    expect(out.progress.at(-1)).toMatchObject({ done: 200000, total: 200000 });
    expect(typeof out.result.checksum).toBe('number');
  });
});
