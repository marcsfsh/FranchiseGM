/**
 * Measures situation profiles (spec 7.5) by running the sim: for each named scheme, every team runs it for
 * a batch of games in a fixed-mode league, and each slot's share of snaps in each trigger situation is
 * written to src/data/situation-profiles.json. The league and its depth charts are built from estimated
 * profiles, so the same code gives the same file whatever the previous measurement said.
 * Rerun after changing the sim or the named schemes: `npx tsx tools/measure-profiles.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseClimate } from '../src/data/climate';
import { parseSchedule } from '../src/data/schedule';
import { createLeague, defaultStartOptions } from '../src/engine/league/create';
import type { League } from '../src/engine/league/types';
import { stream } from '../src/engine/rng';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from '../src/engine/schemes/ids';
import { named, useEstimatedProfiles } from '../src/engine/schemes/resolve';
import { PLAY_TRIGGERS, type PlayTrigger } from '../src/engine/schemes/situations';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, type Slot } from '../src/engine/schemes/slots';
import { simulateGame } from '../src/engine/sim/game';
import { gameSetup } from '../src/engine/sim/setup';
import { nameData } from '../tests/helpers/base-data';

export const PROFILE_FILE = 'src/data/situation-profiles.json';
const GAMES = 48;
const SEED = 20260714;

type Shares = Record<PlayTrigger, number>;

function measure(base: League, side: 'offense' | 'defense', id: string): Record<string, Shares> {
  const league: League = structuredClone(base);
  for (const team of Object.values(league.teams)) {
    if (side === 'offense') team.schemes.offense = named(id as (typeof OFFENSE_SCHEMES)[number]);
    else team.schemes.defense = named(id as (typeof DEFENSE_SCHEMES)[number]);
  }
  const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
  const slots: readonly Slot[] = side === 'offense' ? OFFENSE_SLOTS : DEFENSE_SLOTS;
  const snaps: Partial<Record<Slot, number>> = {};
  const counts: Partial<Record<Slot, Partial<Record<PlayTrigger, number>>>> = {};
  league.schedule.slice(0, GAMES).forEach((game, i) => {
    const rng = stream(SEED, 'measure', side, id, i);
    const setup = { ...gameSetup(league, game, climate, rng.fork('setup')), measure: true };
    const result = simulateGame(setup, rng.fork('plays'));
    for (const team of ['home', 'away'] as const) {
      const s = result.situations?.[team];
      if (!s) continue;
      for (const slot of slots) {
        snaps[slot] = (snaps[slot] ?? 0) + (s.snaps[slot] ?? 0);
        const into = (counts[slot] ??= {});
        for (const [t, n] of Object.entries(s.counts[slot] ?? {}))
          into[t as PlayTrigger] = (into[t as PlayTrigger] ?? 0) + (n as number);
      }
    }
  });
  const out: Record<string, Shares> = {};
  for (const slot of slots) {
    const n = snaps[slot] ?? 0;
    out[slot] = Object.fromEntries(
      PLAY_TRIGGERS.map(t => [t, n ? Math.round(((counts[slot]?.[t] ?? 0) / n) * 10_000) / 10_000 : 0])
    ) as Shares;
  }
  return out;
}

export function measureAll(): object {
  useEstimatedProfiles(true);
  try {
    const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
    const base = createLeague({
      id: 'profiles',
      name: 'Profiles',
      start: defaultStartOptions('MIN', SEED),
      gameVersion: 'tools',
      names: nameData(),
      schedule,
      fixed: true
    });
    return {
      status: 'measured',
      note: "Share of each slot's snaps in each trigger situation, from tools/measure-profiles.ts (spec 7.5).",
      games: GAMES,
      seed: SEED,
      offense: Object.fromEntries(OFFENSE_SCHEMES.map(id => [id, measure(base, 'offense', id)])),
      defense: Object.fromEntries(DEFENSE_SCHEMES.map(id => [id, measure(base, 'defense', id)]))
    };
  } finally {
    useEstimatedProfiles(false);
  }
}

if (process.argv[1]?.endsWith('measure-profiles.ts')) {
  writeFileSync(PROFILE_FILE, `${JSON.stringify(measureAll(), null, 1)}\n`);
  console.log(`Wrote ${PROFILE_FILE}`);
}
