/**
 * Builds a league export at the draft for layout tests: the finished 2026 season fixture advanced through the
 * offseason, as the game does it, until the user's team is on the clock (D-48). The user's roster is on
 * manual: where it can't advance, the staff fixes it, as the hub's "Let your staff fix it" does (D-46).
 * Deterministic.
 * `npx tsx tools/make-draft-fixture.ts <finished.json.gz> <out.json.gz> [league name]`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseClimate } from '../src/data/climate';
import { makeLegal } from '../src/engine/ai/decisions/compliance';
import { onTheClock } from '../src/engine/draft/draft';
import { stream } from '../src/engine/rng';
import { advanceOffseason } from '../src/engine/season/offseason';
import { exportLeague, readLeagueFile } from '../src/storage/saves';
import { nameData } from '../tests/helpers/base-data';

const [source, out, name = 'Draft day'] = process.argv.slice(2);
if (!source || !out)
  throw new Error('Usage: make-draft-fixture.ts <finished.json.gz> <out.json.gz> [league name]');
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const { league, history } = await readLeagueFile(new Blob([readFileSync(source)]));
league.meta.id = name.toLowerCase().replace(/\W+/g, '-');
league.meta.name = name;
const user = league.meta.start.userTeam;
for (let steps = 0; onTheClock(league)?.owner !== user; steps++) {
  if (steps > 20) throw new Error(`The fixture never reached the user's pick: ${league.date.phase}.`);
  const step = advanceOffseason(league, { names: nameData(), climate }, { actions: 0, entropy: 0 });
  if (!step.blocked) continue;
  makeLegal(league, user, stream(league.random.baseSeed, 'staffFix', league.season.season, league.season.transactions.length)); // prettier-ignore
  const again = advanceOffseason(league, { names: nameData(), climate }, { actions: 0, entropy: 0 });
  if (again.blocked) throw new Error(`The fixture is blocked at ${league.date.phase}: ${again.blocked}`);
}
const blob = await exportLeague(league, history);
writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
