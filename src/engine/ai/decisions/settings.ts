/**
 * Two decision shapes the weekly settings share (spec 14.1): a dial set somewhere between its limits, and
 * building around a player or not.
 */
import type { Rng } from '../../rng';
import { TUNING } from '../../tuning';
import { comfort, exploit, focusCase, type DialOption, type FocusOption } from '../considerations/plan';
import { decide, type Decision } from '../framework';

const P = TUNING.ai.plan;

/**
 * A setting on a dial: options evenly spaced across its limits, scored by how close each sits to the
 * ideal and, weighed by the coach's rigidity (0 to 1), to the normal.
 */
export function decideDial(
  decision: string,
  actor: string,
  [lo, hi]: readonly [number, number],
  neutral: number,
  ideal: number,
  rigidity: number,
  competence: number,
  rng: Rng,
  steps: number = P.steps
): Decision<DialOption> | null {
  const options: DialOption[] = Array.from({ length: steps }, (_, i) => ({
    value: lo + ((hi - lo) * i) / (steps - 1),
    lo,
    hi,
    neutral
  }));
  return decide(
    decision,
    actor,
    options,
    [exploit(ideal), comfort()],
    { exploit: 1, comfort: rigidity },
    competence,
    rng,
    o => String(Math.round(o.value * 1000) / 1000)
  );
}

/** A candidate's case (how far he clears the threshold, in points) against going without. */
export function decideFocus(
  decision: string,
  actor: string,
  candidate: { id: string; name: string; margin: number } | null,
  competence: number,
  rng: Rng
): Decision<FocusOption> | null {
  const options: FocusOption[] = [{ id: null, label: 'Nobody', margin: 0 }];
  if (candidate) options.push({ id: candidate.id, label: candidate.name, margin: candidate.margin });
  return decide(decision, actor, options, [focusCase()], {}, competence, rng, o => o.label);
}
