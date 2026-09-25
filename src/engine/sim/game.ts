/**
 * The play loop (spec 8.3). Every game runs play by play: situation, coaching decision, personnel and
 * package, play call, resolution (pass, run, special teams), penalties, injuries, and updates to fatigue,
 * clock, and stats. Plays aren't stored; the result holds the box score, scoring and drive summaries, and
 * the recap (spec 8.8). All randomness comes from the game's stream.
 */
import type { Rng } from '../rng';
import type { PenaltyId } from '../rules/ruleset';
import type { ContextTrigger, PlayTrigger } from '../schemes/situations';
import type { DefenseSlot, OffenseSlot, Slot } from '../schemes/slots';
import type { DownDistance, Personnel, RunConcept, Shell, TargetSlot } from '../schemes/tendencies';
import { POSITION_GROUP } from '../model/positions';
import { TUNING } from '../tuning';
import type { CompositeId } from './composites';
import { recap } from './recap';
import { emptyLine, emptyTotals, sumLines, type PlayerLine, type StatKey, type TeamTotals } from './stats';
import type { GameplaySlider, OutputSlider, PenaltySlider } from './sliders';
import type {
  DriveResult,
  DriveSummary,
  EjectionEvent,
  GameResult,
  GameSetup,
  InjuryEvent,
  InjurySeverity,
  PenaltyEvent,
  ScoringPlay,
  Side,
  SimPlayer,
  SituationCounts,
  TeamSetup
} from './types';
import { isBadWeather } from './weather';

const S = TUNING.sim;
const C = S.calls;
const TWO_HIGH: readonly Shell[] = ['cover2', 'cover4', 'cover6'];
const K = S.clock;
const B = C.airBands;

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (p: number): number => Math.log(p / (1 - p));
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

type Depth = 'short' | 'intermediate' | 'deep' | 'screen';
type Package = 'base' | 'nickel' | 'dime' | 'goalLine';
type OnField = Map<Slot, SimPlayer>;

interface PassCall {
  kind: 'pass';
  depth: Depth;
  playAction: boolean;
}
interface RunCall {
  kind: 'run';
  concept: RunConcept;
  qbRun: boolean;
}
type Call = PassCall | RunCall;

interface DefenseCall {
  man: boolean;
  shell: Shell;
  blitz: boolean;
  simPressure: boolean;
  /** Soft coverage while protecting a lead, 0 to 1: short passes come easier, big plays harder. */
  soft: number;
}

/** What a scrimmage play did, before penalties. */
interface PlayOutcome {
  yards: number;
  /** The clock stops after the play (incompletion, out of bounds late in a half, turnover, score). */
  stops: boolean;
  turnover: 'interception' | 'fumble' | null;
  /** Yards the defense returned a turnover, from the spot it took the ball. */
  returnYards: number;
  sack: boolean;
  /** Pass or run, for first-down stats; null for kneels and spikes. */
  kind: 'pass' | 'run' | null;
  incomplete: boolean;
  /** The yards the pass traveled in the air, for spot fouls. */
  air: number;
  /** Who had the ball at the end: the passer's target or the runner. */
  ballCarrier: SimPlayer | null;
  passer: SimPlayer | null;
  tackler: SimPlayer | null;
  covering: SimPlayer | null;
  pressured: boolean;
  /** The quarterback threw it away under pressure. */
  throwAway: boolean;
  description: string;
}

const DOWN_BUCKETS = (down: number, distance: number): DownDistance =>
  down === 1
    ? 'first'
    : down === 2
      ? distance <= 3
        ? 'secondShort'
        : 'secondLong'
      : distance <= 3
        ? 'thirdShort'
        : 'thirdLong';

const PERSONNEL_SLOTS: Record<Personnel, readonly OffenseSlot[]> = {
  '10': ['QB', 'RB1', 'X', 'Z', 'SLOT', 'LT', 'LG', 'C', 'RG', 'RT'],
  '11': ['QB', 'RB1', 'TE1', 'X', 'Z', 'SLOT', 'LT', 'LG', 'C', 'RG', 'RT'],
  '12': ['QB', 'RB1', 'TE1', 'TE2', 'X', 'Z', 'LT', 'LG', 'C', 'RG', 'RT'],
  '13': ['QB', 'RB1', 'TE1', 'TE2', 'X', 'LT', 'LG', 'C', 'RG', 'RT'],
  '21': ['QB', 'RB1', 'FB', 'TE1', 'X', 'Z', 'LT', 'LG', 'C', 'RG', 'RT'],
  '22': ['QB', 'RB1', 'FB', 'TE1', 'TE2', 'X', 'LT', 'LG', 'C', 'RG', 'RT']
};
/** Extra skill players from deeper in the depth chart: a fourth receiver in 10, a third tight end in 13. */
const EXTRA_SLOT: Partial<Record<Personnel, OffenseSlot>> = { '10': 'SLOT', '13': 'TE2' };
const PACKAGE_SLOTS: Record<Package, readonly DefenseSlot[]> = {
  base: ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', 'MIKE', 'WILL', 'CB1', 'CB2', 'FS', 'SS'],
  nickel: ['LEDGE', 'REDGE', 'DT1', 'DT2', 'MIKE', 'WILL', 'CB1', 'CB2', 'NCB', 'FS', 'SS'],
  dime: ['LEDGE', 'REDGE', 'DT1', 'DT2', 'MIKE', 'CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS'],
  // Goal line: a third interior lineman (GOAL_LINE_EXTRA) takes the second corner's place.
  goalLine: ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', 'MIKE', 'WILL', 'CB1', 'FS', 'SS']
};
/** The goal-line package's extra lineman, from deeper in the interior depth chart. */
const GOAL_LINE_EXTRA = 'DT1+' as Slot;
/** Who covers each receiving slot, first choice first. */
const COVERAGE: Record<TargetSlot | 'EXTRA', readonly DefenseSlot[]> = {
  X: ['CB1', 'CB2', 'NCB'],
  Z: ['CB2', 'CB1', 'NCB'],
  SLOT: ['NCB', 'SS', 'WILL', 'FLEX'],
  EXTRA: ['DIME', 'FS', 'SS', 'WILL'],
  TE1: ['SS', 'MIKE', 'FLEX'],
  TE2: ['FLEX', 'WILL', 'MIKE'],
  RB1: ['WILL', 'MIKE', 'FLEX'],
  RB2: ['WILL', 'MIKE', 'FLEX'],
  FB: ['MIKE', 'WILL', 'FLEX']
};
const FRONT: readonly Slot[] = ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', GOAL_LINE_EXTRA];
/** Who plays quarterback when every passer is hurt: backs and receivers first (spec 10.8). */
const EMERGENCY_QB: readonly Slot[] = ['RB1', 'RB2', 'SLOT', 'X', 'Z', 'TE1', 'TE2', 'FB'];
const LINE: readonly OffenseSlot[] = ['LT', 'LG', 'C', 'RG', 'RT'];

const BODY_PARTS: Record<InjurySeverity, readonly string[]> = {
  minor: ['ankle', 'hand', 'shoulder', 'hip', 'ribs', 'calf'],
  short: ['ankle', 'hamstring', 'knee', 'shoulder', 'groin', 'concussion'],
  medium: ['hamstring', 'knee', 'high ankle', 'shoulder', 'foot'],
  season: ['knee (ACL)', 'Achilles', 'foot (Lisfranc)', 'shoulder', 'ankle']
};

interface Drive {
  team: Side;
  quarter: number;
  clock: number;
  start: number;
  plays: number;
  yards: number;
  seconds: number;
}

class GameSim {
  private readonly teams: Record<Side, TeamSetup>;
  private readonly rng: Rng;
  private readonly bad: boolean;
  private readonly turf: boolean;
  private readonly lines: Record<Side, Record<string, PlayerLine>> = { home: {}, away: {} };
  private readonly totals: Record<Side, TeamTotals> = { home: emptyTotals(), away: emptyTotals() };
  private readonly scoring: ScoringPlay[] = [];
  private readonly drives: DriveSummary[] = [];
  private readonly injuries: InjuryEvent[] = [];
  private readonly ejections: EjectionEvent[] = [];
  private readonly penaltyLog: PenaltyEvent[] = [];
  private readonly situations: Record<Side, SituationCounts> = {
    home: { snaps: {}, counts: {} },
    away: { snaps: {}, counts: {} }
  };
  /** Players back from minor injuries after this many more plays. */
  private readonly returning = new Map<SimPlayer, number>();

  private quarter = 1;
  private clock: number;
  private offense: Side = 'home';
  private ball = 25;
  private down = 1;
  private distance: number;
  private readonly score: Record<Side, number> = { home: 0, away: 0 };
  private readonly byQuarter: Record<Side, number[]> = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };
  private readonly timeouts: Record<Side, number>;
  private openingKicker: Side = 'home';
  private warned = false;
  private over = false;
  private overtime = false;
  private readonly otPossessions: Record<Side, number> = { home: 0, away: 0 };
  private drive: Drive | null = null;
  /** The game clock runs between plays; incompletions, timeouts, scores, and changes of possession stop it. */
  private running = false;
  /** An accepted defensive foul on a period's last play gives the offense an untimed down. */
  private untimed = false;
  /** Halftime pass-rate adjustments (spec 8.6). */
  private readonly adjust: Record<Side, number> = { home: 0, away: 0 };
  private plays = 0;
  private redZoneCounted = false;
  /** Players on the field this play, by side and slot. */
  private field: Record<Side, OnField> = { home: new Map(), away: new Map() };
  /** Each team's offensive and defensive snaps so far, for snap limits (spec 12.3). */
  private readonly unitSnaps: Record<Side, { offense: number; defense: number }> = {
    home: { offense: 0, defense: 0 },
    away: { offense: 0, defense: 0 }
  };
  private contexts: ContextTrigger[] = [];
  /** Whether each side's offense and defense have taken their first snap (spec 9.2 games started). */
  private readonly startersMarked: Record<Side, { offense: boolean; defense: boolean }> = {
    home: { offense: false, defense: false },
    away: { offense: false, defense: false }
  };

  constructor(
    private readonly setup: GameSetup,
    rng: Rng
  ) {
    this.teams = { home: setup.home, away: setup.away };
    this.rng = rng;
    this.bad = isBadWeather(setup.weather);
    this.turf = setup.venue.surface === 'turf';
    this.clock = setup.rules.quarterSeconds;
    this.distance = setup.rules.yardsToGain;
    this.timeouts = { home: setup.rules.timeoutsPerHalf, away: setup.rules.timeoutsPerHalf };
  }

  run(from?: GameState): GameResult {
    // The toss winner defers, so the other team receives the opening kickoff.
    const receiver: Side = this.rng.chance(0.5) ? 'home' : 'away';
    this.openingKicker = other(from?.receivedOpeningKickoff ?? receiver);
    if (from) this.resume(from);
    else this.kickoff(this.openingKicker);
    let guard = 0;
    while (!this.over && guard++ < K.maxPlays) this.snap();
    if (!this.over) this.finish();
    return this.result();
  }

  /** Starts from a game situation instead of the opening kickoff. */
  private resume(from: GameState): void {
    const rules = this.setup.rules;
    this.quarter = from.quarter;
    this.overtime = from.quarter > 4;
    this.clock = Math.min(from.clock, this.periodSeconds);
    this.warned = this.lateHalf() && this.clock <= K.twoMinute;
    const timeouts = this.overtime ? this.overtimeTimeouts : rules.timeoutsPerHalf;
    this.timeouts.home = from.timeouts?.home ?? timeouts;
    this.timeouts.away = from.timeouts?.away ?? timeouts;
    this.otPossessions.home = from.overtimePossessions?.home ?? 0;
    this.otPossessions.away = from.overtimePossessions?.away ?? 0;
    // Earlier points go in the first quarter of the line score.
    for (const side of ['home', 'away'] as const) {
      this.score[side] = from.score[side];
      this.byQuarter[side] = this.overtime ? [from.score[side], 0, 0, 0, 0] : [from.score[side], 0, 0, 0];
      this.totals[side].points = from.score[side];
    }
    if (!from.offense) {
      const receiver: Side = this.rng.chance(0.5) ? 'home' : 'away';
      this.kickoff(other(receiver));
      return;
    }
    this.possess(from.offense, from.ball ?? 25);
    this.down = from.down ?? 1;
    this.distance = Math.min(from.distance ?? rules.yardsToGain, 100 - this.ball);
    this.running = from.running ?? false;
  }

  // ---------------------------------------------------------------------------------------------------
  // Helpers: players, edges, stats, situations

  private line(side: Side, player: SimPlayer): PlayerLine {
    return (this.lines[side][player.id] ??= emptyLine());
  }

  /** Stat entries for the play in progress; an accepted penalty wipes the play (spec 8.3 step 6). */
  private buffer: (() => void)[] | null = null;

  private add(side: Side, player: SimPlayer | null, key: StatKey, value = 1): void {
    if (!player) return;
    const apply = () => {
      this.line(side, player)[key] += value;
    };
    if (this.buffer) this.buffer.push(apply);
    else apply();
  }

  private long(side: Side, player: SimPlayer | null, key: StatKey, value: number): void {
    if (!player) return;
    const apply = () => {
      const l = this.line(side, player);
      if (value > l[key]) l[key] = value;
    };
    if (this.buffer) this.buffer.push(apply);
    else apply();
  }

  private commit(): void {
    const entries = this.buffer ?? [];
    this.buffer = null;
    for (const apply of entries) apply();
  }

  private discard(): void {
    this.buffer = null;
  }

  private slider(side: Side, key: GameplaySlider): number {
    const s = this.setup.sliders.gameplay[key];
    return this.teams[side].user ? s.user : s.ai;
  }

  private penaltySlider(side: Side, key: PenaltySlider): number {
    const s = this.setup.sliders.penalties[key];
    return this.teams[side].user ? s.user : s.ai;
  }

  private output(key: OutputSlider): number {
    return this.setup.sliders.output[key];
  }

  /** Rating points added to every edge for a player in a slot today: form, home field, fit, fatigue. */
  private modifier(side: Side, player: SimPlayer, slot: Slot): number {
    const fit = (player.fit[slot] ?? 0) * S.fitPoints * this.setup.sliders.general.fitEffect;
    const tired = Math.max(0, S.tiredAt - player.energy) * S.tiredPoints;
    return this.teams[side].boost + fit - tired;
  }

  /**
   * A player's edge for an action in a slot, with any of his abilities that trigger here (spec 7.4): an
   * ability is active when one of its play triggers happens, inside one of its contexts if it has any.
   */
  private edge(
    side: Side,
    player: SimPlayer,
    slot: Slot,
    id: CompositeId,
    triggers: readonly PlayTrigger[] = []
  ): number {
    let value = player.edges[id] + this.modifier(side, player, slot);
    // Artificial turf is a little faster (spec 17.2).
    if (this.turf && (id === 'burst' || id === 'elusive' || id === 'returner')) value += C.turfSpeed;
    if (triggers.length) {
      for (const a of player.abilities) {
        if (!a.triggers.some(t => triggers.includes(t))) continue;
        if (a.contexts.length && !a.contexts.some(c => this.contexts.includes(c))) continue;
        value += a.edges[id] ?? 0;
      }
    }
    return value;
  }

  private note(side: Side, slot: Slot, ...triggers: PlayTrigger[]): void {
    if (!this.setup.measure || slot.endsWith('+')) return;
    const counts = (this.situations[side].counts[slot] ??= {});
    for (const t of triggers) counts[t] = (counts[t] ?? 0) + 1;
  }

  private slotOf(side: Side, player: SimPlayer): Slot | null {
    for (const [slot, p] of this.field[side]) if (p === player) return slot;
    return null;
  }

  private at(side: Side, slot: Slot): SimPlayer | null {
    return this.field[side].get(slot) ?? null;
  }

  /** The quarterback, or an emergency one from the skill positions when every passer is hurt. */
  private quarterback(side: Side, used: Set<SimPlayer> = new Set()): SimPlayer | null {
    const qb = this.pick(side, 'QB', used);
    if (qb) return qb;
    for (const slot of EMERGENCY_QB) {
      const p = this.pick(side, slot, used);
      if (p) return p;
    }
    return null;
  }

  /** A listed player who can go in: on this team, healthy, and not already on the field. */
  private ready(side: Side, id: string | null, used: Set<SimPlayer>): SimPlayer | null {
    const p = id ? this.teams[side].players[id] : undefined;
    return p && !p.out && !used.has(p) ? p : null;
  }

  /** The lead back's share of the backfield snaps: the rotation's split, tilted toward a featured back. */
  private rb1Share(side: Side): number {
    const team = this.teams[side];
    const feature = team.plan.feature;
    const tilt =
      feature === null
        ? 0
        : team.depth.RB1?.[0] === feature
          ? C.featureCarries
          : team.depth.RB2?.[0] === feature
            ? -C.featureCarries
            : 0;
    return clamp(team.rotation.rb1Share + tilt, 0, 1);
  }

  /**
   * Healthy, rested enough, and not already used this play. Filling a scrimmage lineup (`rotate`) also
   * follows the planned rotation: development snaps for a young backup and snap limits (spec 12.3).
   */
  private pick(
    side: Side,
    slot: Slot,
    used: Set<SimPlayer>,
    depthIndex = 0,
    rotate = false
  ): SimPlayer | null {
    const team = this.teams[side];
    const ids = team.depth[slot] ?? [];
    const available = ids
      .map(id => team.players[id])
      .filter((p): p is SimPlayer => !!p && !p.out && !used.has(p));
    const first = available[depthIndex] ?? available[0];
    if (!first) return null;
    const next = available[depthIndex + 1];
    if (rotate && next) {
      const dev = team.rotation.devSnaps[next.id];
      if (dev && this.rng.chance(dev)) return next;
      const limit = team.rotation.snapLimits[first.id];
      if (limit !== undefined) {
        const unit = side === this.offense ? 'offense' : 'defense';
        const total = this.unitSnaps[side][unit];
        const played = this.line(side, first)[unit === 'offense' ? 'snapsOffense' : 'snapsDefense'];
        if (total >= C.snapLimitFrom && played >= limit * total) return next;
      }
    }
    // Rotation (spec 8.4, 12.3): a tired starter sits for a fresher backup. The defensive line rotates
    // sooner or later by the team's rotation setting.
    const group = POSITION_GROUP[first.position];
    const backup = next;
    const subAt =
      S.subAt[group] + (group === 'DL' ? (team.rotation.lineRotation - 0.5) * C.lineRotationSpread : 0);
    if (backup && first.energy < subAt && backup.energy > first.energy + K.subMargin) return backup;
    return first;
  }

  // ---------------------------------------------------------------------------------------------------
  // Clock and game flow

  private get margin(): number {
    return this.score[this.offense] - this.score[other(this.offense)];
  }

  private get fieldGoalPoints(): number {
    return this.setup.rules.points.fieldGoal;
  }

  /** The most a touchdown and a two-point try are worth: one score. */
  private get oneScore(): number {
    const points = this.setup.rules.points;
    return points.touchdown + points.twoPoint;
  }

  private get inRedZone(): boolean {
    return this.ball >= 100 - C.redZoneYards;
  }

  /** Timeouts for each overtime period, or each pair of playoff periods. */
  private get overtimeTimeouts(): number {
    const o = this.setup.rules.overtime;
    return this.setup.playoff ? o.playoffTimeouts : o.timeouts;
  }

  /** A regular-season overtime that can end in a tie is a single period (spec 16 rules). */
  private get singleOvertime(): boolean {
    return !this.setup.playoff && this.setup.rules.overtime.regularSeasonTies;
  }

  private get periodSeconds(): number {
    const rules = this.setup.rules;
    if (this.quarter <= 4) return rules.quarterSeconds;
    return this.setup.playoff ? rules.overtime.playoffSeconds : rules.overtime.regularSeasonSeconds;
  }

  /**
   * Whether this period's end ends a half, overtime, or the game: the second and fourth quarters, and in
   * overtime a single regular-season period or every second period of a longer one, which pair up like
   * quarters. The two-minute warning and end-of-half clock management apply only here.
   */
  private lateHalf(): boolean {
    if (this.quarter <= 4) return this.quarter === 2 || this.quarter === 4;
    return this.singleOvertime || (this.quarter - 4) % 2 === 0;
  }

  /** Seconds left in the half (or the pair of overtime periods). */
  private get halfSeconds(): number {
    return this.lateHalf() ? this.clock : this.clock + this.periodSeconds;
  }

  /** The last two minutes of the first half and the last five of the second: the clock stops more. */
  private lateWindow(): boolean {
    if (!this.lateHalf()) return false;
    return this.clock <= (this.quarter === 2 ? K.twoMinute : K.fiveMinutes);
  }

  private warningPending(): boolean {
    return this.setup.rules.twoMinuteWarning && this.lateHalf() && !this.warned && this.clock > K.twoMinute;
  }

  /**
   * Runs the game clock and credits the time to the offense. The two-minute warning stops it: at 2:00
   * between plays, or after a play that runs through 2:00. Returns false once the period's time is up.
   */
  private tick(raw: number, betweenPlays = false): boolean {
    const seconds = Math.round(raw);
    if (seconds <= 0 || this.clock <= 0) return this.clock > 0;
    const before = this.clock;
    if (this.warningPending() && this.clock - seconds <= K.twoMinute) {
      this.clock = betweenPlays ? K.twoMinute : Math.max(0, this.clock - seconds);
      this.warned = true;
      this.running = false;
    } else this.clock = Math.max(0, this.clock - seconds);
    const used = before - this.clock;
    if (this.drive) this.drive.seconds += used;
    this.totals[this.offense].timeOfPossession += used;
    return this.clock > 0;
  }

  private startDrive(team: Side): void {
    this.drive = {
      team,
      quarter: this.quarter,
      clock: this.clock,
      start: this.ball,
      plays: 0,
      yards: 0,
      seconds: 0
    };
    this.redZoneCounted = false;
  }

  private endDrive(result: DriveResult): void {
    const d = this.drive;
    if (!d) return;
    this.drives.push({
      team: this.teams[d.team].abbr,
      quarter: d.quarter,
      clock: d.clock,
      start: d.start,
      plays: d.plays,
      yards: d.yards,
      seconds: d.seconds,
      result
    });
    // Overtime counts finished possessions: both teams get one before sudden death (spec 16 rules).
    if (this.overtime) this.otPossessions[d.team]++;
    this.drive = null;
    this.redZoneCounted = false;
  }

  /** Gives the ball to a team at a yard line (from its own goal line), first and ten. */
  private possess(team: Side, ball: number): void {
    this.offense = team;
    this.ball = clamp(Math.round(ball), 1, 99);
    this.down = 1;
    this.distance = Math.min(this.setup.rules.yardsToGain, 100 - this.ball);
    this.startDrive(team);
  }

  private points(team: Side, points: number): void {
    this.score[team] += points;
    const q = Math.min(this.quarter, 5) - 1;
    const list = this.byQuarter[team];
    while (list.length <= q) list.push(0);
    list[q] = (list[q] ?? 0) + points;
    this.totals[team].points += points;
  }

  private scored(team: Side, kind: ScoringPlay['kind'], points: number, description: string): void {
    this.points(team, points);
    this.scoring.push({
      quarter: this.quarter,
      clock: this.clock,
      team: this.teams[team].abbr,
      kind,
      points,
      description,
      home: this.score.home,
      away: this.score.away
    });
  }

  /** Sets up a new half or overtime period: fresh clock, timeouts, and two-minute warning. */
  private newHalf(quarter: number, timeouts: number): void {
    this.quarter = quarter;
    this.clock = this.periodSeconds;
    this.warned = false;
    this.running = false;
    this.timeouts.home = this.timeouts.away = timeouts;
  }

  /**
   * The clock ran out in a period. Returns true when play goes on in the same half: a quarter break, where
   * the teams switch ends and the drive continues. Returns false after halftime, the start of overtime, a
   * new pair of overtime periods (each of which kicks off), or the end of the game.
   */
  private endPeriod(): boolean {
    const rules = this.setup.rules;
    const q = this.quarter;
    if (q === 1 || q === 3 || (q > 4 && !this.lateHalf())) {
      // The teams switch ends; the clock starts again on the snap.
      this.quarter++;
      this.clock = this.periodSeconds;
      this.running = false;
      return true;
    }
    if (q === 2) {
      this.endDrive('endOfHalf');
      this.halftime();
      this.newHalf(3, rules.timeoutsPerHalf);
      // The opening kickoff's receiver kicks to start the second half.
      this.kickoff(other(this.openingKicker));
      return false;
    }
    // The end of regulation, a single regular-season overtime, or a pair of longer overtime periods.
    if ((q === 4 && this.score.home !== this.score.away) || (q > 4 && this.singleOvertime)) {
      this.finish();
      return false;
    }
    this.endDrive('endOfHalf');
    // A possession cut off by the end of a pair of overtime periods counts as that team's possession.
    this.overtimeCheck();
    if (this.over) return false;
    if (q === 4) {
      this.overtime = true;
      // The line score's fifth entry holds overtime for both teams.
      for (const side of ['home', 'away'] as const)
        while (this.byQuarter[side].length < 5) this.byQuarter[side].push(0);
    }
    this.newHalf(q + 1, this.overtimeTimeouts);
    // A coin toss decides who receives (spec 16 rules).
    const receiver: Side = this.rng.chance(0.5) ? 'home' : 'away';
    this.kickoff(other(receiver));
    return false;
  }

  /**
   * Halftime adjustments (spec 8.6): each staff shifts its second-half pass rate toward whichever of
   * passing and running gained more per play, scaled by the head coach's adjustment skill.
   */
  private halftime(): void {
    for (const side of ['home', 'away'] as const) {
      const lines = Object.values(this.lines[side]);
      const sum = (k: StatKey) => lines.reduce((total, l) => total + l[k], 0);
      const dropbacks = sum('passAtt') + sum('sacked');
      const runs = sum('rushAtt');
      if (dropbacks < S.halftimeMinPlays || runs < S.halftimeMinPlays) continue;
      const gap =
        (sum('passYds') - sum('sackYds')) / dropbacks - sum('rushYds') / runs - S.halftimeNeutralGap;
      const skill = this.teams[side].coach.halftime / 100;
      this.adjust[side] = clamp(gap / S.halftimeScale, -1, 1) * S.halftimeShift * skill;
    }
  }

  /**
   * Overtime ends when the scores differ once both teams have had a possession, or at once on a defensive
   * score (spec 16 rules). Without the both-teams rule, an opening touchdown ends it too.
   */
  private overtimeCheck(scoring: { defensive?: boolean; touchdown?: boolean } = {}): void {
    if (!this.overtime || this.over || this.score.home === this.score.away) return;
    const both = this.otPossessions.home > 0 && this.otPossessions.away > 0;
    const sudden = !this.setup.rules.overtime.bothTeamsPossess && scoring.touchdown === true;
    if (both || scoring.defensive || sudden) this.finish();
  }

  private finish(): void {
    if (this.over) return;
    this.endDrive(this.quarter >= 4 ? 'endOfGame' : 'endOfHalf');
    this.over = true;
  }

  // ---------------------------------------------------------------------------------------------------
  // Personnel

  private personnel(): Personnel {
    const team = this.teams[this.offense];
    const t = team.tendencies.offense;
    const spread = team.plan.spread;
    const weights = (Object.keys(t.personnel) as Personnel[]).map(p => {
      const heavy = p === '12' || p === '13' || p === '21' || p === '22';
      // The game plan's personnel lean (spec 8.7).
      let w = t.personnel[p] * (heavy ? 1 - spread : 1 + spread);
      if (100 - this.ball <= C.goalLineYards && heavy) w *= C.goalLineHeavy;
      if ((this.down === 3 && this.distance >= C.longYardage) || this.hurry())
        w *= heavy ? C.passingDownHeavy : 1;
      return w;
    });
    return this.rng.weighted(Object.keys(t.personnel) as Personnel[], weights);
  }

  private defensePackage(personnel: Personnel): Package {
    const defense = this.teams[other(this.offense)];
    const t = defense.tendencies.defense;
    const heavy = personnel === '12' || personnel === '13' || personnel === '21' || personnel === '22';
    if (heavy && 100 - this.ball <= C.goalLineYards && this.rng.chance(C.goalLinePackage)) return 'goalLine';
    const receivers = 5 - Number(personnel[0]) - Number(personnel[1]);
    const factor = C.packageByReceivers[Math.min(4, Math.max(1, receivers)) as 1 | 2 | 3 | 4];
    // The game plan's package lean trades base snaps for nickel and dime snaps (spec 12.3).
    const lean = defense.plan.nickel;
    return this.rng.weighted<Package>(
      ['base', 'nickel', 'dime'],
      [
        t.packages.base * factor[0] * (1 - lean),
        t.packages.nickel * factor[1] * (1 + lean),
        t.packages.dime * factor[2] * (1 + lean)
      ]
    );
  }

  private fill(personnel: Personnel, pkg: Package): void {
    const off: OnField = new Map();
    const used = new Set<SimPlayer>();
    const offense = this.offense;
    const rb1Share = this.rb1Share(offense);
    const subs = this.teams[offense].rotation.subs;
    const shortYardage =
      100 - this.ball <= C.goalLineYards || (this.down >= 3 && this.distance <= C.shortYardageBack);
    const back =
      (shortYardage ? this.ready(offense, subs.goalLineBack, used) : null) ??
      (this.down >= 3 ? this.ready(offense, subs.thirdDownBack, used) : null);
    const redZone = this.inRedZone ? this.ready(offense, subs.redZoneTarget, used) : null;
    const redZoneSlot: Slot | null = redZone ? (redZone.position === 'TE' ? 'TE1' : 'SLOT') : null;
    for (const slot of PERSONNEL_SLOTS[personnel]) {
      // The lead back splits snaps with the change-of-pace back by the team's rotation (spec 12.3).
      const s: Slot = slot === 'RB1' && !this.rng.chance(rb1Share) ? 'RB2' : slot;
      // Situational subs (spec 12.3): the goal-line or third-down back, and a big target in the red zone.
      const sub =
        slot === 'RB1' && back && !used.has(back)
          ? back
          : s === redZoneSlot && redZone && !used.has(redZone)
            ? redZone
            : null;
      const p =
        sub ??
        (slot === 'QB'
          ? this.quarterback(offense, used)
          : (this.pick(offense, s, used, 0, true) ?? this.pick(offense, slot, used, 0, true)));
      if (p) {
        off.set(s, p);
        used.add(p);
      }
    }
    // A fourth receiver in 10 personnel or a third tight end in 13: the next one on the depth chart.
    const extra = EXTRA_SLOT[personnel];
    if (extra) {
      const p = this.pick(offense, extra, used);
      if (p) {
        off.set(`${extra}+` as Slot, p);
        used.add(p);
      }
    }
    const def: OnField = new Map();
    const dUsed = new Set<SimPlayer>();
    // In dime the team's dime linebacker, if it names one, is the lone linebacker (spec 12.3).
    const dimeBacker =
      pkg === 'dime'
        ? this.ready(other(offense), this.teams[other(offense)].rotation.subs.dimeBacker, dUsed)
        : null;
    for (const slot of PACKAGE_SLOTS[pkg]) {
      const p =
        slot === 'MIKE' && dimeBacker && !dUsed.has(dimeBacker)
          ? dimeBacker
          : this.pick(other(offense), slot, dUsed, 0, true);
      if (p) {
        def.set(slot, p);
        dUsed.add(p);
      }
    }
    // On passing downs a pass-rush specialist comes in for the weaker edge rusher (spec 12.3).
    const passingDown =
      (this.down === 2 && this.distance >= C.passRushDown.second) ||
      (this.down >= 3 && this.distance >= C.passRushDown.third);
    const rusher = passingDown
      ? this.ready(other(offense), this.teams[other(offense)].rotation.subs.passRusher, dUsed)
      : null;
    if (rusher) {
      const edges = (['LEDGE', 'REDGE'] as const).flatMap(slot => {
        const p = def.get(slot);
        return p ? [{ slot, p }] : [];
      });
      const weaker = edges.sort((a, b) => a.p.edges.passRush - b.p.edges.passRush)[0];
      if (weaker && weaker.p.edges.passRush < rusher.edges.passRush) {
        def.set(weaker.slot, rusher);
        dUsed.add(rusher);
      }
    }
    if (pkg === 'goalLine') {
      const p = this.pick(other(offense), 'DT1', dUsed);
      if (p) def.set(GOAL_LINE_EXTRA, p);
    }
    this.field = offense === 'home' ? { home: off, away: def } : { home: def, away: off };
  }

  /** Energy, snaps, and situation snap counts after a scrimmage play (spec 8.4). */
  private wear(): void {
    const w = this.setup.weather;
    const heat = w.indoor ? 0 : Math.max(0, w.tempF - K.heatAboveF) / K.heatScale;
    for (const side of ['home', 'away'] as const) {
      const team = this.teams[side];
      const onField = new Set(this.field[side].values());
      this.unitSnaps[side][side === this.offense ? 'offense' : 'defense']++;
      const hurry = side === this.offense && this.hurry() ? K.hurryFatigue : 0;
      const altitude = side !== 'home' && w.altitudeFt >= K.altitudeFt ? S.altitudeFatigue : 0;
      for (const p of Object.values(team.players)) {
        if (onField.has(p)) {
          const cost =
            S.fatigue[POSITION_GROUP[p.position]] *
            (S.staminaBase - p.stamina / 100) *
            (1 + heat * S.heatFatigue + hurry + altitude);
          p.energy = Math.max(0, p.energy - cost);
          this.line(side, p)[side === this.offense ? 'snapsOffense' : 'snapsDefense']++;
        } else p.energy = Math.min(100, p.energy + S.recovery);
      }
      if (this.setup.measure) {
        for (const slot of this.field[side].keys()) {
          const snaps = this.situations[side].snaps;
          snaps[slot] = (snaps[slot] ?? 0) + 1;
        }
      }
    }
    for (const [player, left] of this.returning) {
      if (left <= 1) {
        player.out = false;
        this.returning.delete(player);
      } else this.returning.set(player, left - 1);
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Decisions (spec 8.6)

  /** The two-minute offense: late in the first half, or late in the game while behind or tied. */
  private hurry(): boolean {
    if (!this.lateHalf()) return false;
    if (this.quarter === 2) return this.clock <= C.hurryHalfSeconds;
    if (this.margin < 0) return this.clock <= C.hurrySeconds;
    return this.margin === 0 && this.clock <= C.hurryHalfSeconds;
  }

  private milking(): boolean {
    return this.quarter >= 4 && this.lateHalf() && this.margin > 0 && this.clock <= C.milkSeconds;
  }

  /**
   * How hard a side protects its lead, 0 to 1 (spec 8.6 conservatism when leading): nothing before the
   * second half, in overtime, or with a one-score lead, then rising with the lead and the clock, scaled by
   * the head coach's conservatism.
   */
  private protecting(side: Side): number {
    if (this.quarter < 3 || this.quarter > 4) return 0;
    const lead = this.score[side] - this.score[other(side)];
    if (lead <= 0) return 0;
    const coach = this.teams[side].coach.conservatism / 50;
    // In the last minutes any lead is protected, a one-score lead included (the prevent defense).
    const late = this.quarter === 4 && this.clock <= C.preventSeconds ? C.preventLate : 0;
    if (lead <= C.protectFrom) return Math.min(1, late * coach);
    const size = Math.min(1, (lead - C.protectFrom) / C.protectRamp);
    const q = this.setup.rules.quarterSeconds;
    const progress = ((this.quarter - 3) * q + (q - this.clock)) / (2 * q);
    return Math.min(1, Math.max(late, size * (C.protectEarly + (1 - C.protectEarly) * progress)) * coach);
  }

  /**
   * How hard a side chases a deficit, 0 to 1 (game script): nothing in the first quarter, in overtime, or
   * within a field goal, then rising with the deficit and the clock.
   */
  private chasing(side: Side): number {
    if (this.quarter < 2 || this.quarter > 4) return 0;
    const deficit = this.score[other(side)] - this.score[side];
    if (deficit <= C.chaseFrom) return 0;
    const size = Math.min(1, (deficit - C.chaseFrom) / C.chaseRamp);
    const q = this.setup.rules.quarterSeconds;
    const progress = ((this.quarter - 2) * q + (q - this.clock)) / (3 * q);
    return size * (C.chaseEarly + (1 - C.chaseEarly) * progress);
  }

  private fgDistance(): number {
    return 100 - this.ball + C.fgSnapYards;
  }

  private kicker(side: Side): SimPlayer | null {
    return this.pick(side, 'K', new Set());
  }

  private fgRange(): boolean {
    const k = this.kicker(this.offense);
    const bonus = k ? k.edges.kickPower * C.rangePerPoint : 0;
    const w = this.setup.weather;
    const altitude = w.altitudeFt >= K.altitudeFt ? C.altitudeRange : 0;
    const wind = !w.indoor && w.windMph >= C.windRangeMph ? C.windRangeLoss : 0;
    return this.fgDistance() <= S.fgMaxDistance + bonus + altitude - wind;
  }

  /**
   * As a half or the game runs out, an offense in range plays for the last kick: always before halftime,
   * and at the end of the game (or overtime) when a field goal ties or wins it.
   */
  private wantsLastKick(): boolean {
    if (!this.lateHalf() || !this.fgRange()) return false;
    return this.quarter === 2 || (this.margin >= -this.fieldGoalPoints && this.margin <= 0);
  }

  /** Fourth down: go for it, kick a field goal, or punt (spec 8.3 step 2). */
  private fourthDown(): 'go' | 'fg' | 'punt' {
    const coach = this.teams[this.offense].coach;
    const late = this.quarter >= 4;
    const deficit = -this.margin;
    const range = this.fgRange();
    const seconds = this.halfSeconds;
    if (this.wantsLastKick() && this.clock <= C.endHalfFgSeconds) return 'fg';
    // Behind in overtime, a punt loses the game: kick only if a field goal ties or wins it.
    if (this.overtime && deficit > 0) return range && deficit <= this.fieldGoalPoints ? 'fg' : 'go';
    if (late && deficit > 0) {
      // Behind late: a field goal only helps if it ties or wins; otherwise keep the drive alive.
      if (range && deficit <= this.fieldGoalPoints) return 'fg';
      if (seconds <= C.desperationSeconds) return 'go';
      if (
        deficit > this.oneScore &&
        seconds <= C.desperationSeconds * 2 &&
        this.distance <= C.desperationYards
      )
        return 'go';
    }
    // Sudden death: any field goal wins.
    if (this.overtime && deficit === 0 && range && this.otPossessions.home > 0 && this.otPossessions.away > 0)
      return 'fg';
    const goal = 100 - this.ball;
    const index = this.distance <= 1 ? 0 : this.distance <= 2 ? 1 : this.distance <= 5 ? 2 : 3;
    const plus = this.ball >= 50;
    let go = (plus ? S.goRate : S.goRateOwnHalf)[index] as number;
    go *= C.goAggressionBase + (coach.aggressiveness / 100) * C.goAggressionSpread;
    if (late && this.margin > 0) go *= C.leadingGoFactor;
    if (goal <= this.distance && goal <= C.goalLineGoYards) go = Math.max(go, C.goalLineGo);
    if (this.rng.chance(clamp(go, 0, 1))) return 'go';
    if (!range) return 'punt';
    // Long tries depend on the kicker's leg; otherwise the coach punts to pin the other team deep.
    const distance = this.fgDistance();
    if (distance <= C.fgRoutine) return 'fg';
    const k = this.kicker(this.offense);
    const tryLong =
      1 - (distance - C.fgRoutine) * C.fgFadePerYard + (k ? k.edges.kickPower * C.fgPowerShare : 0);
    return this.rng.chance(clamp(tryLong, C.fgLongTry[0], C.fgLongTry[1])) ? 'fg' : 'punt';
  }

  /** Fakes a punt or field goal now and then on fourth and short (spec 8.6: coaching aggressiveness). */
  private fakes(kind: 'punt' | 'fg'): boolean {
    if (this.distance > C.fakeMaxDistance || this.lateWindow() || this.overtime) return false;
    // Never fake a kick that ties or wins the game.
    if (kind === 'fg' && this.quarter >= 4 && this.margin >= -this.fieldGoalPoints && this.margin <= 0)
      return false;
    const coach = this.teams[this.offense].coach;
    const base = kind === 'punt' ? C.fakePunt : C.fakeFieldGoal;
    return this.rng.chance(base * (C.goAggressionBase + (coach.aggressiveness / 100) * C.goAggressionSpread));
  }

  // ---------------------------------------------------------------------------------------------------
  // The snap

  private snap(): void {
    if (this.over) return;
    // An owed untimed down stays owed until a down is actually run.
    const owed = this.untimed;
    this.untimed = false;
    const off = this.offense;
    const def = other(off);
    this.contexts = this.currentContexts();
    if (this.inRedZone && !this.redZoneCounted) {
      this.redZoneCounted = true;
      this.totals[off].redZoneTrips++;
    }

    // End of a half or the game: kneel with the lead, or set up and take the last kick.
    if (this.shouldKneel()) return this.kneel();
    if (this.down === 4) {
      const choice = this.fourthDown();
      if (choice === 'punt') return this.fakes('punt') ? this.fakeKick() : this.punt();
      if (choice === 'fg') return this.fakes('fg') ? this.fakeKick() : this.fieldGoal();
    } else if (this.wantsLastKick()) {
      // With the clock stopped, kick when time is short (or after the spike, with no timeouts left); with it
      // running and no timeouts, spike it first.
      const noTimeouts = this.timeouts[off] === 0;
      const kickNow = this.clock <= (noTimeouts ? C.spikeSeconds : C.fgNowSeconds);
      if (!this.running && kickNow) return this.fieldGoal();
      if (this.running && this.clock <= C.spikeSeconds) {
        if (noTimeouts) return this.spike();
        this.timeout(off);
        return this.fieldGoal();
      }
    }

    const personnel = this.personnel();
    const pkg = this.defensePackage(personnel);
    this.fill(personnel, pkg);
    this.markStarters(off, def);
    const call = this.callPlay();
    const dcall = this.defenseCall();

    // Pre-snap fouls (spec 8.3 step 6): the play doesn't happen. A running clock restarts on the ready
    // signal, except late in a half, where it waits for the snap.
    if (this.preSnapFoul(off, def)) {
      this.untimed = owed;
      return this.nextSnap(!this.running || this.lateWindow());
    }

    const startBall = this.ball;
    const down = this.down;
    const distance = this.distance;
    this.running = true;
    this.buffer = [];
    const outcome = call.kind === 'pass' ? this.pass(call, dcall) : this.rush(call, dcall);
    this.plays++;
    this.wear();
    this.tick(this.playSeconds());

    const foul = this.liveFoul(call, outcome);
    const verdict = foul ? this.enforce(foul, outcome, startBall, down, distance) : 'stands';
    this.injuryCheck(outcome);
    // A period can't end on an accepted defensive foul: the offense gets an untimed down.
    if (foul && verdict !== 'stands' && foul.side === def && this.clock <= 0) this.untimed = true;
    // After an accepted foul the clock restarts on the ready signal, unless the play stopped it anyway
    // or it's late in a half.
    const foulStops = outcome.stops || this.lateWindow();
    if (verdict === 'wiped') {
      this.discard();
      if (this.down > 4) return this.turnoverOnDowns();
      return this.nextSnap(foulStops);
    }
    // Plays wiped by a penalty don't count as plays from scrimmage.
    this.totals[off].plays++;
    if (this.drive) this.drive.plays++;
    this.commit();
    if (verdict === 'added' && foul) {
      // The play stands; the personal foul adds its yardage from the end of it with a first down.
      this.ball = startBall + outcome.yards;
      if (this.drive) this.drive.yards += outcome.yards;
      const yards = this.enforceYards(this.setup.rules.penalties[foul.id].yards, false);
      this.ball = Math.min(99, this.ball + yards);
      if (this.drive) this.drive.yards += yards;
      this.firstDown('penalty');
      return this.nextSnap(foulStops);
    }
    this.apply(outcome, startBall, down, distance);
  }

  /** Players on the field for each unit's first snap started the game. */
  private markStarters(off: Side, def: Side): void {
    for (const [side, unit] of [
      [off, 'offense'],
      [def, 'defense']
    ] as const) {
      if (this.startersMarked[side][unit]) continue;
      this.startersMarked[side][unit] = true;
      for (const p of this.field[side].values()) this.line(side, p).started = 1;
    }
  }

  /**
   * A special teams unit (spec 9.2 special teams snaps): the specialists for the kick, then backups from
   * the depth chart who cover and block, eleven in all.
   */
  private specialUnit(
    side: Side,
    kind: 'kickoff' | 'kickReturn' | 'punt' | 'puntReturn' | 'fieldGoal' | 'block'
  ): SimPlayer[] {
    const team = this.teams[side];
    const first = (slot: Slot, n = 1) =>
      (team.depth[slot] ?? [])
        .map(id => team.players[id])
        .filter((p): p is SimPlayer => !!p && !p.out)
        .slice(0, n);
    const second = (slot: Slot) =>
      (team.depth[slot] ?? [])
        .slice(1)
        .map(id => team.players[id])
        .filter((p): p is SimPlayer => !!p && !p.out)
        .slice(0, 1);
    const core: SimPlayer[] =
      kind === 'kickoff'
        ? [...first('K'), ...first('GUNNER', 2)]
        : kind === 'punt'
          ? [...first('P'), ...first('LS'), ...first('GUNNER', 2)]
          : kind === 'kickReturn'
            ? first('KR', 2)
            : kind === 'puntReturn'
              ? first('PR')
              : kind === 'fieldGoal'
                ? [
                    ...first('K'),
                    ...first('P'),
                    ...first('LS'),
                    ...LINE.flatMap(s => first(s)),
                    ...first('TE1'),
                    ...first('TE2')
                  ]
                : [
                    ...FRONT.flatMap(s => first(s)),
                    ...first('MIKE'),
                    ...first('WILL'),
                    ...first('CB1'),
                    ...first('CB2'),
                    ...first('FS'),
                    ...first('SS')
                  ];
    const reserves: Slot[] = [
      'MIKE',
      'WILL',
      'FLEX',
      'SS',
      'FS',
      'CB2',
      'NCB',
      'TE2',
      'RB2',
      'SLOT',
      'LEDGE',
      'Z'
    ];
    const unit = [...new Set(core)];
    for (const slot of reserves) {
      if (unit.length >= 11) break;
      for (const p of second(slot)) if (!unit.includes(p) && unit.length < 11) unit.push(p);
    }
    return unit.slice(0, 11);
  }

  /** Special teams snaps for both units on a kick. */
  private kickSnaps(kicking: Side, kick: 'kickoff' | 'punt' | 'fieldGoal'): SimPlayer[] {
    const cover = this.specialUnit(kicking, kick);
    const other_ = other(kicking);
    const receive = this.specialUnit(
      other_,
      kick === 'kickoff' ? 'kickReturn' : kick === 'punt' ? 'puntReturn' : 'block'
    );
    for (const p of cover) this.line(kicking, p).snapsSpecial++;
    for (const p of receive) this.line(other_, p).snapsSpecial++;
    return cover;
  }

  /** A coverage player makes the tackle on a return. */
  private coverTackle(kicking: Side, cover: readonly SimPlayer[]): void {
    const tacklers = cover.filter(p => p.position !== 'K' && p.position !== 'P');
    const who = tacklers[Math.floor(this.rng.float() * tacklers.length)];
    if (who) {
      this.add(kicking, who, 'soloTackles');
      this.add(kicking, who, 'tackles');
    }
  }

  /** Game seconds a scrimmage play takes. */
  private playSeconds(): number {
    return K.playSeconds[0] + this.rng.float() * (K.playSeconds[1] - K.playSeconds[0]);
  }

  private currentContexts(): ContextTrigger[] {
    const out: ContextTrigger[] = [];
    if (this.inRedZone) out.push('redZone');
    if (this.down === 3) out.push('thirdDown');
    if (this.lateHalf() && this.clock <= K.twoMinute) out.push('twoMinute');
    if (this.quarter >= 4 && Math.abs(this.margin) <= this.oneScore) out.push('lateAndClose');
    if (this.bad) out.push('badWeather');
    return out;
  }

  /** Between-snap seconds for an offense protecting a lead: toward the whole play clock. */
  private slowed(runoff: number): number {
    return runoff + (this.fullRunoff - runoff) * this.protecting(this.offense);
  }

  /** Seconds the offense lets run between snaps when it wants the clock to run: nearly the whole play clock. */
  private get fullRunoff(): number {
    return this.setup.rules.playClock - K.playClockMargin;
  }

  /**
   * Victory formation: with the lead late in the game when kneeling runs out the clock, or at the end of
   * the first half in the offense's own territory. Each kneel takes a couple of seconds, and the clock runs
   * the play clock between them unless the defense stops it with a timeout or the two-minute warning does.
   */
  private shouldKneel(): boolean {
    if (this.down > 4) return false;
    if (this.quarter === 2) return this.clock <= C.kneelHalfSeconds && this.ball < 50 && this.down < 4;
    if (this.quarter < 4 || !this.lateHalf() || this.margin <= 0) return false;
    const stops = this.timeouts[other(this.offense)] + (this.warningPending() ? 1 : 0);
    const kneels = 5 - this.down;
    const canBurn = kneels * K.kneelPlaySeconds + Math.max(0, kneels - 1 - stops) * this.fullRunoff;
    return this.clock <= canBurn;
  }

  private kneel(): void {
    const off = this.offense;
    const qb = this.quarterback(off);
    this.plays++;
    this.totals[off].plays++;
    if (this.drive) this.drive.plays++;
    this.add(off, qb, 'rushAtt');
    this.add(off, qb, 'rushYds', -1);
    this.ball = Math.max(1, this.ball - 1);
    this.down++;
    this.distance++;
    if (this.drive) this.drive.yards -= 1;
    this.running = true;
    this.tick(K.kneelPlaySeconds);
    if (this.down > 4 && this.clock > 0) return this.turnoverOnDowns();
    this.nextSnap(false);
  }

  /** Spikes the ball to stop the clock: an incomplete pass that costs a down. */
  private spike(): void {
    const off = this.offense;
    const qb = this.quarterback(off);
    this.plays++;
    this.totals[off].plays++;
    if (this.drive) this.drive.plays++;
    this.add(off, qb, 'passAtt');
    this.down++;
    this.running = true;
    this.tick(K.spikePlaySeconds);
    this.nextSnap(true);
  }

  /**
   * A fake punt or field goal: the up back or holder runs for it (credited to the punter, who holds for
   * kicks). It converts at the tuning rate; a stop turns the ball over on downs.
   */
  private fakeKick(): void {
    const off = this.offense;
    const runner = this.pick(off, 'P', new Set()) ?? this.quarterback(off);
    const start = this.ball;
    const down = this.down;
    const distance = this.distance;
    this.plays++;
    this.totals[off].plays++;
    if (this.drive) this.drive.plays++;
    const converted = this.rng.chance(C.fakeSuccess);
    const extra = Math.round(-Math.log(1 - this.rng.float()) * C.fakeExtraYards);
    const yards = Math.min(
      100 - start,
      converted ? distance + extra : Math.floor(this.rng.float() * distance)
    );
    this.add(off, runner, 'rushAtt');
    this.add(off, runner, 'rushYds', yards);
    this.long(off, runner, 'rushLong', yards);
    this.running = true;
    this.tick(this.playSeconds());
    this.apply(
      {
        yards, stops: false, turnover: null, returnYards: 0, sack: false, kind: 'run', incomplete: false, air: 0,
        ballCarrier: runner, passer: null, tackler: null, covering: null, pressured: false, throwAway: false,
        description: `Fake ${runner?.short ?? 'kick'} runs for ${yards}`
      },
      start,
      down,
      distance
    ); // prettier-ignore
  }

  private callPlay(): Call {
    const team = this.teams[this.offense];
    const t = team.tendencies.offense;
    let pass =
      t.passRate[DOWN_BUCKETS(this.down, this.distance)] +
      S.passRateShift +
      team.lean +
      team.plan.passLean +
      this.adjust[this.offense];
    const goal = 100 - this.ball;
    const deficit = -this.margin;
    if (this.quarter >= 4 && deficit > this.fieldGoalPoints && this.clock <= C.lateTrailingSeconds)
      pass = Math.max(pass, C.lateTrailingPass);
    else if (this.quarter >= 4 && deficit > 0 && this.clock <= C.hurrySeconds)
      pass = Math.max(pass, C.lateTrailingPass);
    if (this.milking()) pass *= C.leadingRunShift;
    else pass *= 1 - C.protectPassCut * this.protecting(this.offense);
    pass += (1 - pass) * C.chaseShift * this.chasing(this.offense);
    if (this.quarter === 2 && this.clock <= C.hurryHalfSeconds) pass = Math.max(pass, C.twoMinutePass);
    if (goal <= C.goalLineYards) pass *= C.goalLinePass;
    const w = this.setup.weather;
    const impact = this.setup.sliders.general.weatherImpact;
    if (w.precipitation !== 'none') pass *= 1 - (1 - C.wetPassShift) * impact;
    if (w.windMph >= C.windyMph) pass *= 1 - (1 - C.windyPassShift) * impact;
    const pv = this.output('passingVolume');
    const rv = this.output('rushingVolume');
    pass = clamp((pass * pv) / (pass * pv + (1 - pass) * rv), 0.02, 0.98);
    if (this.rng.chance(pass)) {
      let deep = t.deepShots * (this.quarter >= 4 && deficit > 7 ? C.deepLateBoost : 1);
      if (this.down === 3 && this.distance <= C.shortYardage) deep *= C.deepShortYardage;
      if (goal < C.deepShotRoom) deep = 0;
      const screen =
        this.down === 3 && this.distance >= C.longYardage ? t.screen * C.screenThirdLong : t.screen;
      // On third and fourth down with room to go, more throws go past the line to gain.
      const sticks =
        this.down >= 3 && this.distance >= C.sticksFrom
          ? C.sticksShift * Math.min(1, (this.distance - C.sticksFrom + 1) / C.sticksRamp)
          : 0;
      const r = this.rng.float();
      const depth: Depth =
        r < screen
          ? 'screen'
          : r < screen + deep
            ? 'deep'
            : r < screen + deep + TUNING.situations.intermediateShare + sticks
              ? 'intermediate'
              : 'short';
      const playAction =
        this.down <= 2 && !this.hurry() && depth !== 'screen' && this.rng.chance(t.playAction);
      return { kind: 'pass', depth, playAction };
    }
    const concepts = Object.keys(t.runConcepts) as RunConcept[];
    const concept = this.rng.weighted(
      concepts,
      concepts.map(c => t.runConcepts[c])
    );
    return { kind: 'run', concept, qbRun: this.rng.chance(t.qbRuns) };
  }

  private defenseCall(): DefenseCall {
    const defense = this.teams[other(this.offense)];
    const t = defense.tendencies.defense;
    const plan = defense.plan;
    // A defense protecting a lead plays soft and rarely blitzes.
    const soft = this.protecting(other(this.offense));
    const blitz = this.rng.chance(
      t.blitz * plan.blitz * (this.down === 3 ? C.blitzThirdDown : 1) * (1 - soft)
    );
    const shells = Object.keys(t.shells) as Shell[];
    return {
      man: this.rng.chance(clamp(t.man + plan.man, 0, 1)),
      // The game plan's shell lean: two-high shells against single-high (spec 8.7).
      shell: this.rng.weighted(
        shells,
        shells.map(s => t.shells[s] * (TWO_HIGH.includes(s) ? 1 + plan.twoHigh : 1 - plan.twoHigh))
      ),
      blitz,
      simPressure: !blitz && this.rng.chance(t.simPressure * (1 - soft)),
      soft
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // Pass plays

  private rushersAndBlockers(dcall: DefenseCall): {
    rushers: [Slot, SimPlayer][];
    blockers: [Slot, SimPlayer][];
  } {
    const off = this.offense;
    const def = other(off);
    const front3 = this.teams[def].tendencies.defense.front === 3;
    const rushers: [Slot, SimPlayer][] = [];
    for (const slot of FRONT) {
      const p = this.at(def, slot);
      if (!p) continue;
      if (slot === 'FLEX' && !front3) continue;
      rushers.push([slot, p]);
    }
    const blitzers: DefenseSlot[] = dcall.blitz
      ? ['MIKE', 'WILL', 'NCB', 'SS']
      : dcall.simPressure
        ? ['MIKE']
        : [];
    for (const slot of blitzers) {
      const p = this.at(def, slot);
      if (p && rushers.length < (dcall.blitz ? C.blitzRushers : C.baseRushers) + 1) rushers.push([slot, p]);
    }
    if (dcall.simPressure && rushers.length > C.baseRushers) rushers.shift();
    const blockers: [Slot, SimPlayer][] = [];
    for (const slot of LINE) {
      const p = this.at(off, slot);
      if (p) blockers.push([slot, p]);
    }
    for (const slot of ['TE1', 'RB1', 'RB2', 'FB'] as const) {
      const p = this.at(off, slot);
      const stays =
        slot === 'TE1'
          ? 1 - TUNING.situations.routeShare.TE1
          : slot === 'RB1' || slot === 'RB2'
            ? 1 - TUNING.situations.routeShare.RB1
            : 1;
      if (p && this.rng.chance(stays * (dcall.blitz ? C.blitzPickup : 1))) blockers.push([slot, p]);
    }
    return { rushers, blockers };
  }

  private pass(call: PassCall, dcall: DefenseCall): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    const qb = this.at(off, 'QB');
    const base: PlayOutcome = {
      yards: 0, stops: true, turnover: null, returnYards: 0, sack: false, kind: 'pass', incomplete: true, air: 0,
      ballCarrier: null, passer: qb, tackler: null, covering: null, pressured: false, throwAway: false, description: 'pass incomplete'
    }; // prettier-ignore
    if (!qb) return base;
    const { rushers, blockers } = this.rushersAndBlockers(dcall);
    for (const [slot] of blockers)
      this.note(off, slot, 'passRush', ...(dcall.blitz ? (['facingBlitz'] as const) : []));
    for (const [slot] of rushers) this.note(def, slot, 'passRush');
    // Everyone else is in a route or in coverage against man or zone (spec 7.5 situations).
    const coverTrigger: PlayTrigger = dcall.man ? 'versusMan' : 'versusZone';
    const rushing = new Set(rushers.map(([, p]) => p));
    const blocking = new Set(blockers.map(([, p]) => p));
    for (const [slot, p] of this.field[def])
      if (!rushing.has(p)) this.note(def, slot, 'coverage', coverTrigger);
    for (const [slot, p] of this.field[off])
      if (slot !== 'QB' && !blocking.has(p) && !LINE.includes(slot as OffenseSlot))
        this.note(off, slot, coverTrigger);
    this.note(
      off,
      'QB',
      'dropback',
      ...(dcall.blitz ? (['facingBlitz'] as const) : []),
      ...(call.playAction ? (['playAction'] as const) : [])
    );
    // A pass rusher the game plan doubles gets chipped on the way in; a spy on the quarterback is one fewer
    // man in the rush (spec 8.7 player focus).
    const chipped = this.teams[off].plan.doubleRusher;
    const spy = this.teams[def].plan.spy;
    // The rush is as strong as its best four: a blitzer adds a man to block (blitzPressure) without
    // watering down the rating of the rush.
    const rushEdges = rushers
      .map(
        ([slot, p]) => this.edge(def, p, slot, 'passRush', ['passRush']) - (p.id === chipped ? C.chipRush : 0)
      )
      .sort((a, b) => b - a)
      .slice(0, C.baseRushers);
    const rush = rushEdges.reduce((sum, e) => sum + e, 0) / Math.max(1, rushEdges.length);
    const block =
      blockers.reduce(
        (sum, [slot, p]) =>
          sum +
          this.edge(off, p, slot, 'passBlock', [
            'passRush',
            ...(dcall.blitz ? (['facingBlitz'] as const) : [])
          ]),
        0
      ) / Math.max(1, blockers.length);
    const cohesion = this.teams[off].cohesion.offense.execution * this.setup.sliders.general.cohesionEffect;
    const blitzEdge = dcall.blitz ? S.blitzPressure : dcall.simPressure ? S.simPressure : 0;
    const passBlockSlider = this.slider(off, 'passBlocking');
    let pPressure = sigmoid(
      logit(S.pressureBase) +
        S.edge.pressure * (rush - block) +
        blitzEdge -
        cohesion * C.cohesionLogit -
        (passBlockSlider - 1) * C.sliderLogit -
        dcall.soft * C.softPressureLogit -
        (spy ? C.spyPressure : 0)
    );
    if (call.depth === 'screen') pPressure *= C.screenPressure;
    if (call.playAction) pPressure *= C.playActionPressure;
    const pressured = this.rng.chance(pPressure);
    const qbSlot: Slot = 'QB';
    const triggers: PlayTrigger[] = ['dropback', ...(dcall.blitz ? (['facingBlitz'] as const) : [])];

    if (pressured) {
      const escape =
        this.edge(off, qb, qbSlot, 'escape', triggers) * 0.5 +
        this.edge(off, qb, qbSlot, 'poise', triggers) * 0.5;
      const sense = qb.traits.sensePressure;
      const senseLogit = C.senseSack[sense];
      const pSack = sigmoid(logit(S.sackGivenPressure) - S.edge.sack * escape + senseLogit);
      // The rusher who got there and the blocker he beat (spec 9.2 pressures and pressures allowed).
      const rusher = this.bestOf(rushers, def, 'passRush');
      const beaten = this.worstOf(blockers, off, 'passBlock');
      this.add(off, qb, 'pressured');
      this.add(def, rusher, 'pressures');
      this.add(off, beaten, 'pressuresAllowed');
      if (this.rng.chance(pSack)) {
        this.add(off, beaten, 'sacksAllowed');
        return this.sack(qb, rusher, base);
      }
      if (this.rng.chance(C.hitShare)) this.add(def, rusher, 'qbHits');
      const scrambleP =
        (S.scrambleGivenPressure +
          S.scrambleTendency *
            this.teams[off].tendencies.offense.scramble *
            (qb.traits.qbStyle === 'scrambling'
              ? C.scramblerFactor
              : qb.traits.qbStyle === 'pocket'
                ? C.pocketFactor
                : 1)) *
        (spy ? C.spyScramble : 1);
      if (this.rng.chance(scrambleP)) return this.scramble(qb, base);
      const throwAway =
        S.throwAwayGivenPressure +
        (qb.traits.throwAway ? S.throwAwayTrait : 0) +
        (sense === 'paranoid' ? C.paranoidThrowAway : 0);
      if (this.rng.chance(throwAway)) {
        this.add(off, qb, 'passAtt');
        this.add(off, qb, 'throwAways');
        return { ...base, pressured: true, throwAway: true, description: `${qb.short} throws it away` };
      }
    }
    return this.throwBall(call, dcall, qb, pressured, base);
  }

  private bestOf(players: [Slot, SimPlayer][], side: Side, id: CompositeId): SimPlayer | null {
    if (!players.length) return null;
    const weights = players.map(([slot, p]) => Math.exp(this.edge(side, p, slot, id) / C.creditSpread));
    return (players[this.rng.weightedIndex(weights)] as [Slot, SimPlayer])[1];
  }

  /** The player most likely to have lost his matchup: weighted toward the weakest edge. */
  private worstOf(players: [Slot, SimPlayer][], side: Side, id: CompositeId): SimPlayer | null {
    if (!players.length) return null;
    const weights = players.map(([slot, p]) => Math.exp(-this.edge(side, p, slot, id) / C.creditSpread));
    return (players[this.rng.weightedIndex(weights)] as [Slot, SimPlayer])[1];
  }

  /**
   * Credits a tackle (spec 9.2): solo, or shared with a teammate from `helpers` who was in on the play, in
   * which case both get an assist.
   */
  private tackle(side: Side, tackler: SimPlayer | null, helpers: readonly Slot[] = []): void {
    if (!tackler) return;
    const others = helpers.flatMap(slot => {
      const p = this.at(side, slot);
      return p && p !== tackler ? [p] : [];
    });
    const helper =
      others.length && this.rng.chance(C.assistShare)
        ? (others[Math.floor(this.rng.float() * others.length)] as SimPlayer)
        : null;
    for (const p of helper ? [tackler, helper] : [tackler]) {
      this.add(side, p, helper ? 'assistedTackles' : 'soloTackles');
      this.add(side, p, 'tackles');
    }
  }

  /** Yards a carrier gains before first contact; the rest of the run comes after contact (spec 9.2). */
  private beforeContact(yards: number, blocking: number): number {
    if (yards <= 0) return yards;
    const mean = Math.max(0.2, C.contactYards + blocking * C.contactPerPoint);
    return Math.min(yards, Math.round(-Math.log(1 - this.rng.float()) * mean));
  }

  private sack(qb: SimPlayer, rusher: SimPlayer | null, base: PlayOutcome): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    const yards = -Math.min(
      this.ball - 0,
      Math.round(
        C.sackYards[0] +
          this.rng.float() * (C.sackYards[1] - C.sackYards[0]) +
          this.rng.normal(0, C.sackSpread)
      )
    );
    this.add(off, qb, 'sacked');
    this.add(off, qb, 'sackYds', -yards);
    this.add(def, rusher, 'sacks');
    this.add(def, rusher, 'qbHits');
    this.add(def, rusher, 'tacklesForLoss');
    this.tackle(def, rusher);
    const strip = this.rng.chance(C.stripSack * this.slider(off, 'fumbles') * this.output('turnovers'));
    if (strip) {
      this.add(off, qb, 'fumbles');
      this.add(def, rusher, 'forcedFumbles');
      if (this.rng.chance(C.stripLost)) {
        this.add(off, qb, 'fumblesLost');
        this.add(def, rusher, 'fumbleRecoveries');
        return {
          ...base,
          yards,
          sack: true,
          incomplete: false,
          turnover: 'fumble',
          returnYards: this.turnoverReturn(C.fumbleReturnMean),
          stops: true,
          tackler: rusher,
          description: `${qb.short} sacked and fumbles`
        };
      }
    }
    return {
      ...base,
      yards,
      sack: true,
      incomplete: false,
      stops: false,
      tackler: rusher,
      pressured: true,
      description: `${qb.short} sacked for ${-yards}`
    };
  }

  private scramble(qb: SimPlayer, base: PlayOutcome): PlayOutcome {
    const off = this.offense;
    this.note(off, 'QB', 'outsidePocket', 'carry');
    const burst = this.edge(off, qb, 'QB', 'burst', ['outsidePocket', 'carry']);
    const mean = Math.max(C.scrambleMin, S.scrambleMean + burst * C.scrambleBurst);
    const yards = Math.min(
      100 - this.ball,
      Math.max(
        C.scrambleFloor,
        Math.round(this.rng.normal(0, C.scrambleSpread) + -Math.log(1 - this.rng.float()) * mean)
      )
    );
    this.add(off, qb, 'rushAtt');
    this.add(off, qb, 'rushYds', yards);
    this.long(off, qb, 'rushLong', yards);
    this.add(off, qb, 'rushYac', Math.max(0, yards - this.beforeContact(yards, 0)));
    if (yards >= C.bigRun) this.add(off, qb, 'rush10');
    const tackler = this.tacklerFor(['MIKE', 'WILL', 'SS', 'FS', 'LEDGE', 'REDGE']);
    if (this.ball + yards < 100) this.tackle(other(off), tackler, ['MIKE', 'WILL', 'SS', 'FS']);
    const oob = this.rng.chance(C.scrambleOutOfBounds);
    return {
      ...base,
      yards,
      kind: 'run',
      incomplete: false,
      stops: oob && this.lateWindow(),
      ballCarrier: qb,
      tackler,
      pressured: true,
      description: `${qb.short} scrambles for ${yards}`
    };
  }

  private tacklerFor(slots: readonly DefenseSlot[]): SimPlayer | null {
    const def = other(this.offense);
    const players = slots.flatMap(s => {
      const p = this.at(def, s);
      return p ? [[s, p] as [Slot, SimPlayer]] : [];
    });
    // Tackles spread across the pursuit more evenly than pass rush wins do.
    const weights = players.map(([slot, p]) => Math.exp(this.edge(def, p, slot, 'tackle') / C.tackleSpread));
    return players.length ? (players[this.rng.weightedIndex(weights)] as [Slot, SimPlayer])[1] : null;
  }

  private throwBall(
    call: PassCall,
    dcall: DefenseCall,
    qb: SimPlayer,
    pressured: boolean,
    base: PlayOutcome
  ): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    const t = this.teams[off].tendencies.offense;
    const offPlan = this.teams[off].plan;
    const defPlan = this.teams[def].plan;
    // Receivers running routes, and who covers each (spec 8.3 step 5: target selection).
    const routes: { slot: Slot; tslot: TargetSlot | 'EXTRA'; player: SimPlayer; share: number }[] = [];
    for (const [slot, player] of this.field[off]) {
      const tslot = slot.endsWith('+') ? 'EXTRA' : (slot as TargetSlot);
      if (!(tslot in COVERAGE)) continue;
      const share = (tslot === 'EXTRA' ? t.targets.SLOT : t.targets[tslot]) + C.minTargetShare;
      // The game plan's featured player draws a bigger share of the looks (spec 8.7).
      routes.push({
        slot,
        tslot,
        player,
        share: share * (player.id === offPlan.feature ? 1 + C.featureTargets : 1)
      });
    }
    if (!routes.length) return base;
    const back = (tslot: TargetSlot | 'EXTRA') => tslot === 'RB1' || tslot === 'RB2' || tslot === 'FB';
    const coverTrig: PlayTrigger = dcall.man ? 'versusMan' : 'versusZone';
    const depthTrig: PlayTrigger = call.depth === 'deep' ? 'deepPass' : 'shortPass';
    const routeId: CompositeId =
      call.depth === 'deep' ? 'routeDeep' : call.depth === 'intermediate' ? 'routeMid' : 'routeShort';
    const matchups = new Map<SimPlayer, DefenseSlot | null>(
      routes.map(r => [r.player, COVERAGE[r.tslot].find(s => this.at(def, s)) ?? null])
    );
    // A shadow corner follows his man, and whoever that corner would have covered takes the shadowed
    // receiver's usual defender (spec 8.7).
    const shadowed = routes.find(r => r.player.id === defPlan.shadow)?.player;
    if (shadowed && this.at(def, 'CB1') && matchups.get(shadowed) !== 'CB1') {
      const swap = [...matchups].find(([, s]) => s === 'CB1')?.[0];
      if (swap) matchups.set(swap, matchups.get(shadowed) ?? null);
      matchups.set(shadowed, 'CB1');
    }
    const doubled = routes.some(r => r.player.id === defPlan.doubleReceiver);
    const scored = routes.map(r => {
      const defSlot = matchups.get(r.player) ?? null;
      const defender = defSlot ? this.at(def, defSlot) : null;
      const route = this.edge(off, r.player, r.slot, routeId, [coverTrig, depthTrig]);
      const cover =
        defender && defSlot
          ? this.edge(def, defender, defSlot, dcall.man ? 'manCover' : 'zoneCover', [
              coverTrig,
              depthTrig,
              'coverage'
            ])
          : -C.uncovered;
      const pressRate = clamp(this.teams[def].tendencies.defense.press + defPlan.press, 0, 1);
      const press =
        dcall.man && defender && this.rng.chance(pressRate)
          ? C.pressWeight * (r.player.edges.routeShort - defender.edges.manCover)
          : 0;
      // Safety help on a doubled receiver leaves a little more room for everyone else.
      const help = !doubled
        ? 0
        : r.player.id === defPlan.doubleReceiver
          ? -C.doubleSeparation
          : C.doubleOthers;
      // A back who chips a pass rusher gets into his route late.
      const chip = offPlan.doubleRusher && back(r.tslot) ? -C.chipRoute : 0;
      const reaction = (this.slider(def, 'passDefenseReaction') - 1) * C.sliderPoints;
      const sep =
        route -
        cover -
        reaction +
        press +
        (call.playAction ? C.playActionSeparation : 0) +
        (dcall.blitz ? C.blitzSeparation : 0) +
        (back(r.tslot) ? C.backfieldSeparation : 0) +
        help +
        chip -
        this.teams[def].cohesion.defense.execution * C.cohesionSeparation;
      return { ...r, defender, defSlot, sep };
    });
    const depthFavor = (tslot: TargetSlot | 'EXTRA') =>
      call.depth === 'deep'
        ? (C.deepFavor[tslot] ?? 1)
        : call.depth === 'screen'
          ? (C.screenFavor[tslot] ?? 1)
          : 1;
    // Under pressure the quarterback checks the ball down to his backs.
    const weights = scored.map(
      r =>
        r.share *
        depthFavor(r.tslot) *
        (pressured && back(r.tslot) ? C.checkdownFavor : 1) *
        Math.exp(r.sep * C.openness)
    );
    const target = scored[this.rng.weightedIndex(weights)] as (typeof scored)[number];
    const rec = target.player;
    const defender = target.defender;
    this.note(off, target.slot, 'target', depthTrig);
    this.note(off, 'QB', depthTrig);
    if (target.defSlot) this.note(def, target.defSlot, depthTrig);
    // Deep safeties are in on every deep ball: the free safety always, the strong safety in two-high shells.
    if (call.depth === 'deep') {
      if (target.defSlot !== 'FS') this.note(def, 'FS', 'deepPass');
      const twoHigh = dcall.shell === 'cover2' || dcall.shell === 'cover4' || dcall.shell === 'cover6';
      if (twoHigh && target.defSlot !== 'SS') this.note(def, 'SS', 'deepPass');
    }
    this.add(off, qb, 'passAtt');
    this.add(off, rec, 'targets');
    this.add(def, defender, 'targetsAllowed');
    // Intended air yards, measured to the target whether or not the pass is caught (spec 9.2).
    const air = Math.min(100 - this.ball, this.airYards(call.depth));
    this.add(off, qb, 'passAirYds', air);

    // Throw quality and interception chance (spec 8.3: accuracy by depth, under pressure, on the run).
    const accId: CompositeId =
      call.depth === 'deep' ? 'accDeep' : call.depth === 'intermediate' ? 'accMid' : 'accShort';
    const qbTriggers: PlayTrigger[] = [
      'dropback',
      depthTrig,
      ...(pressured ? (['facingBlitz'] as const) : [])
    ];
    // Play-action bootlegs move the quarterback out of the pocket to throw on the run.
    const bootleg =
      call.playAction &&
      this.rng.chance(C.bootlegShare + C.bootlegPerOutsideZone * t.runConcepts.outsideZone);
    if (bootleg) {
      qbTriggers.push('outsidePocket');
      this.note(off, 'QB', 'outsidePocket');
    }
    const acc =
      (bootleg
        ? (this.edge(off, qb, 'QB', accId, qbTriggers) + this.edge(off, qb, 'QB', 'onRun', qbTriggers)) / 2
        : this.edge(off, qb, 'QB', accId, qbTriggers)) +
      (pressured ? this.edge(off, qb, 'QB', 'poise', qbTriggers) * C.poiseWeight : 0);
    const weather = this.setup.weather;
    const impact = this.setup.sliders.general.weatherImpact;
    const wetLogit =
      weather.precipitation !== 'none' ? S.wetPassLogit * impact : weather.indoor ? S.indoorPassLogit : 0;
    // Wind hurts every throw, the long ones most (spec 17.2).
    const windLogit =
      S.windPassLogitPerMph * C.windDepth[call.depth] * Math.max(0, weather.windMph - C.calmMph) * impact;
    const depthKey = call.depth;
    const decision = this.edge(off, qb, 'QB', 'decision', qbTriggers);
    const hawk =
      defender && target.defSlot
        ? this.edge(def, defender, target.defSlot, 'ballHawk', [coverTrig, depthTrig])
        : 0;
    const aggressive =
      qb.traits.forcesPasses === 'aggressive'
        ? S.interceptionAggressive
        : qb.traits.forcesPasses === 'conservative'
          ? -S.interceptionAggressive
          : 0;
    const playsBall = defender?.traits.playsBall === 'aggressive' ? C.playsBallLogit : 0;
    const pInt =
      sigmoid(
        logit(S.interception[depthKey]) +
          S.edge.interception * (hawk - decision) +
          (pressured ? S.interceptionPressure : 0) +
          aggressive +
          playsBall -
          target.sep * C.intSeparation
      ) *
      this.slider(def, 'interceptions') *
      this.output('turnovers');
    if (this.rng.chance(pInt) && defender) return this.interception(qb, rec, defender, base, air);

    const hands = this.edge(off, rec, target.slot, target.sep < C.contestedSep ? 'contested' : 'hands', [
      depthTrig,
      ...(target.sep < C.contestedSep ? (['contestedCatch'] as const) : []),
      'target'
    ]);
    if (target.sep < C.contestedSep) {
      this.note(off, target.slot, 'contestedCatch');
      if (target.defSlot) this.note(def, target.defSlot, 'contestedCatch');
    }
    const pComplete =
      sigmoid(
        logit(S.completion[depthKey]) + S.edge.completion * acc + S.edge.separation * target.sep + C.handsWeight * hands +
          (pressured ? S.pressureCompletion : 0) +
          (this.inRedZone ? C.redZoneCompletion + (this.output('scoring') - 1) * C.sliderLogit : 0) +
          wetLogit + windLogit + (call.playAction ? C.playActionLogit : 0) +
          dcall.soft * (call.depth === 'deep' ? -C.softDeepLogit : C.softShortLogit) +
          (this.slider(off, 'qbAccuracy') - 1) * C.sliderLogit + (this.slider(off, 'wrCatching') - 1) * C.sliderLogit -
          (this.slider(def, 'passCoverage') - 1) * C.sliderLogit + (this.output('passingEfficiency') - 1) * C.sliderLogit
      ); // prettier-ignore
    if (!this.rng.chance(pComplete)) {
      // A drop is on the receiver; the rest are misses or breakups.
      const drops =
        S.dropShare *
        (rec.traits.dropsOpenPasses ? C.dropsTrait : 1) *
        (weather.precipitation !== 'none' ? C.wetDrops : 1);
      if (this.rng.chance(drops)) {
        this.add(off, rec, 'drops');
        this.add(off, qb, 'passDrops');
      } else if (defender && this.rng.chance(C.breakupShare)) this.add(def, defender, 'passesDefended');
      return {
        ...base,
        air,
        covering: defender,
        description: `${qb.short} pass incomplete to ${rec.short}`
      };
    }

    // Completion: air yards, then yards after the catch against the tackle (spec 8.3 step 5).
    const goal = 100 - this.ball;
    const elusive =
      this.edge(off, rec, target.slot, 'elusive', ['openField']) * 0.5 +
      this.edge(off, rec, target.slot, 'burst', ['openField', depthTrig]) * 0.5;
    const tacklerSlot = target.defSlot ?? 'FS';
    const tacklePlayer = this.at(def, tacklerSlot) ?? defender;
    const tackle = tacklePlayer ? this.edge(def, tacklePlayer, tacklerSlot, 'tackle', ['openField']) : 0;
    const yacMean = Math.max(
      C.yacFloor,
      S.yac[depthKey] *
        (1 + (elusive - tackle) * C.yacPerPoint) *
        (rec.traits.yacCatch ? C.yacTrait : 1) *
        (1 - C.softYac * dcall.soft)
    );
    let yac = Math.round(-Math.log(1 - this.rng.float()) * yacMean);
    const broken = this.rng.chance(
      sigmoid(
        logit(S.brokenTackle) +
          S.edge.breakaway * (elusive - tackle) -
          (this.slider(def, 'tackling') - 1) * C.sliderLogit
      )
    );
    if (broken) {
      yac += Math.round(-Math.log(1 - this.rng.float()) * S.brokenTackleYards);
      this.add(def, tacklePlayer, 'missedTackles');
    }
    if (yac >= C.openFieldYards || broken) {
      this.note(off, target.slot, 'openField');
      this.note(def, tacklerSlot, 'openField');
    }
    const yards = Math.min(goal, air + yac);
    const gained = yards;
    this.add(off, qb, 'passCmp');
    this.add(off, qb, 'passYds', gained);
    this.long(off, qb, 'passLong', gained);
    this.add(off, rec, 'receptions');
    this.add(off, rec, 'recYds', gained);
    this.add(off, rec, 'yac', Math.max(0, gained - air));
    this.long(off, rec, 'recLong', gained);
    if (gained >= C.bigPlay) {
      this.add(off, qb, 'pass20');
      this.add(off, rec, 'rec20');
    }
    if (target.sep < C.contestedSep) this.add(off, rec, 'contestedCatches');
    const touchdown = this.ball + gained >= 100;
    this.add(def, defender, 'completionsAllowed');
    this.add(def, defender, 'yardsAllowed', gained);
    if (touchdown) this.add(def, defender, 'tdsAllowed');
    else this.tackle(def, tacklePlayer, ['FS', 'SS', 'MIKE', 'WILL', 'NCB']);
    // A fumble after the catch.
    const fumbleP =
      sigmoid(
        logit(S.fumbleCatch) -
          S.edge.fumble * rec.edges.ballSecurity +
          (tacklePlayer?.traits.stripsBall ? C.stripsLogit : 0)
      ) *
      this.slider(off, 'fumbles') *
      this.output('turnovers');
    if (!touchdown && this.rng.chance(fumbleP)) {
      this.add(off, rec, 'fumbles');
      this.add(def, tacklePlayer, 'forcedFumbles');
      if (this.rng.chance(S.fumbleLost)) {
        this.add(off, rec, 'fumblesLost');
        this.add(def, tacklePlayer, 'fumbleRecoveries');
        return {
          ...base,
          yards,
          incomplete: false,
          turnover: 'fumble',
          returnYards: this.turnoverReturn(C.fumbleReturnMean),
          air,
          ballCarrier: rec,
          tackler: tacklePlayer,
          covering: defender,
          description: `${rec.short} fumbles after the catch`
        };
      }
    }
    const oob = this.rng.chance(S.outOfBoundsCatch);
    return {
      ...base, yards, incomplete: false, stops: touchdown || (oob && this.lateWindow()), air, ballCarrier: rec, tackler: tacklePlayer,
      covering: defender, pressured, description: `${qb.short} pass to ${rec.short} for ${yards}`
    }; // prettier-ignore
  }

  private airYards(depth: Depth): number {
    switch (depth) {
      case 'screen':
        return Math.round(S.screenAir[0] + this.rng.float() * (S.screenAir[1] - S.screenAir[0]));
      case 'short':
        return 1 + (Math.floor(-Math.log(1 - this.rng.float()) * S.airShortMean) % (B.intermediate - 1));
      case 'intermediate':
        return B.intermediate + Math.floor(this.rng.float() * (B.deep - B.intermediate));
      default:
        return B.deep + Math.round(-Math.log(1 - this.rng.float()) * S.airDeepMean);
    }
  }

  private interception(
    qb: SimPlayer,
    rec: SimPlayer,
    defender: SimPlayer,
    base: PlayOutcome,
    air: number
  ): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    this.add(off, qb, 'passInt');
    this.add(def, defender, 'defInt');
    this.add(def, defender, 'passesDefended');
    const back = this.turnoverReturn(C.intReturnMean);
    this.add(def, defender, 'defIntYds', back);
    return {
      ...base,
      turnover: 'interception',
      air,
      returnYards: back,
      covering: defender,
      ballCarrier: rec,
      description: `${qb.short} intercepted by ${defender.short}`
    };
  }

  /** Yards a turnover is returned: usually short, now and then a breakaway (spec 8.3 step 5). */
  private turnoverReturn(mean: number): number {
    const breakaway = this.rng.chance(C.returnBreakaway);
    return Math.round(-Math.log(1 - this.rng.float()) * (breakaway ? C.returnBreakawayMean : mean));
  }

  // ---------------------------------------------------------------------------------------------------
  // Run plays

  private rush(call: RunCall, _dcall: DefenseCall): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    const qb = this.at(off, 'QB');
    const back: Slot = this.at(off, 'RB1') ? 'RB1' : 'RB2';
    const carrierSlot: Slot = call.qbRun
      ? 'QB'
      : this.at(off, 'FB') && this.rng.chance(TUNING.situations.fullbackCarryShare)
        ? 'FB'
        : back;
    const carrier = this.at(off, carrierSlot) ?? qb;
    const base: PlayOutcome = {
      yards: 0, stops: false, turnover: null, returnYards: 0, sack: false, kind: 'run', incomplete: false, air: 0,
      ballCarrier: carrier, passer: null, tackler: null, covering: null, pressured: false, throwAway: false, description: 'run'
    }; // prettier-ignore
    if (!carrier) return base;
    const inside =
      call.concept === 'insideZone' ||
      call.concept === 'power' ||
      call.concept === 'draw' ||
      (call.concept === 'counter' && this.rng.chance(TUNING.situations.counterInside));
    const lane: PlayTrigger = inside ? 'insideRun' : 'outsideRun';
    const zone = call.concept === 'insideZone' || call.concept === 'outsideZone';
    // Gap runs go downhill into the line: the carrier meets contact there on every one.
    this.note(off, carrierSlot, 'carry', lane, ...(zone ? [] : (['contactAtLine'] as const)));

    // Blocking against the front (spec 8.3: run block types against block shedding and power moves).
    let block = 0;
    let count = 0;
    const blockers: [SimPlayer, number][] = [];
    for (const slot of [...LINE, 'TE1', 'TE2', 'FB'] as Slot[]) {
      const p = this.at(off, slot);
      if (!p) continue;
      this.note(off, slot, lane, ...(LINE.includes(slot as OffenseSlot) ? (['contactAtLine'] as const) : []));
      const weight = slot === 'FB' ? C.leadWeight : slot === 'TE1' || slot === 'TE2' ? C.teBlockWeight : 1;
      const id: CompositeId = slot === 'FB' ? 'leadBlock' : zone ? 'runBlockZone' : 'runBlockGap';
      const edge = this.edge(off, p, slot, id, [lane, 'contactAtLine']);
      blockers.push([p, edge]);
      block += weight * edge;
      count += weight;
    }
    block /= Math.max(1, count);
    let stop = 0;
    let dcount = 0;
    const box: Slot[] = ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', GOAL_LINE_EXTRA, 'MIKE', 'WILL', 'SS'];
    for (const slot of box) {
      const p = this.at(def, slot);
      if (!p) continue;
      this.note(def, slot, lane, ...(FRONT.includes(slot) ? (['contactAtLine'] as const) : []));
      const weight = slot === 'SS' ? C.safetyBoxWeight : 1;
      stop += weight * this.edge(def, p, slot, 'runStop', [lane, 'contactAtLine']);
      dcount += weight;
    }
    stop /= Math.max(1, dcount);
    const winners: SimPlayer[] = [];
    for (const [p, edge] of blockers) {
      this.add(off, p, 'runBlockSnaps');
      if (this.rng.chance(sigmoid(logit(C.runBlockWin) + S.edge.stuff * (edge - stop)))) {
        this.add(off, p, 'runBlockWins');
        winners.push(p);
      }
    }
    const light = (this.field[def].has('NCB') ? 1 : 0) + (this.field[def].has('DIME') ? 1 : 0);
    const runFit = this.teams[def].tendencies.defense.runFit;
    const net =
      block - stop + light * C.lightBoxPoints + (this.slider(off, 'runBlocking') - 1) * C.sliderPoints;
    const cohesionOff =
      this.teams[off].cohesion.offense.execution * this.setup.sliders.general.cohesionEffect;
    const pStuff = sigmoid(
      logit(S.stuff) +
        (100 - this.ball <= C.goalLineStuffYards ? C.goalLineStuff : 0) -
        (this.inRedZone ? (this.output('scoring') - 1) * C.sliderLogit : 0) -
        S.edge.stuff * net +
        (runFit - 0.5) * C.penetrationLogit * (zone ? 1 : 0.5) -
        cohesionOff * C.cohesionLogit
    );
    const goal = 100 - this.ball;

    // The carrier: vision and elusiveness on zone runs, power on gap runs, burst outside (spec 8.3).
    const carrierEdge =
      call.concept === 'outsideZone'
        ? (this.edge(off, carrier, carrierSlot, 'burst', [lane, 'carry']) + this.edge(off, carrier, carrierSlot, 'elusive', [lane, 'carry', 'openField'])) / 2
        : zone
          ? (this.edge(off, carrier, carrierSlot, 'vision', [lane, 'carry']) + this.edge(off, carrier, carrierSlot, 'elusive', [lane, 'carry'])) / 2
          : (this.edge(off, carrier, carrierSlot, 'power', [lane, 'carry', 'contactAtLine']) + this.edge(off, carrier, carrierSlot, 'vision', [lane, 'carry'])) / 2; // prettier-ignore
    let yards: number;
    let tackler: SimPlayer | null;
    let contact: number;
    if (this.rng.chance(pStuff)) {
      yards = -Math.floor(this.rng.float() * S.stuffYards);
      tackler = this.tacklerFor(['DT1', 'DT2', 'LEDGE', 'REDGE', 'FLEX', 'MIKE']);
      if (zone) this.note(off, carrierSlot, 'contactAtLine');
      if (tackler) {
        const slot = this.slotOf(def, tackler);
        if (slot) this.note(def, slot, 'contactAtLine');
      }
      if (yards < 0) this.add(def, tackler, 'tacklesForLoss');
      contact = yards;
    } else {
      const shape = S.runGainShape;
      const mean = Math.max(
        C.runMeanFloor,
        S.runGainMean +
          net * S.blockYardsPerPoint +
          carrierEdge * C.carrierYardsPerPoint +
          (this.output('rushingEfficiency') - 1) * C.efficiencyYards
      );
      // Gamma-like gain: the sum of `shape` exponentials, scaled to the mean.
      let g = 0;
      for (let i = 0; i < Math.round(shape); i++) g -= Math.log(1 - this.rng.float());
      yards = Math.round((g / Math.round(shape)) * mean) + (this.rng.float() < 0.5 ? 0 : -1) + 1;
      if (yards <= C.contactAtLineYards && zone) this.note(off, carrierSlot, 'contactAtLine');
      contact = this.beforeContact(yards, net);
      // A big gain behind a winning block puts a defender on his back now and then (flavor).
      if (yards >= C.pancakeYards && winners.length && this.rng.chance(C.pancakeShare))
        this.add(off, winners[Math.floor(this.rng.float() * winners.length)] as SimPlayer, 'pancakes');
      // Outside runs that turn the corner put the back in space.
      if (!inside && yards >= C.edgeYards) this.note(off, carrierSlot, 'openField');
      const pursuers: DefenseSlot[] = ['MIKE', 'WILL', 'SS', 'FS', 'NCB', 'CB1', 'CB2'];
      tackler = this.tacklerFor(pursuers);
      const tackle = tackler
        ? this.edge(def, tackler, this.slotOf(def, tackler) ?? 'MIKE', 'tackle', ['openField', lane])
        : 0;
      const breakEdge =
        (this.edge(off, carrier, carrierSlot, 'elusive', ['openField']) +
          this.edge(off, carrier, carrierSlot, 'burst', ['openField'])) /
        2;
      if (
        this.rng.chance(
          sigmoid(
            logit(S.breakaway) +
              (inside ? 0 : C.outsideBreakaway) +
              S.edge.breakaway * (breakEdge - tackle) -
              (this.slider(def, 'tackling') - 1) * C.sliderLogit
          )
        )
      ) {
        yards += C.breakawayStart + Math.round(-Math.log(1 - this.rng.float()) * S.breakawayYards);
        this.note(off, carrierSlot, 'openField');
        if (tackler) this.note(def, this.slotOf(def, tackler) ?? 'FS', 'openField');
        // The pursuer missed; a deep defender makes the tackle.
        this.add(off, carrier, 'brokenTackles');
        this.add(def, tackler, 'missedTackles');
        tackler = this.tacklerFor(['FS', 'SS', 'CB1', 'CB2', 'NCB']);
      }
    }
    yards = Math.min(goal, yards);
    if (this.ball + yards <= 0) yards = -this.ball;
    this.add(off, carrier, 'rushAtt');
    this.add(off, carrier, 'rushYds', yards);
    this.long(off, carrier, 'rushLong', yards);
    this.add(off, carrier, 'rushYac', Math.max(0, yards - Math.max(0, contact)));
    if (yards >= C.bigRun) this.add(off, carrier, 'rush10');
    const touchdown = this.ball + yards >= 100;
    if (!touchdown && this.ball + yards > 0)
      this.tackle(def, tackler, ['MIKE', 'WILL', 'DT1', 'DT2', 'LEDGE', 'REDGE', 'SS']);

    // Fumbles (spec 8.3: carrying, covers ball, strips ball, weather).
    const covers = C.coversBall[carrier.traits.coversBall];
    const wet =
      this.setup.weather.precipitation !== 'none'
        ? S.fumbleWet * this.setup.sliders.general.weatherImpact
        : 0;
    const pFumble =
      sigmoid(
        logit(S.fumbleCarry) -
          S.edge.fumble * carrier.edges.ballSecurity +
          covers +
          (tackler?.traits.stripsBall ? C.stripsLogit : 0) +
          wet
      ) *
      this.slider(off, 'fumbles') *
      this.output('turnovers');
    if (!touchdown && this.rng.chance(pFumble)) {
      this.add(off, carrier, 'fumbles');
      this.add(def, tackler, 'forcedFumbles');
      if (this.rng.chance(S.fumbleLost)) {
        this.add(off, carrier, 'fumblesLost');
        this.add(def, tackler, 'fumbleRecoveries');
        return {
          ...base,
          yards,
          turnover: 'fumble',
          returnYards: this.turnoverReturn(C.fumbleReturnMean),
          stops: true,
          tackler,
          description: `${carrier.short} fumbles`
        };
      }
    }
    const oob = this.rng.chance(S.outOfBoundsRun * (inside ? C.outOfBoundsInside : C.outOfBoundsOutside));
    return {
      ...base,
      yards,
      stops: touchdown || (oob && this.lateWindow()),
      tackler,
      description: `${carrier.short} runs for ${yards}`
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // Penalties (spec 8.3 step 6): rates from tuning, yardage and effects from the rule set.

  /** Players' average discipline multiplier. */
  private discipline(players: readonly SimPlayer[]): number {
    return players.length
      ? players.reduce((sum, p) => sum + S.discipline[p.traits.penalty], 0) / players.length
      : 1;
  }

  private foulRate(
    base: number,
    side: Side,
    players: readonly SimPlayer[],
    slider: PenaltySlider | null
  ): number {
    const unit =
      side === this.offense ? this.teams[side].cohesion.offense : this.teams[side].cohesion.defense;
    const cohesion = 1 - unit.execution * C.cohesionPenalty * this.setup.sliders.general.cohesionEffect;
    return (
      base *
      this.discipline(players) *
      (slider ? this.penaltySlider(side, slider) : 1) *
      this.output('penalties') *
      Math.max(0, cohesion)
    );
  }

  private unit(side: Side, slots: readonly Slot[]): SimPlayer[] {
    return slots.flatMap(s => {
      const p = this.at(side, s);
      return p ? [p] : [];
    });
  }

  /**
   * Charges a foul to a player (never wiped with the play). A flagrant personal foul, when the rules make
   * the foul ejection-eligible, sends him to the locker room for the rest of the game (spec 16).
   */
  private charge(side: Side, players: readonly SimPlayer[], id: PenaltyId, yards: number): void {
    if (!players.length) return;
    const who = players[
      this.rng.weightedIndex(players.map(p => S.discipline[p.traits.penalty]))
    ] as SimPlayer;
    const l = this.line(side, who);
    l.penalties++;
    l.penaltyYds += yards;
    this.penaltyLog.push({ playerId: who.id, team: this.teams[side].abbr, penalty: id, yards });
    if (this.setup.rules.penalties[id].ejectionEligible && !who.out && this.rng.chance(C.ejectionShare)) {
      who.out = true;
      this.returning.delete(who);
      this.ejections.push({
        playerId: who.id,
        team: this.teams[side].abbr,
        quarter: this.quarter,
        penalty: id
      });
    }
  }

  /** Half the distance to the goal when the yardage would reach past it. */
  private enforceYards(yards: number, towardOwnGoal: boolean, from = this.ball): number {
    return Math.min(yards, Math.floor((towardOwnGoal ? from : 100 - from) / 2));
  }

  /**
   * Dead-ball fouls before the snap, the ones the rule set marks pre-snap. Returns true when one happened
   * (the play doesn't).
   */
  private preSnapFoul(off: Side, def: Side): boolean {
    const R = S.penaltyRates;
    const rules = this.setup.rules.penalties;
    const offense = this.unit(off, [...LINE, 'TE1', 'TE2', 'X', 'Z', 'SLOT']);
    const defense = this.unit(def, [...FRONT, 'MIKE', 'WILL']);
    const crowd = off === 'away' ? this.setup.crowd : 1;
    const options: [PenaltyId, Side, SimPlayer[], number][] = [
      ['falseStart', off, offense, this.foulRate(R.falseStart, off, offense, 'falseStart') * crowd],
      ['offside', def, defense, this.foulRate(R.offside, def, defense, 'offside')],
      [
        'delayOfGame',
        off,
        this.unit(off, ['QB']),
        this.foulRate(R.delayOfGame, off, [], null) * (this.hurry() ? K.hurryDelay : 1)
      ],
      ['illegalFormation', off, offense, this.foulRate(R.illegalFormation, off, offense, null)]
    ];
    for (const [id, side, players, rate] of options) {
      if (!rules[id].preSnap || !this.rng.chance(rate)) continue;
      const againstOffense = side === off;
      const yards = this.enforceYards(rules[id].yards, againstOffense);
      this.charge(side, players, id, yards);
      if (this.drive) this.drive.yards += againstOffense ? -yards : yards;
      if (againstOffense) {
        this.ball -= yards;
        this.distance += yards;
      } else {
        this.ball += yards;
        this.distance -= yards;
        if (this.distance <= 0) this.firstDown('penalty');
      }
      return true;
    }
    return false;
  }

  /** A live-ball foul during the play, if any (fouls the rule set marks pre-snap happen before it). */
  private liveFoul(
    call: Call,
    outcome: PlayOutcome
  ): { id: PenaltyId; side: Side; players: SimPlayer[] } | null {
    const R = S.penaltyRates;
    const off = this.offense;
    const def = other(off);
    const line = this.unit(off, [...LINE, 'TE1']);
    const secondary = this.unit(def, ['CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS']);
    const front = this.unit(def, [...FRONT, 'MIKE', 'WILL']);
    const everyone = [...this.field[def].values()];
    const covering = outcome.covering ? [outcome.covering] : secondary;
    const receiver = outcome.ballCarrier ? [outcome.ballCarrier] : [];
    const options: [PenaltyId, Side, SimPlayer[], number][] = [];
    const formation = this.unit(off, [...LINE, 'TE1', 'TE2', 'X', 'Z', 'SLOT']);
    options.push([
      'illegalFormation',
      off,
      formation,
      this.foulRate(R.illegalFormation, off, formation, null)
    ]);
    if (call.kind === 'pass') {
      options.push([
        'offensiveHolding',
        off,
        line,
        this.foulRate(R.offensiveHoldingPass, off, line, 'offensiveHolding')
      ]);
      if (outcome.throwAway && outcome.passer)
        options.push([
          'intentionalGrounding',
          off,
          [outcome.passer],
          S.groundingGivenThrowAway * this.penaltySlider(off, 'intentionalGrounding')
        ]);
      // Coverage fouls need a thrown ball, not a sack, throwaway, or scramble.
      if (outcome.kind === 'pass' && !outcome.sack && !outcome.throwAway) {
        options.push([
          'defensivePassInterference',
          def,
          covering,
          this.foulRate(R.defensivePassInterference, def, covering, 'defensivePassInterference')
        ]);
        options.push([
          'offensivePassInterference',
          off,
          receiver,
          this.foulRate(R.offensivePassInterference, off, receiver, 'offensivePassInterference')
        ]);
        options.push([
          'defensiveHolding',
          def,
          secondary,
          this.foulRate(R.defensiveHolding, def, secondary, 'defensiveHolding')
        ]);
        options.push([
          'illegalContact',
          def,
          secondary,
          this.foulRate(R.illegalContact, def, secondary, null)
        ]);
      }
      if (outcome.pressured)
        options.push([
          'roughingThePasser',
          def,
          front,
          this.foulRate(R.roughingThePasser, def, front, 'roughingThePasser')
        ]);
    } else {
      options.push([
        'offensiveHolding',
        off,
        line,
        this.foulRate(R.offensiveHoldingRun, off, line, 'offensiveHolding')
      ]);
    }
    options.push([
      'unnecessaryRoughness',
      def,
      everyone,
      this.foulRate(R.unnecessaryRoughness, def, everyone, null)
    ]);
    options.push(['facemask', def, everyone, this.foulRate(R.facemask, def, everyone, 'facemask')]);
    options.push(['illegalUseOfHands', def, front, this.foulRate(R.illegalUseOfHands, def, front, null)]);
    options.push([
      'unsportsmanlikeConduct',
      def,
      everyone,
      this.foulRate(R.unsportsmanlikeConduct, def, everyone, null)
    ]);
    const rules = this.setup.rules.penalties;
    for (const [id, side, players, rate] of options)
      if (!rules[id].preSnap && this.rng.chance(rate)) return { id, side, players };
    return null;
  }

  /**
   * Accepts or declines a live-ball foul (spec 8.3 step 6) and enforces it. 'stands' leaves the play's
   * result; 'wiped' nullifies the play (its stats are discarded) with the ball, down, and distance set
   * from the foul; 'added' keeps the play and adds a personal foul's yardage from the end of it.
   */
  private enforce(
    foul: { id: PenaltyId; side: Side; players: SimPlayer[] },
    outcome: PlayOutcome,
    start: number,
    down: number,
    distance: number
  ): 'stands' | 'wiped' | 'added' {
    const rule = this.setup.rules.penalties[foul.id];
    const off = this.offense;
    const gained = outcome.yards;
    const scored = !outcome.turnover && start + gained >= 100;
    if (foul.side === off) {
      // The defense declines when the play already went worse for the offense, or when declining brings
      // up fourth down or turns the ball over on downs.
      const yards = this.enforceYards(rule.yards, true, start);
      const failed = gained < distance;
      if (outcome.turnover || outcome.sack || gained <= -yards || (down >= 3 && failed && !rule.lossOfDown))
        return 'stands';
      this.charge(off, foul.players, foul.id, yards);
      this.ball = start - yards;
      this.down = down + (rule.lossOfDown ? 1 : 0);
      this.distance = distance + yards;
      if (this.drive) this.drive.yards -= yards;
      return 'wiped';
    }
    // Personal fouls after a gain are enforced from the end of the play, on top of it.
    const personal =
      foul.id === 'unnecessaryRoughness' ||
      foul.id === 'facemask' ||
      foul.id === 'unsportsmanlikeConduct' ||
      (foul.id === 'roughingThePasser' && !outcome.incomplete);
    if (personal && !outcome.turnover && !scored && gained >= 0) {
      const end = start + gained;
      const yards = this.enforceYards(rule.yards, false, end);
      this.charge(foul.side, foul.players, foul.id, yards);
      return 'added';
    }
    // Otherwise the offense takes the better of the play and the penalty from the previous spot.
    const yards = rule.spotFoul
      ? Math.min(Math.max(1, outcome.air), 99 - start)
      : this.enforceYards(rule.yards, false, start);
    const playBetter =
      !outcome.turnover && (scored || (gained >= yards && (gained >= distance || !rule.automaticFirstDown)));
    if (playBetter) return 'stands';
    this.charge(foul.side, foul.players, foul.id, yards);
    this.ball = Math.min(99, start + yards);
    this.down = down;
    this.distance = distance;
    if (this.drive) this.drive.yards += yards;
    if (rule.automaticFirstDown || yards >= distance) this.firstDown('penalty');
    else this.distance = distance - yards;
    return 'wiped';
  }

  // ---------------------------------------------------------------------------------------------------
  // After the play

  /** First downs by player: the passer and receiver, or the runner. */
  private creditFirstDown(outcome: PlayOutcome): void {
    const off = this.offense;
    if (outcome.kind === 'pass') {
      this.add(off, outcome.passer, 'passFirstDowns');
      this.add(off, outcome.ballCarrier, 'recFirstDowns');
    } else this.add(off, outcome.ballCarrier, 'rushFirstDowns');
  }

  private firstDown(kind: 'pass' | 'run' | 'penalty'): void {
    const off = this.offense;
    this.down = 1;
    this.distance = Math.min(this.setup.rules.yardsToGain, 100 - this.ball);
    const t = this.totals[off];
    t.firstDowns++;
    if (kind === 'pass') t.firstDownsPass++;
    else if (kind === 'run') t.firstDownsRush++;
    else t.firstDownsPenalty++;
  }

  private apply(outcome: PlayOutcome, start: number, down: number, distance: number): void {
    const off = this.offense;
    const def = other(off);
    if (down === 3) this.totals[off].thirdDownAtt++;
    if (down === 4) this.totals[off].fourthDownAtt++;
    if (this.drive) this.drive.yards += outcome.turnover ? 0 : outcome.yards;

    if (outcome.turnover) {
      const spot = start + (outcome.turnover === 'interception' ? outcome.air : outcome.yards);
      // An interception in the end zone is a touchback unless the return gets past the touchback line.
      const touchback = this.setup.rules.touchback;
      const defBall =
        spot >= 100
          ? Math.max(outcome.returnYards, touchback)
          : 100 - clamp(spot, 1, 99) + outcome.returnYards;
      this.endDrive(outcome.turnover === 'interception' ? 'interception' : 'fumble');
      // A return touchdown counts before overtime's possession rule is checked (touchdown() checks it).
      if (defBall >= 100) {
        const scorer = outcome.turnover === 'interception' ? outcome.covering : outcome.tackler;
        this.add(def, scorer, outcome.turnover === 'interception' ? 'defIntTd' : 'fumbleReturnTd');
        this.offense = def;
        this.touchdown(
          def,
          `${scorer?.short ?? 'Defense'} ${outcome.turnover === 'interception' ? 'interception' : 'fumble'} return`,
          true
        );
        return;
      }
      this.overtimeCheck();
      if (this.over) return;
      this.possess(def, Math.max(1, defBall));
      this.nextSnap(true);
      return;
    }

    this.ball = start + outcome.yards;
    if (this.ball >= 100) {
      if (down === 3) this.totals[off].thirdDownConv++;
      if (down === 4) this.totals[off].fourthDownConv++;
      // A touchdown that reaches the line to gain also counts as a first down, as NFL scoring does.
      if (outcome.yards >= distance) {
        const t = this.totals[off];
        t.firstDowns++;
        if (outcome.kind === 'pass') t.firstDownsPass++;
        else t.firstDownsRush++;
        this.creditFirstDown(outcome);
      }
      const scorer = outcome.ballCarrier;
      if (outcome.kind === 'pass' && outcome.passer && scorer) {
        this.add(off, outcome.passer, 'passTd');
        this.add(off, scorer, 'recTd');
        this.touchdown(off, `${scorer.short} ${outcome.yards} yd pass from ${outcome.passer.short}`);
      } else {
        this.add(off, scorer, 'rushTd');
        this.touchdown(off, `${scorer?.short ?? 'Team'} ${outcome.yards} yd run`);
      }
      return;
    }
    if (this.ball <= 0) {
      this.safety(def);
      return;
    }
    if (outcome.yards >= distance) {
      if (down === 3) this.totals[off].thirdDownConv++;
      if (down === 4) this.totals[off].fourthDownConv++;
      this.firstDown(outcome.kind === 'pass' ? 'pass' : 'run');
      this.creditFirstDown(outcome);
    } else {
      this.down = down + 1;
      this.distance = distance - outcome.yards;
      if (this.down > 4) {
        this.turnoverOnDowns();
        return;
      }
    }
    this.nextSnap(outcome.stops);
  }

  /**
   * Between plays (spec 8.3 step 8): the period ends if its time is up (unless an untimed down is owed);
   * otherwise, if the clock is running, a timeout may stop it, or it runs until the next snap.
   */
  private nextSnap(stops: boolean): void {
    if (this.over) return;
    if (stops) this.running = false;
    if (this.clock <= 0) {
      if (!this.untimed) this.endPeriod();
      return;
    }
    if (!this.running) return;
    const off = this.offense;
    const def = other(off);
    if (this.timeouts[off] > 0 && this.wantsOffenseTimeout()) return this.timeout(off);
    if (this.timeouts[def] > 0 && this.wantsDefenseTimeout()) return this.timeout(def);
    const hurry = this.hurry();
    const tempo = this.teams[off].tendencies.offense.tempo;
    // An offense out of timeouts that needs the last kick hurries to the line to spike the ball.
    const spiking =
      this.wantsLastKick() && this.timeouts[off] === 0 && this.clock <= C.spikeSeconds + K.spikeRunoff;
    const skill = this.teams[off].coach.clock;
    const runoff = spiking
      ? K.spikeRunoff
      : hurry
        ? K.runoff.hurry + (1 - skill / 100) * K.clockWaste
        : this.milking()
          ? this.fullRunoff
          : this.slowed(K.runoff.normal + (0.5 - tempo) * K.tempoSpread);
    if (!this.tick(Math.min(this.setup.rules.playClock, runoff), true)) this.endPeriod();
  }

  private timeout(side: Side): void {
    this.timeouts[side]--;
    this.running = false;
  }

  /** Timeouts late in a half (spec 8.3 step 2): to save time for a score. */
  private wantsOffenseTimeout(): boolean {
    if (!this.lateHalf()) return false;
    if (this.quarter === 2) return this.clock <= C.timeoutHalfSeconds && this.ball >= C.timeoutHalfFromBall;
    return this.margin <= 0 && this.clock <= C.timeoutGameSeconds;
  }

  /** A defense behind or tied late in the game stops the clock to get the ball back with time left. */
  private wantsDefenseTimeout(): boolean {
    return (
      this.quarter >= 4 &&
      this.lateHalf() &&
      this.margin >= 0 &&
      this.margin <= C.defenseTimeoutMaxDeficit &&
      this.clock <= C.defenseTimeoutSeconds
    );
  }

  private turnoverOnDowns(): void {
    const def = other(this.offense);
    this.endDrive('downs');
    this.overtimeCheck();
    if (this.over) return;
    this.possess(def, 100 - this.ball);
    this.nextSnap(true);
  }

  private safety(scoringTeam: Side): void {
    const conceding = other(scoringTeam);
    const defenders = [...this.field[scoringTeam].values()];
    const who = defenders.length
      ? (defenders[Math.floor(this.rng.float() * defenders.length)] as SimPlayer)
      : null;
    this.add(scoringTeam, who, 'safeties');
    this.scored(scoringTeam, 'safety', this.setup.rules.points.safety, 'Safety');
    this.endDrive('safety');
    // A safety is a defensive score: in overtime it ends the game.
    this.overtimeCheck({ defensive: true });
    if (this.over) return;
    // The conceding team free kicks (spec 16 rules).
    this.offense = conceding;
    this.kickoffAfterScore(conceding, true);
  }

  /**
   * A touchdown, the try, then the kickoff (spec 16 rules). `defensive` for interception and fumble
   * returns. In overtime, a touchdown that takes the lead after both teams have had the ball ends the game
   * without a try; one that only ties it or trails still gets its try.
   */
  private touchdown(team: Side, description: string, defensive = false): void {
    if (!defensive && team === this.offense && this.redZoneCounted) this.totals[team].redZoneTd++;
    this.scored(team, 'touchdown', this.setup.rules.points.touchdown, description);
    this.endDrive('touchdown');
    const scoring = { defensive, touchdown: true };
    if (this.score[team] > this.score[other(team)]) this.overtimeCheck(scoring);
    if (this.over) return;
    this.tryAfter(team);
    this.overtimeCheck(scoring);
    if (this.over) return;
    this.kickoffAfterScore(team);
  }

  /** The kickoff after a score, unless the score came on the last play of a half or the game. */
  private kickoffAfterScore(kicker: Side, freeKick = false): void {
    if (this.over) return;
    this.running = false;
    if (this.clock <= 0 && !this.endPeriod()) return;
    this.kickoff(kicker, freeKick);
  }

  // ---------------------------------------------------------------------------------------------------
  // Tries, kicks, and punts

  private tryAfter(team: Side): void {
    const coach = this.teams[team].coach;
    const lead = this.score[team] - this.score[other(team)];
    const late = this.quarter >= 4 || this.overtime;
    const chart = late && (C.goForTwoLate as readonly number[]).includes(lead);
    const goForTwo = chart || this.rng.chance(S.twoPointBase * (0.5 + coach.aggressiveness / 100));
    const kicker = this.kicker(team);
    if (goForTwo) {
      this.totals[team].twoPointAtt++;
      const off = this.teams[team];
      // Success from the rule set's spot: the tuning rate at the 2, harder from farther out.
      const fromSpot = sigmoid(
        logit(S.twoPointSuccess) + (this.setup.rules.twoPointSpot - 2) * C.twoPointPerYard
      );
      const success = this.rng.chance(
        clamp(
          fromSpot + (off.boost - this.teams[other(team)].boost) * C.twoPointPerPoint,
          C.twoPointRange[0],
          C.twoPointRange[1]
        )
      );
      if (success) {
        const who = this.pick(team, this.rng.chance(0.5) ? 'RB1' : 'X', new Set());
        this.add(team, who, 'twoPointMade');
        this.scored(
          team,
          'twoPoint',
          this.setup.rules.points.twoPoint,
          `Two-point conversion by ${who?.short ?? off.name}`
        );
      } else if (this.rng.chance(C.defensiveTry)) {
        this.scored(
          other(team),
          'defensiveTry',
          this.setup.rules.defensiveTryPoints,
          'Defensive two-point return'
        );
      }
      return;
    }
    const distance = this.setup.rules.extraPointSpot + C.fgSnapYards + C.xpExtraYards;
    this.add(team, kicker, 'xpAtt');
    this.kickSnaps(team, 'fieldGoal');
    if (this.rng.chance(this.kickChance(team, kicker, distance))) {
      this.add(team, kicker, 'xpMade');
      const point = this.setup.rules.points.extraPoint;
      this.points(team, point);
      const last = this.scoring[this.scoring.length - 1];
      if (last) {
        last.points += point;
        last.description += ` (${kicker?.short ?? 'kick'} kick)`;
        last.home = this.score.home;
        last.away = this.score.away;
      }
    }
  }

  private kickChance(team: Side, kicker: SimPlayer | null, distance: number): number {
    const w = this.setup.weather;
    const impact = this.setup.sliders.general.weatherImpact;
    const acc = kicker ? this.edge(team, kicker, 'K', 'kickAccuracy', ['kick']) : -10;
    const power = kicker ? this.edge(team, kicker, 'K', 'kickPower', ['kick']) : -10;
    const long = Math.max(0, distance - C.longKick) / 10;
    let x = fieldGoalLogit(distance) + S.edge.kick * (acc + power * long);
    if (!w.indoor) {
      if (w.tempF < C.coldF) x += S.fgCold * impact;
      if (w.precipitation !== 'none') x += S.fgWet * impact;
      x += S.fgWindPerMph * Math.max(0, w.windMph - C.calmMph) * impact;
    }
    if (w.altitudeFt >= K.altitudeFt) x += S.fgAltitude * long;
    x +=
      (this.slider(team, 'fgAccuracy') - 1) * C.sliderLogit +
      (this.slider(team, 'fgPower') - 1) * C.sliderLogit * long;
    return sigmoid(x);
  }

  private fieldGoal(): void {
    const off = this.offense;
    const def = other(off);
    const kicker = this.kicker(off);
    const distance = this.fgDistance();
    this.plays++;
    this.note(off, 'K', 'kick');
    this.kickSnaps(off, 'fieldGoal');
    this.add(off, kicker, 'fgAtt');
    if (distance >= 40 && distance < 50) this.add(off, kicker, 'fgAtt40');
    if (distance >= 50) this.add(off, kicker, 'fgAtt50');
    this.running = true;
    this.tick(K.kickSeconds);
    if (this.rng.chance(this.kickChance(off, kicker, distance))) {
      this.add(off, kicker, 'fgMade');
      if (distance >= 40 && distance < 50) this.add(off, kicker, 'fgMade40');
      if (distance >= 50) this.add(off, kicker, 'fgMade50');
      this.long(off, kicker, 'fgLong', distance);
      this.scored(
        off,
        'fieldGoal',
        this.fieldGoalPoints,
        `${kicker?.short ?? 'Team'} ${distance} yd field goal`
      );
      this.endDrive('fieldGoal');
      this.overtimeCheck();
      if (this.over) return;
      this.kickoffAfterScore(off);
      return;
    }
    // A miss: the defense takes over at the spot of the kick, or the rule's yard line if that is farther
    // from its goal.
    const kickSpot = this.ball - C.fgHoldYards;
    this.endDrive('missedFieldGoal');
    this.overtimeCheck();
    if (this.over) return;
    this.possess(def, Math.max(this.setup.rules.missedFieldGoalSpot, 100 - kickSpot));
    this.nextSnap(true);
  }

  /**
   * A punt (spec 8.3 special teams): distance from the punter's leg, weather, and altitude; with room to
   * spare he aims to pin the returner deep. Then a fair catch, a return, or a ball downed or rolling into the
   * end zone. Running into the kicker, kick catch interference, and blocks in the back come from the rules.
   */
  private punt(): void {
    const off = this.offense;
    const def = other(off);
    const rules = this.setup.rules;
    const punter = this.pick(off, 'P', new Set());
    this.plays++;
    this.note(off, 'P', 'kick');
    this.running = true;
    // Running into the kicker: the punting team takes the yards only when they reach the line to gain.
    if (this.rng.chance(S.penaltyRates.runningIntoKicker * this.output('penalties'))) {
      const rik = rules.penalties.runningIntoKicker;
      const yards = this.enforceYards(rik.yards, false);
      if (yards >= this.distance || rik.automaticFirstDown) {
        this.charge(def, this.unit(def, FRONT), 'runningIntoKicker', yards);
        this.tick(K.kickSeconds);
        this.ball += yards;
        if (this.drive) this.drive.yards += yards;
        this.firstDown('penalty');
        // A defensive foul on a period's last play extends it.
        if (this.clock <= 0) this.untimed = true;
        return this.nextSnap(true);
      }
    }
    this.endDrive('punt');
    this.overtimeCheck();
    if (this.over) return;
    this.add(off, punter, 'punts');
    const cover = this.kickSnaps(off, 'punt');
    const w = this.setup.weather;
    const impact = this.setup.sliders.general.weatherImpact;
    const wind = w.indoor ? 0 : (this.rng.float() - 0.5) * w.windMph * C.puntWind * impact;
    const power = punter ? this.edge(off, punter, 'P', 'kickPower', ['kick']) : -5;
    const altitude = w.altitudeFt >= K.altitudeFt ? C.puntAltitude : 0;
    let gross = Math.round(
      this.rng.normal(S.puntMean + power * C.puntPerPoint + altitude + wind, S.puntSd) *
        this.slider(off, 'puntPower')
    );
    const toGoal = 100 - this.ball;
    // With more leg than field, the punter aims for the corner instead of the end zone.
    const aim = toGoal - C.puntAim;
    if (gross > aim && aim > 0) {
      const accuracy = punter ? this.edge(off, punter, 'P', 'kickAccuracy', ['kick']) : 0;
      const sd = Math.max(
        1,
        (C.puntAimSd * (1 - accuracy * C.puntAimPerPoint)) / Math.max(0.25, this.slider(off, 'puntAccuracy'))
      );
      // Bounces can still carry an aimed punt into the end zone.
      gross = Math.round(aim + this.rng.normal(0, sd));
    }
    let receiveAt: number;
    let returned = 0;
    let net: number;
    this.tick(K.kickSeconds);
    if (this.rng.chance(S.puntBlocked)) {
      this.add(off, punter, 'puntsBlocked');
      gross = 0;
      receiveAt = 100 - (this.ball - C.blockedPuntLoss);
      net = -C.blockedPuntLoss;
    } else if (gross >= toGoal) {
      // Into the end zone: a touchback.
      this.add(off, punter, 'puntTouchbacks');
      gross = toGoal;
      receiveAt = rules.touchback;
      net = toGoal - rules.touchback;
    } else {
      const landing = this.ball + gross;
      const catchAt = 100 - landing;
      const returner = this.pick(def, 'PR', new Set());
      const deep = catchAt <= C.puntDownedInside;
      const fairCatch = rules.puntFairCatch ? S.puntFairCatch : 0;
      const r = this.rng.float();
      receiveAt = catchAt;
      if (!deep && r < fairCatch + S.puntReturned && returner) {
        // Kick catch interference: the receiving team gets the ball 15 yards past the catch.
        const kci = rules.penalties.kickCatchInterference;
        const kciRate =
          S.penaltyRates.kickCatchInterference *
          this.penaltySlider(off, 'kickCatchInterference') *
          this.output('penalties');
        if (this.rng.chance(kciRate)) {
          const gunner = this.pick(off, 'GUNNER', new Set());
          this.charge(off, gunner ? [gunner] : [], 'kickCatchInterference', kci.yards);
          receiveAt = Math.min(99, catchAt + kci.yards);
        } else if (r < fairCatch) {
          this.add(def, returner, 'fairCatches');
        } else {
          this.note(def, 'PR', 'carry', 'openField');
          const edge = this.edge(def, returner, 'PR', 'returner', ['openField', 'carry']);
          returned = Math.round(
            -Math.log(1 - this.rng.float()) *
              Math.max(C.puntReturnFloor, S.puntReturnMean + edge * C.returnPerPoint)
          );
          this.add(def, returner, 'puntReturns');
          if (this.rng.chance(C.returnTdPunt)) returned = landing;
          returned = Math.min(returned, landing);
          this.add(def, returner, 'puntReturnYds', returned);
          this.long(def, returner, 'puntReturnLong', returned);
          if (this.rng.chance(this.blockInBackRate(def))) {
            const yards = rules.penalties.illegalBlockInBack.yards;
            this.charge(def, this.unit(def, ['MIKE', 'WILL', 'SS', 'CB2']), 'illegalBlockInBack', yards);
            returned = Math.max(-C.returnFoulFloor, returned - yards);
          }
          receiveAt = catchAt + returned;
          if (receiveAt < 100) this.coverTackle(off, cover);
          if (receiveAt >= 100) {
            this.add(def, returner, 'puntReturnTd');
            this.add(off, punter, 'puntYds', gross);
            this.add(off, punter, 'puntNetYds', gross - landing);
            this.long(off, punter, 'puntLong', gross);
            // The return is the receiving team's possession, starting where the returner caught it.
            this.offense = def;
            this.ball = clamp(catchAt, 1, 99);
            this.startDrive(def);
            this.touchdown(def, `${returner.short} punt return`);
            return;
          }
        }
      }
      net = gross - returned;
      if (catchAt <= 20 && receiveAt <= 20) this.add(off, punter, 'puntsIn20');
    }
    this.add(off, punter, 'puntYds', gross);
    this.add(off, punter, 'puntNetYds', net);
    this.long(off, punter, 'puntLong', gross);
    this.possess(def, receiveAt);
    this.nextSnap(true);
  }

  /** Blocks in the back on a return, charged to the returning team. */
  private blockInBackRate(returning: Side): number {
    return (
      S.penaltyRates.illegalBlockInBack *
      this.penaltySlider(returning, 'illegalBlockInBack') *
      this.output('penalties')
    );
  }

  /** A kickoff (spec 8.3: current kickoff rules from the rule set) or a free kick after a safety. */
  private kickoff(kicker: Side, afterSafety = false): void {
    if (this.over) return;
    const receiver = other(kicker);
    const rules = this.setup.rules.kickoff;
    const k = this.kicker(kicker);
    this.note(kicker, 'K', 'kick');
    this.running = true;
    const cover = this.kickSnaps(kicker, 'kickoff');
    this.add(kicker, k, 'kickoffs');
    const behind = this.score[kicker] - this.score[receiver];
    const onsideAllowed =
      (!rules.onsideOnlyWhenTrailing || behind < 0) && (!rules.onsideFourthQuarterOnly || this.quarter >= 4);
    const lateTrailing =
      this.quarter >= 4 && behind < 0 && behind >= -C.onsideMaxDeficit && this.clock <= C.onsideSeconds;
    if (!afterSafety && onsideAllowed && lateTrailing && this.rng.chance(C.onsideChance)) {
      // The ball travels about onsideYards from the kicking spot, where one team or the other falls on it.
      const spot = rules.spot + C.onsideYards;
      this.tick(K.kickSeconds / 2);
      if (this.rng.chance(S.onsideRecovery)) this.possess(kicker, spot);
      else this.possess(receiver, 100 - spot);
      return this.nextSnap(true);
    }
    const returner = this.pick(receiver, 'KR', new Set());
    const r = this.rng.float();
    const power = k ? k.edges.kickPower * C.kickoffPowerShift : 0;
    const returnable =
      S.kickoffReturnable - power + (1 - this.slider(kicker, 'kickoffPower')) * C.kickoffSliderShift;
    let start: number;
    if (afterSafety) {
      // A free kick travels about freeKickLanding yards from the kicking spot, then is returned.
      const landing = C.freeKickLanding;
      start =
        100 -
        (this.setup.rules.safetyKickSpot + landing) +
        Math.round(this.rng.normal(S.kickReturnMean * C.freeKickReturnShare, S.kickReturnSd));
      this.offense = receiver;
      this.tick(K.returnSeconds);
      this.coverTackle(kicker, cover);
    } else if (r < S.kickoffShort) {
      start = rules.shortSpot;
    } else if (r < S.kickoffShort + S.kickoffLandingRollTouchback) {
      start = rules.landingZoneTouchback;
      this.add(kicker, k, 'kickoffTouchbacks');
    } else if (r < S.kickoffShort + S.kickoffLandingRollTouchback + returnable && returner) {
      // Caught inside the landing zone and returned (spec 8.3: return rating, blocking, and coverage).
      this.note(receiver, 'KR', 'carry', 'openField');
      const deepest = Math.min(S.kickoffLanding[1], rules.landingZone);
      const caught = S.kickoffLanding[0] + Math.floor(this.rng.float() * (deepest - S.kickoffLanding[0]));
      const edge = this.edge(receiver, returner, 'KR', 'returner', ['openField', 'carry']);
      let back = Math.max(
        0,
        Math.round(this.rng.normal(S.kickReturnMean + edge * C.returnPerPoint, S.kickReturnSd))
      );
      if (this.rng.chance(S.returnTouchdown)) back = 100;
      if (this.rng.chance(this.blockInBackRate(receiver))) {
        const yards = this.setup.rules.penalties.illegalBlockInBack.yards;
        this.charge(receiver, this.unit(receiver, ['MIKE', 'WILL', 'SS']), 'illegalBlockInBack', yards);
        back = Math.max(0, back - yards);
      }
      this.add(receiver, returner, 'kickReturns');
      const total = Math.min(100 - caught, back);
      this.add(receiver, returner, 'kickReturnYds', total);
      this.long(receiver, returner, 'kickReturnLong', total);
      // A returner tackled at the goal line after a catch there has the ball at the 1.
      start = Math.max(1, caught + total);
      // The receiving team has the ball during the return.
      this.offense = receiver;
      this.tick(K.returnSeconds);
      if (start >= 100) {
        this.add(receiver, returner, 'kickReturnTd');
        // A return from the end zone counts as a drive from the 1, like one tackled there.
        this.ball = clamp(caught, 1, 99);
        this.startDrive(receiver);
        this.touchdown(receiver, `${returner.short} kickoff return`);
        return;
      }
      this.coverTackle(kicker, cover);
    } else {
      start = rules.touchback;
      this.add(kicker, k, 'kickoffTouchbacks');
    }
    this.possess(receiver, start);
    this.nextSnap(true);
  }

  // ---------------------------------------------------------------------------------------------------
  // Injuries (spec 8.3 step 7, 10.8)

  private injuryCheck(outcome: PlayOutcome): void {
    const involved: [Side, SimPlayer][] = [];
    const off = this.offense;
    const def = other(off);
    if (outcome.ballCarrier) involved.push([off, outcome.ballCarrier]);
    if (outcome.tackler) involved.push([def, outcome.tackler]);
    if (outcome.sack && outcome.passer) involved.push([off, outcome.passer]);
    for (const side of [off, def] as const) {
      const players = [...this.field[side].values()];
      for (let i = 0; i < C.linemenExposed && players.length; i++)
        involved.push([side, players[Math.floor(this.rng.float() * players.length)] as SimPlayer]);
    }
    const g = this.setup.sliders.general;
    const surface = this.turf ? C.turfInjury : 1;
    for (const [side, p] of involved) {
      if (p.out) continue;
      const risk =
        S.injuryRate *
        (C.injuryProne - p.injury / 99) *
        (C.toughnessBase - p.toughness / C.toughnessScale) *
        (1 + Math.max(0, C.injuryTiredBelow - p.energy) / 100) *
        surface *
        p.injuryRisk *
        g.injuryFrequency;
      if (!this.rng.chance(risk)) continue;
      const weights = S.injurySeverity.map((w, i) => (i === 0 ? w / g.injurySeverity : w * g.injurySeverity));
      const index = this.rng.weightedIndex(weights);
      const severity = (['minor', 'short', 'medium', 'season'] as const)[index] as InjurySeverity;
      const range = C.injuryWeeks[severity];
      const weeks = range[0] + Math.floor(this.rng.float() * (range[1] - range[0] + 1));
      const parts = BODY_PARTS[severity];
      this.injuries.push({
        playerId: p.id,
        team: this.teams[side].abbr,
        quarter: this.quarter,
        severity,
        weeks,
        bodyPart: parts[Math.floor(this.rng.float() * parts.length)] as string
      });
      p.out = true;
      if (severity === 'minor')
        this.returning.set(
          p,
          C.minorOutPlays[0] + Math.floor(this.rng.float() * (C.minorOutPlays[1] - C.minorOutPlays[0]))
        );
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Result

  private result(): GameResult {
    const box = (side: Side) => {
      const players = this.lines[side];
      const totals = sumLines(Object.values(players), this.totals[side]);
      return { totals, players };
    };
    const home = box('home');
    const away = box('away');
    const winner =
      this.score.home === this.score.away
        ? null
        : this.score.home > this.score.away
          ? this.setup.home.abbr
          : this.setup.away.abbr;
    const result: GameResult = {
      id: this.setup.id,
      home: this.setup.home.abbr,
      away: this.setup.away.abbr,
      score: { ...this.score },
      quarters: { home: [...this.byQuarter.home], away: [...this.byQuarter.away] },
      winner,
      overtime: this.overtime,
      box: { home, away },
      scoring: this.scoring,
      drives: this.drives,
      injuries: this.injuries,
      ejections: this.ejections,
      penalties: this.penaltyLog,
      recap: [],
      weather: this.setup.weather,
      plays: this.plays,
      ...(this.setup.measure ? { situations: this.situations } : {})
    };
    result.recap = recap(result, this.setup);
    return result;
  }
}

/** Simulates one game (spec 8). The same setup and stream always give the same result. */
export function simulateGame(setup: GameSetup, rng: Rng): GameResult {
  return new GameSim(setup, rng).run();
}

/** A game situation to start a sim from (tests of end-of-game rules and clock management). */
export interface GameState {
  quarter: number;
  /** Seconds left in the period. */
  clock: number;
  score: { home: number; away: number };
  /** The team with the ball, or null to start with a kickoff to the coin toss winner. */
  offense: Side | null;
  /** Yard line from the offense's goal line. */
  ball?: number;
  down?: number;
  distance?: number;
  timeouts?: { home: number; away: number };
  /** Possessions each team has finished in overtime. */
  overtimePossessions?: { home: number; away: number };
  /** Whether the clock is running before the next snap. */
  running?: boolean;
  /** Who received the opening kickoff, so the other team receives the second half's. */
  receivedOpeningKickoff?: Side;
}

/** Simulates the rest of a game from a situation. The scoring and drives cover only what happens next. */
/**
 * Field goal log-odds for an average kicker in calm air (spec 8.3): falling fastest out to fgKnee and more
 * slowly beyond it.
 */
export function fieldGoalLogit(distance: number): number {
  const inside = Math.min(distance, S.fgKnee);
  return S.fgLogit25 + S.fgPerYard * (inside - 25) + S.fgPerYardLong * (distance - inside);
}

export function simulateFrom(setup: GameSetup, rng: Rng, from: GameState): GameResult {
  return new GameSim(setup, rng).run(from);
}
