import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { contractsOf, dropContract, putContract } from '../../src/engine/league/contract-index';
import type { League } from '../../src/engine/league/types';
import { situationLeague } from '../helpers/situations';

// The contract index behind the cap sheets (spec 6.5).
const scan = (league: League, team: TeamAbbr) => Object.values(league.contracts).filter(c => c.team === team);

describe('the contract index', () => {
  it("lists each team's contracts as a scan of them all does, through additions, replacements, and removals", () => {
    const league = structuredClone(situationLeague);
    expect(contractsOf(league, 'MIN')).toEqual(scan(league, 'MIN'));
    const [first, second] = scan(league, 'MIN');
    if (!first || !second) throw new Error('no contracts');
    putContract(league, { ...first, signingBonus: first.signingBonus + 1 });
    putContract(league, { ...second, id: 'added' });
    dropContract(league, second.id);
    putContract(league, { ...first, id: 'moved', team: 'GB' });
    putContract(league, { ...first, id: 'moved', team: 'CHI' });
    for (const team of ['MIN', 'GB', 'CHI'] as const)
      expect(contractsOf(league, team)).toEqual(scan(league, team));
    expect(contractsOf(league, 'MIN')[0]?.signingBonus).toBe(first.signingBonus + 1);
  });

  it('keeps a copy of the league apart', () => {
    const league = structuredClone(situationLeague);
    const [first] = scan(league, 'MIN');
    if (!first) throw new Error('no contracts');
    contractsOf(league, 'MIN');
    const copy = structuredClone(league);
    putContract(copy, { ...first, id: 'copied' });
    expect(contractsOf(league, 'MIN').some(c => c.id === 'copied')).toBe(false);
    expect(contractsOf(copy, 'MIN').some(c => c.id === 'copied')).toBe(true);
  });
});
