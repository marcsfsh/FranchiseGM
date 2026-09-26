import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import type { League } from '../../src/engine/league/types';
import { offFieldHeadline, offFieldMessage, offFieldWeek } from '../../src/engine/locker/off-field';
import { stream, type Rng } from '../../src/engine/rng';
import { rosterCounts } from '../../src/engine/roster/rules';
import { situationLeague } from '../helpers/situations';

// Off-field events and suspensions (spec 10.9; D-59).
/** A stream whose draws cycle through `values`. */
function drawing(...values: number[]): Rng {
  const rng = stream(1);
  let i = 0;
  rng.float = () => values[i++ % values.length] ?? 0.999;
  return rng;
}
const inSeason = (): League => {
  const league = structuredClone(situationLeague);
  league.date = { season: 2026, phase: 'regularSeason', week: 3 };
  return league;
};
const everyone = new Set<TeamAbbr>(['MIN']);

describe('suspensions (spec 10.9)', () => {
  it('put a player on the suspended list for his games, and bring him back once his team has played them', () => {
    const league = inSeason();
    const before = rosterCounts(league, 'MIN').active;
    // The first draw of each player is the drug policy's: every player on a roster is suspended.
    const events = offFieldWeek(league, new Set(), true, drawing(0));
    const p = events.find(e => e.team === 'MIN')?.player;
    if (!p) throw new Error('no suspension');
    expect(events.find(e => e.player === p)).toMatchObject({ kind: 'ped', games: league.rules.roster.pedSuspensionGames });
    expect(p).toMatchObject({ status: 'suspended', suspension: { games: 6, reason: 'ped' } });
    expect(rosterCounts(league, 'MIN').active).toBeLessThan(before);
    expect(league.season.transactions.find(t => t.playerId === p.id)).toMatchObject({ kind: 'suspended', reason: '6 games under the drug policy' });
    // Six games later he's back where he was; weeks without a game don't count.
    league.settings.drama.offField = false;
    offFieldWeek(league, new Set(['GB']), true, drawing(0));
    expect(p.suspension?.games).toBe(6);
    for (let g = 0; g < 5; g++) offFieldWeek(league, everyone, true, drawing(0));
    expect(p.status).toBe('suspended');
    const back = offFieldWeek(league, everyone, true, drawing(0)).filter(e => e.player === p);
    expect(back).toEqual([{ player: p, team: 'MIN', kind: 'reinstated' }]);
    expect(p.status).toBe('active');
    expect(p.suspension).toBeUndefined();
  }); // prettier-ignore

  it('come only in the regular season, and not with the setting off', () => {
    const league = inSeason();
    expect(offFieldWeek(league, everyone, false, drawing(0))).toEqual([]);
    league.settings.drama.offField = false;
    expect(offFieldWeek(league, everyone, true, drawing(0))).toEqual([]);
  });
});

describe('other off-field events (spec 10.9)', () => {
  it('count charity work toward the Man of the Year, and tell the user of his own players', () => {
    const league = inSeason();
    // Each player draws four times: the drug policy, conduct, a legal matter, and charity.
    const events = offFieldWeek(league, new Set(), true, drawing(0.999, 0.999, 0.999, 0));
    const mine = events.find(e => e.team === 'MIN');
    expect(mine?.kind).toBe('charity');
    expect(mine?.player.community).toBe(1);
    expect(offFieldMessage(league, mine!)).toBeNull();
    const legal = offFieldWeek(inSeason(), new Set(), true, drawing(0.999, 0.999, 0)).find(
      e => e.team === 'MIN'
    );
    if (!legal) throw new Error('no event');
    expect(offFieldMessage(league, legal)?.title).toMatch(/is in the news off the field$/);
    legal.player.ovr = 90;
    expect(offFieldHeadline(legal)).toMatch(/of the Vikings faces a legal matter off the field$/);
  });
});
