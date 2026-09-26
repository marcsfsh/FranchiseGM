/**
 * An unattended league run (M12's done when, Checkpoint B): a generated league played season after season
 * through every offseason, as the game does it, with the user's club on auto. After every week and every
 * offseason step it checks each team's legality (League health: the cap, the roster limits and minimum, and a
 * game-day roster), and it writes a league summary: each season's champion and runner-up, standings spread,
 * stat leaders, and week 1 market; each team's record over the run; and the problems found. Exits with 1 when
 * a team was ever illegal or a team's average wins fell outside the competitive band.
 *
 *   npx tsx tools/league-run.ts [--seasons 10] [--seed 1] [--out calibration/reports]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TEAM_ABBRS, TEAM_COLORS, type TeamAbbr } from '../src/data/team-colors';
import { marketFacts } from '../src/engine/calibration/chain';
import { loopLeague } from '../src/engine/calibration/loop';
import type { League } from '../src/engine/league/types';
import { fullName } from '../src/engine/model/player';
import { stream } from '../src/engine/rng';
import { leagueHealth } from '../src/engine/roster/legality';
import { advanceWeek } from '../src/engine/season/advance';
import { advanceOffseason } from '../src/engine/season/offseason';
import { buildStandings, type WinLoss } from '../src/engine/season/standings';
import { gameWeek } from '../src/engine/season/state';
import { loadData } from './calibration/data';

const { values } = parseArgs({
  options: {
    seasons: { type: 'string', default: '10' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'calibration/reports' }
  }
});
const seasons = Number(values.seasons);
const seed = Number(values.seed);

/**
 * Average wins a season that every team's run must land within: the NFL's range over 2015 to 2024 ran from
 * the Jets' 5.6 to the Chiefs' 12.3 (Pro Football Reference), and the band leaves room around it.
 */
const COMPETITIVE: readonly [number, number] = [4, 13];

/** The stats whose leaders the summary lists, with their labels. */
const LEADERS = [
  ['passYds', 'Passing yards'],
  ['rushYds', 'Rushing yards'],
  ['recYds', 'Receiving yards'],
  ['sacks', 'Sacks'],
  ['defInt', 'Interceptions']
] as const;

interface SeasonLine {
  season: number;
  champion: TeamAbbr | null;
  runnerUp: TeamAbbr | null;
  records: Record<TeamAbbr, WinLoss>;
  playoffs: TeamAbbr[];
  leaders: { label: string; name: string; team: string; value: number }[];
  /** Week 1: the median team's cap space and the most, as shares of the cap, and teams over it. */
  spaceMedian: number;
  spaceTop: number;
  overCap: number;
  /** Week 1: the gap between the strongest and weakest rosters, by the mean of each one's best 22 overalls. */
  strengthGap: number;
}

const wins = (r: WinLoss): number => r.wins + r.ties / 2;
const record = (r: WinLoss): string => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const nick = (abbr: TeamAbbr | null): string => (abbr ? TEAM_COLORS[abbr].name : 'none');
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** The mean overall of each team's best 22 players on its active roster. */
function strengths(league: League): number[] {
  return TEAM_ABBRS.map(abbr => {
    const top = Object.values(league.players)
      .filter(p => p.team === abbr && p.status === 'active')
      .map(p => p.ovr)
      .sort((a, b) => b - a)
      .slice(0, 22);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  });
}

const data = loadData();
const league = loopLeague(data, stream(seed, 'league-run').nextU32());
const input = { actions: 0, entropy: 0 };
const problems: string[] = [];
const check = (when: string) => {
  for (const { team, problems: found } of leagueHealth(league))
    for (const p of found) problems.push(`${when}: ${team} ${p.fact}`);
};
const lines: SeasonLine[] = [];
const started = performance.now();
for (let s = 0; s < seasons; s++) {
  check(`${league.date.season} week 1`);
  const market = marketFacts(league);
  const space = [...market.space].sort((a, b) => a - b);
  const power = strengths(league);
  while (gameWeek(league) !== null) {
    const week = advanceWeek(league, data.climate, input);
    if (week.blocked) throw new Error(`The run stopped in ${league.date.season} week ${league.date.week}: ${week.blocked}`); // prettier-ignore
    check(`${league.date.season} ${league.date.phase} ${league.date.week}`);
  }
  const results = Object.values(league.season.results);
  const regular = buildStandings(results.filter(g => !g.playoff)).records;
  const final = results.filter(g => g.playoff).sort((a, b) => b.week - a.week)[0];
  const champion = league.season.champion;
  const leaders = LEADERS.map(([key, label]) => {
    const [id, line] = Object.entries(league.season.totals).sort(([a, x], [b, y]) => (y[key] ?? 0) - (x[key] ?? 0) || (a < b ? -1 : 1))[0] ?? ['', {}]; // prettier-ignore
    const p = league.players[id];
    return { label, name: p ? `${fullName(p)} (${p.position})` : '-', team: p?.team ?? p?.lastTeam ?? '-', value: line[key] ?? 0 }; // prettier-ignore
  });
  lines.push({
    season: league.date.season,
    champion,
    runnerUp: final ? (final.home === champion ? final.away : final.home) : null,
    records: Object.fromEntries(TEAM_ABBRS.map(t => [t, regular[t].overall])) as Record<TeamAbbr, WinLoss>,
    playoffs: [...(league.season.seeds?.AFC ?? []), ...(league.season.seeds?.NFC ?? [])],
    leaders,
    spaceMedian: ((space[15] ?? 0) + (space[16] ?? 0)) / 2 / market.cap,
    spaceTop: (space.at(-1) ?? 0) / market.cap,
    overCap: space.filter(x => x < 0).length,
    strengthGap: Math.max(...power) - Math.min(...power)
  });
  console.error(`season ${s + 1} of ${seasons} (${((performance.now() - started) / 1000).toFixed(0)} s)`);
  if (s === seasons - 1) break;
  while (league.date.phase !== 'regularSeason') {
    const step = advanceOffseason(league, { names: data.names, climate: data.climate }, input);
    if (step.blocked)
      throw new Error(`The run stopped in the ${league.date.season} offseason: ${step.blocked}`);
    check(`${league.date.season} ${league.date.phase} ${league.date.week}`);
  }
}

// Each team over the run.
const teams = TEAM_ABBRS.map(t => {
  const total = lines.reduce(
    (a, l) => ({ wins: a.wins + l.records[t].wins, losses: a.losses + l.records[t].losses, ties: a.ties + l.records[t].ties }), // prettier-ignore
    { wins: 0, losses: 0, ties: 0 }
  );
  return {
    team: t,
    total,
    average: wins(total) / lines.length,
    playoffs: lines.filter(l => l.playoffs.includes(t)).length,
    titles: lines.filter(l => l.champion === t).length
  };
}).sort((a, b) => b.average - a.average || (a.team < b.team ? -1 : 1));
const outside = teams.filter(t => t.average < COMPETITIVE[0] || t.average > COMPETITIVE[1]);

const sd = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};
const md: string[] = [
  `# League run: ${seasons} seasons, seed ${seed}`,
  '',
  `- A generated league played through ${seasons} seasons and ${seasons - 1} offseasons unattended, every club run by its AI staff (the user's on auto), in ${((performance.now() - started) / 1000).toFixed(0)} s.`, // prettier-ignore
  `- Legality: ${problems.length ? `${problems.length} problems found` : 'every team legal after every week and every offseason step'} (League health: the cap, roster limits and minimums, and game-day rosters).`, // prettier-ignore
  `- Competitive balance: average wins a season range from ${teams.at(-1)?.average.toFixed(1)} to ${teams[0]?.average.toFixed(1)} (the band is ${COMPETITIVE[0]} to ${COMPETITIVE[1]}; the NFL's 2015 to 2024 ran from 5.6 to 12.3); ${outside.length ? `outside it: ${outside.map(t => t.team).join(', ')}` : 'every team within it'}. ${new Set(lines.map(l => l.champion)).size} different champions in ${seasons} seasons.`, // prettier-ignore
  '',
  '## Seasons',
  '',
  '| Season | Champion | Runner-up | Best record | Worst record | Wins sd | Cap space, median / most | Over the cap | Roster gap |',
  '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |'
];
for (const l of lines) {
  const byWins = TEAM_ABBRS.map(t => [t, l.records[t]] as const).sort((a, b) => wins(b[1]) - wins(a[1]) || (a[0] < b[0] ? -1 : 1)); // prettier-ignore
  const best = byWins[0];
  const worst = byWins.at(-1);
  md.push(
    `| ${l.season} | ${nick(l.champion)} | ${nick(l.runnerUp)} | ${best ? `${best[0]} ${record(best[1])}` : '-'} | ${worst ? `${worst[0]} ${record(worst[1])}` : '-'} | ` + // prettier-ignore
      `${sd(TEAM_ABBRS.map(t => wins(l.records[t]))).toFixed(2)} | ${pct(l.spaceMedian)} / ${pct(l.spaceTop)} | ${l.overCap} | ${l.strengthGap.toFixed(1)} |` // prettier-ignore
  );
}
md.push('', '## Stat leaders', '', `| Season | ${LEADERS.map(([, label]) => label).join(' | ')} |`, `| --- |${LEADERS.map(() => ' --- |').join('')}`); // prettier-ignore
for (const l of lines)
  md.push(`| ${l.season} | ${l.leaders.map(x => `${x.name}, ${x.team}: ${Number.isInteger(x.value) ? x.value.toLocaleString('en-US') : x.value.toFixed(1)}`).join(' | ')} |`); // prettier-ignore
md.push('', '## Teams over the run', '', '| Team | Record | Wins a season | Playoffs | Titles |', '| --- | --- | ---: | ---: | ---: |'); // prettier-ignore
for (const t of teams)
  md.push(`| ${TEAM_COLORS[t.team].name} | ${record(t.total)} | ${t.average.toFixed(1)} | ${t.playoffs} | ${t.titles} |`); // prettier-ignore
if (problems.length) md.push('', '## Problems', '', ...problems.slice(0, 50).map(p => `- ${p}`));

const out = values.out ?? 'calibration/reports';
mkdirSync(out, { recursive: true });
const file = path.join(out, `${new Date().toISOString().slice(0, 10)}-league-${seasons}s-seed${seed}.md`);
writeFileSync(file, `${md.join('\n')}\n`);
console.log(`${file}: ${problems.length} legality problems; average wins ${teams.at(-1)?.average.toFixed(1)} to ${teams[0]?.average.toFixed(1)}`); // prettier-ignore
if (problems.length || outside.length) process.exitCode = 1;
