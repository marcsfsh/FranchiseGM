/**
 * The fit experiment (spec 7.3, 23.3): in an experiment replay, each starter plays every game at his best
 * or his worst fit across the named schemes, drawn at random per game, while his team keeps its own scheme.
 * Comparing the two arms' per-play production measures what fit alone is worth for the same players. The
 * same games measure the locker room (spec 10.9): one team plays with the best locker room and the other
 * with the worst, drawn at random, so the home margin's swing between the draws is twice the effect.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { teamFitContext } from '../fit/cohesion';
import { recipeFor, roleRating, type FitContext } from '../fit/role-rating';
import { teamStaff } from '../league/fit';
import type { League } from '../league/types';
import { LOCKER_ROOM_BEST } from '../locker/room';
import type { Rng } from '../rng';
import { DEFENSE_LIST, OFFENSE_LIST } from '../schemes/catalog';
import { named } from '../schemes/resolve';
import { OFFENSE_SLOTS, type Slot } from '../schemes/slots';
import type { PlayerLine, TeamTotals } from '../sim/stats';
import type { GameResult, GameSetup, Side } from '../sim/types';

/**
 * The starters each group measures and whether more of its stat is better: yards per attempt, per carry,
 * and per target; pressures and sacks allowed per dropback; pressures per opposing dropback; and yards
 * allowed per coverage target.
 */
export const FIT_GROUPS = {
  passing: { slots: ['QB'], higher: true },
  rushing: { slots: ['RB1'], higher: true },
  receiving: { slots: ['X', 'Z', 'SLOT', 'TE1'], higher: true },
  protection: { slots: ['LT', 'LG', 'C', 'RG', 'RT'], higher: false },
  passRush: { slots: ['LEDGE', 'REDGE', 'DT1', 'DT2'], higher: true },
  coverage: { slots: ['CB1', 'CB2', 'NCB', 'FS', 'SS'], higher: false }
} as const satisfies Record<string, { slots: readonly Slot[]; higher: boolean }>;

export type FitGroup = keyof typeof FIT_GROUPS;
export const FIT_GROUP_IDS = Object.keys(FIT_GROUPS) as FitGroup[];

/** One arm's totals: the stat's numerator and denominator, player-games, and summed fit points. */
export interface FitArm {
  num: number;
  den: number;
  games: number;
  fit: number;
}

/** The home team's margin summed over the games it had the best locker room, and the worst. */
export interface LockerRoomSample {
  best: { margin: number; games: number };
  worst: { margin: number; games: number };
}

export type FitSample = Record<FitGroup, { best: FitArm; worst: FitArm }> & { lockerRoom: LockerRoomSample };

const emptyArm = (): FitArm => ({ num: 0, den: 0, games: 0, fit: 0 });

export const emptyFitSample = (): FitSample => ({
  ...(Object.fromEntries(FIT_GROUP_IDS.map(g => [g, { best: emptyArm(), worst: emptyArm() }])) as Record<FitGroup, { best: FitArm; worst: FitArm }>),
  lockerRoom: { best: { margin: 0, games: 0 }, worst: { margin: 0, games: 0 } }
}); // prettier-ignore

interface Extremes {
  best: number;
  worst: number;
}

const dropbacks = (t: Readonly<TeamTotals>): number => t.passAtt + t.sacked;

/** A starter's stat for his group in one game: numerator and denominator. */
function measure(
  group: FitGroup,
  line: Readonly<PlayerLine>,
  own: Readonly<TeamTotals>,
  opponent: Readonly<TeamTotals>
): [number, number] {
  switch (group) {
    case 'passing':
      return [line.passYds, line.passAtt];
    case 'rushing':
      return [line.rushYds, line.rushAtt];
    case 'receiving':
      return [line.recYds, line.targets];
    case 'protection':
      // Pressures allowed include the ones that became sacks.
      return [line.pressuresAllowed, dropbacks(own)];
    case 'passRush':
      return [line.pressures, dropbacks(opponent)];
    case 'coverage':
      return [line.yardsAllowed, line.targetsAllowed];
  }
}

/** Runs the experiment across a replay: assign arms before each game, measure after it. */
export class FitExperiment {
  readonly sample = emptyFitSample();
  /** Each team's starters' best and worst fit in the slots the groups measure. */
  private readonly extremes = new Map<TeamAbbr, Map<string, Partial<Record<Slot, Extremes>>>>();
  private assigned: { side: Side; id: string; slot: Slot; group: FitGroup; arm: 'best' | 'worst' }[] = [];
  /** The home team's locker room this game. */
  private room: 'best' | 'worst' = 'best';

  constructor(private readonly league: League) {}

  private teamExtremes(
    abbr: TeamAbbr,
    setup: GameSetup['home']
  ): Map<string, Partial<Record<Slot, Extremes>>> {
    const known = this.extremes.get(abbr);
    if (known) return known;
    const staff = teamStaff(this.league, abbr);
    const schemes = this.league.teams[abbr].schemes;
    const cap = this.league.settings.fitCap;
    const offenses: FitContext[] = OFFENSE_LIST.map(o =>
      teamFitContext({ offense: named(o.id), defense: schemes.defense }, cap, staff)
    );
    const defenses: FitContext[] = DEFENSE_LIST.map(d =>
      teamFitContext({ offense: schemes.offense, defense: named(d.id) }, cap, staff)
    );
    const out = new Map<string, Partial<Record<Slot, Extremes>>>();
    for (const group of FIT_GROUP_IDS)
      for (const slot of FIT_GROUPS[group].slots) {
        const id = setup.depth[slot]?.[0];
        const player = id ? this.league.players[id] : undefined;
        if (!id || !player) continue;
        const contexts = (OFFENSE_SLOTS as readonly Slot[]).includes(slot) ? offenses : defenses;
        const fits = contexts
          .filter(ctx => recipeFor(ctx, slot).eligible.includes(player.position))
          .map(ctx => roleRating(player, slot, ctx).fit);
        if (!fits.length) continue;
        const slots = out.get(id) ?? {};
        slots[slot] = { best: Math.max(...fits), worst: Math.min(...fits) };
        out.set(id, slots);
      }
    this.extremes.set(abbr, out);
    return out;
  }

  /**
   * Gives each measured starter in the game his best or worst fit, a coin flip each, and one team the best
   * locker room and the other the worst.
   */
  assign(setup: GameSetup, rng: Rng): void {
    this.assigned = [];
    this.room = rng.fork('lockerRoom').chance(0.5) ? 'best' : 'worst';
    const best = { offense: LOCKER_ROOM_BEST, defense: LOCKER_ROOM_BEST };
    const worst = { offense: -LOCKER_ROOM_BEST, defense: -LOCKER_ROOM_BEST };
    setup.home.lockerRoom = this.room === 'best' ? best : worst;
    setup.away.lockerRoom = this.room === 'best' ? worst : best;
    for (const side of ['home', 'away'] as const) {
      const team = setup[side];
      const extremes = this.teamExtremes(team.abbr, team);
      for (const group of FIT_GROUP_IDS)
        for (const slot of FIT_GROUPS[group].slots) {
          const id = team.depth[slot]?.[0];
          const range = id ? extremes.get(id)?.[slot] : undefined;
          const player = id ? team.players[id] : undefined;
          if (!id || !range || !player) continue;
          const arm = rng.chance(0.5) ? 'best' : 'worst';
          player.fit[slot] = range[arm];
          this.assigned.push({ side, id, slot, group, arm });
        }
    }
  }

  /** Adds the game's production by arm. */
  record(setup: GameSetup, result: GameResult): void {
    for (const a of this.assigned) {
      const line = result.box[a.side].players[a.id];
      if (!line) continue;
      const other = a.side === 'home' ? 'away' : 'home';
      const [num, den] = measure(a.group, line, result.box[a.side].totals, result.box[other].totals);
      const arm = this.sample[a.group][a.arm];
      arm.num += num;
      arm.den += den;
      arm.games++;
      arm.fit += setup[a.side].players[a.id]?.fit[a.slot] ?? 0;
    }
    this.assigned = [];
    const room = this.sample.lockerRoom[this.room];
    room.margin += result.score.home - result.score.away;
    room.games++;
  }
}
