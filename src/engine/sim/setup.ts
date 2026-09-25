/**
 * Game setup (spec 8.2): turns a league's teams into sim inputs. Depth charts come from snap-ordered
 * lineups with backups by role rating (the M7 depth chart screen and AI weekly management replace this);
 * tendencies bend toward the roster by the head coach's flexibility; weather, home field, and form are
 * drawn for the day.
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import { venueById, type Venue } from '../../data/stadiums';
import { divisionOf, homeStadium } from '../../data/teams';
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import { ability } from '../abilities/catalog';
import { adaptedTendencies, autoLineup, teamCohesion, type LineupPlayer } from '../fit/cohesion';
import { recipeFor, roleRating, type FitContext } from '../fit/role-rating';
import { leagueFitContext, teamStaff } from '../league/fit';
import type { League } from '../league/types';
import { fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SPECIAL_SLOTS, type Slot } from '../schemes/slots';
import { TUNING } from '../tuning';
import { cannotPlay, designation, hurtEffects } from '../season/injuries';
import { abilityEdges, compositeEdges } from './composites';
import type { SimSliders } from './sliders';
import type { CoachStyle, GameSetup, GameWeather, SimAbility, SimPlayer, TeamSetup } from './types';
import { drawWeather, EASTERN, zoneHours, zoneOffset } from './weather';

const S = TUNING.sim;
const ALL_SLOTS: readonly Slot[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS, ...SPECIAL_SLOTS];

function simAbilities(player: Player): SimAbility[] {
  return player.abilities.flatMap(id => {
    const a = ability(id);
    return a
      ? [{ id, name: a.name, triggers: a.triggers, contexts: a.contexts ?? [], edges: abilityEdges(a) }]
      : [];
  });
}

export function simPlayer(player: Player): SimPlayer {
  // Playing hurt costs rating points and raises the injury risk (spec 10.8).
  const hurt = hurtEffects(player.injury);
  const edges = compositeEdges(player.ratings);
  if (hurt.penalty)
    for (const key of Object.keys(edges) as (keyof typeof edges)[]) edges[key] -= hurt.penalty;
  return {
    id: player.id,
    name: fullName(player),
    short: `${player.firstName.charAt(0)}. ${player.lastName}`,
    position: player.position,
    jersey: player.jersey,
    ovr: player.ovr,
    edges,
    traits: player.traits,
    abilities: simAbilities(player),
    fit: {},
    stamina: player.ratings.sta,
    injury: player.ratings.inj,
    toughness: player.ratings.tgh,
    energy: 100,
    out: false,
    injuryRisk: hurt.risk
  };
}

/**
 * Depth chart: the snap-ordered lineup's starters (spec 7.6), then every other eligible player by role
 * rating. Special teams slots take the best role ratings. Fit per slot is recorded on each player.
 */
export function depthChart(
  roster: readonly Player[],
  ctx: FitContext,
  players: Record<string, SimPlayer>
): Record<Slot, string[]> {
  const lineup = autoLineup(roster as readonly LineupPlayer[], ctx);
  const depth = {} as Record<Slot, string[]>;
  for (const slot of ALL_SLOTS) {
    const eligible = recipeFor(ctx, slot).eligible;
    const rated = roster
      .filter(p => eligible.includes(p.position))
      .map(p => ({ id: p.id, role: roleRating(p, slot, ctx) }))
      .sort((a, b) => b.role.rating - a.role.rating || (a.id < b.id ? -1 : 1));
    for (const r of rated) {
      const sim = players[r.id];
      if (sim) sim.fit[slot] = r.role.fit;
    }
    const starter = lineup.get(slot)?.player.id;
    depth[slot] = starter
      ? [starter, ...rated.map(r => r.id).filter(id => id !== starter)]
      : rated.map(r => r.id);
  }
  return depth;
}

function coachStyle(league: League, abbr: TeamAbbr): CoachStyle {
  const hc = teamStaff(league, abbr).find(s => s.role === 'HC');
  return {
    aggressiveness: hc?.tendencies?.aggressiveness ?? 50,
    clock: hc?.tendencies?.clockManagement ?? 50,
    halftime: hc?.ratings.gameManagement ?? 50,
    // Until M13 gives head coaches this tendency, the aggressive ones protect leads least (D-18).
    conservatism: 100 - (hc?.tendencies?.aggressiveness ?? 50)
  };
}

/**
 * How much more the roster's passing game outclasses its running game, in rating points: the starting
 * quarterback, top three receivers, and pass protection against the line's run blocking and the lead back.
 */
function passRunBalance(players: Record<string, SimPlayer>, depth: Record<Slot, string[]>): number {
  const at = (slot: Slot) => players[depth[slot]?.[0] ?? ''];
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const line = (['LT', 'LG', 'C', 'RG', 'RT'] as const).flatMap(s => (at(s) ? [at(s) as SimPlayer] : []));
  const receivers = (['X', 'Z', 'SLOT'] as const).flatMap(s => (at(s) ? [at(s) as SimPlayer] : []));
  const qb = at('QB');
  const back = at('RB1');
  const passing = mean([
    qb?.edges.accMid ?? 0,
    mean(receivers.map(r => r.edges.routeMid)),
    mean(line.map(p => p.edges.passBlock))
  ]);
  const running = mean([
    mean(line.map(p => (p.edges.runBlockZone + p.edges.runBlockGap) / 2)),
    back ? (back.edges.vision + back.edges.elusive) / 2 : 0
  ]);
  return passing - running;
}

/** Whether a player dresses for his team's game: active, and not held out by an injury (spec 10.8). */
export function available(league: League, player: Player): boolean {
  if (player.status !== 'active') return false;
  if (cannotPlay(designation(player.injury))) return false;
  // A questionable player the coach decided to rest.
  return !(league.teams[player.team as TeamAbbr]?.resting ?? []).includes(player.id);
}

export function teamSetup(league: League, abbr: TeamAbbr, boost: number): TeamSetup {
  const roster = Object.values(league.players).filter(p => p.team === abbr && available(league, p));
  const ctx = leagueFitContext(league, abbr);
  const players: Record<string, SimPlayer> = {};
  for (const p of roster) players[p.id] = simPlayer(p);
  const depth = depthChart(roster, ctx, players);
  const hc = teamStaff(league, abbr).find(s => s.role === 'HC');
  const flexibility = hc?.ratings.flexibility ?? 50;
  const lineup = autoLineup(roster as readonly LineupPlayer[], ctx);
  const adapted = adaptedTendencies(roster as readonly LineupPlayer[], ctx, flexibility);
  return {
    abbr,
    name: teamFullName(abbr),
    user: abbr === league.meta.start.userTeam,
    players,
    depth,
    offense: ctx.offense,
    defense: ctx.defense,
    tendencies: { offense: adapted.offense, defense: adapted.defense },
    coach: coachStyle(league, abbr),
    cohesion: teamCohesion(lineup, ctx, flexibility),
    boost,
    lean:
      Math.max(-1, Math.min(1, passRunBalance(players, depth) / S.leanScale)) * S.leanMax * (flexibility / 99)
  };
}

/** Days since the team's last game before this one, or null if it hasn't played. */
function restDays(league: League, abbr: TeamAbbr, game: ScheduledGame): number | null {
  let last: string | null = null;
  for (const g of league.schedule) {
    if (g.id === game.id || g.date >= game.date || (g.home !== abbr && g.away !== abbr)) continue;
    if (!last || g.date > last) last = g.date;
  }
  if (!last) return null;
  return Math.round((Date.parse(game.date) - Date.parse(last)) / 86_400_000);
}

function restPoints(days: number | null): number {
  if (days === null) return 0;
  if (days <= S.shortWeekDays) return -S.shortWeek;
  if (days >= S.byeWeekDays) return S.afterBye;
  return 0;
}

/** One team's home field and travel effects for a game, in rating points (spec 17.2, 17.3). */
export interface HomeField {
  crowd: number;
  /** Time zones crossed. */
  travel: number;
  /** An eastbound trip to a kickoff in the body clock's morning. */
  early: number;
  rest: number;
  /** Division visitors know the building and the opponent, which trims the home edge. */
  familiarity: number;
  /** Dome and retractable-roof teams playing outdoors in the cold. */
  cold: number;
}

/**
 * Home field (spec 17.3) from crowd noise, travel across time zones and early eastbound kickoffs, rest,
 * and division familiarity, scaled by the home field slider; plus dome teams in the cold (spec 17.2),
 * scaled by the weather slider. `falseStarts` multiplies the visiting offense's false starts.
 */
export function homeField(
  league: League,
  game: ScheduledGame,
  venue: Venue,
  weather: GameWeather,
  sliders: SimSliders
): { home: HomeField; away: HomeField; falseStarts: number } {
  const neutral = game.siteType !== 'home';
  const hf = sliders.general.homeField;
  const kickoffEt = Number(game.timeEt.slice(0, 2)) + Number(game.timeEt.slice(3, 5)) / 60;
  const division = !neutral && divisionOf(game.home).includes(game.away);
  const team = (abbr: TeamAbbr, isHome: boolean): HomeField => {
    const stadium = homeStadium(abbr);
    const zone = zoneOffset(stadium);
    const eastbound = zoneOffset(venue) > zone;
    const outdoorCold = !weather.indoor && weather.tempF < S.domeColdF;
    return {
      crowd: isHome && !neutral ? S.homeCrowd * venue.noise * hf : 0,
      travel: -S.travelPerZone * zoneHours(stadium, venue) * hf,
      early: eastbound && kickoffEt + zone - EASTERN < S.earlyBodyClockHour ? -S.earlyEastbound * hf : 0,
      rest: restPoints(restDays(league, abbr, game)) * hf,
      familiarity: !isHome && division ? S.divisionFamiliarity * hf : 0,
      cold: stadium.roof !== 'open' && outdoorCold ? -S.domeCold * sliders.general.weatherImpact : 0
    };
  };
  return {
    home: team(game.home, true),
    away: team(game.away, false),
    falseStarts: neutral ? 1 : 1 + S.crowdFalseStart * venue.noise * hf
  };
}

const total = (h: HomeField): number => h.crowd + h.travel + h.early + h.rest + h.familiarity + h.cold;

/**
 * Team setups kept while rosters, depth charts, and staffs stay the same (a calibration replay), so each
 * game clones one instead of rebuilding it. The sim changes a setup's players as it runs.
 */
export type TeamSetups = Map<TeamAbbr, TeamSetup>;

function setupFor(league: League, abbr: TeamAbbr, boost: number, cache?: TeamSetups): TeamSetup {
  if (!cache) return teamSetup(league, abbr, boost);
  let base = cache.get(abbr);
  if (!base) {
    base = teamSetup(league, abbr, 0);
    cache.set(abbr, base);
  }
  return { ...structuredClone(base), boost };
}

/** Everything the sim needs for one scheduled game. */
export function gameSetup(
  league: League,
  game: ScheduledGame,
  climate: ClimateTable | null,
  rng: Rng,
  cache?: TeamSetups
): GameSetup {
  const venue = venueById(game.venue);
  const month = Number(game.date.slice(5, 7)) - 1;
  const sliders = league.settings.sim;
  const weather = drawWeather(rng.fork('weather'), venue, climate?.[venue.climate]?.[month] ?? null);
  const field = homeField(league, game, venue, weather, sliders);
  // Each team's form for the day (spec 8.5), scaled by the upset slider.
  const boostRng = rng.fork('boost');
  const form = () => boostRng.normal(0, S.formSd * sliders.general.upsets);
  const b = { home: total(field.home) + form(), away: total(field.away) + form(), crowd: field.falseStarts };
  return {
    id: game.id,
    season: game.season,
    week: game.week,
    // Playoff games are numbered on from the regular season's weeks and can't end in a tie.
    playoff: game.week > league.rules.season.weeks,
    neutral: game.siteType !== 'home',
    venue,
    weather,
    rules: league.rules.game,
    sliders,
    home: setupFor(league, game.home, b.home, cache),
    away: setupFor(league, game.away, b.away, cache),
    crowd: b.crowd
  };
}
