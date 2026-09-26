/**
 * Aging diagnostics for tuning (spec 23.3): plays one generated league season after season through the
 * offseason, as the calibration chains do, and prints each season's week 1 roster make-up by position group
 * and the delta-method aging curve (mean change in overall from one week 1 to the next, by age).
 *   npx tsx tools/aging-diagnostics.ts [seasons, default 10] [seed, default 1] ['{"progression":{...}}']
 * The optional JSON is merged into TUNING first, to try a tuning without editing it.
 */
import { computeAging, CURVE_GROUPS, runChain, type AgingFacts } from '../src/engine/calibration/chain';
import { loopLeague } from '../src/engine/calibration/loop';
import { stream } from '../src/engine/rng';
import { TUNING } from '../src/engine/tuning';
import { loadData } from './calibration/data';

const seasons = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1);
/** Merges plain objects key by key; arrays and numbers replace. */
function merge(into: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const target = into[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && target && typeof target === 'object')
      merge(target as Record<string, unknown>, value as Record<string, unknown>);
    else into[key] = value;
  }
}
if (process.argv[4])
  merge(TUNING as unknown as Record<string, unknown>, JSON.parse(process.argv[4]) as Record<string, unknown>);
const data = loadData();
const league = loopLeague(data, stream(seed, 'calibration', 'chain', 0).nextU32());
const started = performance.now();
const facts: AgingFacts = runChain(league, data, seasons, done =>
  console.error(`season ${done} of ${seasons} (${((performance.now() - started) / 1000).toFixed(0)} s)`)
);

const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '-' : n.toFixed(d));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
console.log(
  'season  age   exp  rook/tm  30+/tm  ' + CURVE_GROUPS.map(g => g.padStart(5)).join(' ') + '  pool'
);
for (const s of facts.snapshots) {
  const active = s.players.filter(p => p.active);
  const byGroup = CURVE_GROUPS.map(g =>
    fmt(mean(active.filter(p => p.group === g).map(p => p.ovr))).padStart(5)
  );
  console.log(
    `${s.season}   ${fmt(mean(active.map(p => p.exactAge)), 2)} ${fmt(mean(active.map(p => p.accrued)), 2)}  ` +
      `${fmt(active.filter(p => p.accrued === 0).length / s.teams).padStart(6)}  ${fmt(active.filter(p => p.age >= 30).length / s.teams).padStart(6)}  ` +
      `${byGroup.join(' ')}  ${s.players.length - active.length}`
  );
}
const ages = new Map<number, number>();
for (const r of facts.retirements) ages.set(Math.floor(r.age), (ages.get(Math.floor(r.age)) ?? 0) + 1);
console.log(
  `retirements: ${facts.retirements.length}, mean age ${fmt(mean(facts.retirements.map(r => r.age)))}, mean seasons ${fmt(mean(facts.retirements.map(r => r.experience)))}`
);
console.log(
  'retirements by age: ' +
    [...ages]
      .sort((a, b) => a[0] - b[0])
      .map(([a, n]) => `${a}:${n}`)
      .join(' ')
);

// The delta-method curve by group: mean change by age at the first week 1.
console.log('\nmean change in overall to the next week 1, by age (n)');
console.log('age  ' + CURVE_GROUPS.map(g => g.padStart(11)).join(''));
for (let age = 21; age <= 37; age++) {
  const cells = CURVE_GROUPS.map(group => {
    const changes: number[] = [];
    for (let i = 0; i + 1 < facts.snapshots.length; i++) {
      const later = new Map(facts.snapshots[i + 1]?.players.map(p => [p.id, p]) ?? []);
      for (const p of facts.snapshots[i]?.players ?? [])
        if (p.group === group && p.age === age) {
          const next = later.get(p.id);
          if (next) changes.push(next.ovr - p.ovr);
        }
    }
    return `${fmt(mean(changes))} (${changes.length})`.padStart(11);
  });
  console.log(`${age}   ${cells.join('')}`);
}
const metrics = computeAging([facts]);
console.log('\n' + [...metrics].map(([id, v]) => `${id}: ${fmt(v.value, 2)}`).join('\n'));
