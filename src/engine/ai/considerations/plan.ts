/**
 * Considerations for the weekly game plan (spec 8.7, 14.11): how well a setting attacks what the scouting
 * report found, how far it strays from the scheme's normal, and whether a player is worth building around.
 */
import { TUNING } from '../../tuning';
import { curves, type Consideration } from '../framework';

const P = TUNING.ai.plan;

/** One setting of a dial such as the blitz rate, on a dial from `lo` to `hi` whose normal is `neutral`. */
export interface DialOption {
  value: number;
  lo: number;
  hi: number;
  neutral: number;
}

/** How close the setting sits to what the report calls for: 1 on the ideal, 0 half the dial away. */
export const exploit = (ideal: number): Consideration<DialOption> => ({
  name: 'exploit',
  input: o => Math.abs(o.value - ideal) / (o.hi - o.lo),
  curve: curves.linear(0.5, 0)
});

/** How close the setting sits to the scheme's normal; rigid coaches weigh this more. */
export const comfort = (): Consideration<DialOption> => ({
  name: 'comfort',
  input: o => Math.abs(o.value - o.neutral) / (o.hi - o.lo),
  curve: curves.lift(0.3, curves.linear(1, 0))
});

/** Building the plan around a player, or not: `margin` is how far his case clears its threshold. */
export interface FocusOption {
  id: string | null;
  label: string;
  margin: number;
}

/** A player's case scores 0.5 at its threshold and more above it; going without scores 0.5. */
export const focusCase = (): Consideration<FocusOption> => ({
  name: 'case',
  input: o => (o.id === null ? 0 : o.margin),
  curve: curves.logistic(0, P.focusWidth)
});
