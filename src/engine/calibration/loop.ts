/**
 * Calibration seasons through the weekly loop (spec 4.2, 23.1): a generated league plays its regular season
 * with advanceWeek, the path the game takes, so weekly management runs as it does in play (AI roster moves,
 * injured reserve, waivers, practice squad elevations, rest, depth charts, and game plans). The AI runs
 * every club, the user's included. Season-level metrics are judged on these seasons (C-20).
 */
import type { ClimateTable } from '../../data/climate';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { createLeague, defaultStartOptions } from '../league/create';
import type { League } from '../league/types';
import { advanceWeek, weekGames } from '../season/advance';
import { cannotPlay, designation } from '../season/injuries';
import { SeasonFacts, type CalibrationData, type ReplayFacts } from './replay';

/** A generated fictional league for a weekly-loop season, with the user's club on auto; the seed picks it. */
export function loopLeague(data: CalibrationData, seed: number): League {
  const league = createLeague({
    id: `calibration-loop-${seed}`,
    name: 'Calibration',
    start: defaultStartOptions(TEAM_ABBRS[0] as TeamAbbr, seed),
    gameVersion: 'calibration',
    names: data.names,
    schedule: data.schedule,
    fixed: true
  });
  league.settings.auto.roster = true;
  league.settings.auto.contracts = true;
  return league;
}

/** A league's regular season played week by week through advanceWeek, collecting its facts. */
export class LoopSeason {
  private readonly collected: SeasonFacts;

  constructor(
    private readonly league: League,
    private readonly climate: ClimateTable | null
  ) {
    const season = league.date.season;
    this.collected = new SeasonFacts(
      league,
      league.schedule.filter(g => g.season === season)
    );
  }

  /** Whether the regular season is over. */
  get done(): boolean {
    return this.league.date.phase !== 'regularSeason';
  }

  /** The regular season's weeks, for progress. */
  get weeks(): number {
    return this.league.rules.season.weeks;
  }

  /** Plays the next week: weekly management, the games, injuries, and the calendar. */
  playWeek(): void {
    const games = new Map(weekGames(this.league).map(g => [g.id, g]));
    // Players an injury keeps out at kickoff, as replays count them.
    const playing = new Set([...games.values()].flatMap(g => [g.home, g.away]));
    for (const p of Object.values(this.league.players))
      if (p.team && playing.has(p.team as TeamAbbr) && cannotPlay(designation(p.injury)))
        this.collected.team(p.team as TeamAbbr).injuries.absences++;
    const week = advanceWeek(this.league, this.climate, { actions: 0, entropy: 0 });
    if (week.blocked)
      throw new Error(`The loop season stopped in week ${this.league.date.week}: ${week.blocked}`);
    for (const { result } of week.games) {
      const game = games.get(result.id);
      if (game) this.collected.add(game, result);
    }
  }

  facts(): ReplayFacts {
    return this.collected.facts();
  }
}
