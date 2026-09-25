/**
 * What a team brings to a game beyond its roster and schemes: the week's game plan (spec 8.7) and its
 * rotations and packages (spec 12.3). The coaching staff sets them each week, or the user does.
 */
import { DOWN_DISTANCES } from '../schemes/tendencies';
import { TUNING } from '../tuning';

/**
 * Situations with their own run and pass balance (spec 8.7): each down and distance, then the red zone and
 * the two-minute drill, which take over from the down's setting.
 */
export const PLAN_SITUATIONS = [...DOWN_DISTANCES, 'redZone', 'twoMinute'] as const;
export type PlanSituation = (typeof PLAN_SITUATIONS)[number];

export interface GamePlan {
  /** Added to the pass rate on every down: the run and pass balance for this opponent. */
  passLean: number;
  /** Added to the pass rate on top of passLean in each situation (the red zone and two-minute drill replace the down's). */
  situations: Record<PlanSituation, number>;
  /** Multiplies the blitz rate. */
  blitz: number;
  /** Added to the man coverage share. */
  man: number;
  /** Added to the press rate in man coverage. */
  press: number;
  /** Added to the nickel and dime packages' share, taken from base. */
  nickel: number;
  /** Personnel usage: added to the three- and four-receiver groupings' share, taken from the heavy ones. */
  spread: number;
  /** Coverage shells: added to the two-high shells' share (cover 2, 4, and 6), taken from single-high. */
  twoHigh: number;
  /** One of ours to feature: a bigger share of the targets, or of the carries for a back. */
  feature: string | null;
  /** Their receiver our top corner follows wherever he lines up. */
  shadow: string | null;
  /** Their receiver who draws safety help on every pass. */
  doubleReceiver: string | null;
  /** Their pass rusher a back or tight end chips on the way into his route. */
  doubleRusher: string | null;
  /** A linebacker or safety spies their quarterback. */
  spy: boolean;
}

/** Situational substitutions (spec 12.3): who comes in for a down, a distance, or a part of the field. */
export interface SituationalSubs {
  /** The back on third down. */
  thirdDownBack: string | null;
  /** A pass-rush specialist on passing downs, in for the weaker edge rusher. */
  passRusher: string | null;
  /** A big target inside the 20, in for the slot receiver or the lead tight end. */
  redZoneTarget: string | null;
  /** The back at the goal line and on third or fourth and short. */
  goalLineBack: string | null;
  /** The lone linebacker in the dime package. */
  dimeBacker: string | null;
}

export interface Rotation {
  /** The lead back's share of running back snaps. */
  rb1Share: number;
  /** How much the defensive line rotates: 0 rides the starters, 1 rotates heavily. */
  lineRotation: number;
  subs: SituationalSubs;
  /** The most of his unit's snaps a player plays: players back from an injury, or tiring veterans. */
  snapLimits: Record<string, number>;
  /** Development snaps: the share of his slot's snaps planned for a young backup. */
  devSnaps: Record<string, number>;
}

/** The limits the user and the AI plan within. */
export const PLAN_LIMITS = TUNING.gamePlan.limits;

export const NEUTRAL_PLAN: GamePlan = {
  passLean: 0,
  situations: Object.fromEntries(PLAN_SITUATIONS.map(s => [s, 0])) as Record<PlanSituation, number>,
  blitz: 1,
  man: 0,
  press: 0,
  nickel: 0,
  spread: 0,
  twoHigh: 0,
  feature: null,
  shadow: null,
  doubleReceiver: null,
  doubleRusher: null,
  spy: false
};

export const NO_SUBS: SituationalSubs = {
  thirdDownBack: null,
  passRusher: null,
  redZoneTarget: null,
  goalLineBack: null,
  dimeBacker: null
};

export const defaultRotation = (rb1Share: number): Rotation => ({
  rb1Share,
  lineRotation: 0.5,
  subs: { ...NO_SUBS },
  snapLimits: {},
  devSnaps: {}
});
