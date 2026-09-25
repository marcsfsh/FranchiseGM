import { expect, test } from '@playwright/test';
import { createLeague, openGame } from './helpers';

// M4 done-when: a single game sims in under 100 ms on desktop, in the worker (spec 2.3).
test('sims a game in the worker in under 100 ms', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'A desktop timing.');
  await openGame(page);
  await createLeague(page, { name: 'Sim league', team: 'KC', seed: '44' });
  const out = await page.evaluate(async () => {
    const gm = (globalThis as unknown as { __gm: Record<string, unknown> }).__gm as {
      app: { league: { schedule: { id: string }[] }; baseDb: { climate: unknown } };
      runJob(
        job: string,
        payload: unknown
      ): Promise<{ result: { result: { score: unknown; plays: number; recap: string[] }; ms: number } }>;
    };
    const league = gm.app.league;
    const times: number[] = [];
    let last: { score: unknown; plays: number; recap: string[] } | null = null;
    for (const game of league.schedule.slice(0, 5)) {
      const { result } = await gm.runJob('simGame', {
        league,
        gameId: game.id,
        climate: gm.app.baseDb.climate
      });
      times.push(result.ms);
      last = result.result;
    }
    return { times, last };
  });
  expect(out.last?.plays).toBeGreaterThan(90);
  expect(out.last?.recap.length).toBeGreaterThan(0);
  const sorted = [...out.times].sort((a, b) => a - b);
  expect(sorted[2]).toBeLessThan(100);
});
