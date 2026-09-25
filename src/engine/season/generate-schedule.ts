/**
 * Schedules for 2027 and later (spec 5.2): the season's matchups set on the 18-week grid, then given dates,
 * kickoff times, and sites. Each week's layout (how many games and byes, and its Thursday, Sunday night,
 * Monday, holiday, and international slots) follows the seed year's, moved onto the new year's calendar.
 */
import { gameId, type ScheduledGame, type SiteType } from '../../data/schedule';
import { TEAMS, divisionKey, homeStadium, type TeamAbbr } from '../../data/teams';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { matchRotation, seasonMatchups, type Matchup } from './matchups';

const S = TUNING.schedule;

export interface ScheduleInput {
  /** The season to schedule. */
  season: number;
  /** The seed year's regular-season schedule. */
  seed: readonly ScheduledGame[];
  /** Last season's division finish, 1 to 4. */
  places: Partial<Record<TeamAbbr, number>>;
  /** Last season's winning percentage, which puts the best matchups in prime time. */
  strength: Partial<Record<TeamAbbr, number>>;
  /** The defending champion, who opens the season at home. */
  champion: TeamAbbr | null;
}

// Calendar days, counted in UTC at noon so time zones never shift a date.
const DAY_MS = 86_400_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const THURSDAY = 4;
const FRIDAY = 5;
const SATURDAY = 6;
const MONDAY = 1;
const noon = (date: string): number => Date.parse(`${date}T12:00:00Z`);
const addDays = (date: string, days: number): string =>
  new Date(noon(date) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string): number => Math.round((noon(to) - noon(from)) / DAY_MS);
const weekday = (date: string): number => new Date(noon(date)).getUTCDay();

/** The Sunday of week 1: the season opens the week after Labor Day, the first Monday in September. */
export function firstSunday(year: number): string {
  const september = `${year}-09-01`;
  const laborDay = addDays(september, (MONDAY - weekday(september) + 7) % 7);
  return addDays(laborDay, 6);
}

const sundayOf = (year: number, week: number): string => addDays(firstSunday(year), 7 * (week - 1));

/** Thanksgiving: the fourth Thursday in November. */
export function thanksgiving(year: number): string {
  const november = `${year}-11-01`;
  return addDays(november, ((THURSDAY - weekday(november) + 7) % 7) + 21);
}

/** The week a date falls in, each week running Thursday to Wednesday around its Sunday. */
const weekOf = (year: number, date: string): number =>
  Math.floor((daysBetween(firstSunday(year), date) + 3) / 7) + 1;

/** Detroit and Dallas host on Thanksgiving Day by tradition. */
const THANKSGIVING_HOSTS: readonly TeamAbbr[] = ['DET', 'DAL'];
/** Pacific and Mountain hosts kick off Sunday afternoons in the late window, never at 1 p.m. Eastern. */
const LATE_ZONES = new Set(['America/Los_Angeles', 'America/Denver', 'America/Phoenix']);
const EARLY = '13:00';
const LATE = '16:25';
/** Kickoffs from this time on Sunday are the night game; earlier ones are the afternoon windows. */
const NIGHT = '19:00';
const LATE_WINDOW = '16:00';

/** A kickoff slot in a week's layout. */
interface Slot {
  /** Days from the week's Sunday: Thursday is -3 and Monday 1. */
  offset: number;
  timeEt: string;
  siteType: SiteType;
  /** A neutral or international site's venue. */
  venue: string | null;
  /** The host this slot is kept for: the champion opens the season, Detroit and Dallas host on Thanksgiving. */
  host: TeamAbbr | 'champion' | null;
}

const sundayAfternoon = (): Slot => ({ offset: 0, timeEt: EARLY, siteType: 'home', venue: null, host: null });
const isOpen = (s: Slot): boolean =>
  s.offset === 0 && s.timeEt === EARLY && s.siteType === 'home' && s.host === null;

/**
 * Each week's slots for a year, from the seed year's schedule: the same days and kickoff times, with the
 * Thanksgiving layout moved to the week of the new year's Thanksgiving and the Christmas games to Christmas
 * Day when it falls on a Thursday, Friday, Saturday, or Monday (a Thursday or Monday Christmas keeps its
 * night game in the usual slot).
 */
function layoutFor(seed: readonly ScheduledGame[], year: number): Slot[][] {
  const seedYear = seed[0]?.season ?? year;
  const weeks = Math.max(...seed.map(g => g.week));
  const layout: Slot[][] = Array.from({ length: weeks }, () => []);
  const christmas: Slot[] = [];
  const seedThanksgiving = thanksgiving(seedYear);
  const kickoffOrder = [...seed].sort(
    (a, b) => (a.date + a.timeEt < b.date + b.timeEt ? -1 : a.date + a.timeEt > b.date + b.timeEt ? 1 : 0) || (a.id < b.id ? -1 : 1)
  ); // prettier-ignore
  for (const g of kickoffOrder) {
    const week = layout[g.week - 1] as Slot[];
    const slot: Slot = {
      offset: daysBetween(sundayOf(seedYear, g.week), g.date),
      timeEt: g.timeEt,
      siteType: g.siteType,
      venue: g.siteType === 'home' ? null : g.venue,
      host: g.date === seedThanksgiving && THANKSGIVING_HOSTS.includes(g.home) ? g.home : null
    };
    if (g.date.endsWith('-12-25')) {
      christmas.push(slot);
      week.push(sundayAfternoon());
    } else week.push(slot);
  }
  const opener = layout[0]?.[0];
  if (opener) opener.host = 'champion';

  const from = weekOf(seedYear, seedThanksgiving);
  const to = weekOf(year, thanksgiving(year));
  if (from !== to && layout[from - 1] && layout[to - 1])
    [layout[from - 1], layout[to - 1]] = [layout[to - 1] as Slot[], layout[from - 1] as Slot[]];

  const day = `${year}-12-25`;
  const christmasWeek = layout[weekOf(year, day) - 1];
  const kept = [FRIDAY, SATURDAY].includes(weekday(day))
    ? christmas
    : [THURSDAY, MONDAY].includes(weekday(day))
      ? christmas.filter(s => s.timeEt < NIGHT)
      : [];
  if (christmasWeek)
    for (const s of kept) {
      const open = christmasWeek.findIndex(isOpen);
      if (open < 0) break;
      christmasWeek[open] = { ...s, offset: daysBetween(sundayOf(year, weekOf(year, day)), day) };
    }
  return layout;
}

interface Game {
  home: number;
  away: number;
  /** The division rival's other game, or -1. */
  twin: number;
}

/** Search nodes before a fresh start, and fresh starts before the week-to-week rules relax a step. */
const SEARCH_NODES = 20000;
const STARTS = 200;
/**
 * Search order for a team's games: road games for teams with the most road games left, home games for hosts
 * with the most home games left, and division rivals' first meetings (leaving room for the rematch), with a
 * little noise so seasons differ.
 */
const FIRST_MEETING = 0.3;
const ORDER_NOISE = 0.3;
const BYE = -2;
const FREE = -1;

/**
 * Sets every game in a week (spec 5.2): division games in the last week, the champion at home in week 1,
 * Detroit and Dallas at home on Thanksgiving, one bye per team where the layout has them, no more than
 * `maxRoadStreak` road games in a row, and division rematches `rematchGap` weeks apart. One depth-first
 * search fills the weeks in order, the most constrained team first, and checks after each game that both
 * teams can still finish; a search that runs long starts over.
 */
function placeWeeks(
  matchups: readonly Matchup[],
  layout: readonly Slot[][],
  champion: TeamAbbr | null,
  rng: Rng
): number[] {
  const n = TEAMS.length;
  const weeks = layout.length;
  const index = new Map(TEAMS.map((t, i) => [t.abbr, i]));
  const at = (abbr: TeamAbbr): number => index.get(abbr) as number;
  const games: Game[] = matchups.map(m => ({ home: at(m.home), away: at(m.away), twin: -1 }));
  games.forEach((g, i) => {
    if (matchups[i]?.kind === 'division')
      g.twin = games.findIndex(o => o.home === g.away && o.away === g.home);
  });
  const byTeam: number[][] = Array.from({ length: n }, () => []);
  games.forEach((g, i) => {
    byTeam[g.home]?.push(i);
    byTeam[g.away]?.push(i);
  });
  const byes = layout.map(slots => n - 2 * slots.length);
  const hosts = layout.map(slots =>
    slots.flatMap(s => (s.host === 'champion' ? (champion ? [champion] : []) : s.host ? [s.host] : []))
  );
  const divisions = [...new Set(TEAMS.map(divisionKey))].map(d => TEAMS.flatMap((t, i) => (divisionKey(t) === d ? [i] : []))); // prettier-ignore

  for (let start = 0; ; start++) {
    // After many fresh starts, relax the rematch spacing and the road run a step at a time (tests never get here).
    const relax = Math.floor(start / STARTS);
    const maxRun = relax < 2 ? S.maxRoadStreak + relax : weeks;
    const gap = relax < 2 ? S.rematchGap - relax : 0;
    const week = new Array<number>(games.length).fill(0);
    const grid = new Array<number>(n * (weeks + 1)).fill(FREE);
    const cell = (t: number, w: number): number => grid[t * (weeks + 1) + w] as number;
    const set = (t: number, w: number, v: number): void => {
      grid[t * (weeks + 1) + w] = v;
    };
    const roadRun = (t: number, w: number): number => {
      let run = 1;
      for (const step of [-1, 1])
        for (let x = w + step; x >= 1 && x <= weeks; x += step) {
          const g = cell(t, x);
          if (g === BYE) continue;
          if (g < 0 || games[g]?.away !== t) break;
          run++;
        }
      return run;
    };
    const fits = (i: number, w: number): boolean => {
      const g = games[i] as Game;
      if (week[i] || cell(g.home, w) !== FREE || cell(g.away, w) !== FREE) return false;
      const twin = g.twin >= 0 ? (week[g.twin] ?? 0) : 0;
      if (twin && Math.abs(twin - w) < gap) return false;
      return roadRun(g.away, w) <= maxRun;
    };
    const place = (i: number, w: number): void => {
      const g = games[i] as Game;
      week[i] = w;
      set(g.home, w, i);
      set(g.away, w, i);
    };
    const unplace = (i: number, w: number): void => {
      const g = games[i] as Game;
      week[i] = 0;
      set(g.home, w, FREE);
      set(g.away, w, FREE);
    };

    // The last week: each division plays among itself, in one of its three pairings.
    if (byes[weeks - 1] === 0)
      for (const clubs of divisions) {
        const [a, b, c, d] = clubs as [number, number, number, number];
        const pairs = rng.pick([[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]] as const);
        for (const [x, y] of pairs) {
          const options = byTeam[x]?.filter(i => (games[i]?.home === y || games[i]?.away === y) && fits(i, weeks)) ?? [];
          if (options.length) place(rng.pick(options), weeks);
        }
      } // prettier-ignore
    // Hosts kept for special slots get a home game that week.
    let ok = true;
    hosts.forEach((abbrs, w) => {
      for (const abbr of abbrs) {
        const t = at(abbr);
        if (cell(t, w + 1) !== FREE) continue;
        const options = byTeam[t]?.filter(i => games[i]?.home === t && !abbrs.includes(TEAMS[games[i]?.away ?? 0]?.abbr as TeamAbbr) && fits(i, w + 1)) ?? []; // prettier-ignore
        if (options.length) place(rng.pick(options), w + 1);
        else ok = false;
      }
    });
    // One bye per team, dealt at random in the weeks that have them.
    const order = rng.shuffle(TEAMS.map((_, i) => i));
    byes.forEach((count, w) => {
      for (let k = 0; k < count; k++) {
        const t = order.findIndex(x => x >= 0 && cell(x, w + 1) === FREE);
        if (t < 0) ok = false;
        else {
          set(order[t] as number, w + 1, BYE);
          order[t] = -1;
        }
      }
    });
    if (!ok) continue;

    /** A team's unplaced home and road games, and its run of road games through week w. */
    const outlook = (t: number, w: number): { home: number; road: number; run: number } => {
      let home = 0;
      let road = 0;
      for (const i of byTeam[t] ?? []) {
        if (week[i]) continue;
        if (games[i]?.away === t) road++;
        else home++;
      }
      let run = 0;
      for (let x = w; x >= 1; x--) {
        const g = cell(t, x);
        if (g === BYE) continue;
        if (g < 0 || games[g]?.away !== t) break;
        run++;
      }
      return { home, road, run };
    };
    /** Whether a team can still finish after week w: home games enough to break its road runs, and room left for its rematches. */
    const viable = (t: number, w: number): boolean => {
      const { home, road, run } = outlook(t, w);
      if (road > maxRun - run + maxRun * home) return false;
      let first = 0;
      let last = 0;
      for (let x = w + 1; x <= weeks; x++)
        if (cell(t, x) === FREE) {
          first ||= x;
          last = x;
        }
      for (const i of byTeam[t] ?? []) {
        const g = games[i] as Game;
        if (g.twin < 0 || week[i]) continue;
        const twin = week[g.twin] ?? 0;
        if (!twin ? last - first < gap : first > twin - gap && last < twin + gap) return false;
      }
      return true;
    };
    const priority = (i: number, w: number): number => {
      const g = games[i] as Game;
      const road = outlook(g.away, w);
      const home = outlook(g.home, w);
      const first = g.twin >= 0 && !week[g.twin] ? FIRST_MEETING : 0;
      return road.road / Math.max(1, road.road + road.home) + home.home / Math.max(1, home.road + home.home) + first + rng.range(0, ORDER_NOISE); // prettier-ignore
    };
    // One depth-first search across the weeks: a dead end backs up into the latest choices first.
    let left = SEARCH_NODES;
    const fill = (w: number): boolean => {
      if (w > weeks) return true;
      let pick = -1;
      let options: number[] = [];
      for (let t = 0; t < n; t++) {
        if (cell(t, w) !== FREE) continue;
        const open = (byTeam[t] ?? []).filter(i => fits(i, w));
        if (!open.length) return false;
        if (pick < 0 || open.length < options.length) {
          pick = t;
          options = open;
        }
      }
      if (pick < 0) return fill(w + 1);
      const scored = rng.shuffle(options).map(i => ({ i, p: priority(i, w) }));
      for (const { i } of scored.sort((a, b) => b.p - a.p)) {
        if (--left < 0) return false;
        place(i, w);
        const g = games[i] as Game;
        if (viable(g.home, w) && viable(g.away, w) && fill(w)) return true;
        unplace(i, w);
      }
      return false;
    };
    if (fill(1)) return week;
  }
}

/**
 * Kickoff slots for each week's games: kept hosts first, then international sites, then the prime-time slots
 * for the best matchups, then Sunday afternoon with western hosts in the late window. A game needs
 * `minRestDays` since each team's last game; a slot nothing fits becomes a Sunday 1 p.m. game.
 */
function kickoffs(
  input: ScheduleInput,
  matchups: readonly Matchup[],
  weekOfGame: readonly number[],
  layout: readonly Slot[][],
  rng: Rng
): ScheduledGame[] {
  const { season, strength, champion } = input;
  const last = new Map<TeamAbbr, string>();
  const prime = new Map<TeamAbbr, number>();
  const abroad = new Set<TeamAbbr>();
  const out: ScheduledGame[] = [];
  const western = (m: Matchup): boolean => LATE_ZONES.has(homeStadium(m.home).timeZone);
  const hostOf = (slot: Slot): TeamAbbr | null => (slot.host === 'champion' ? champion : slot.host);

  layout.forEach((template, w) => {
    const week = w + 1;
    const sunday = sundayOf(season, week);
    const dateOf = (slot: Slot): string => addDays(sunday, slot.offset);
    const games = matchups.flatMap((m, i) => (weekOfGame[i] === week ? [m] : []));
    const slots = template.map(s => ({ ...s }));
    // Both teams in a game kept for one of next week's slots need their rest before it.
    const next = new Map<TeamAbbr, string>();
    for (const s of layout[week] ?? []) {
      const host = hostOf(s);
      const kept = host ? matchups.find((m, i) => weekOfGame[i] === week + 1 && m.home === host) : undefined;
      if (kept)
        for (const t of [kept.home, kept.away]) next.set(t, addDays(sundayOf(season, week + 1), s.offset));
    }
    const rested = (m: Matchup, date: string): boolean =>
      [m.home, m.away].every(t => {
        const before = last.get(t);
        const after = next.get(t);
        return (!before || daysBetween(before, date) >= S.minRestDays) && (!after || daysBetween(date, after) >= S.minRestDays); // prettier-ignore
      });
    const placed = new Map<Slot, Matchup>();
    const unplaced = (): Matchup[] => games.filter(m => ![...placed.values()].includes(m));
    const put = (slot: Slot, m: Matchup): void => {
      placed.set(slot, m);
    };

    for (const s of slots) {
      const host = hostOf(s);
      const m = host ? unplaced().find(g => g.home === host) : undefined;
      if (m) put(s, m);
      else s.host = null;
    }
    for (const s of slots.filter(x => !placed.has(x) && x.siteType !== 'home')) {
      const options = unplaced().filter(
        m => !abroad.has(m.home) && !abroad.has(m.away) && rested(m, dateOf(s))
      );
      if (options.length) {
        const m = rng.pick(options);
        put(s, m);
        abroad.add(m.home);
        abroad.add(m.away);
      } else Object.assign(s, sundayAfternoon());
    }
    // Sunday night first, then Monday, Thursday, and the rest.
    const rank = (s: Slot): number => (s.offset === 0 ? 0 : s.offset === 1 ? 1 : s.offset === -3 ? 2 : 3);
    const primeSlots = slots
      .filter(s => !placed.has(s) && (s.offset !== 0 || s.timeEt >= NIGHT))
      .sort((a, b) => rank(a) - rank(b));
    for (const s of primeSlots) {
      const scored = unplaced()
        .filter(m => rested(m, dateOf(s)))
        .map(m => ({
          m,
          appeal:
            (strength[m.home] ?? 0.5) + (strength[m.away] ?? 0.5) + rng.range(0, S.primeJitter) -
            S.primeRepeat * ((prime.get(m.home) ?? 0) + (prime.get(m.away) ?? 0))
        })); // prettier-ignore
      const best = scored.sort((a, b) => b.appeal - a.appeal)[0];
      if (best) {
        put(s, best.m);
        for (const t of [best.m.home, best.m.away]) prime.set(t, (prime.get(t) ?? 0) + 1);
      } else Object.assign(s, sundayAfternoon());
    }
    // Sunday afternoon: western hosts take the late window first; any left over move to it too.
    const open = slots.filter(s => !placed.has(s));
    const late = open.filter(s => s.timeEt >= LATE_WINDOW);
    const early = open.filter(s => s.timeEt < LATE_WINDOW);
    const rest = rng.shuffle(unplaced()).sort((a, b) => Number(western(b)) - Number(western(a)));
    for (const s of late) {
      const m = rest.shift();
      if (m) put(s, m);
    }
    for (const s of early) {
      const m = rest.shift();
      if (!m) continue;
      if (western(m)) s.timeEt = LATE;
      put(s, m);
    }

    for (const [s, m] of placed) {
      const date = dateOf(s);
      last.set(m.home, date);
      last.set(m.away, date);
      out.push({
        id: gameId(season, week, m.away, m.home),
        season,
        week,
        day: DAY_NAMES[weekday(date)] as string,
        date,
        timeEt: s.timeEt,
        away: m.away,
        home: m.home,
        siteType: s.siteType,
        venue: s.siteType === 'home' ? homeStadium(m.home).id : (s.venue ?? homeStadium(m.home).id)
      });
    }
  });
  return out.sort((a, b) => a.week - b.week || (a.date + a.timeEt < b.date + b.timeEt ? -1 : a.date + a.timeEt > b.date + b.timeEt ? 1 : 0) || (a.id < b.id ? -1 : 1)); // prettier-ignore
}

/** A season's schedule after the seed year (spec 5.2). */
export function generateSchedule(input: ScheduleInput, rng: Rng): ScheduledGame[] {
  const seed = input.seed.filter(g => g.season === input.seed[0]?.season);
  const rotation = matchRotation(seed, seed[0]?.season ?? input.season);
  const matchups = seasonMatchups(rotation, input.season, input.places);
  const layout = layoutFor(seed, input.season);
  const weeks = placeWeeks(matchups, layout, input.champion, rng);
  return kickoffs(input, matchups, weeks, layout, rng);
}
