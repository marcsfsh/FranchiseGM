import { expect, test } from '@playwright/test';
import { createLeague, openGame } from './helpers';

// M4: a game sims in the worker (spec 2.3). Its time is measured for milestone reports, never enforced
// (post-M23 section 2.18).
test('sims a game in the worker', async ({ page }, info) => {
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
    for (const game of league.schedule.slice(0, 7)) {
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
  // Other layout tests share the CPU while the suite runs in parallel, so the fastest of seven runs, the one
  // they disturbed least, measures the sim itself.
  console.log(
    `Measured: a game sims in ${Math.min(...out.times).toFixed(1)} ms in the worker (fastest of 7).`
  );
});
