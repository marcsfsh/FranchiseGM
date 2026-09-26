import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { finishDraft, openDraft, runDraft } from '../../src/engine/draft/draft';
import {
  aiOffers,
  makeOffer,
  offerProblem,
  offersFor,
  opportunity,
  pledged,
  scrambleOpen,
  undraftedRookies,
  withdrawOffer
} from '../../src/engine/draft/udfa';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { previewMove } from '../../src/engine/roster/moves';
import { advanceOffseason } from '../../src/engine/season/offseason';
import { DEFAULT_RULES } from '../../src/engine/rules/ruleset';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// The UDFA scramble (spec 10.4, 11.7; D-49): offers with bonuses from each team's pool, rookies choosing by
// the money and, more, their chance to make the roster, and the AI's offers.
const U = TUNING.draft.udfa;
const POOL = DEFAULT_RULES.rookieScale.udfaBonusPool;
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });

/** A league whose 2027 draft just ended, every pick made by the staffs. */
function drafted(): League {
  const league = Object.assign(structuredClone(situationLeague), { date: at(2026, 'draft') });
  league.settings.auto.draft = true;
  openDraft(league, nameData(), stream(1, 'class'));
  runDraft(league, stream(1, 'draft'));
  finishDraft(league);
  return league;
}

describe('the UDFA scramble (spec 10.4)', () => {
  it('takes offers from the draft\'s end, within each team\'s bonus pool', () => {
    const league = drafted();
    expect(scrambleOpen(league)).toBe(true);
    const rookies = undraftedRookies(league);
    expect(rookies).toHaveLength(450 - 224);
    const [a, b, c] = rookies as [Player, Player, Player];
    expect(offerProblem(league, 'MIN', a.id, U.maxBonus + U.step)).toMatch(/^Offer a signing bonus from \$0 to /);
    expect(offerProblem(league, 'MIN', a.id, 12_345)).toMatch(/in steps of/);
    // Two of the biggest bonuses spend the pool; changing an offer frees its own bonus first.
    expect(makeOffer(league, 'MIN', a.id, U.maxBonus)).toBeNull();
    expect(makeOffer(league, 'MIN', b.id, POOL - U.maxBonus)).toBeNull();
    expect(offerProblem(league, 'MIN', c.id, U.step)).toBe(`That's more than your bonus pool has left: $0 of $${POOL.toLocaleString('en-US')}.`);
    expect(makeOffer(league, 'MIN', a.id, U.step)).toBeNull();
    expect(pledged(league, 'MIN')).toBe(POOL - U.maxBonus + U.step);
    withdrawOffer(league, 'MIN', a.id);
    expect(pledged(league, 'MIN')).toBe(POOL - U.maxBonus);
    expect(league.udfaOffers[a.id]).toBeUndefined();
    // While the scramble is open he signs only through it.
    const signing = previewMove(league, { kind: 'sign', team: 'MIN', playerId: c.id, offer: { years: 1, salary: 1_000_000, signingBonus: 0 } });
    expect(signing.ok ? 'allowed' : signing.reason).toMatch(/is weighing offers from teams until the undrafted free agents step ends\./);
    // Not a rookie still looking, or not the time for it.
    const vet = Object.values(league.players).find(p => p.status === 'freeAgent' && p.experience > 2) as Player;
    expect(offerProblem(league, 'MIN', vet.id, 0)).toBe("He isn't an undrafted rookie looking for a team.");
    league.date = at(2026, 'otas');
    expect(offerProblem(league, 'MIN', a.id, 0)).toMatch(/^Undrafted rookies take offers from the end of the draft/);
  }); // prettier-ignore

  it('weighs a roster spot more than money, and the AI offers where it is thin', () => {
    const league = drafted();
    const rookie = undraftedRookies(league).find(p => p.position === 'QB') as Player;
    // A team with fewer quarterbacks as good as he is gives him a better chance.
    const chances = TEAM_ABBRS.map(t => opportunity(league, t, rookie));
    expect(Math.max(...chances)).toBeGreaterThan(Math.min(...chances));
    const [open, crowded] = [...TEAM_ABBRS].sort((x, y) => opportunity(league, y, rookie) - opportunity(league, x, rookie)).filter((t, i, all) => i === 0 || i === all.length - 1) as [typeof TEAM_ABBRS[number], typeof TEAM_ABBRS[number]];
    expect(makeOffer(league, crowded, rookie.id, U.step)).toBeNull();
    expect(makeOffer(league, open, rookie.id, 0)).toBeNull();
    if (opportunity(league, open, rookie) - opportunity(league, crowded, rookie) >= 0.5) expect(offersFor(league, rookie)[0]?.team).toBe(open);
    // The AI's offers: every AI team offers, within its pool.
    aiOffers(league, TEAM_ABBRS.filter(t => t !== 'MIN'), stream(2, 'udfa'));
    for (const team of TEAM_ABBRS.filter(t => t !== 'MIN')) {
      expect(pledged(league, team), team).toBeLessThanOrEqual(POOL);
      expect(Object.values(league.udfaOffers).some(offers => offers.some(o => o.team === team)), team).toBe(true);
    }
  }); // prettier-ignore

  it('signs each rookie with his best offer from a team with room as the step ends', () => {
    const league = drafted();
    const user = league.meta.start.userTeam;
    const rookie = undraftedRookies(league)[0] as Player;
    expect(makeOffer(league, user, rookie.id, U.maxBonus)).toBeNull();
    // Through the offseason: the AI offers as the undrafted free agents step opens, and the rookies choose
    // as it ends.
    expect(advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 }).blocked).toBeNull();
    expect(league.date.phase).toBe('udfa');
    expect(Object.keys(league.udfaOffers).length).toBeGreaterThan(1);
    const best = offersFor(league, rookie)[0];
    const step = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 2 });
    expect(league.date.phase).toBe('otas');
    expect(league.udfaOffers).toEqual({});
    expect(rookie.team).toBe(best?.team);
    const contract = league.contracts[rookie.contractId ?? ''];
    expect(contract).toMatchObject({ type: 'udfa', team: best?.team, signingBonus: best?.bonus });
    expect(contract?.years).toHaveLength(league.rules.rookieScale.udfaYears);
    const mine = Object.values(league.players).filter(p => p.team === user && 'undrafted' in p.draft && p.draft.year === 2027);
    if (mine.length) expect(step.inbox.some(m => m.title.startsWith('Undrafted rookies:'))).toBe(true);
    // Every team stays within its roster's limit.
    for (const team of TEAM_ABBRS) expect(Object.values(league.players).filter(p => p.team === team && p.status === 'active').length).toBeLessThanOrEqual(league.rules.roster.offseason);
  }, 60_000); // prettier-ignore
});
