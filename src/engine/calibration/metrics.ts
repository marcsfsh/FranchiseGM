/**
 * Calibration metrics (spec 23.3), computed from replay facts. Each metric has a stable ID that
 * `calibration/targets.json` keys its band, source, and note by. The thresholds below are the measurement
 * definitions the sourced targets use (margins, spread buckets, weather buckets, milestone yards), not
 * simulation tuning.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { FIT_GROUP_IDS, FIT_GROUPS, type FitArm, type FitGroup } from './experiment';
import type { GameFact, ReplayFacts, TeamFact } from './replay';

export type MetricGroup = 'games' | 'seasons' | 'stats' | 'leaders' | 'injuries' | 'effects' | 'aging';

export const GROUP_TITLES: Record<MetricGroup, string> = {
  games: 'Games',
  seasons: 'Seasons',
  stats: 'League stats',
  leaders: 'Stat leaders and shares',
  injuries: 'Injuries',
  effects: 'Effect sizes',
  aging: 'Aging and development'
};

/** How a value prints: a share as a percentage, a change in percentage points, or a number. */
export type MetricFormat = 'pct' | 'pctPoints' | 'dec1' | 'dec2' | 'int' | 'signed1';

export interface MetricDef {
  id: string;
  group: MetricGroup;
  label: string;
  format: MetricFormat;
}

export interface MetricValue {
  value: number | null;
  /** The sample the value came from: games, team-seasons, seasons, or plays, as the metric counts them. */
  n: number;
}

/** One season's facts and where they came from: a replay, or a season through the weekly loop. */
export interface RunSample {
  league: number;
  replay: number;
  /** Played through the weekly loop (spec 4.2) rather than replayed. */
  loop?: boolean;
  facts: ReplayFacts;
}

/** Margins (NFL Analytics "Half of NFL games are one-score games"; betting.us blowout study). */
const ONE_SCORE = 8;
const CLOSE = 3;
const BLOWOUT = 17;
/** Expected-margin buckets for favorites, in points (the usual point-spread ranges). */
const FAVORITE_BUCKETS: readonly (readonly [string, number, number])[] = [
  ['Under3', 0, 3],
  ['3to7', 3, 7],
  ['7to10', 7, 10],
  ['10Plus', 10, Infinity]
];
/** Wind and temperature buckets (NFL Analytics "Weather & NFL Scoring"; The Spax weather study). */
const CALM_MPH = 5;
const STIFF_MPH = 16;
const LIGHT_MPH = 10;
const HIGH_MPH = 20;
const COLD_F = 32;
const MILD_F: readonly [number, number] = [50, 69];
/** Milestone seasons (spec 23.3). */
const PASSER_YARDS = 4000;
const RUSHER_YARDS = 1000;
const RECEIVER_YARDS = 1000;
const MANY_WINS = 15;
const FEW_WINS = 2;
const SEASONS_PER_DECADE = 10;

const DEFS: MetricDef[] = [];
const def = (id: string, group: MetricGroup, label: string, format: MetricFormat): void => {
  DEFS.push({ id, group, label, format });
};

def('games.homeWinRate', 'games', 'Home win rate', 'pct');
def('games.homeMargin', 'games', 'Home field, points per game', 'signed1');
def('games.pointsPerTeam', 'games', 'Points per team game', 'dec1');
def('games.oneScoreShare', 'games', 'Games decided by 8 or fewer', 'pct');
def('games.closeShare', 'games', 'Games decided by 1 to 3', 'pct');
def('games.blowoutShare', 'games', 'Games decided by 17 or more', 'pct');
def('games.overtimeRate', 'games', 'Overtime games', 'pct');
def('games.tieRate', 'games', 'Ties', 'pct');
def('games.comebackRate', 'games', 'Winner trailed in the 4th quarter', 'pct');
def('games.favoriteWinRate', 'games', 'Favorites win (by rating gap)', 'pct');
for (const [key, lo, hi] of FAVORITE_BUCKETS)
  def(
    `games.favoriteWinRate${key}`,
    'games',
    hi === Infinity ? `Favorites by ${lo}+ points` : `Favorites by ${lo} to ${hi} points`,
    'pct'
  );
def('games.marginSd', 'games', 'Margin spread around the rating gap (sd)', 'dec1');
def('games.ratingSd', 'games', 'Team rating spread (sd, points)', 'dec1');

def('seasons.winSd', 'seasons', 'Team wins, sd', 'dec2');
def('seasons.bestRecord', 'seasons', 'Most wins in a season (mean)', 'dec1');
def('seasons.worstRecord', 'seasons', 'Fewest wins in a season (mean)', 'dec1');
def('seasons.manyWinsPerDecade', 'seasons', '15-win teams per decade', 'dec1');
def('seasons.fewWinsPerDecade', 'seasons', '2-or-fewer-win teams per decade', 'dec1');
def('seasons.perfectOrWinlessPer100', 'seasons', 'Perfect or winless teams per 100 seasons', 'dec1');

def('stats.passAtt', 'stats', 'Pass attempts per team game', 'dec1');
def('stats.cmpPct', 'stats', 'Completion rate', 'pct');
def('stats.ypa', 'stats', 'Yards per pass attempt', 'dec2');
def('stats.tdPct', 'stats', 'Touchdown rate', 'pct');
def('stats.intPct', 'stats', 'Interception rate', 'pct');
def('stats.sackPct', 'stats', 'Sack rate', 'pct');
def('stats.rushAtt', 'stats', 'Rush attempts per team game', 'dec1');
def('stats.ypc', 'stats', 'Yards per carry', 'dec2');
def('stats.thirdDownPct', 'stats', 'Third-down conversions', 'pct');
def('stats.fourthDownAtt', 'stats', 'Fourth-down attempts per team game', 'dec2');
def('stats.fourthDownPct', 'stats', 'Fourth-down conversions', 'pct');
def('stats.redZoneTdPct', 'stats', 'Red zone touchdowns', 'pct');
def('stats.turnovers', 'stats', 'Turnovers per team game', 'dec2');
def('stats.penalties', 'stats', 'Penalties per team game', 'dec2');
def('stats.penaltyYds', 'stats', 'Penalty yards per team game', 'dec1');
def('stats.fgPctUnder40', 'stats', 'Field goals under 40 yards', 'pct');
def('stats.fgPct40s', 'stats', 'Field goals from 40 to 49', 'pct');
def('stats.fgPct50Plus', 'stats', 'Field goals from 50 or more', 'pct');
def('stats.puntAvg', 'stats', 'Gross punt average', 'dec1');
def('stats.kickoffReturnRate', 'stats', 'Kickoffs returned', 'pct');
def('stats.kickReturnAvg', 'stats', 'Kick return average', 'dec1');
def('stats.puntReturnAvg', 'stats', 'Punt return average', 'dec1');

def('leaders.passYds', 'leaders', 'Passing yards leader', 'int');
def('leaders.rushYds', 'leaders', 'Rushing yards leader', 'int');
def('leaders.recYds', 'leaders', 'Receiving yards leader', 'int');
def('leaders.receptions', 'leaders', 'Receptions leader', 'int');
def('leaders.sacks', 'leaders', 'Sacks leader', 'dec1');
def('leaders.defInt', 'leaders', 'Interceptions leader', 'dec1');
def('leaders.passers4000', 'leaders', '4,000-yard passers', 'dec1');
def('leaders.rushers1000', 'leaders', '1,000-yard rushers', 'dec1');
def('leaders.receivers1000', 'leaders', '1,000-yard receivers', 'dec1');
def('leaders.topTargetShare', 'leaders', "Team's top target share", 'pct');
def('leaders.maxTargetShare', 'leaders', 'Highest target share in the league', 'pct');
def('leaders.leadBackShare', 'leaders', "Lead back's share of running back carries", 'pct');

def('injuries.missed', 'injuries', 'Injuries costing a game, per team season', 'dec1');
def('injuries.gamesLost', 'injuries', 'Games lost to injury, per team season', 'dec1');
def('injuries.seasonEnding', 'injuries', 'Season-ending injuries, per team season', 'dec1');
def('injuries.all', 'injuries', 'All in-game injuries, per team season', 'dec1');

def('effects.fit', 'effects', 'Fit: best versus worst fit, same players', 'pct');
for (const group of FIT_GROUP_IDS)
  def(`effects.fit.${group}`, 'effects', `Fit effect, ${fitLabel(group)}`, 'pct');
def('effects.windPoints', 'effects', 'Wind 16+ mph versus calm, points per team', 'signed1');
def('effects.domePoints', 'effects', 'Indoors versus outdoors, points per team', 'signed1');
def('effects.coldPoints', 'effects', 'Freezing versus mild, points per team', 'signed1');
def('effects.rainPoints', 'effects', 'Rain versus dry, points per team', 'signed1');
def('effects.snowPoints', 'effects', 'Snow versus dry, points per team', 'signed1');
def('effects.windCompletion', 'effects', 'Wind 20+ mph versus under 10, completion rate', 'pctPoints');
def('effects.windFieldGoal', 'effects', 'Wind 20+ mph versus under 10, field goal rate', 'pctPoints');
def('effects.cohesion', 'effects', 'Cohesion', 'signed1');
def('effects.coaching', 'effects', 'Coaching quality', 'signed1');
def('effects.facilities', 'effects', 'Facilities', 'signed1');
def('effects.lockerRoom', 'effects', 'Locker room', 'signed1');

// Aging and development (spec 23.3), from leagues chained through the offseason (src/engine/calibration/chain.ts).
def('aging.meanAge', 'aging', 'Average age, week 1 active rosters', 'dec2');
def(
  'aging.meanExperience',
  'aging',
  'Average accrued seasons, this one included, week 1 active rosters',
  'dec2'
);
def('aging.rookiesPerTeam', 'aging', 'Players with no accrued season, per week 1 roster', 'dec1');
def('aging.over30PerTeam', 'aging', 'Players 30 or older, per week 1 roster', 'dec1');
def('aging.ovrDrift', 'aging', 'League average overall, change over the run', 'signed1');
def('aging.groupDrift', 'aging', 'Largest position group overall change over the run', 'dec1');
for (const group of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'])
  def(`aging.peakAge.${group}`, 'aging', `Peak age, ${group}`, 'dec1');
def('aging.retireAge', 'aging', 'Average age at retirement', 'dec1');
def('aging.retireExperience', 'aging', 'Average credited seasons at retirement', 'dec1');

function fitLabel(group: FitGroup): string {
  const labels: Record<FitGroup, string> = {
    passing: 'yards per attempt',
    rushing: 'yards per carry',
    receiving: 'yards per target',
    protection: 'pressures allowed',
    passRush: 'pressures',
    coverage: 'yards allowed per target'
  };
  return labels[group];
}

/** Every metric in report order. */
export const METRICS: readonly MetricDef[] = DEFS;

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const sum = <T>(items: readonly T[], f: (item: T) => number): number =>
  items.reduce((total, item) => total + f(item), 0);

/** Points above average per team and the home edge, fitted to margins by least squares (a simple rating system). */
export function fitRatings(games: readonly GameFact[]): { ratings: Map<TeamAbbr, number>; home: number } {
  const ratings = new Map<TeamAbbr, number>();
  const byTeam = new Map<TeamAbbr, { margin: number; opp: TeamAbbr; site: number }[]>();
  for (const g of games) {
    const site = g.neutral ? 0 : 1;
    const margin = g.homeScore - g.awayScore;
    byTeam.set(g.home, [...(byTeam.get(g.home) ?? []), { margin, opp: g.away, site }]);
    byTeam.set(g.away, [...(byTeam.get(g.away) ?? []), { margin: -margin, opp: g.home, site: -site }]);
  }
  for (const team of byTeam.keys()) ratings.set(team, 0);
  let home = 0;
  const hosted = games.filter(g => !g.neutral);
  for (let i = 0; i < 200; i++) {
    home = hosted.length
      ? sum(
          hosted,
          g => g.homeScore - g.awayScore - (ratings.get(g.home) ?? 0) + (ratings.get(g.away) ?? 0)
        ) / hosted.length
      : 0;
    for (const [team, list] of byTeam)
      ratings.set(team, sum(list, x => x.margin + (ratings.get(x.opp) ?? 0) - x.site * home) / list.length);
    const center = sum([...ratings.values()], r => r) / ratings.size;
    for (const [team, r] of ratings) ratings.set(team, r - center);
  }
  return { ratings, home };
}

const wins = (t: TeamFact): number => t.wins + t.ties / 2;

function gameMetrics(samples: readonly RunSample[], out: Map<string, MetricValue>): void {
  const games = samples.flatMap(s => s.facts.games);
  const n = games.length;
  const margins = games.map(g => g.homeScore - g.awayScore);
  const hosted = games.filter(g => !g.neutral);
  const homeWins = sum(hosted, g => (g.homeScore > g.awayScore ? 1 : g.homeScore === g.awayScore ? 0.5 : 0));
  out.set('games.homeWinRate', { value: ratio(homeWins, hosted.length), n: hosted.length });
  out.set('games.homeMargin', {
    value: mean(hosted.map(g => g.homeScore - g.awayScore)),
    n: hosted.length
  });
  out.set('games.pointsPerTeam', {
    value: ratio(
      sum(games, g => g.homeScore + g.awayScore),
      2 * n
    ),
    n
  });
  const share = (test: (margin: number) => boolean) => ({
    value: ratio(margins.filter(m => test(Math.abs(m))).length, n),
    n
  });
  out.set(
    'games.oneScoreShare',
    share(m => m <= ONE_SCORE)
  );
  out.set(
    'games.closeShare',
    share(m => m >= 1 && m <= CLOSE)
  );
  out.set(
    'games.blowoutShare',
    share(m => m >= BLOWOUT)
  );
  out.set(
    'games.tieRate',
    share(m => m === 0)
  );
  out.set('games.overtimeRate', { value: ratio(games.filter(g => g.overtime).length, n), n });
  out.set('games.comebackRate', { value: ratio(games.filter(g => g.comeback).length, n), n });

  // Favorites by the rating gap: each league's ratings are fitted over all its replays.
  const leagues = new Map<number, GameFact[]>();
  for (const s of samples) leagues.set(s.league, [...(leagues.get(s.league) ?? []), ...s.facts.games]);
  const results: { gap: number; won: number; residual: number }[] = [];
  const spreads: number[] = [];
  for (const list of leagues.values()) {
    const { ratings, home } = fitRatings(list);
    spreads.push(...ratings.values());
    for (const g of list) {
      const expected = (ratings.get(g.home) ?? 0) - (ratings.get(g.away) ?? 0) + (g.neutral ? 0 : home);
      const margin = g.homeScore - g.awayScore;
      const residual = margin - expected;
      if (expected === 0) continue;
      const favoriteMargin = expected > 0 ? margin : -margin;
      results.push({
        gap: Math.abs(expected),
        won: favoriteMargin > 0 ? 1 : favoriteMargin === 0 ? 0.5 : 0,
        residual
      });
    }
  }
  out.set('games.favoriteWinRate', {
    value: ratio(
      sum(results, r => r.won),
      results.length
    ),
    n: results.length
  });
  for (const [key, lo, hi] of FAVORITE_BUCKETS) {
    const inBucket = results.filter(r => r.gap >= lo && r.gap < hi);
    out.set(`games.favoriteWinRate${key}`, {
      value: ratio(
        sum(inBucket, r => r.won),
        inBucket.length
      ),
      n: inBucket.length
    });
  }
  out.set('games.marginSd', {
    value: results.length ? Math.sqrt(sum(results, r => r.residual ** 2) / results.length) : null,
    n: results.length
  });
  const spreadMean = mean(spreads) ?? 0;
  out.set('games.ratingSd', {
    value: spreads.length ? Math.sqrt(sum(spreads, r => (r - spreadMean) ** 2) / spreads.length) : null,
    n: spreads.length
  });
}

function seasonMetrics(samples: readonly RunSample[], out: Map<string, MetricValue>): void {
  const seasons = samples.length;
  const deviations: number[] = [];
  let many = 0;
  let few = 0;
  let extreme = 0;
  const best: number[] = [];
  const worst: number[] = [];
  for (const s of samples) {
    const w = s.facts.teams.map(wins);
    const avg = mean(w) ?? 0;
    deviations.push(...w.map(x => (x - avg) ** 2));
    best.push(Math.max(...w));
    worst.push(Math.min(...w));
    for (const t of s.facts.teams) {
      if (t.wins >= MANY_WINS) many++;
      if (t.wins <= FEW_WINS) few++;
      // Perfect means no losses or ties; winless means no wins, ties or not.
      if ((t.losses === 0 && t.ties === 0) || t.wins === 0) extreme++;
    }
  }
  const teamSeasons = deviations.length;
  out.set('seasons.winSd', {
    value: teamSeasons ? Math.sqrt(sum(deviations, d => d) / teamSeasons) : null,
    n: teamSeasons
  });
  out.set('seasons.bestRecord', { value: mean(best), n: seasons });
  out.set('seasons.worstRecord', { value: mean(worst), n: seasons });
  out.set('seasons.manyWinsPerDecade', { value: ratio(many * SEASONS_PER_DECADE, seasons), n: seasons });
  out.set('seasons.fewWinsPerDecade', { value: ratio(few * SEASONS_PER_DECADE, seasons), n: seasons });
  out.set('seasons.perfectOrWinlessPer100', { value: ratio(extreme * 100, seasons), n: seasons });
}

function statMetrics(samples: readonly RunSample[], out: Map<string, MetricValue>): void {
  const teams = samples.flatMap(s => s.facts.teams);
  const games = sum(teams, t => t.wins + t.losses + t.ties);
  const total = (key: keyof TeamFact['totals']) => sum(teams, t => t.totals[key]);
  const line = (key: keyof TeamFact['lines']) => sum(teams, t => t.lines[key]);
  const perGame = (id: string, value: number) => out.set(id, { value: ratio(value, games), n: games });
  const rate = (id: string, num: number, den: number) => out.set(id, { value: ratio(num, den), n: den });
  const att = total('passAtt');
  perGame('stats.passAtt', att);
  rate('stats.cmpPct', total('passCmp'), att);
  rate('stats.ypa', total('passYds'), att);
  rate('stats.tdPct', total('passTd'), att);
  rate('stats.intPct', total('passInt'), att);
  rate('stats.sackPct', total('sacked'), att + total('sacked'));
  perGame('stats.rushAtt', total('rushAtt'));
  rate('stats.ypc', total('rushYds'), total('rushAtt'));
  rate('stats.thirdDownPct', total('thirdDownConv'), total('thirdDownAtt'));
  perGame('stats.fourthDownAtt', total('fourthDownAtt'));
  rate('stats.fourthDownPct', total('fourthDownConv'), total('fourthDownAtt'));
  rate('stats.redZoneTdPct', total('redZoneTd'), total('redZoneTrips'));
  perGame('stats.turnovers', total('turnovers'));
  perGame('stats.penalties', total('penalties'));
  perGame('stats.penaltyYds', total('penaltyYds'));
  const long = line('fgAtt40') + line('fgAtt50');
  rate('stats.fgPctUnder40', total('fgMade') - line('fgMade40') - line('fgMade50'), total('fgAtt') - long);
  rate('stats.fgPct40s', line('fgMade40'), line('fgAtt40'));
  rate('stats.fgPct50Plus', line('fgMade50'), line('fgAtt50'));
  rate('stats.puntAvg', line('puntYds'), total('punts'));
  rate('stats.kickoffReturnRate', line('kickReturns'), line('kickoffs'));
  rate('stats.kickReturnAvg', line('kickReturnYds'), line('kickReturns'));
  rate('stats.puntReturnAvg', line('puntReturnYds'), line('puntReturns'));
}

function leaderMetrics(samples: readonly RunSample[], out: Map<string, MetricValue>): void {
  const seasons = samples.length;
  const leader = (id: string, key: 'passYds' | 'rushYds' | 'recYds' | 'receptions' | 'sacks' | 'defInt') =>
    out.set(id, {
      value: mean(samples.map(s => Math.max(0, ...s.facts.players.map(p => p.line[key])))),
      n: seasons
    });
  leader('leaders.passYds', 'passYds');
  leader('leaders.rushYds', 'rushYds');
  leader('leaders.recYds', 'recYds');
  leader('leaders.receptions', 'receptions');
  leader('leaders.sacks', 'sacks');
  leader('leaders.defInt', 'defInt');
  const count = (id: string, test: (p: RunSample['facts']['players'][number]) => boolean) =>
    out.set(id, { value: mean(samples.map(s => s.facts.players.filter(test).length)), n: seasons });
  count('leaders.passers4000', p => p.line.passYds >= PASSER_YARDS);
  count('leaders.rushers1000', p => p.line.rushYds >= RUSHER_YARDS);
  count('leaders.receivers1000', p => p.line.recYds >= RECEIVER_YARDS);

  const topShares: number[] = [];
  const backShares: number[] = [];
  for (const s of samples) {
    const byTeam = new Map<TeamAbbr, RunSample['facts']['players']>();
    for (const p of s.facts.players) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
    for (const list of byTeam.values()) {
      const targets = sum(list, p => p.line.targets);
      if (targets > 0) topShares.push(Math.max(...list.map(p => p.line.targets)) / targets);
      const backs = list.filter(p => p.position === 'HB' || p.position === 'FB');
      const carries = sum(backs, p => p.line.rushAtt);
      if (carries > 0) backShares.push(Math.max(...backs.map(p => p.line.rushAtt)) / carries);
    }
  }
  out.set('leaders.topTargetShare', { value: mean(topShares), n: topShares.length });
  out.set('leaders.maxTargetShare', {
    value: mean(
      samples.map(s => {
        const teamTargets = new Map(s.facts.teams.map(t => [t.team, t.lines.targets]));
        return Math.max(0, ...s.facts.players.map(p => p.line.targets / (teamTargets.get(p.team) || 1)));
      })
    ),
    n: seasons
  });
  out.set('leaders.leadBackShare', { value: mean(backShares), n: backShares.length });
}

function injuryMetrics(samples: readonly RunSample[], out: Map<string, MetricValue>): void {
  const teams = samples.flatMap(s => s.facts.teams);
  const per = (id: string, f: (t: TeamFact) => number) =>
    out.set(id, { value: ratio(sum(teams, f), teams.length), n: teams.length });
  per('injuries.missed', t => t.injuries.missed);
  per('injuries.gamesLost', t => t.injuries.gamesLost);
  per('injuries.seasonEnding', t => t.injuries.seasonEnding);
  per('injuries.all', t => t.injuries.all);
}

/** A fit group's relative change from the worst arm to the best, signed so that better is positive. */
function fitEffect(group: FitGroup, arms: { best: FitArm; worst: FitArm }): number | null {
  const best = ratio(arms.best.num, arms.best.den);
  const worst = ratio(arms.worst.num, arms.worst.den);
  if (best === null || worst === null || best + worst === 0) return null;
  const change = (best - worst) / ((best + worst) / 2);
  return FIT_GROUPS[group].higher ? change : -change;
}

function effectMetrics(
  samples: readonly RunSample[],
  experiments: readonly RunSample[],
  out: Map<string, MetricValue>
): void {
  // Fit: the experiment replays' arms, pooled.
  const pooled = new Map<FitGroup, { best: FitArm; worst: FitArm }>();
  for (const s of experiments) {
    const fit = s.facts.fit;
    if (!fit) continue;
    for (const group of FIT_GROUP_IDS) {
      const into = pooled.get(group) ?? {
        best: { num: 0, den: 0, games: 0, fit: 0 },
        worst: { num: 0, den: 0, games: 0, fit: 0 }
      };
      for (const arm of ['best', 'worst'] as const)
        for (const key of ['num', 'den', 'games', 'fit'] as const) into[arm][key] += fit[group][arm][key];
      pooled.set(group, into);
    }
  }
  const effects: number[] = [];
  for (const group of FIT_GROUP_IDS) {
    const arms = pooled.get(group);
    const value = arms ? fitEffect(group, arms) : null;
    if (value !== null) effects.push(value);
    out.set(`effects.fit.${group}`, { value, n: arms ? arms.best.games + arms.worst.games : 0 });
  }
  out.set('effects.fit', {
    value: effects.length === FIT_GROUP_IDS.length ? mean(effects) : null,
    n: experiments.length
  });

  // Weather, from the regular replays.
  const games = samples.flatMap(s => s.facts.games);
  const outdoor = games.filter(g => !g.weather.indoor);
  const points = (list: readonly GameFact[]) =>
    ratio(
      sum(list, g => g.homeScore + g.awayScore),
      2 * list.length
    );
  const difference = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const pointsGap = (id: string, a: readonly GameFact[], b: readonly GameFact[]) =>
    out.set(id, { value: difference(points(a), points(b)), n: Math.min(a.length, b.length) });
  pointsGap(
    'effects.windPoints',
    outdoor.filter(g => g.weather.windMph >= STIFF_MPH),
    outdoor.filter(g => g.weather.windMph <= CALM_MPH)
  );
  pointsGap(
    'effects.domePoints',
    games.filter(g => g.weather.indoor),
    outdoor
  );
  pointsGap(
    'effects.coldPoints',
    outdoor.filter(g => g.weather.tempF <= COLD_F),
    outdoor.filter(g => g.weather.tempF >= MILD_F[0] && g.weather.tempF <= MILD_F[1])
  );
  const dry = outdoor.filter(g => g.weather.precipitation === 'none');
  pointsGap(
    'effects.rainPoints',
    outdoor.filter(g => g.weather.precipitation === 'rain'),
    dry
  );
  pointsGap(
    'effects.snowPoints',
    outdoor.filter(g => g.weather.precipitation === 'snow'),
    dry
  );
  const high = outdoor.filter(g => g.weather.windMph >= HIGH_MPH);
  const light = outdoor.filter(g => g.weather.windMph < LIGHT_MPH);
  const rateGap = (id: string, num: 'passCmp' | 'fgMade', den: 'passAtt' | 'fgAtt') =>
    out.set(id, {
      value: difference(
        ratio(
          sum(high, g => g[num]),
          sum(high, g => g[den])
        ),
        ratio(
          sum(light, g => g[num]),
          sum(light, g => g[den])
        )
      ),
      n: sum(high, g => g[den])
    });
  rateGap('effects.windCompletion', 'passCmp', 'passAtt');
  rateGap('effects.windFieldGoal', 'fgMade', 'fgAtt');
  // Measured once their features arrive: cohesion and coaching (M13), facilities (M16), locker room (M12).
  for (const id of ['effects.cohesion', 'effects.coaching', 'effects.facilities', 'effects.lockerRoom'])
    out.set(id, { value: null, n: 0 });
}

/**
 * Every metric from a run's replays. Experiment replays feed only the fit metrics; everything else comes
 * from the regular replays.
 */
export function computeMetrics(samples: readonly RunSample[]): Map<string, MetricValue> {
  const regular = samples.filter(s => !s.facts.fit);
  const experiments = samples.filter(s => s.facts.fit);
  const out = new Map<string, MetricValue>();
  if (regular.length) {
    gameMetrics(regular, out);
    seasonMetrics(regular, out);
    statMetrics(regular, out);
    leaderMetrics(regular, out);
    injuryMetrics(regular, out);
  }
  effectMetrics(regular, experiments, out);
  return out;
}
