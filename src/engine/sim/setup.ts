/**
 * Game setup (spec 8.2): turns a league's teams into sim inputs. Depth charts come from snap-ordered
 * lineups with backups by role rating (the M7 depth chart screen and AI weekly management replace this);
 * tendencies bend toward the roster by the head coach's flexibility; weather, home field, and form are
 * drawn for the day.
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import { venueById, type Venue } from '../../data/stadiums';
import { homeStadium } from '../../data/teams';
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
import { abilityEdges, compositeEdges } from './composites';
import type { SimSliders } from './sliders';
import type { CoachStyle, GameSetup, SimAbility, SimPlayer, TeamSetup } from './types';
import { drawWeather, zoneHours } from './weather';

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
  return {
    id: player.id,
    name: fullName(player),
    short: `${player.firstName.charAt(0)}. ${player.lastName}`,
    position: player.position,
    jersey: player.jersey,
    ovr: player.ovr,
    edges: compositeEdges(player.ratings),
    traits: player.traits,
    abilities: simAbilities(player),
    fit: {},
    stamina: player.ratings.sta,
    injury: player.ratings.inj,
    toughness: player.ratings.tgh,
    energy: 100,
    out: false
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
    halftime: hc?.ratings.gameManagement ?? 50
  };
}

export function teamSetup(league: League, abbr: TeamAbbr, boost: number): TeamSetup {
  const roster = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active');
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
    boost
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

/**
 * Home field (spec 17.3) from crowd noise, travel across time zones, and rest, scaled by the home field
 * slider; plus each team's form for the day (spec 8.5), scaled by the upset slider.
 */
function boosts(
  league: League,
  game: ScheduledGame,
  venue: Venue,
  sliders: SimSliders,
  rng: Rng
): { home: number; away: number; crowd: number } {
  const neutral = game.siteType !== 'home';
  const hf = sliders.general.homeField;
  const crowd = neutral ? 0 : S.homeCrowd * venue.noise * hf;
  const travel = (abbr: TeamAbbr) => -S.travelPerZone * zoneHours(homeStadium(abbr), venue) * hf;
  const rest = (abbr: TeamAbbr) => restPoints(restDays(league, abbr, game)) * hf;
  const form = () => rng.normal(0, S.formSd * sliders.general.upsets);
  return {
    home: crowd + travel(game.home) + rest(game.home) + form(),
    away: travel(game.away) + rest(game.away) + form(),
    crowd: neutral ? 1 : 1 + S.crowdFalseStart * venue.noise * hf
  };
}

/** Everything the sim needs for one scheduled game. */
export function gameSetup(
  league: League,
  game: ScheduledGame,
  climate: ClimateTable | null,
  rng: Rng
): GameSetup {
  const venue = venueById(game.venue);
  const month = Number(game.date.slice(5, 7)) - 1;
  const sliders = league.settings.sim;
  const weather = drawWeather(rng.fork('weather'), venue, climate?.[venue.climate]?.[month] ?? null);
  const b = boosts(league, game, venue, sliders, rng.fork('boost'));
  return {
    id: game.id,
    season: game.season,
    week: game.week,
    playoff: false,
    neutral: game.siteType !== 'home',
    venue,
    weather,
    rules: league.rules.game,
    sliders,
    home: teamSetup(league, game.home, b.home),
    away: teamSetup(league, game.away, b.away),
    crowd: b.crowd
  };
}
