/**
 * Considerations for lineup decisions (spec 12.2, 10.8): who starts at a slot, and whether a questionable
 * player plays. Each is a small named consideration with its response curve.
 */
import { TUNING } from '../../tuning';
import { curves, type Consideration } from '../framework';

const D = TUNING.ai.depth;
const R = TUNING.ai.rest;

/** A player who could start at a slot. */
export interface StarterOption {
  id: string;
  name: string;
  /** Role rating at the slot, less the playing-hurt penalty. */
  rating: number;
  experience: number;
  age: number;
  /** Potential over current overall. */
  upside: number;
  /** This season's cap hit. */
  capHit: number;
}

/** Merit: the role rating against the best option's. */
export const merit = (best: number): Consideration<StarterOption> => ({
  name: 'merit',
  input: o => o.rating - best,
  curve: curves.linear(-D.meritSpan, 0)
});

/** The veteran-leaning coach's trust in seasons played. */
export const experience = (): Consideration<StarterOption> => ({
  name: 'experience',
  input: o => o.experience,
  curve: curves.lift(D.styleFloor, curves.linear(0, D.experienceYears))
});

/** The developer's snaps for young players with room to grow. */
export const upside = (): Consideration<StarterOption> => ({
  name: 'upside',
  input: o => (o.age <= D.youngAge ? Math.max(0, o.upside) : 0),
  curve: curves.lift(D.styleFloor, curves.linear(0, D.upsideSpan))
});

/** The loyalist's (and every coach's small) preference for last week's starter. */
export const incumbent = (starter: string | undefined): Consideration<StarterOption> => ({
  name: 'incumbent',
  input: o => (o.id === starter ? 1 : 0),
  curve: curves.flag(D.styleFloor)
});

/** The contract-minded coach's lean toward the players the team pays most. */
export const salary = (maxCapHit: number): Consideration<StarterOption> => ({
  name: 'salary',
  input: o => (maxCapHit > 0 ? o.capHit / maxCapHit : 0),
  curve: curves.lift(D.styleFloor, curves.linear(0, 1))
});

/** A questionable player's choice: play him hurt or rest him. */
export interface RestOption {
  play: boolean;
  /** Points he's better than the man who plays if he rests. */
  edge: number;
  /** His injury risk multiplier if he plays. */
  risk: number;
  /** How much the game matters, 0 to 1. */
  stakes: number;
}

/** How much the lineup loses without him; resting him reads the same scale backward. */
export const needed = (): Consideration<RestOption> => ({
  name: 'needed',
  input: o => (o.play ? o.edge : R.edgeSpan[0] + R.edgeSpan[1] - o.edge),
  curve: curves.linear(R.edgeSpan[0], R.edgeSpan[1])
});

/** The chance of making the injury worse. */
export const reinjury = (): Consideration<RestOption> => ({
  name: 'reinjury',
  input: o => (o.play ? o.risk : 1),
  curve: curves.linear(R.riskSpan[0], R.riskSpan[1])
});

/** How much this game matters. */
export const stakes = (): Consideration<RestOption> => ({
  name: 'stakes',
  input: o => (o.play ? o.stakes : 1 - o.stakes),
  curve: curves.lift(R.stakesFloor, curves.linear(0, 1))
});
