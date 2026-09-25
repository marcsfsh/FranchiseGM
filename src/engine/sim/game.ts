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
  GameResult,
  GameSetup,
  InjuryEvent,
  InjurySeverity,
  ScoringPlay,
  Side,
  SimPlayer,
  SituationCounts,
  TeamSetup
} from './types';
import { isBadWeather } from './weather';

const S = TUNING.sim;
const C = S.calls;
const K = S.clock;

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (p: number): number => Math.log(p / (1 - p));
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

type Depth = 'short' | 'intermediate' | 'deep' | 'screen';
type Package = 'base' | 'nickel' | 'dime';
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
  dime: ['LEDGE', 'REDGE', 'DT1', 'DT2', 'MIKE', 'CB1', 'CB2', 'NCB', 'DIME', 'FS', 'SS']
};
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
const FRONT: readonly DefenseSlot[] = ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX'];
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
  private readonly lines: Record<Side, Record<string, PlayerLine>> = { home: {}, away: {} };
  private readonly totals: Record<Side, TeamTotals> = { home: emptyTotals(), away: emptyTotals() };
  private readonly scoring: ScoringPlay[] = [];
  private readonly drives: DriveSummary[] = [];
  private readonly injuries: InjuryEvent[] = [];
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
  private distance = 10;
  private readonly score: Record<Side, number> = { home: 0, away: 0 };
  private readonly byQuarter: Record<Side, number[]> = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };
  private readonly timeouts: Record<Side, number>;
  private openingKicker: Side = 'home';
  private warned = false;
  private over = false;
  private overtime = false;
  private readonly otPossessions: Record<Side, number> = { home: 0, away: 0 };
  private drive: Drive | null = null;
  /** Halftime pass-rate adjustments (spec 8.6). */
  private readonly adjust: Record<Side, number> = { home: 0, away: 0 };
  private plays = 0;
  private redZoneCounted = false;
  /** Players on the field this play, by side and slot. */
  private field: Record<Side, OnField> = { home: new Map(), away: new Map() };
  private contexts: ContextTrigger[] = [];

  constructor(
    private readonly setup: GameSetup,
    rng: Rng
  ) {
    this.teams = { home: setup.home, away: setup.away };
    this.rng = rng;
    this.bad = isBadWeather(setup.weather);
    this.clock = setup.rules.quarterSeconds;
    this.timeouts = { home: setup.rules.timeoutsPerHalf, away: setup.rules.timeoutsPerHalf };
  }

  run(): GameResult {
    // The toss winner defers, so the other team receives the opening kickoff.
    const receiver: Side = this.rng.chance(0.5) ? 'home' : 'away';
    this.openingKicker = other(receiver);
    this.kickoff(this.openingKicker);
    let guard = 0;
    while (!this.over && guard++ < K.maxPlays) this.snap();
    if (!this.over) this.finish();
    return this.result();
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

  /** Healthy, rested enough, and not already used this play. */
  private pick(side: Side, slot: Slot, used: Set<SimPlayer>, depthIndex = 0): SimPlayer | null {
    const team = this.teams[side];
    const ids = team.depth[slot] ?? [];
    const available = ids
      .map(id => team.players[id])
      .filter((p): p is SimPlayer => !!p && !p.out && !used.has(p));
    const first = available[depthIndex] ?? available[0];
    if (!first) return null;
    // Rotation (spec 8.4, 12.3): a tired starter sits for a fresher backup.
    const group = POSITION_GROUP[first.position];
    const backup = available[depthIndex + 1];
    if (backup && first.energy < S.subAt[group] && backup.energy > first.energy + K.subMargin) return backup;
    return first;
  }

  // ---------------------------------------------------------------------------------------------------
  // Clock and game flow

  private get margin(): number {
    return this.score[this.offense] - this.score[other(this.offense)];
  }

  private get halfSeconds(): number {
    // Seconds left in the half (or the overtime period).
    return this.quarter === 1 || this.quarter === 3
      ? this.clock + this.setup.rules.quarterSeconds
      : this.clock;
  }

  private lateHalf(): boolean {
    return this.quarter === 2 || this.quarter >= 4;
  }

  /** Runs the game clock; stops at the two-minute warning. Returns false if the period ended. */
  private tick(raw: number): boolean {
    const seconds = Math.round(raw);
    if (seconds <= 0) return true;
    const warnAt = this.setup.rules.twoMinuteWarning && this.lateHalf() && !this.warned ? K.twoMinute : -1;
    if (this.drive) this.drive.seconds += Math.min(seconds, this.clock);
    this.totals[this.offense].timeOfPossession += Math.min(seconds, this.clock);
    if (warnAt > 0 && this.clock > warnAt && this.clock - seconds <= warnAt) {
      this.clock = Math.max(warnAt, this.clock - seconds) === warnAt ? warnAt : this.clock - seconds;
      this.warned = true;
      return this.clock > 0;
    }
    this.clock = Math.max(0, this.clock - seconds);
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
    if (this.overtime) this.otPossessions[team]++;
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
    this.drive = null;
    this.redZoneCounted = false;
    this.checkOvertime();
  }

  /** Gives the ball to a team at a yard line (from its own goal line), first and ten. */
  private possess(team: Side, ball: number): void {
    this.offense = team;
    this.ball = clamp(Math.round(ball), 1, 99);
    this.down = 1;
    this.distance = Math.min(10, 100 - this.ball);
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

  /** After the clock runs out in a period. */
  private endPeriod(): void {
    const rules = this.setup.rules;
    if (this.quarter === 1 || this.quarter === 3) {
      this.quarter++;
      this.clock = rules.quarterSeconds;
      return;
    }
    if (this.quarter === 2) {
      this.endDrive('endOfHalf');
      this.halftime();
      this.quarter = 3;
      this.clock = rules.quarterSeconds;
      this.warned = false;
      this.timeouts.home = this.timeouts.away = rules.timeoutsPerHalf;
      // The opening kickoff's receiver kicks to start the second half.
      this.kickoff(other(this.openingKicker));
      return;
    }
    if (this.quarter === 4 && this.score.home !== this.score.away) return this.finish();
    if (this.quarter >= 5 && (!this.setup.playoff || this.score.home !== this.score.away))
      return this.finish();
    // Overtime: a new period after a coin toss (spec 16 rules).
    this.endDrive('endOfHalf');
    this.overtime = true;
    this.quarter++;
    this.clock = this.setup.playoff ? rules.overtime.playoffSeconds : rules.overtime.regularSeasonSeconds;
    this.warned = false;
    this.timeouts.home = this.timeouts.away = rules.overtime.timeouts;
    if (this.quarter === 5) {
      const receiver: Side = this.rng.chance(0.5) ? 'home' : 'away';
      this.kickoff(other(receiver));
    }
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
      if (dropbacks < 5 || runs < 5) continue;
      const gap =
        (sum('passYds') - sum('sackYds')) / dropbacks - sum('rushYds') / runs - S.halftimeNeutralGap;
      const skill = this.teams[side].coach.halftime / 100;
      this.adjust[side] = clamp(gap / S.halftimeScale, -1, 1) * S.halftimeShift * skill;
    }
  }

  private checkOvertime(): void {
    if (!this.overtime || this.over) return;
    const both =
      !this.setup.rules.overtime.bothTeamsPossess ||
      (this.otPossessions.home > 0 && this.otPossessions.away > 0);
    if (both && this.score.home !== this.score.away) this.finish();
  }

  private finish(): void {
    if (this.over) return;
    this.endDrive(this.quarter >= 4 ? 'endOfGame' : 'endOfHalf');
    this.over = true;
  }

  // ---------------------------------------------------------------------------------------------------
  // Personnel

  private personnel(): Personnel {
    const t = this.teams[this.offense].tendencies.offense;
    const weights = (Object.keys(t.personnel) as Personnel[]).map(p => {
      let w = t.personnel[p];
      const heavy = p === '12' || p === '13' || p === '21' || p === '22';
      if (100 - this.ball <= C.goalLineYards && heavy) w *= C.goalLineHeavy;
      if ((this.down === 3 && this.distance >= 7) || this.hurry()) w *= heavy ? C.passingDownHeavy : 1;
      return w;
    });
    return this.rng.weighted(Object.keys(t.personnel) as Personnel[], weights);
  }

  private defensePackage(personnel: Personnel): Package {
    const t = this.teams[other(this.offense)].tendencies.defense;
    const receivers = 5 - Number(personnel[0]) - Number(personnel[1]);
    const factor = C.packageByReceivers[Math.min(4, Math.max(1, receivers)) as 1 | 2 | 3 | 4];
    return this.rng.weighted<Package>(
      ['base', 'nickel', 'dime'],
      [t.packages.base * factor[0], t.packages.nickel * factor[1], t.packages.dime * factor[2]]
    );
  }

  private fill(personnel: Personnel, pkg: Package): void {
    const off: OnField = new Map();
    const used = new Set<SimPlayer>();
    const offense = this.offense;
    for (const slot of PERSONNEL_SLOTS[personnel]) {
      // The lead back splits snaps with the change-of-pace back by the scheme's share (spec 12.3).
      const s: Slot = slot === 'RB1' && !this.rng.chance(TUNING.situations.rb1Share) ? 'RB2' : slot;
      const p = this.pick(offense, s, used) ?? this.pick(offense, slot, used);
      if (p) {
        off.set(s, p);
        used.add(p);
      }
    }
    // A fourth receiver in 10 personnel or a third tight end in 13, from deeper in the depth chart.
    const extra = EXTRA_SLOT[personnel];
    if (extra) {
      const p = this.pick(offense, extra, used, 1);
      if (p) {
        off.set(`${extra}+` as Slot, p);
        used.add(p);
      }
    }
    const def: OnField = new Map();
    const dUsed = new Set<SimPlayer>();
    for (const slot of PACKAGE_SLOTS[pkg]) {
      const p = this.pick(other(offense), slot, dUsed);
      if (p) {
        def.set(slot, p);
        dUsed.add(p);
      }
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
      const hurry = side === this.offense && this.hurry() ? K.hurryFatigue : 0;
      const altitude = side !== 'home' && w.altitudeFt >= K.altitudeFt ? S.altitudeFatigue : 0;
      for (const p of Object.values(team.players)) {
        if (onField.has(p)) {
          const cost =
            S.fatigue[POSITION_GROUP[p.position]] *
            (1.5 - p.stamina / 100) *
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

  private hurry(): boolean {
    const q = this.quarter;
    if (q === 2 && this.clock <= C.hurryHalfSeconds) return true;
    return q >= 4 && this.margin < 0 && this.clock <= C.hurrySeconds;
  }

  private milking(): boolean {
    return this.quarter >= 4 && this.margin > 0 && this.clock <= C.milkSeconds;
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
    const altitude = this.setup.weather.altitudeFt >= K.altitudeFt ? C.altitudeRange : 0;
    return (
      this.fgDistance() <=
      S.fgMaxDistance + bonus + altitude - (this.setup.weather.windMph >= 20 ? C.windRangeLoss : 0)
    );
  }

  /** Fourth down: go for it, kick a field goal, or punt (spec 8.3 step 2). */
  private fourthDown(): 'go' | 'fg' | 'punt' {
    const coach = this.teams[this.offense].coach;
    const late = this.quarter >= 4;
    const deficit = -this.margin;
    const range = this.fgRange();
    const seconds = this.halfSeconds;
    if (late && deficit > 0) {
      // Behind late: a field goal only helps if it ties or wins; otherwise keep the drive alive.
      if (range && deficit <= 3) return 'fg';
      if (seconds <= C.desperationSeconds) return 'go';
      if (deficit > 8 && seconds <= C.desperationSeconds * 2 && this.distance <= 5) return 'go';
    }
    if (this.quarter === 2 && this.clock <= C.endHalfFgSeconds && range) return 'fg';
    const goal = 100 - this.ball;
    const index = this.distance <= 1 ? 0 : this.distance <= 2 ? 1 : this.distance <= 5 ? 2 : 3;
    const plus = this.ball >= 50;
    let go = (plus ? S.goRate : S.goRateOwnHalf)[index] as number;
    go *= 0.6 + (coach.aggressiveness / 100) * 0.8;
    if (late && this.margin > 0) go *= C.leadingGoFactor;
    if (goal <= this.distance && goal <= 2) go = Math.max(go, C.goalLineGo);
    if (this.rng.chance(clamp(go, 0, 1))) return 'go';
    if (!range) return 'punt';
    // Long tries depend on the kicker's leg; otherwise the coach punts to pin the other team deep.
    const distance = this.fgDistance();
    if (distance <= C.fgRoutine) return 'fg';
    const k = this.kicker(this.offense);
    const tryLong =
      1 - (distance - C.fgRoutine) * C.fgFadePerYard + (k ? k.edges.kickPower * C.fgPowerShare : 0);
    return this.rng.chance(clamp(tryLong, 0.05, 0.95)) ? 'fg' : 'punt';
  }

  // ---------------------------------------------------------------------------------------------------
  // The snap

  private snap(): void {
    if (this.over) return;
    const off = this.offense;
    const def = other(off);
    this.contexts = this.currentContexts();
    if (this.ball >= 80 && !this.redZoneCounted) {
      this.redZoneCounted = true;
      this.totals[off].redZoneTrips++;
    }

    // End of half or game: kneel with the lead, or try the field goal with the clock expiring.
    if (this.shouldKneel()) return this.kneel();
    if (this.down === 4) {
      const choice = this.fourthDown();
      if (choice === 'punt') return this.punt();
      if (choice === 'fg') return this.fieldGoal();
    } else if (
      this.lateHalf() &&
      this.clock <= C.lastSecondsFg &&
      this.fgRange() &&
      (this.quarter === 2 || this.margin >= -3)
    ) {
      return this.fieldGoal();
    }

    const personnel = this.personnel();
    const pkg = this.defensePackage(personnel);
    this.fill(personnel, pkg);
    const call = this.callPlay();
    const dcall = this.defenseCall();

    // Pre-snap fouls (spec 8.3 step 6): the play doesn't happen.
    const pre = this.preSnapFoul(off, def);
    if (pre) return;

    const startBall = this.ball;
    const down = this.down;
    const distance = this.distance;
    this.buffer = [];
    const outcome = call.kind === 'pass' ? this.pass(call, dcall) : this.rush(call, dcall);
    this.plays++;
    this.wear();

    const foul = this.liveFoul(call, outcome);
    const verdict = foul ? this.enforce(foul, outcome, startBall, down, distance) : 'stands';
    this.injuryCheck(outcome);
    if (verdict === 'wiped') {
      this.discard();
      if (this.down > 4) return this.turnoverOnDowns();
      return this.afterPlay(true, K.penaltySeconds);
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
      return this.afterPlay(true, K.penaltySeconds);
    }
    this.apply(outcome, startBall, down, distance);
  }

  private currentContexts(): ContextTrigger[] {
    const out: ContextTrigger[] = [];
    if (this.ball >= 80) out.push('redZone');
    if (this.down === 3) out.push('thirdDown');
    if (this.lateHalf() && this.clock <= K.twoMinute) out.push('twoMinute');
    if (this.quarter >= 4 && Math.abs(this.margin) <= 8) out.push('lateAndClose');
    if (this.bad) out.push('badWeather');
    return out;
  }

  /**
   * Victory formation: with the lead late in the game and too little time for the defense to get the ball
   * back, or at the end of the first half deep in its own territory.
   */
  private shouldKneel(): boolean {
    if (this.quarter === 2) return this.clock <= C.kneelHalfSeconds && this.ball < 50 && this.down < 4;
    if (this.quarter < 4 || this.margin <= 0) return false;
    const defTimeouts = this.timeouts[other(this.offense)];
    const snapsLeft = 4 - this.down;
    // The clock runs 40 seconds after each kneel unless the defense stops it with a timeout.
    const canBurn = snapsLeft * K.kneelSeconds - defTimeouts * K.kneelSeconds + K.kneelPlaySeconds;
    return this.down < 4 ? this.clock <= canBurn + K.kneelSeconds : this.clock <= K.kneelPlaySeconds + 1;
  }

  private kneel(): void {
    const qb = this.pick(this.offense, 'QB', new Set());
    this.plays++;
    this.totals[this.offense].plays++;
    if (this.drive) this.drive.plays++;
    this.add(this.offense, qb, 'rushAtt');
    this.add(this.offense, qb, 'rushYds', -1);
    this.ball = Math.max(1, this.ball - 1);
    this.down++;
    this.distance++;
    if (this.drive) this.drive.yards -= 1;
    const defense = other(this.offense);
    if (!this.tick(K.kneelPlaySeconds)) return this.endPeriod();
    if (this.quarter >= 4 && this.timeouts[defense] > 0 && this.margin <= 16) this.timeouts[defense]--;
    else if (!this.tick(K.kneelSeconds)) return this.endPeriod();
    if (this.down > 4) return this.turnoverOnDowns();
  }

  private callPlay(): Call {
    const team = this.teams[this.offense];
    const t = team.tendencies.offense;
    let pass = t.passRate[DOWN_BUCKETS(this.down, this.distance)] + team.lean + this.adjust[this.offense];
    const goal = 100 - this.ball;
    const deficit = -this.margin;
    if (this.quarter >= 4 && deficit > 3 && this.clock <= C.lateTrailingSeconds)
      pass = Math.max(pass, C.lateTrailingPass);
    else if (this.quarter >= 4 && deficit > 0 && this.clock <= C.hurrySeconds)
      pass = Math.max(pass, C.lateTrailingPass);
    if (this.milking()) pass *= C.leadingRunShift;
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
      if (this.down === 3 && this.distance <= 4) deep *= C.deepShortYardage;
      if (goal < 20) deep = 0;
      const screen = this.down === 3 && this.distance >= 7 ? t.screen * C.screenThirdLong : t.screen;
      const r = this.rng.float();
      const depth: Depth =
        r < screen
          ? 'screen'
          : r < screen + deep
            ? 'deep'
            : r < screen + deep + TUNING.situations.intermediateShare
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
    const t = this.teams[other(this.offense)].tendencies.defense;
    const blitz = this.rng.chance(t.blitz * (this.down === 3 ? C.blitzThirdDown : 1));
    const shells = Object.keys(t.shells) as Shell[];
    return {
      man: this.rng.chance(t.man),
      shell: this.rng.weighted(
        shells,
        shells.map(s => t.shells[s])
      ),
      blitz,
      simPressure: !blitz && this.rng.chance(t.simPressure)
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
      if (p && rushers.length < (dcall.blitz ? C.blitzRushers : 4) + 1) rushers.push([slot, p]);
    }
    if (dcall.simPressure && rushers.length > 4) rushers.shift();
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
    const rush =
      rushers.reduce((sum, [slot, p]) => sum + this.edge(def, p, slot, 'passRush', ['passRush']), 0) /
      Math.max(1, rushers.length);
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
        (passBlockSlider - 1) * C.sliderLogit
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
      const rusher = this.bestOf(rushers, def, 'passRush');
      if (rusher) this.add(def, rusher, 'qbHits');
      if (this.rng.chance(pSack)) return this.sack(qb, rusher, base);
      const scrambleP =
        S.scrambleGivenPressure +
        S.scrambleTendency *
          this.teams[off].tendencies.offense.scramble *
          (qb.traits.qbStyle === 'scrambling'
            ? C.scramblerFactor
            : qb.traits.qbStyle === 'pocket'
              ? C.pocketFactor
              : 1);
      if (this.rng.chance(scrambleP)) return this.scramble(qb, base);
      const throwAway =
        S.throwAwayGivenPressure +
        (qb.traits.throwAway ? S.throwAwayTrait : 0) +
        (sense === 'paranoid' ? C.paranoidThrowAway : 0);
      if (this.rng.chance(throwAway)) {
        this.add(off, qb, 'passAtt');
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

  private sack(qb: SimPlayer, rusher: SimPlayer | null, base: PlayOutcome): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    const yards = -Math.min(
      this.ball - 0,
      Math.round(
        C.sackYards[0] + this.rng.float() * (C.sackYards[1] - C.sackYards[0]) + this.rng.normal(0, 1)
      )
    );
    this.add(off, qb, 'sacked');
    this.add(off, qb, 'sackYds', -yards);
    this.add(def, rusher, 'sacks');
    this.add(def, rusher, 'tacklesForLoss');
    this.add(def, rusher, 'tackles');
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
      Math.max(C.scrambleFloor, Math.round(this.rng.normal(0, 2) + -Math.log(1 - this.rng.float()) * mean))
    );
    this.add(off, qb, 'rushAtt');
    this.add(off, qb, 'rushYds', yards);
    this.long(off, qb, 'rushLong', yards);
    const tackler = this.tacklerFor(['MIKE', 'WILL', 'SS', 'FS', 'LEDGE', 'REDGE']);
    this.add(other(off), tackler, 'tackles');
    const oob = this.rng.chance(C.scrambleOutOfBounds);
    return {
      ...base,
      yards,
      kind: 'run',
      incomplete: false,
      stops: oob && this.oobStops(),
      ballCarrier: qb,
      tackler,
      pressured: true,
      description: `${qb.short} scrambles for ${yards}`
    };
  }

  private oobStops(): boolean {
    return (
      (this.quarter === 2 && this.clock <= K.twoMinute) || (this.quarter >= 4 && this.clock <= K.fiveMinutes)
    );
  }

  private tacklerFor(slots: readonly DefenseSlot[]): SimPlayer | null {
    const def = other(this.offense);
    const players = slots.flatMap(s => {
      const p = this.at(def, s);
      return p ? [[s, p] as [Slot, SimPlayer]] : [];
    });
    return this.bestOf(players, def, 'tackle');
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
    // Receivers running routes, and who covers each (spec 8.3 step 5: target selection).
    const routes: { slot: Slot; tslot: TargetSlot | 'EXTRA'; player: SimPlayer; share: number }[] = [];
    for (const [slot, player] of this.field[off]) {
      const tslot = slot.endsWith('+') ? 'EXTRA' : (slot as TargetSlot);
      if (!(tslot in COVERAGE)) continue;
      const share = tslot === 'EXTRA' ? t.targets.SLOT : t.targets[tslot];
      routes.push({ slot, tslot, player, share: share + C.minTargetShare });
    }
    if (!routes.length) return base;
    const coverTrig: PlayTrigger = dcall.man ? 'versusMan' : 'versusZone';
    const depthTrig: PlayTrigger = call.depth === 'deep' ? 'deepPass' : 'shortPass';
    const routeId: CompositeId =
      call.depth === 'deep' ? 'routeDeep' : call.depth === 'intermediate' ? 'routeMid' : 'routeShort';
    const scored = routes.map(r => {
      const defSlot = COVERAGE[r.tslot].find(s => this.at(def, s)) ?? null;
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
      const press =
        dcall.man && defender && this.rng.chance(this.teams[def].tendencies.defense.press)
          ? C.pressWeight * (r.player.edges.routeShort - defender.edges.manCover) * 0.1
          : 0;
      const sep =
        route -
        cover +
        press +
        (call.playAction ? C.playActionSeparation : 0) +
        (dcall.blitz ? C.blitzSeparation : 0) -
        this.teams[def].cohesion.defense.execution * C.cohesionSeparation;
      return { ...r, defender, defSlot, sep };
    });
    const depthFavor = (tslot: TargetSlot | 'EXTRA') =>
      call.depth === 'deep'
        ? (C.deepFavor[tslot] ?? 1)
        : call.depth === 'screen'
          ? (C.screenFavor[tslot] ?? 1)
          : 1;
    const weights = scored.map(r => r.share * depthFavor(r.tslot) * Math.exp(r.sep * C.openness));
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

    // Throw quality and interception chance (spec 8.3: accuracy by depth, under pressure, on the run).
    const accId: CompositeId =
      call.depth === 'deep' ? 'accDeep' : call.depth === 'intermediate' ? 'accMid' : 'accShort';
    const qbTriggers: PlayTrigger[] = [
      'dropback',
      depthTrig,
      ...(pressured ? (['facingBlitz'] as const) : [])
    ];
    // Play-action bootlegs move the quarterback out of the pocket to throw on the run.
    const bootleg = call.playAction && this.rng.chance(C.bootlegShare);
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
    const wetLogit = weather.precipitation !== 'none' ? S.wetPassLogit * impact : 0;
    const windLogit =
      call.depth === 'deep' ? S.windDeepLogitPerMph * Math.max(0, weather.windMph - C.calmMph) * impact : 0;
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
    if (this.rng.chance(pInt) && defender) return this.interception(qb, rec, defender, base, depthKey);

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
          (this.ball >= 80 ? C.redZoneCompletion : 0) + wetLogit + windLogit + (call.playAction ? C.playActionLogit : 0) +
          (this.slider(off, 'qbAccuracy') - 1) * C.sliderLogit + (this.slider(off, 'wrCatching') - 1) * C.sliderLogit -
          (this.slider(def, 'passCoverage') - 1) * C.sliderLogit + (this.output('passingEfficiency') - 1) * C.sliderLogit
      ); // prettier-ignore
    if (!this.rng.chance(pComplete)) {
      // A drop is on the receiver; the rest are misses or breakups.
      const drops =
        S.dropShare *
        (rec.traits.dropsOpenPasses ? C.dropsTrait : 1) *
        (weather.precipitation !== 'none' ? C.wetDrops : 1);
      if (this.rng.chance(drops)) this.add(off, rec, 'drops');
      else if (defender && this.rng.chance(C.breakupShare)) this.add(def, defender, 'passesDefended');
      return {
        ...base,
        air: this.airYards(depthKey),
        covering: defender,
        description: `${qb.short} pass incomplete to ${rec.short}`
      };
    }

    // Completion: air yards, then yards after the catch against the tackle (spec 8.3 step 5).
    const goal = 100 - this.ball;
    const air = Math.min(goal, this.airYards(depthKey));
    const elusive =
      this.edge(off, rec, target.slot, 'elusive', ['openField']) * 0.5 +
      this.edge(off, rec, target.slot, 'burst', ['openField', depthTrig]) * 0.5;
    const tacklerSlot = target.defSlot ?? 'FS';
    const tacklePlayer = this.at(def, tacklerSlot) ?? defender;
    const tackle = tacklePlayer ? this.edge(def, tacklePlayer, tacklerSlot, 'tackle', ['openField']) : 0;
    const yacMean = Math.max(
      C.yacFloor,
      S.yac[depthKey] * (1 + (elusive - tackle) * C.yacPerPoint) * (rec.traits.yacCatch ? C.yacTrait : 1)
    );
    let yac = Math.round(-Math.log(1 - this.rng.float()) * yacMean);
    const broken = this.rng.chance(
      sigmoid(
        logit(S.brokenTackle) +
          S.edge.breakaway * (elusive - tackle) -
          (this.slider(def, 'tackling') - 1) * C.sliderLogit
      )
    );
    if (broken) yac += Math.round(-Math.log(1 - this.rng.float()) * S.brokenTackleYards);
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
    const touchdown = this.ball + gained >= 100;
    if (!touchdown) this.add(def, tacklePlayer, 'tackles');
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
      ...base, yards, incomplete: false, stops: touchdown || (oob && this.oobStops()), air, ballCarrier: rec, tackler: tacklePlayer,
      covering: defender, pressured, description: `${qb.short} pass to ${rec.short} for ${yards}`
    }; // prettier-ignore
  }

  private airYards(depth: Depth): number {
    switch (depth) {
      case 'screen':
        return Math.round(S.screenAir[0] + this.rng.float() * (S.screenAir[1] - S.screenAir[0]));
      case 'short':
        return 1 + (Math.floor(-Math.log(1 - this.rng.float()) * S.airShortMean) % 9);
      case 'intermediate':
        return 10 + Math.floor(this.rng.float() * 10);
      default:
        return 20 + Math.round(-Math.log(1 - this.rng.float()) * S.airDeepMean);
    }
  }

  private interception(
    qb: SimPlayer,
    rec: SimPlayer,
    defender: SimPlayer,
    base: PlayOutcome,
    depth: Depth
  ): PlayOutcome {
    const off = this.offense;
    const def = other(off);
    this.add(off, qb, 'passInt');
    this.add(def, defender, 'defInt');
    this.add(def, defender, 'passesDefended');
    const air = Math.min(100 - this.ball, this.airYards(depth));
    const back = Math.round(-Math.log(1 - this.rng.float()) * C.intReturnMean);
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
    for (const slot of [...LINE, 'TE1', 'TE2', 'FB'] as Slot[]) {
      const p = this.at(off, slot);
      if (!p) continue;
      this.note(off, slot, lane, ...(LINE.includes(slot as OffenseSlot) ? (['contactAtLine'] as const) : []));
      const weight = slot === 'FB' ? C.leadWeight : slot === 'TE1' || slot === 'TE2' ? C.teBlockWeight : 1;
      const id: CompositeId = slot === 'FB' ? 'leadBlock' : zone ? 'runBlockZone' : 'runBlockGap';
      block += weight * this.edge(off, p, slot, id, [lane, 'contactAtLine']);
      count += weight;
    }
    block /= Math.max(1, count);
    let stop = 0;
    let dcount = 0;
    const box: DefenseSlot[] = ['LEDGE', 'REDGE', 'DT1', 'DT2', 'FLEX', 'MIKE', 'WILL', 'SS'];
    for (const slot of box) {
      const p = this.at(def, slot);
      if (!p) continue;
      this.note(def, slot, lane, ...(FRONT.includes(slot) ? (['contactAtLine'] as const) : []));
      const weight = slot === 'SS' ? C.safetyBoxWeight : 1;
      stop += weight * this.edge(def, p, slot, 'runStop', [lane, 'contactAtLine']);
      dcount += weight;
    }
    stop /= Math.max(1, dcount);
    const light = (this.field[def].has('NCB') ? 1 : 0) + (this.field[def].has('DIME') ? 1 : 0);
    const runFit = this.teams[def].tendencies.defense.runFit;
    const net =
      block -
      stop +
      ((light * S.lightBox) / S.blockYardsPerPoint) * 0.1 +
      (this.slider(off, 'runBlocking') - 1) * C.sliderPoints;
    const cohesionOff =
      this.teams[off].cohesion.offense.execution * this.setup.sliders.general.cohesionEffect;
    const pStuff = sigmoid(
      logit(S.stuff) +
        (100 - this.ball <= 5 ? C.goalLineStuff : 0) -
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
    if (this.rng.chance(pStuff)) {
      yards = -Math.floor(this.rng.float() * S.stuffYards);
      tackler = this.tacklerFor(['DT1', 'DT2', 'LEDGE', 'REDGE', 'FLEX', 'MIKE']);
      if (zone) this.note(off, carrierSlot, 'contactAtLine');
      if (tackler) {
        const slot = this.slotOf(def, tackler);
        if (slot) this.note(def, slot, 'contactAtLine');
      }
      if (yards < 0) this.add(def, tackler, 'tacklesForLoss');
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
      if (yards <= 2 && zone) this.note(off, carrierSlot, 'contactAtLine');
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
      }
    }
    yards = Math.min(goal, yards);
    if (this.ball + yards <= 0) yards = -this.ball;
    this.add(off, carrier, 'rushAtt');
    this.add(off, carrier, 'rushYds', yards);
    this.long(off, carrier, 'rushLong', yards);
    const touchdown = this.ball + yards >= 100;
    if (!touchdown && this.ball + yards > 0) this.add(def, tackler, 'tackles');

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
          stops: true,
          tackler,
          description: `${carrier.short} fumbles`
        };
      }
    }
    const oob = this.rng.chance(S.outOfBoundsRun * (inside ? 0.5 : 1.6));
    return {
      ...base,
      yards,
      stops: touchdown || (oob && this.oobStops()),
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

  /** Charges a foul to a player (never wiped with the play). */
  private charge(side: Side, players: readonly SimPlayer[], yards: number): void {
    if (!players.length) return;
    const who = players[
      this.rng.weightedIndex(players.map(p => S.discipline[p.traits.penalty]))
    ] as SimPlayer;
    const l = this.line(side, who);
    l.penalties++;
    l.penaltyYds += yards;
  }

  /** Half the distance to the goal when the yardage would reach past it. */
  private enforceYards(yards: number, towardOwnGoal: boolean, from = this.ball): number {
    return Math.min(yards, Math.floor((towardOwnGoal ? from : 100 - from) / 2));
  }

  /** Dead-ball fouls before the snap. Returns true when one happened (the play doesn't). */
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
      if (!this.rng.chance(rate)) continue;
      const againstOffense = side === off;
      const yards = this.enforceYards(rules[id].yards, againstOffense);
      this.charge(side, players, yards);
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

  /** A live-ball foul during the play, if any. */
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
      if (!outcome.sack && !outcome.throwAway) {
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
    for (const [id, side, players, rate] of options) if (this.rng.chance(rate)) return { id, side, players };
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
      // The defense declines when the play already went worse for the offense, or on third down
      // when declining brings up fourth down.
      const yards = this.enforceYards(rule.yards, true, start);
      const failed = gained < distance;
      if (outcome.turnover || outcome.sack || gained <= -yards || (down === 3 && failed && !rule.lossOfDown))
        return 'stands';
      this.charge(off, foul.players, yards);
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
      this.charge(foul.side, foul.players, yards);
      return 'added';
    }
    // Otherwise the offense takes the better of the play and the penalty from the previous spot.
    const yards = rule.spotFoul
      ? Math.min(Math.max(1, outcome.air), 99 - start)
      : this.enforceYards(rule.yards, false, start);
    const playBetter =
      !outcome.turnover && (scored || (gained >= yards && (gained >= distance || !rule.automaticFirstDown)));
    if (playBetter) return 'stands';
    this.charge(foul.side, foul.players, yards);
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

  private firstDown(kind: 'pass' | 'run' | 'penalty'): void {
    const off = this.offense;
    this.down = 1;
    this.distance = Math.min(10, 100 - this.ball);
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
      // An interception in the end zone is a touchback unless the return gets past the 20.
      const defBall =
        spot >= 100
          ? outcome.returnYards >= 20
            ? outcome.returnYards
            : 20
          : 100 - clamp(spot, 1, 99) + outcome.returnYards;
      this.endDrive(outcome.turnover === 'interception' ? 'interception' : 'fumble');
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
      this.possess(def, Math.max(1, defBall));
      this.afterPlay(true, 0);
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
    } else {
      this.down = down + 1;
      this.distance = distance - outcome.yards;
      if (this.down > 4) {
        this.turnoverOnDowns();
        return;
      }
    }
    this.afterPlay(outcome.stops, 0);
  }

  /** Clock after a play: the play's time, then (if the clock runs) the time before the next snap. */
  private afterPlay(stops: boolean, extra: number): void {
    if (this.over) return;
    const played = K.playSeconds[0] + this.rng.float() * (K.playSeconds[1] - K.playSeconds[0]) + extra;
    if (!this.tick(played)) return this.endPeriod();
    if (stops || this.over) return;
    // Timeouts late in a half (spec 8.3 step 2: timeouts and clock management).
    const off = this.offense;
    const def = other(off);
    if (this.lateHalf() && this.timeouts[off] > 0 && this.wantsOffenseTimeout()) {
      this.timeouts[off]--;
      return;
    }
    // A defense behind late stops the clock to get the ball back with time left.
    if (
      this.quarter >= 4 &&
      this.timeouts[def] > 0 &&
      this.margin >= 0 &&
      this.margin <= 16 &&
      this.clock <= C.defenseTimeoutSeconds
    ) {
      this.timeouts[def]--;
      return;
    }
    const tempo = this.teams[off].tendencies.offense.tempo;
    const runoff = this.hurry()
      ? K.runoff.hurry
      : this.milking()
        ? K.runoff.milk
        : K.runoff.normal + (0.5 - tempo) * K.tempoSpread;
    const skill = this.teams[off].coach.clock;
    const waste = this.hurry() ? (1 - skill / 100) * K.clockWaste : 0;
    if (!this.tick(runoff + waste)) this.endPeriod();
  }

  private wantsOffenseTimeout(): boolean {
    if (this.quarter === 2) return this.clock <= C.timeoutHalfSeconds && this.ball >= C.timeoutHalfFromBall;
    return this.margin <= 0 && this.clock <= C.timeoutGameSeconds;
  }

  private turnoverOnDowns(): void {
    const def = other(this.offense);
    this.endDrive('downs');
    this.possess(def, 100 - this.ball);
    this.afterPlay(true, 0);
  }

  private safety(scoringTeam: Side): void {
    const conceding = other(scoringTeam);
    this.endDrive('safety');
    this.offense = conceding;
    const defenders = [...this.field[scoringTeam].values()];
    const who = defenders.length
      ? (defenders[Math.floor(this.rng.float() * defenders.length)] as SimPlayer)
      : null;
    this.add(scoringTeam, who, 'safeties');
    this.scored(scoringTeam, 'safety', 2, 'Safety');
    if (this.overtime) {
      this.finish();
      return;
    }
    // The conceding team free kicks from its own 20.
    this.afterPlay(true, 0);
    if (!this.over) this.kickoff(conceding, true);
  }

  /** A touchdown: the try, then the kickoff (spec 16 rules). `defensive` for interception and fumble returns. */
  private touchdown(team: Side, description: string, defensive = false): void {
    if (!defensive && team === this.offense && this.redZoneCounted) this.totals[team].redZoneTd++;
    this.endDrive('touchdown');
    this.scored(team, 'touchdown', 6, description);
    // Overtime: a defensive score ends it; so does any score once both teams have had the ball.
    if (this.overtime && (defensive || this.bothPossessedAndAhead())) return this.finish();
    this.tryAfter(team);
    if (this.over) return;
    this.afterPlay(true, 0);
    if (!this.over) this.kickoff(team);
  }

  private bothPossessedAndAhead(): boolean {
    const both =
      !this.setup.rules.overtime.bothTeamsPossess ||
      (this.otPossessions.home > 0 && this.otPossessions.away > 0);
    return both && this.score.home !== this.score.away;
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
      const qb = this.pick(team, 'QB', new Set());
      const success = this.rng.chance(
        clamp(S.twoPointSuccess + (off.boost - this.teams[other(team)].boost) * C.twoPointPerPoint, 0.2, 0.8)
      );
      if (success) {
        const who = this.pick(team, this.rng.chance(0.5) ? 'RB1' : 'X', new Set());
        this.add(team, who, 'twoPointMade');
        this.scored(team, 'twoPoint', 2, `Two-point conversion by ${who?.short ?? off.name}`);
        void qb;
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
    const distance = this.setup.rules.extraPointSpot + C.fgSnapYards + 1;
    this.add(team, kicker, 'xpAtt');
    if (this.rng.chance(this.kickChance(team, kicker, distance))) {
      this.add(team, kicker, 'xpMade');
      this.points(team, 1);
      const last = this.scoring[this.scoring.length - 1];
      if (last) {
        last.points += 1;
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
    let x = S.fgLogit25 + S.fgPerYard * (distance - 25) + S.edge.kick * (acc + power * long);
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
    this.add(off, kicker, 'fgAtt');
    if (distance >= 40 && distance < 50) this.add(off, kicker, 'fgAtt40');
    if (distance >= 50) this.add(off, kicker, 'fgAtt50');
    this.tick(K.kickSeconds);
    if (this.rng.chance(this.kickChance(off, kicker, distance))) {
      this.add(off, kicker, 'fgMade');
      if (distance >= 40 && distance < 50) this.add(off, kicker, 'fgMade40');
      if (distance >= 50) this.add(off, kicker, 'fgMade50');
      this.long(off, kicker, 'fgLong', distance);
      this.endDrive('fieldGoal');
      this.scored(off, 'fieldGoal', 3, `${kicker?.short ?? 'Team'} ${distance} yd field goal`);
      if (this.overtime && this.bothPossessedAndAhead()) return this.finish();
      if (this.clock <= 0) return this.endPeriod();
      this.kickoff(off);
      return;
    }
    // A miss: the defense takes over at the spot of the kick, or its 20 if that is closer to its goal.
    const kickSpot = this.ball - (C.fgSnapYards - 10);
    this.endDrive('missedFieldGoal');
    this.possess(def, Math.max(20, 100 - kickSpot));
    if (this.clock <= 0) this.endPeriod();
  }

  private punt(): void {
    const off = this.offense;
    const def = other(off);
    const punter = this.pick(off, 'P', new Set());
    this.plays++;
    this.note(off, 'P', 'kick');
    this.endDrive('punt');
    this.add(off, punter, 'punts');
    const w = this.setup.weather;
    const wind = w.indoor
      ? 0
      : (this.rng.float() - 0.5) * w.windMph * C.puntWind * this.setup.sliders.general.weatherImpact;
    const power = punter ? this.edge(off, punter, 'P', 'kickPower', ['kick']) : -5;
    const altitude = w.altitudeFt >= K.altitudeFt ? C.puntAltitude : 0;
    let gross = Math.round(
      this.rng.normal(S.puntMean + power * C.puntPerPoint + altitude + wind, S.puntSd) *
        this.slider(off, 'puntPower')
    );
    const toGoal = 100 - this.ball;
    let receiveAt: number;
    let returned = 0;
    let net: number;
    if (this.rng.chance(S.puntBlocked)) {
      gross = 0;
      receiveAt = 100 - (this.ball - C.blockedPuntLoss);
      net = -C.blockedPuntLoss;
    } else if (gross >= toGoal) {
      // Into the end zone: a touchback at the 20.
      this.add(off, punter, 'puntTouchbacks');
      gross = toGoal;
      receiveAt = 20;
      net = toGoal - 20;
    } else {
      const landing = this.ball + gross;
      const returner = this.pick(def, 'PR', new Set());
      const deep = 100 - landing <= 10;
      const r = this.rng.float();
      if (deep || r < S.puntFairCatch) {
        if (!deep) this.add(def, returner, 'fairCatches');
        receiveAt = 100 - landing;
      } else if (r < S.puntFairCatch + S.puntReturned && returner) {
        this.note(def, 'PR', 'carry', 'openField');
        const edge = this.edge(def, returner, 'PR', 'returner', ['openField', 'carry']);
        returned = Math.round(
          -Math.log(1 - this.rng.float()) * Math.max(2, S.puntReturnMean + edge * C.returnPerPoint)
        );
        this.add(def, returner, 'puntReturns');
        if (this.rng.chance(C.returnTdPunt)) returned = landing;
        const maxReturn = landing;
        returned = Math.min(returned, maxReturn);
        this.add(def, returner, 'puntReturnYds', returned);
        this.long(def, returner, 'puntReturnLong', returned);
        if (this.rng.chance(S.penaltyRates.illegalBlockInBack * this.output('penalties'))) {
          const players = this.unit(def, ['MIKE', 'WILL', 'SS', 'CB2']);
          const yards = this.setup.rules.penalties.illegalBlockInBack.yards;
          this.charge(def, players, yards);
          returned = Math.max(-5, returned - yards);
        }
        receiveAt = 100 - landing + returned;
        if (receiveAt >= 100) {
          this.add(def, returner, 'puntReturnTd');
          this.offense = def;
          this.startDrive(def);
          this.touchdown(def, `${returner.short} punt return`);
          this.add(off, punter, 'puntYds', gross);
          this.add(off, punter, 'puntNetYds', gross - landing);
          return;
        }
      } else {
        receiveAt = 100 - landing;
      }
      net = gross - returned;
      if (100 - landing <= 20 && receiveAt <= 20) this.add(off, punter, 'puntsIn20');
    }
    this.add(off, punter, 'puntYds', gross);
    this.add(off, punter, 'puntNetYds', net);
    this.long(off, punter, 'puntLong', gross);
    this.tick(K.kickSeconds);
    this.possess(def, receiveAt);
    if (this.clock <= 0) this.endPeriod();
  }

  /** A kickoff (spec 8.3: current kickoff rules from the rule set) or a free kick after a safety. */
  private kickoff(kicker: Side, afterSafety = false): void {
    if (this.over) return;
    const receiver = other(kicker);
    const rules = this.setup.rules.kickoff;
    const k = this.kicker(kicker);
    this.note(kicker, 'K', 'kick');
    const behind = this.score[kicker] - this.score[receiver];
    const onsideAllowed =
      (!rules.onsideOnlyWhenTrailing || behind < 0) && (!rules.onsideFourthQuarterOnly || this.quarter >= 4);
    const lateTrailing =
      this.quarter >= 4 && behind < 0 && behind >= -C.onsideMaxDeficit && this.clock <= C.onsideSeconds;
    if (!afterSafety && onsideAllowed && lateTrailing && this.rng.chance(C.onsideChance)) {
      this.tick(K.kickSeconds / 2);
      if (this.rng.chance(S.onsideRecovery)) {
        this.possess(kicker, 100 - (rules.spot + C.onsideYards));
      } else {
        this.possess(receiver, 100 - (rules.spot + C.onsideYards));
      }
      if (this.clock <= 0) this.endPeriod();
      return;
    }
    const returner = this.pick(receiver, 'KR', new Set());
    const r = this.rng.float();
    const power = k ? k.edges.kickPower * C.kickoffPowerShift : 0;
    const returnable =
      S.kickoffReturnable - power + (1 - this.slider(kicker, 'kickoffPower')) * C.kickoffSliderShift;
    let start: number;
    if (afterSafety) {
      // A free kick from the 20 travels about 45 yards, then is returned.
      const landing = C.freeKickLanding;
      start = 100 - (20 + landing) + Math.round(this.rng.normal(S.kickReturnMean * 0.5, S.kickReturnSd));
    } else if (r < S.kickoffShort) {
      start = rules.shortSpot;
    } else if (r < S.kickoffShort + S.kickoffLandingRollTouchback) {
      start = rules.landingZoneTouchback;
    } else if (r < S.kickoffShort + S.kickoffLandingRollTouchback + returnable && returner) {
      // Caught inside the landing zone and returned (spec 8.3: return rating, blocking, and coverage).
      this.note(receiver, 'KR', 'carry', 'openField');
      const caught =
        S.kickoffLanding[0] + Math.floor(this.rng.float() * (S.kickoffLanding[1] - S.kickoffLanding[0]));
      const edge = this.edge(receiver, returner, 'KR', 'returner', ['openField', 'carry']);
      let back = Math.max(
        0,
        Math.round(this.rng.normal(S.kickReturnMean + edge * C.returnPerPoint, S.kickReturnSd))
      );
      if (this.rng.chance(S.returnTouchdown)) back = 100;
      if (this.rng.chance(S.penaltyRates.illegalBlockInBack * this.output('penalties'))) {
        const yards = this.setup.rules.penalties.illegalBlockInBack.yards;
        this.charge(receiver, this.unit(receiver, ['MIKE', 'WILL', 'SS']), yards);
        back = Math.max(0, back - yards);
      }
      this.add(receiver, returner, 'kickReturns');
      const total = Math.min(100 - caught, back);
      this.add(receiver, returner, 'kickReturnYds', total);
      this.long(receiver, returner, 'kickReturnLong', total);
      start = caught + total;
      this.tick(K.returnSeconds);
      if (start >= 100) {
        this.add(receiver, returner, 'kickReturnTd');
        this.offense = receiver;
        this.startDrive(receiver);
        this.touchdown(receiver, `${returner.short} kickoff return`);
        return;
      }
    } else {
      start = rules.touchback;
    }
    this.possess(receiver, start);
    if (this.clock <= 0) this.endPeriod();
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
    for (const [side, p] of involved) {
      if (p.out) continue;
      const risk =
        S.injuryRate *
        (1.6 - p.injury / 99) *
        (1.3 - p.toughness / 200) *
        (1 + Math.max(0, 70 - p.energy) / 100) *
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
