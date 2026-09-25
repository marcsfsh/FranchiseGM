/**
 * What a team brings to a game beyond its roster and schemes: the week's game plan (spec 8.7) and its
 * rotations and packages (spec 12.3). The coaching staff sets them each week, or the user does.
 */

export interface GamePlan {
  /** Added to the pass rate on every down: the run and pass balance for this opponent. */
  passLean: number;
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
export const PLAN_LIMITS = {
  passLean: [-0.15, 0.15],
  blitz: [0.5, 1.5],
  man: [-0.3, 0.3],
  press: [-0.3, 0.3],
  nickel: [-0.2, 0.2],
  spread: [-0.3, 0.3],
  twoHigh: [-0.3, 0.3],
  rb1Share: [0.35, 0.9],
  lineRotation: [0, 1],
  snapLimit: [0.3, 1],
  devSnaps: [0, 0.5]
} as const;

export const NEUTRAL_PLAN: GamePlan = {
  passLean: 0,
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

export const NO_SUBS: SituationalSubs = { thirdDownBack: null, passRusher: null, redZoneTarget: null };

export const defaultRotation = (rb1Share: number): Rotation => ({
  rb1Share,
  lineRotation: 0.5,
  subs: { ...NO_SUBS },
  snapLimits: {},
  devSnaps: {}
});
