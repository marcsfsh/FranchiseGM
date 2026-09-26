import { describe, expect, it } from 'vitest';
import { staffIn } from '../../src/engine/ai/profile';
import { capHit } from '../../src/engine/contracts/cap';
import {
  offerAav,
  offerContract,
  offerTermsWords,
  termsProblem,
  typicalOffer,
  type Offer
} from '../../src/engine/contracts/build';
import { askingFrom, contextFor, demand, mattersMost, offerWorth } from '../../src/engine/contracts/decision';
import { decideWeek, firstYearCharge, makeOffer, offersFor } from '../../src/engine/contracts/free-agency';
import { likelyToEarn } from '../../src/engine/contracts/incentives';
import {
  askedWorth,
  askOf,
  floorEstimate,
  hear,
  mattersWords,
  openingOf,
  patience,
  settledOffer,
  settledSalary,
  settledWorth,
  talks,
  type FloorEstimate
} from '../../src/engine/contracts/negotiation';
import { freeAgents } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import { stream } from '../../src/engine/rng';
import { makeMove, previewMove } from '../../src/engine/roster/moves';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// Contract negotiation (spec 11.6; D-54).
const N = TUNING.contracts.negotiation;

/** The league in OTAs before the 2026 season, after the bidding weeks, when teams negotiate one on one. */
const inTalks = (): League => {
  const league = structuredClone(situationLeague);
  league.date = { season: 2025, phase: 'otas', week: 1 };
  return league;
};
/**
 * The best free agent, made a starter worth well over his minimum, with middling traits and no ties to the
 * user's team, which gets the cap room to sign him.
 */
function star(league: League, traits: Partial<Player['personality']> = {}): Player {
  const [p] = freeAgents(league).sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  if (!p) throw new Error('no free agent');
  Object.assign(p.personality, { volatility: 50, greed: 50, loyalty: 50, ...traits });
  Object.assign(p, { lastTeam: null, morale: 70, ovr: 82 });
  league.teams.MIN.carryover = 200_000_000;
  return p;
}
const plain = (years: number, salary: number): Offer => ({ years, salary, signingBonus: 0 });

describe('the terms of an offer (spec 11.6)', () => {
  it('reads a settled deal back in words, every term the user agrees to (D-66)', () => {
    const deal: Offer = {
      years: 3,
      salary: 6_000_000,
      signingBonus: 6_000_000,
      guaranteedYears: 1,
      voidYears: 1
    };
    expect(offerTermsWords(deal)).toBe("$8,000,000 a year for 3 years, with a $6,000,000 signing bonus, the first year's salary guaranteed, and 1 void year"); // prettier-ignore
    expect(offerTermsWords({ ...deal, guaranteedYears: 2, voidYears: 0 })).toBe("$8,000,000 a year for 3 years, with a $6,000,000 signing bonus and the first 2 years' salary guaranteed"); // prettier-ignore
    expect(offerTermsWords(plain(1, 1_000_000))).toBe('$1,000,000 a year for 1 year');
  });

  it('checks guarantees, incentives, and void years', () => {
    const rules = situationLeague.rules;
    const ok = { years: 2, salary: 2_000_000, signingBonus: 3_000_000, guaranteedYears: 1, perGameBonus: 170_000, voidYears: 2 };
    expect(termsProblem(rules, ok, 1_000_000)).toBeNull();
    expect(termsProblem(rules, { ...ok, guaranteedYears: 3 }, 1_000_000)).toMatch(/^Guarantee his salary for 0 to 2 years/);
    expect(termsProblem(rules, { ...ok, perGameBonus: -1 }, 1_000_000)).toMatch(/per-game roster bonus/);
    expect(termsProblem(rules, { ...ok, voidYears: 4 }, 1_000_000)).toMatch(/^Add up to 3 void years/);
    expect(termsProblem(rules, { ...ok, signingBonus: 0 }, 1_000_000)).toMatch(/^Void years only spread a signing bonus/);
    expect(termsProblem(rules, { ...ok, years: 5, voidYears: 1 }, 1_000_000)).toMatch(/already spreads its bonus/);
  }); // prettier-ignore

  it('builds the contract they describe, with the bonus spread over the void years (hand-checked)', () => {
    const rules = situationLeague.rules;
    const offer = { years: 2, salary: 2_000_000, signingBonus: 3_000_000, guaranteedYears: 1, perGameBonus: 170_000, voidYears: 2 };
    const deal = offerContract(rules, { id: 'c', playerId: 'p', team: 'MIN' }, { season: 2025, phase: 'otas', week: 1 }, offer, 5);
    expect(deal.years.map(y => [y.year, y.base, y.guaranteedBase, y.perGameBonus, y.isVoid])).toEqual([
      [2026, 2_000_000, 2_000_000, 170_000, false],
      [2027, 2_000_000, 0, 170_000, false],
      [2028, 0, 0, 0, true],
      [2029, 0, 0, 0, true]
    ]);
    // $3,000,000 over four years is $750,000 a year; the deal voids in 2028, when both void years' shares land.
    expect([2026, 2027, 2028, 2029].map(y => capHit(deal, y, rules))).toEqual([2_920_000, 2_920_000, 1_500_000, 0]);
  }); // prettier-ignore
});

describe('performance incentives in offers (spec 11.2, 11.6)', () => {
  it("builds one into each year, counted on the cap as likely once he's reached the mark (Article 13)", () => {
    const rules = situationLeague.rules;
    const incentive = { key: 'recYds' as const, atLeast: 1_000, amount: 500_000 };
    const offer = { years: 2, salary: 2_000_000, signingBonus: 0, incentive };
    expect(termsProblem(rules, { ...offer, incentive: { ...incentive, atLeast: 0 } }, 1_000_000)).toBe("Set the incentive's mark at 1 or more.");
    expect(termsProblem(rules, { ...offer, incentive: { ...incentive, amount: -1 } }, 1_000_000)).toMatch(/^The incentive must be a whole-dollar amount/);
    const base = { id: 'c', playerId: 'p', team: 'MIN' as const };
    const date = { season: 2025, phase: 'otas' as const, week: 1 };
    const unlikely = offerContract(rules, base, date, offer, 5);
    expect(unlikely.years.map(y => y.incentives.map(i => [i.condition, i.amount, i.likely]))).toEqual([
      [['1,000 receiving yards', 500_000, false]],
      [['1,000 receiving yards', 500_000, false]]
    ]);
    expect(capHit(unlikely, 2026, rules)).toBe(2_000_000);
    const likely = offerContract(rules, base, date, offer, 5, true);
    expect(capHit(likely, 2026, rules)).toBe(2_500_000);
    // Reaching the mark last season makes it likely, for the cap and for his standing offers.
    const league = structuredClone(situationLeague);
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    const [p] = freeAgents(league);
    if (!p) throw new Error('no free agent');
    league.season.totals = { [p.id]: { recYds: 1_050 } };
    expect(likelyToEarn(league, p, incentive)).toBe(true);
    expect(likelyToEarn(league, p, { ...incentive, atLeast: 1_100 })).toBe(false);
    expect(firstYearCharge(league, offer, p) - firstYearCharge(league, offer)).toBe(500_000);
  }); // prettier-ignore
});

describe('talks (spec 11.6)', () => {
  it("opens above his demand, further for a hard bargainer, and a team's GM settles as far under it as his rating reaches", () => {
    const league = inTalks();
    const p = star(league);
    const market = askingFrom(league, contextFor(league), p, 'MIN');
    const ask = askOf(league, p, 'MIN');
    expect(ask).toBeGreaterThan(market);
    expect(askedWorth(league, p, 'MIN')).toBeCloseTo(demand(league, p) * (1 + openingOf(p)), 6);
    p.dealStyle.agent = 0;
    expect(openingOf(p)).toBeCloseTo(N.opening[0], 6);
    const soft = askOf(league, p, 'MIN');
    p.dealStyle.agent = 100;
    expect(openingOf(p)).toBeCloseTo(N.opening[1], 6);
    expect(askOf(league, p, 'MIN')).toBeGreaterThan(soft);
    p.dealStyle.agent = 50;
    const gm = staffIn(league, 'MIN', 'GM');
    if (!gm) throw new Error('no GM');
    gm.ratings.negotiation = 99;
    const sharp = settledSalary(league, p, 'MIN');
    gm.ratings.negotiation = 0;
    expect(settledSalary(league, p, 'MIN')).toBe(askOf(league, p, 'MIN'));
    expect(sharp).toBeLessThan(askOf(league, p, 'MIN'));
    expect(sharp).toBeGreaterThanOrEqual(market);
    // Through the bidding weeks his agent holds at his opening, over the least he'd take.
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    expect(askOf(league, p, 'MIN')).toBeGreaterThan(askingFrom(league, contextFor(league), p, 'MIN'));
  }); // prettier-ignore

  it("settles a deal built as the AI builds them, at the least that's worth what the GM settles for (D-66)", () => {
    const league = inTalks();
    const p = star(league);
    const gm = staffIn(league, 'MIN', 'GM');
    if (!gm) throw new Error('no GM');
    const ctx = contextFor(league);
    const deal = (skill: number) => {
      gm.ratings.negotiation = skill;
      return settledOffer(league, p, 'MIN', 3);
    };
    const rough = deal(0);
    const sharp = deal(99);
    expect(sharp.signingBonus).toBeGreaterThan(0);
    expect(offerAav(sharp)).toBeLessThan(offerAav(rough));
    // Worth what the GM settles for, and a quote step less isn't.
    expect(offerWorth(league, ctx, p, 'MIN', sharp).total).toBeGreaterThanOrEqual(settledWorth(league, p, 'MIN'));
    const less = typicalOffer(league.rules, 3, offerAav(sharp) - 5_000, league.rules.pay.minimumSalary[p.experience] ?? 0);
    expect(offerWorth(league, ctx, p, 'MIN', less).total).toBeLessThan(settledWorth(league, p, 'MIN'));
  }); // prettier-ignore

  it("gives the front office a range around the least he'd take, narrower with a better GM", () => {
    const league = inTalks();
    const p = star(league);
    const gm = staffIn(league, 'MIN', 'GM');
    if (!gm) throw new Error('no GM');
    const terms = { years: 3, signingBonus: 0 };
    const least = askingFrom(league, contextFor(league), p, 'MIN', 3);
    const width = (e: FloorEstimate) => e.high - e.low;
    gm.ratings.negotiation = 0;
    const rough = floorEstimate(league, 'MIN', p, terms);
    gm.ratings.negotiation = 99;
    const sharp = floorEstimate(league, 'MIN', p, terms);
    for (const e of [rough, sharp]) {
      expect(e.low).toBeLessThanOrEqual(least);
      expect(e.high).toBeGreaterThanOrEqual(least);
    }
    expect(width(sharp)).toBeLessThan(width(rough));
    // Where the least he'd take sits in the range is how front offices misread him: near the bottom at one
    // end, near the top at the other. The width moves with the misread, so it doesn't give him away either.
    p.dealStyle.read = 0;
    const under = floorEstimate(league, 'MIN', p, terms);
    p.dealStyle.read = 100;
    const over = floorEstimate(league, 'MIN', p, terms);
    expect((least - under.low) / width(under)).toBeLessThan(0.35);
    expect((least - over.low) / width(over)).toBeGreaterThan(0.65);
    expect(width(under)).toBeGreaterThan(width(over));
    // His agent's bargaining doesn't move it.
    p.dealStyle.agent = 0;
    expect(floorEstimate(league, 'MIN', p, terms)).toEqual(over);
  });

  it('answers with a counter that comes down, and takes his counter', () => {
    const league = inTalks();
    const p = star(league);
    const ask = askOf(league, p, 'MIN', 3);
    const first = hear(league, 'MIN', p, plain(3, Math.round(ask * 0.95)));
    expect(first.kind).toBe('counter');
    if (first.kind !== 'counter') return;
    expect(first.lowball).toBe(false);
    expect(first.offer.years).toBe(3);
    expect(first.offer.salary).toBeLessThan(ask);
    expect(first.matters.length).toBeGreaterThan(0);
    expect(talks(league, 'MIN', p.id)).toMatchObject({ rounds: 1, closed: false, counter: first.offer });
    expect(hear(league, 'MIN', p, first.offer)).toEqual({ kind: 'accept' });
    expect(league.negotiations).toEqual({});
  });

  it('runs out of patience, fewer offers for the volatile, until the calendar advances', () => {
    expect(patience({ personality: { volatility: 0 } } as Player)).toBe(N.patience[1]);
    expect(patience({ personality: { volatility: 100 } } as Player)).toBe(N.patience[0]);
    const league = inTalks();
    const p = star(league, { volatility: 100 });
    const low = plain(1, Math.round(askOf(league, p, 'MIN') * 0.9));
    expect(hear(league, 'MIN', p, low).kind).toBe('counter');
    expect(hear(league, 'MIN', p, low)).toEqual({ kind: 'brokeOff', lowball: false });
    expect(hear(league, 'MIN', p, plain(1, askOf(league, p, 'MIN') * 2))).toEqual({ kind: 'closed' });
    // An offer in talks is refused while they're off, in the preview too.
    const move = { kind: 'sign' as const, team: 'MIN' as const, playerId: p.id, offer: plain(1, 30_000_000), talks: true };
    expect(previewMove(league, move)).toEqual({ ok: false, reason: "He's broken off talks with you until you advance." });
    league.date = { season: 2025, phase: 'trainingCamp', week: 1 };
    expect(talks(league, 'MIN', p.id)).toMatchObject({ rounds: 0, closed: false });
  }); // prettier-ignore

  it('holds a lowball against the team for the league year, and it costs his morale', () => {
    const league = inTalks();
    const p = star(league);
    const before = askOf(league, p, 'MIN');
    const minimum = league.rules.pay.minimumSalary[p.experience] ?? 0;
    const reply = hear(league, 'MIN', p, plain(1, minimum));
    expect(reply).toMatchObject({ kind: 'counter', lowball: true });
    expect(p.morale).toBe(70 - N.lowballMorale);
    const ctx = contextFor(league);
    expect(offerWorth(league, ctx, p, 'MIN', plain(1, before)).interest).toBeCloseTo(-N.lowballInterest, 6);
    // A step later his patience is back, and the lowball still counts.
    league.date = { season: 2025, phase: 'trainingCamp', week: 1 };
    expect(talks(league, 'MIN', p.id)).toMatchObject({ rounds: 0, lowballs: 1 });
    expect(askOf(league, p, 'MIN')).toBeGreaterThan(before);
  });

  it('takes or leaves a final offer outright: the less greedy take less', () => {
    const league = inTalks();
    const calm = star(league, { greed: 0 });
    const floor = askingFrom(league, contextFor(league), calm, 'MIN');
    expect(hear(league, 'MIN', calm, { ...plain(1, floor), final: true })).toEqual({ kind: 'accept' });
    const other = inTalks();
    const greedy = star(other, { greed: 100 });
    const low = askingFrom(other, contextFor(other), greedy, 'MIN');
    expect(hear(other, 'MIN', greedy, { ...plain(1, low), final: true })).toEqual({
      kind: 'final',
      lowball: false
    });
    expect(talks(other, 'MIN', greedy.id).closed).toBe(true);
  });

  it("previews an offer in talks without his answer, and signs him only when he takes it", () => {
    const league = inTalks();
    const p = star(league);
    const low = { kind: 'sign' as const, team: 'MIN' as const, playerId: p.id, offer: plain(2, Math.round(askOf(league, p, 'MIN', 2) * 0.95)), talks: true };
    const preview = previewMove(league, low);
    expect(preview.ok && preview.value.notes[0]).toBe('He answers when you send the offer. If he takes it, he signs for 2 years.');
    const turned = makeMove(league, low, stream(1));
    expect(turned).toMatchObject({ ok: false, reason: expect.stringMatching(/^He turned it down\. On the rest of your terms he'd sign for \$[\d,]+ a year for 2 years\./) });
    expect(p.status).toBe('freeAgent');
    const counter = talks(league, 'MIN', p.id).counter;
    if (!counter) throw new Error('no counter');
    const signed = makeMove(league, { ...low, offer: counter }, stream(2));
    expect(signed.ok && signed.value.notes).toEqual([expect.stringMatching(/takes your offer and signs for 2 years\.$/)]);
    expect(p).toMatchObject({ team: 'MIN', status: 'active' });
  }); // prettier-ignore

  it('says what matters most: the length he wants, guaranteed money, or cash up front, else money', () => {
    const league = inTalks();
    const p = star(league);
    const aged = (age: number) => (p.birthDate = `${2026 - age}${p.birthDate.slice(4)}`);
    Object.assign(p, { potential: p.ovr, injury: null }, { ratings: { ...p.ratings, inj: 95 } });
    p.dealStyle.upFront = 0;
    const guaranteed = (years: number) => ({ ...plain(years, 20_000_000), guaranteedYears: years });
    // An older player on a one-year deal wants more years; a young one still rising, fewer.
    aged(34);
    expect(mattersMost(league, p, guaranteed(1))).toEqual(['longer']);
    aged(23);
    p.potential = p.ovr + 6;
    expect(mattersMost(league, p, guaranteed(5))).toEqual(['shorter']);
    // In his prime, on a deal the length he wants: guarantees when little is guaranteed, a bonus if he
    // likes cash up front, and otherwise money.
    aged(27);
    p.potential = p.ovr;
    expect(mattersMost(league, p, plain(4, 20_000_000))[0]).toBe('guarantees');
    expect(mattersMost(league, p, guaranteed(4))).toEqual(['money']);
    p.dealStyle.upFront = 100;
    expect(mattersMost(league, p, guaranteed(4))).toEqual(['bonus']);
    expect(mattersWords(['bonus', 'guarantees'])).toBe(
      'More of it up front as a signing bonus matters most to him, then guaranteed money.'
    );
  });
});

describe('final and lowball bids in the bidding weeks (spec 11.6, 11.8)', () => {
  it('lets a final bid he passes on fall away, and holds a lowball bid against its team', () => {
    const league = structuredClone(situationLeague);
    league.date = { season: 2026, phase: 'freeAgency', week: 1 };
    const p = star(league);
    const minimum = league.rules.pay.minimumSalary[p.experience] ?? 0;
    expect(makeOffer(league, 'MIN', p.id, { ...plain(1, minimum), final: true })).toBeNull();
    expect(makeOffer(league, 'GB', p.id, plain(1, minimum))).toBeNull();
    decideWeek(league, stream(3));
    expect(p.status).toBe('freeAgent');
    expect(offersFor(league, p.id).map(o => o.team)).toEqual(['GB']);
    expect(talks(league, 'GB', p.id).lowballs).toBe(1);
    expect(talks(league, 'MIN', p.id).lowballs).toBe(1);
  });
});
