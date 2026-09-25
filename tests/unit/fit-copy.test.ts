import { describe, expect, it } from 'vitest';
import { roleRating } from '../../src/engine/fit/role-rating';
import { fitParts, fitSentence, fitVerdict } from '../../src/app/ui/fit';
import { fitContext, typicalPlayer } from '../helpers/fit';

describe('fit breakdown copy (spec 7.3)', () => {
  it('names the role ratings where the player beats the typical player', () => {
    const back = typicalPlayer('HB', { bcv: 12, agi: 10 }, { yacCatch: true });
    const r = roleRating(back, 'RB1', fitContext('shanahanZone'));
    expect(fitSentence(r, 8)).toMatch(
      /^Good fit for Zone runner: \+\d+ ratings \(ball carrier vision, agility\), \+1 traits \(YAC catch\)\.$/
    );
  });

  it('never names a weakness as a reason for a good fit', () => {
    // Poor press lowers a corner's overall more than it hurts a slot corner, who doesn't press.
    const corner = typicalPlayer('CB', { prs: -25 });
    const r = roleRating(corner, 'NCB', fitContext('westCoast', 'fourThreeOver'));
    expect(r.parts.ratings).toBeGreaterThan(0.5);
    const parts = fitParts(r);
    expect(parts[0]).toMatch(/ratings \(his weaknesses matter less here\)/);
    expect(parts.join(' ')).not.toMatch(/press/);
  });

  it('calls fits under the threshold fair', () => {
    expect(fitVerdict(3)).toBe('Good fit');
    expect(fitVerdict(2)).toBe('Fair fit');
    expect(fitVerdict(-3)).toBe('Poor fit');
  });
});
