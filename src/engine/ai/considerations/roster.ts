/**
 * Considerations for in-season signings (spec 14.11): how badly the roster needs the player's position,
 * how good he is, how young, and whether he already knows the system from the practice squad.
 */
import { TUNING } from '../../tuning';
import { curves, type Consideration } from '../framework';

const S = TUNING.ai.signing;

export interface SigningOption {
  id: string;
  name: string;
  /** Players missing from his position group. */
  need: number;
  ovr: number;
  age: number;
  /** On the team's own practice squad: he knows the system. */
  own: boolean;
}

export const need = (): Consideration<SigningOption> => ({
  name: 'need',
  input: o => o.need,
  curve: curves.lift(S.needFloor, curves.linear(0, 1))
});

export const quality = (): Consideration<SigningOption> => ({
  name: 'quality',
  input: o => o.ovr,
  curve: curves.linear(S.qualitySpan[0], S.qualitySpan[1])
});

export const youth = (): Consideration<SigningOption> => ({
  name: 'youth',
  input: o => o.age,
  curve: curves.lift(S.youthFloor, curves.linear(S.youthSpan[0], S.youthSpan[1]))
});

export const familiar = (): Consideration<SigningOption> => ({
  name: 'familiar',
  input: o => (o.own ? 1 : 0),
  curve: curves.flag(S.strangerScore)
});
