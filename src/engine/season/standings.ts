/**
 * Standings, tiebreakers, and playoff seeding (spec 5.3). Ties follow the NFL's current procedures: one list
 * of steps for division ties and one for wild card ties, each in a two-club and a three-or-more-club form.
 * When a step leaves fewer clubs tied, the procedure starts over with them; a seeded coin toss ends it.
 */
import { DEFAULT_RULES } from '../rules/ruleset';
import { team, TEAMS, type Conference, type TeamAbbr } from '../../data/teams';
import { stream } from '../rng';
import { joinList } from '../text';

/** A finished game as the standings see it. */
export interface GameScore {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  homeScore: number;
  awayScore: number;
  /** Touchdowns by each team on offense, defense, and special teams. */
  homeTd: number;
  awayTd: number;
}

export interface WinLoss {
  wins: number;
  losses: number;
  ties: number;
}

export interface TeamRecord {
  abbr: TeamAbbr;
  overall: WinLoss;
  home: WinLoss;
  away: WinLoss;
  division: WinLoss;
  conference: WinLoss;
  pointsFor: number;
  pointsAgainst: number;
  tdFor: number;
  tdAgainst: number;
  /** The current streak, like "W3" or "L1"; empty before the first game. */
  streak: string;
  /** Combined record of the opponents beaten (strength of victory) and of every opponent (strength of schedule). */
  sov: number;
  sos: number;
}

/** One team's view of a game. */
interface Side {
  opp: TeamAbbr;
  pf: number;
  pa: number;
  tdf: number;
  tda: number;
}

export interface Standings {
  records: Record<TeamAbbr, TeamRecord>;
  /** Each team's games in week order. */
  games: Record<TeamAbbr, Side[]>;
}

const EPS = 1e-9;
const empty = (): WinLoss => ({ wins: 0, losses: 0, ties: 0 });

/** Winning percentage with ties as half a win; .000 before any game. */
export function winPct(r: WinLoss): number {
  const games = r.wins + r.losses + r.ties;
  return games ? (r.wins + r.ties / 2) / games : 0;
}

function tally(r: WinLoss, pf: number, pa: number): void {
  if (pf > pa) r.wins++;
  else if (pf < pa) r.losses++;
  else r.ties++;
}

const sameConference = (a: TeamAbbr, b: TeamAbbr) => team(a).conf === team(b).conf;
const sameDivision = (a: TeamAbbr, b: TeamAbbr) => sameConference(a, b) && team(a).div === team(b).div;

/** Standings for every team from finished games. */
export function buildStandings(scores: readonly GameScore[]): Standings {
  const records = {} as Record<TeamAbbr, TeamRecord>;
  const games = {} as Record<TeamAbbr, Side[]>;
  for (const t of TEAMS) {
    games[t.abbr] = [];
    records[t.abbr] = {
      abbr: t.abbr,
      overall: empty(),
      home: empty(),
      away: empty(),
      division: empty(),
      conference: empty(),
      pointsFor: 0,
      pointsAgainst: 0,
      tdFor: 0,
      tdAgainst: 0,
      streak: '',
      sov: 0,
      sos: 0
    };
  }
  for (const g of [...scores].sort((a, b) => a.week - b.week)) {
    const sides: [TeamAbbr, Side, boolean][] = [
      [g.home, { opp: g.away, pf: g.homeScore, pa: g.awayScore, tdf: g.homeTd, tda: g.awayTd }, true],
      [g.away, { opp: g.home, pf: g.awayScore, pa: g.homeScore, tdf: g.awayTd, tda: g.homeTd }, false]
    ];
    for (const [abbr, side, home] of sides) {
      const r = records[abbr];
      games[abbr].push(side);
      tally(r.overall, side.pf, side.pa);
      tally(home ? r.home : r.away, side.pf, side.pa);
      if (sameDivision(abbr, side.opp)) tally(r.division, side.pf, side.pa);
      if (sameConference(abbr, side.opp)) tally(r.conference, side.pf, side.pa);
      r.pointsFor += side.pf;
      r.pointsAgainst += side.pa;
      r.tdFor += side.tdf;
      r.tdAgainst += side.tda;
      const mark = side.pf > side.pa ? 'W' : side.pf < side.pa ? 'L' : 'T';
      r.streak = r.streak.startsWith(mark) ? `${mark}${Number(r.streak.slice(1)) + 1}` : `${mark}1`;
    }
  }
  // Strength of victory and of schedule count each game's opponent once, with that opponent's final record.
  for (const t of TEAMS) {
    const beaten = empty();
    const played = empty();
    for (const side of games[t.abbr]) {
      const o = records[side.opp].overall;
      for (const into of side.pf > side.pa ? [beaten, played] : [played]) {
        into.wins += o.wins;
        into.losses += o.losses;
        into.ties += o.ties;
      }
    }
    records[t.abbr].sov = winPct(beaten);
    records[t.abbr].sos = winPct(played);
  }
  return { records, games };
}

type Kind = 'division' | 'wildCard';

interface Context {
  table: Standings;
  /** Seeds the coin toss. */
  coinSeed: number;
  /** Each team's place in its division, used when a wild card tie holds clubs from one division. */
  divisionPlace: Map<TeamAbbr, number>;
  /** Wild card ties use common games only when each club played at least this many. */
  commonGamesMin: number;
}

/** Scores for the tied clubs (higher is better), or null when the step doesn't apply to them. */
type Step = {
  name: string;
  score: (tied: readonly TeamAbbr[], ctx: Context) => Map<TeamAbbr, number> | null;
};

const scores = (tied: readonly TeamAbbr[], f: (abbr: TeamAbbr) => number) =>
  new Map(tied.map(abbr => [abbr, f(abbr)]));

/** A club's record and net points in games against `opponents`. */
function against(ctx: Context, abbr: TeamAbbr, opponents: ReadonlySet<TeamAbbr>) {
  const r = empty();
  let net = 0;
  for (const g of ctx.table.games[abbr]) {
    if (!opponents.has(g.opp)) continue;
    tally(r, g.pf, g.pa);
    net += g.pf - g.pa;
  }
  return { record: r, games: r.wins + r.losses + r.ties, net };
}

/** Opponents every tied club played, not counting the tied clubs themselves. */
function commonOpponents(ctx: Context, tied: readonly TeamAbbr[]): Set<TeamAbbr> {
  const sets = tied.map(abbr => new Set(ctx.table.games[abbr].map(g => g.opp)));
  const common = new Set([...(sets[0] ?? [])].filter(o => sets.every(s => s.has(o))));
  for (const abbr of tied) common.delete(abbr);
  return common;
}

/** Rank by a value, ties sharing the better rank (1 is best). */
function rankBy(pool: readonly TeamAbbr[], value: (abbr: TeamAbbr) => number): Map<TeamAbbr, number> {
  const sorted = [...pool].sort((a, b) => value(b) - value(a));
  const ranks = new Map<TeamAbbr, number>();
  sorted.forEach((abbr, i) => {
    const prev = sorted[i - 1];
    ranks.set(abbr, prev !== undefined && value(prev) === value(abbr) ? (ranks.get(prev) as number) : i + 1);
  });
  return ranks;
}

function combinedRanking(ctx: Context, tied: readonly TeamAbbr[], pool: readonly TeamAbbr[]) {
  const r = ctx.table.records;
  const scored = rankBy(pool, abbr => r[abbr].pointsFor);
  const allowed = rankBy(pool, abbr => -r[abbr].pointsAgainst);
  return scores(tied, abbr => -((scored.get(abbr) as number) + (allowed.get(abbr) as number)));
}

const conferenceTeams = (abbr: TeamAbbr) => TEAMS.filter(t => t.conf === team(abbr).conf).map(t => t.abbr);

const STEP = {
  headToHead: {
    name: 'Head-to-head',
    score: (tied, ctx) => {
      const set = new Set(tied);
      const results = tied.map(abbr => against(ctx, abbr, set));
      // Clubs that never met can't be separated this way.
      if (results.some(x => x.games === 0)) return null;
      return new Map(tied.map((abbr, i) => [abbr, winPct((results[i] as { record: WinLoss }).record)]));
    }
  },
  sweep: {
    name: 'Head-to-head sweep',
    score: (tied, ctx) => {
      // Applies only when one club beat each of the others, or lost to each of them.
      const meetings = (abbr: TeamAbbr, other: TeamAbbr) =>
        ctx.table.games[abbr].filter(g => g.opp === other);
      const each = (abbr: TeamAbbr, won: boolean) =>
        tied.every(other => {
          if (other === abbr) return true;
          const m = meetings(abbr, other);
          return m.length > 0 && m.every(g => (won ? g.pf > g.pa : g.pf < g.pa));
        });
      const sweeper = tied.find(abbr => each(abbr, true));
      if (sweeper) return scores(tied, abbr => (abbr === sweeper ? 1 : 0));
      const swept = tied.find(abbr => each(abbr, false));
      if (swept) return scores(tied, abbr => (abbr === swept ? 0 : 1));
      return null;
    }
  },
  division: {
    name: 'Division record',
    score: (tied, ctx) => scores(tied, abbr => winPct(ctx.table.records[abbr].division))
  },
  common: {
    name: 'Common games',
    score: (tied, ctx) => {
      const common = commonOpponents(ctx, tied);
      if (!common.size) return null;
      return scores(tied, abbr => winPct(against(ctx, abbr, common).record));
    }
  },
  commonFour: {
    name: 'Common games',
    score: (tied, ctx) => {
      const common = commonOpponents(ctx, tied);
      if (tied.some(abbr => against(ctx, abbr, common).games < ctx.commonGamesMin)) return null;
      return scores(tied, abbr => winPct(against(ctx, abbr, common).record));
    }
  },
  conference: {
    name: 'Conference record',
    score: (tied, ctx) => scores(tied, abbr => winPct(ctx.table.records[abbr].conference))
  },
  victory: {
    name: 'Strength of victory',
    score: (tied, ctx) => scores(tied, abbr => ctx.table.records[abbr].sov)
  },
  schedule: {
    name: 'Strength of schedule',
    score: (tied, ctx) => scores(tied, abbr => ctx.table.records[abbr].sos)
  },
  conferenceRank: {
    name: 'Points rank in the conference',
    score: (tied, ctx) => combinedRanking(ctx, tied, conferenceTeams(tied[0] as TeamAbbr))
  },
  leagueRank: {
    name: 'Points rank in the league',
    score: (tied, ctx) =>
      combinedRanking(
        ctx,
        tied,
        TEAMS.map(t => t.abbr)
      )
  },
  netCommon: {
    name: 'Net points in common games',
    score: (tied, ctx) => {
      const common = commonOpponents(ctx, tied);
      if (!common.size) return null;
      return scores(tied, abbr => against(ctx, abbr, common).net);
    }
  },
  netConference: {
    name: 'Net points in conference games',
    score: (tied, ctx) =>
      scores(tied, abbr => against(ctx, abbr, new Set(conferenceTeams(abbr).filter(o => o !== abbr))).net)
  },
  netAll: {
    name: 'Net points',
    score: (tied, ctx) =>
      scores(tied, abbr => ctx.table.records[abbr].pointsFor - ctx.table.records[abbr].pointsAgainst)
  },
  netTouchdowns: {
    name: 'Net touchdowns',
    score: (tied, ctx) =>
      scores(tied, abbr => ctx.table.records[abbr].tdFor - ctx.table.records[abbr].tdAgainst)
  },
  coin: {
    name: 'Coin toss',
    score: (tied, ctx) => {
      const rng = stream(ctx.coinSeed, 'coinToss', ...[...tied].sort());
      return new Map([...tied].sort().map(abbr => [abbr, rng.float()]));
    }
  }
} satisfies Record<string, Step>;

const DIVISION_STEPS: readonly Step[] = [
  STEP.headToHead,
  STEP.division,
  STEP.common,
  STEP.conference,
  STEP.victory,
  STEP.schedule,
  STEP.conferenceRank,
  STEP.leagueRank,
  STEP.netCommon,
  STEP.netAll,
  STEP.netTouchdowns,
  STEP.coin
];

const WILD_CARD_TWO: readonly Step[] = [
  STEP.headToHead,
  STEP.conference,
  STEP.commonFour,
  STEP.victory,
  STEP.schedule,
  STEP.conferenceRank,
  STEP.leagueRank,
  STEP.netConference,
  STEP.netAll,
  STEP.netTouchdowns,
  STEP.coin
];

const WILD_CARD_MORE: readonly Step[] = [STEP.sweep, ...WILD_CARD_TWO.slice(1)];

/** The best of clubs tied on winning percentage, and the step that decided it. */
function pickBest(tied: readonly TeamAbbr[], kind: Kind, ctx: Context): { abbr: TeamAbbr; step: string } {
  let group = [...tied].sort();
  let decidedBy = 'Record';
  if (kind === 'wildCard') {
    // Clubs from one division take part only through the best of them by the division tiebreaker.
    const best = new Map<string, TeamAbbr>();
    for (const abbr of group) {
      const key = `${team(abbr).conf} ${team(abbr).div}`;
      const held = best.get(key);
      if (!held || (ctx.divisionPlace.get(abbr) as number) < (ctx.divisionPlace.get(held) as number))
        best.set(key, abbr);
    }
    if (best.size < group.length) decidedBy = 'Division tiebreaker';
    group = [...best.values()].sort();
  }
  for (;;) {
    if (group.length === 1) return { abbr: group[0] as TeamAbbr, step: decidedBy };
    const steps = kind === 'division' ? DIVISION_STEPS : group.length === 2 ? WILD_CARD_TWO : WILD_CARD_MORE;
    let narrowed = false;
    for (const step of steps) {
      const s = step.score(group, ctx);
      if (!s) continue;
      const top = Math.max(...s.values());
      const left = group.filter(abbr => (s.get(abbr) as number) >= top - EPS);
      if (left.length < group.length) {
        // Fewer clubs tied: start over with them.
        group = left;
        decidedBy = step.name;
        narrowed = true;
        break;
      }
    }
    if (!narrowed) throw new Error('A coin toss always breaks a tie.');
  }
}

export interface Ranked {
  abbr: TeamAbbr;
  /** The tiebreaker step that placed this club ahead of the clubs tied with it, if any. */
  tiebreak: string | null;
}

/** Orders clubs by winning percentage, breaking ties by the division or wild card procedure. */
function order(clubs: readonly TeamAbbr[], kind: Kind, ctx: Context): Ranked[] {
  const pct = (abbr: TeamAbbr) => winPct(ctx.table.records[abbr].overall);
  const sorted = [...clubs].sort((a, b) => pct(b) - pct(a) || (a < b ? -1 : 1));
  const out: Ranked[] = [];
  for (let i = 0; i < sorted.length;) {
    const first = sorted[i] as TeamAbbr;
    let tied = sorted.slice(i).filter(abbr => Math.abs(pct(abbr) - pct(first)) < EPS);
    i += tied.length;
    while (tied.length > 1) {
      const { abbr, step } = pickBest(tied, kind, ctx);
      out.push({ abbr, tiebreak: step });
      tied = tied.filter(t => t !== abbr);
    }
    out.push({ abbr: tied[0] as TeamAbbr, tiebreak: null });
  }
  return out;
}

export interface DivisionStandings {
  conference: Conference;
  division: string;
  teams: Ranked[];
}

export interface ConferenceSeeds {
  conference: Conference;
  /** Seeds 1 to the playoff field size: division winners first, then wild cards. */
  seeds: Ranked[];
  /** Every other club in the conference, best first. */
  rest: Ranked[];
}

export interface LeagueStandings {
  table: Standings;
  divisions: DivisionStandings[];
  conferences: ConferenceSeeds[];
}

/** Division order, conference seeds, and the rest of each conference (spec 5.3). */
export function rankLeague(
  scores: readonly GameScore[],
  coinSeed: number,
  playoffTeamsPerConference: number,
  commonGamesMin: number = DEFAULT_RULES.season.commonGamesMin
): LeagueStandings {
  const table = buildStandings(scores);
  const ctx: Context = { table, coinSeed, divisionPlace: new Map(), commonGamesMin };
  const divisions: DivisionStandings[] = [];
  for (const conference of ['AFC', 'NFC'] as const)
    for (const division of ['East', 'North', 'South', 'West'] as const) {
      const clubs = TEAMS.filter(t => t.conf === conference && t.div === division).map(t => t.abbr);
      const teams = order(clubs, 'division', ctx);
      teams.forEach((t, i) => ctx.divisionPlace.set(t.abbr, i));
      divisions.push({ conference, division: `${conference} ${division}`, teams });
    }
  const conferences = (['AFC', 'NFC'] as const).map(conference => {
    const mine = divisions.filter(d => d.conference === conference);
    const winners = order(
      mine.map(d => (d.teams[0] as Ranked).abbr),
      'wildCard',
      ctx
    );
    const others = order(
      mine.flatMap(d => d.teams.slice(1).map(t => t.abbr)),
      'wildCard',
      ctx
    );
    const wildCards = Math.max(0, playoffTeamsPerConference - winners.length);
    return {
      conference,
      seeds: [...winners, ...others.slice(0, wildCards)],
      rest: others.slice(wildCards)
    };
  });
  return { table, divisions, conferences };
}

/** A club a tiebreaker placed ahead of the clubs tied with it on record, and the step that did it. */
export interface TiebreakNote {
  abbr: TeamAbbr;
  over: TeamAbbr[];
  step: string;
}

/**
 * The tiebreakers behind one ordered list of clubs (a division, or a conference's division winners or its
 * other clubs), in order: each club a step placed ahead of the clubs still tied with it (spec 5.3, 19.3).
 */
export function tiebreaks(ranked: readonly Ranked[], table: Standings): TiebreakNote[] {
  const pct = (abbr: TeamAbbr) => winPct(table.records[abbr].overall);
  return ranked.flatMap((r, i) => {
    if (!r.tiebreak) return [];
    const over = ranked
      .slice(i + 1)
      .filter(o => Math.abs(pct(o.abbr) - pct(r.abbr)) < EPS)
      .map(o => o.abbr);
    return over.length ? [{ abbr: r.abbr, over, step: r.tiebreak }] : [];
  });
}

/** How each step reads after "on": "on head-to-head record". */
const STEP_PHRASES: Record<string, string> = {
  'Head-to-head': 'head-to-head record',
  'Head-to-head sweep': 'a head-to-head sweep',
  'Division record': 'division record',
  'Common games': 'record in common games',
  'Conference record': 'conference record',
  'Strength of victory': 'strength of victory',
  'Strength of schedule': 'strength of schedule',
  'Points rank in the conference': 'points scored and allowed, ranked in the conference',
  'Points rank in the league': 'points scored and allowed, ranked in the league',
  'Net points in common games': 'net points in common games',
  'Net points in conference games': 'net points in conference games',
  'Net points': 'net points',
  'Net touchdowns': 'net touchdowns',
  'Coin toss': 'a coin toss',
  'Division tiebreaker': 'the division tiebreaker'
};

const recordText = (r: WinLoss): string => `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`;

/**
 * A tiebreak in a sentence, where `name` gives a club as a plural noun phrase ("the Bills"): "The Bills
 * are ahead of the Dolphins, also 10–7, on head-to-head record."
 */
export function explainTiebreak(
  note: TiebreakNote,
  table: Standings,
  name: (abbr: TeamAbbr) => string
): string {
  const phrase = STEP_PHRASES[note.step] ?? note.step.toLowerCase();
  const record = recordText(table.records[note.abbr].overall);
  const first = name(note.abbr);
  const subject = first.charAt(0).toUpperCase() + first.slice(1);
  return `${subject} are ahead of ${joinList(note.over.map(name))}, also ${record}, on ${phrase}.`;
}
