import { describe, expect, it } from 'vitest';
import {
  experience,
  incumbent,
  merit,
  salary,
  upside,
  type StarterOption
} from '../../src/engine/ai/considerations/lineup';
import { decideDepthChart, depthWeights } from '../../src/engine/ai/decisions/depth-chart';
import { decideGamePlan, idealPlan } from '../../src/engine/ai/decisions/game-plan';
import { decideRest } from '../../src/engine/ai/decisions/rest';
import { decideRotation } from '../../src/engine/ai/decisions/rotation';
import { NEED_GROUP, rosterMoves, waiverClaims } from '../../src/engine/ai/decisions/roster-moves';
import { score } from '../../src/engine/ai/framework';
import { coachProfile, staffIn } from '../../src/engine/ai/profile';
import { scoutingReport } from '../../src/engine/ai/scouting';
import { manageWeek } from '../../src/engine/ai/weekly';
import { dressable } from '../../src/engine/roster/rules';
import type { TeamAbbr } from '../../src/data/team-colors';
import { orderOf } from '../../src/engine/league/depth';
import { activeRoster } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import type { Player } from '../../src/engine/model/player';
import type { StaffMember } from '../../src/engine/model/staff';
import { stream } from '../../src/engine/rng';
import type { PlayerInjury } from '../../src/engine/season/injuries';
import { NEUTRAL_PLAN } from '../../src/engine/sim/plan';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);
const TEAM: TeamAbbr = 'KC';

/** A head coach with the given personality and tendencies (0 to 100). */
function coach(change: {
  tendencies?: Record<string, number>;
  personality?: Record<string, number>;
}): StaffMember {
  const hc = staffIn(situationLeague, TEAM, 'HC') as StaffMember;
  return {
    ...structuredClone(hc),
    overall: 99,
    tendencies: { ...(hc.tendencies as NonNullable<StaffMember['tendencies']>), ...change.tendencies },
    personality: { ...hc.personality, ...change.personality }
  };
}

/** A veteran who rates a little better and a young player with room to grow, at one slot. */
const veteran: StarterOption = {
  id: 'v',
  name: 'Veteran',
  rating: 72,
  experience: 9,
  age: 31,
  upside: 0,
  capHit: 9_000_000
};
const rookie: StarterOption = {
  id: 'r',
  name: 'Rookie',
  rating: 70,
  experience: 0,
  age: 22,
  upside: 14,
  capHit: 900_000
};

function ranked(hc: StaffMember, starter?: string): string[] {
  const weights = depthWeights(coachProfile(hc));
  const options = [veteran, rookie];
  return score(options, [merit(72), experience(), upside(), incumbent(starter), salary(9_000_000)], weights)
    .sort((a, b) => b.score - a.score)
    .map(s => s.option.id);
}

describe('auto depth charts by coach personality (spec 12.2)', () => {
  it('turns personality into a profile of depth chart styles', () => {
    const developer = coachProfile(coach({ tendencies: { youthLean: 100 } }));
    const veteranLean = coachProfile(coach({ tendencies: { youthLean: 0 } }));
    expect(developer.developer).toBeGreaterThan(0.3);
    expect(developer.veteran).toBe(0);
    expect(veteranLean.veteran).toBeGreaterThan(0.3);
    const total = Object.values(developer).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('starts the young high-potential player for a developer and the veteran for everyone else', () => {
    const neutral = { rigidity: 0, personnelPower: 100 };
    expect(
      ranked(coach({ tendencies: { ...neutral, youthLean: 100 }, personality: { loyalty: 0 } }))[0]
    ).toBe('r');
    expect(ranked(coach({ tendencies: { ...neutral, youthLean: 0 }, personality: { loyalty: 0 } }))[0]).toBe(
      'v'
    );
    expect(
      ranked(
        coach({ tendencies: { ...neutral, youthLean: 50 }, personality: { loyalty: 0, analyticsLean: 100 } })
      )[0]
    ).toBe('v');
  });

  it("keeps last week's starter for a loyalist, and plays the expensive player for a contract-minded coach", () => {
    const loyalist = coach({
      tendencies: { youthLean: 50, rigidity: 100, personnelPower: 100 },
      personality: { loyalty: 100 }
    });
    expect(ranked(loyalist, 'r')[0]).toBe('r');
    const pliable = coach({
      tendencies: { youthLean: 50, rigidity: 0, personnelPower: 100 },
      personality: { loyalty: 0 }
    });
    expect(ranked(pliable, 'r')[0]).toBe('v');
    // Swap the pay: the contract-minded coach follows the money to the lower-rated player.
    const paid = { ...rookie, capHit: 20_000_000 };
    const contract = coach({
      tendencies: { youthLean: 50, rigidity: 0, personnelPower: 0 },
      personality: { loyalty: 0, analyticsLean: 0 }
    });
    const order = score(
      [veteran, paid],
      [merit(72), experience(), upside(), incumbent(undefined), salary(20_000_000)],
      depthWeights(coachProfile(contract))
    )
      .sort((a, b) => b.score - a.score)
      .map(s => s.option.id);
    expect(order[0]).toBe('r');
  });

  it('fills every offensive and defensive slot with a different healthy player', () => {
    const league = fresh();
    const roster = dressable(league, TEAM);
    const { starters, logs } = decideDepthChart(league, TEAM, roster, stream(3, 'depth'));
    const ids = Object.values(starters);
    expect(ids.length).toBe(27);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => roster.some(p => p.id === id))).toBe(true);
    expect(logs).toHaveLength(27);
    // Most slots go to the best role rating; the rest are close calls.
    const gaps = logs.map(l => -(l.chosen.parts.find(p => p.name === 'merit')?.input ?? 0));
    expect(gaps.filter(g => g === 0).length).toBeGreaterThan(20);
    expect(Math.max(...gaps)).toBeLessThan(8);
  });

  it('moves a starter over to fill a slot nobody left can play', () => {
    const league = fresh();
    const all = dressable(league, TEAM);
    const LINE = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
    const line = all.filter(p => (LINE as readonly string[]).includes(p.position)).slice(0, 5);
    // A strong tackle and two strong guards, and two weak centers, alike but for their ratings: the guards
    // start at LG and C, and no tackle is left for RT.
    line.forEach((p, i) => {
      const { traits, abilities } = line[0] as Player;
      Object.assign(p, {
        position: ['LT', 'LG', 'RG', 'C', 'C'][i],
        ovr: i < 3 ? 90 : 45,
        traits: { ...traits },
        abilities: [...abilities]
      });
      for (const key of Object.keys(p.ratings) as (keyof Player['ratings'])[])
        p.ratings[key] = i < 3 ? 95 : 40;
    });
    league.teams[TEAM].depth.order = orderOf({});
    const roster = all.filter(p => line.includes(p) || !(LINE as readonly string[]).includes(p.position));
    const { starters } = decideDepthChart(league, TEAM, roster, stream(3, 'depth'));
    const ids = LINE.map(slot => starters[slot]);
    expect(ids).not.toContain(undefined);
    expect(new Set(ids).size).toBe(5);
  });

  it('replays the same lineup from the same season stream', () => {
    const league = fresh();
    const roster = dressable(league, TEAM);
    const a = decideDepthChart(league, TEAM, roster, stream(7, 'season'));
    const b = decideDepthChart(league, TEAM, roster, stream(7, 'season'));
    expect(a.starters).toEqual(b.starters);
  });
});

describe('questionable players (spec 10.8 playing hurt)', () => {
  it('plays a starter the lineup needs and rests a backup', () => {
    const league = fresh();
    const roster = dressable(league, TEAM);
    const { starters } = decideDepthChart(league, TEAM, roster, stream(1));
    league.teams[TEAM].depth.order = orderOf(starters);
    const qb = league.players[starters.QB as string];
    const backups = roster.filter(p => p.position === 'QB' && p.id !== qb?.id);
    const backup = backups[0];
    if (!qb || !backup) throw new Error('no quarterbacks');
    // The starter is better than the man behind him; the backup isn't starting anywhere.
    for (const p of [qb, backup])
      p.injury = {
        bodyPart: 'ankle',
        severity: 'minor',
        weeksOut: 0,
        lingering: 3,
        fragile: 0,
        season: 2026,
        week: 1,
        career: false
      };
    const { resting, logs } = decideRest(league, TEAM, roster, false, stream(2));
    expect(resting).toContain(backup.id);
    expect(resting).not.toContain(qb.id);
    expect(logs).toHaveLength(2);
  });
});

describe('rotations on auto (spec 12.3)', () => {
  it("limits a returning player's snaps and brings in a pass-rush specialist who out-rushes a starter", () => {
    const league = fresh();
    const roster = dressable(league, TEAM);
    const { starters } = decideDepthChart(league, TEAM, roster, stream(1));
    const starting = new Set(Object.values(starters));
    const back = roster.find(p => starting.has(p.id));
    const specialist = roster.find(p => !starting.has(p.id) && (p.position === 'LE' || p.position === 'RE'));
    if (!back || !specialist) throw new Error('no players');
    back.injury = {
      bodyPart: 'ankle',
      severity: 'minor',
      weeksOut: 0,
      lingering: 2,
      fragile: 0,
      season: 2026,
      week: 1,
      career: false
    };
    specialist.ratings = { ...specialist.ratings, fmv: 99, pmv: 99, acc: 95, spd: 90 };
    const { rotation, logs } = decideRotation(league, TEAM, roster, starters, stream(2));
    expect(rotation.snapLimits[back.id]).toBe(TUNING.ai.rotation.returnLimit.questionable);
    expect(rotation.subs.passRusher).toBe(specialist.id);
    expect(rotation.rb1Share).toBeGreaterThanOrEqual(0.35);
    expect(logs.map(l => l.decision)).toContain('Rotation: pass-rush specialist');
  });

  it('names a goal-line back and a dime linebacker who beat the starters at the job', () => {
    const league = fresh();
    const roster = dressable(league, TEAM);
    const { starters } = decideDepthChart(league, TEAM, roster, stream(1));
    const starting = new Set(Object.values(starters));
    const bruiser = roster.find(p => !starting.has(p.id) && p.position === 'HB');
    const cover = roster.find(p => !starting.has(p.id) && ['MLB', 'LOLB', 'ROLB'].includes(p.position));
    if (!bruiser || !cover) throw new Error('no players');
    bruiser.ratings = { ...bruiser.ratings, trk: 99, btk: 99, str: 95, sfa: 95, car: 99 };
    cover.ratings = { ...cover.ratings, zcv: 99, mcv: 99, prc: 95, spd: 92, prs: 90 };
    const { rotation, logs } = decideRotation(league, TEAM, roster, starters, stream(2));
    expect(rotation.subs.goalLineBack).toBe(bruiser.id);
    expect(rotation.subs.dimeBacker).toBe(cover.id);
    expect(logs.map(l => l.decision)).toEqual(
      expect.arrayContaining(['Rotation: goal-line back', 'Rotation: dime linebacker'])
    );
  });
});

describe('injury replacements (spec 12.1, 14.11)', () => {
  it('moves a long injury to injured reserve and signs a replacement at the position', () => {
    const league = fresh();
    const hurt = activeRoster(league, TEAM).find(p => p.position === 'WR');
    if (!hurt) throw new Error('no receiver');
    const injury: PlayerInjury = {
      bodyPart: 'knee',
      severity: 'medium',
      weeksOut: 6,
      lingering: 2,
      fragile: 3,
      season: 2026,
      week: 1,
      career: false
    };
    hurt.injury = injury;
    const logs = rosterMoves(league, TEAM, stream(4));
    expect(hurt.status).toBe('ir');
    expect(activeRoster(league, TEAM)).toHaveLength(league.rules.roster.active);
    const signed = league.season.transactions.filter(t => t.kind === 'signed' || t.kind === 'promoted');
    expect(signed).toHaveLength(1);
    const newcomer = league.players[signed[0]?.playerId as string];
    expect(newcomer?.team).toBe(TEAM);
    expect(NEED_GROUP[newcomer?.position ?? 'QB']).toBe('WR');
    expect(newcomer?.contractId && league.contracts[newcomer.contractId]?.years[0]?.base).toBeGreaterThan(0);
    expect(logs[0]?.decision).toBe('Sign a free agent');

    // Healed after three games, he still waits: injured reserve is at least four games (spec 12.1).
    hurt.injury = { ...injury, weeksOut: 0 };
    const play = (week: number) => {
      const id = `g${week}`;
      league.season.results[id] = {
        id, week, home: TEAM, away: 'BUF', homeScore: 20, awayScore: 17, homeTd: 2, awayTd: 2, playoff: false, overtime: false
      }; // prettier-ignore
    };
    [1, 2, 3].forEach(play);
    rosterMoves(league, TEAM, stream(5));
    expect(hurt.status).toBe('ir');
    // After the fourth game he comes back, and the weakest healthy receiver makes room.
    play(5);
    rosterMoves(league, TEAM, stream(6));
    expect(hurt.status).toBe('active');
    expect(activeRoster(league, TEAM)).toHaveLength(league.rules.roster.active);
    const released = league.season.transactions.filter(t => t.kind === 'released');
    expect(released).toHaveLength(1);
    expect(NEED_GROUP[league.players[released[0]?.playerId as string]?.position ?? 'QB']).toBe('WR');
  });

  it("never promotes or signs a player who can't play this week", () => {
    const league = fresh();
    const hurt = (p: Player | undefined, weeksOut: number) => {
      if (!p) throw new Error('no player');
      p.injury = { bodyPart: 'knee', severity: 'medium', weeksOut, lingering: 1, fragile: 1, season: 2026, week: 1, career: false };
    };
    const qbs = activeRoster(league, TEAM).filter(p => p.position === 'QB');
    for (const qb of qbs) hurt(qb, 6);
    // The practice squad has the best quarterback on offer, but he's hurt too, so a healthy free agent has
    // to come in.
    const squad = Object.values(league.players).filter(p => p.team === TEAM && p.status === 'practice' && p.position === 'QB');
    expect(squad.length).toBeGreaterThan(0);
    for (const p of squad) {
      hurt(p, 5);
      p.ovr = 90;
    }
    rosterMoves(league, TEAM, stream(8));
    const joined = league.season.transactions
      .filter(t => t.team === TEAM && (t.kind === 'signed' || t.kind === 'promoted'))
      .map(t => league.players[t.playerId]);
    const quarterback = joined.find(p => p?.position === 'QB');
    expect(quarterback).toBeDefined();
    expect(quarterback?.injury ?? null).toBeNull();
    expect(squad.every(p => p.status === 'practice')).toBe(true);
  }); // prettier-ignore

  it('brings a healed player back from injured reserve when nobody at his position is healthy', () => {
    const league = fresh();
    const [starter, backup] = activeRoster(league, TEAM)
      .filter(p => p.position === 'QB')
      .sort((a, b) => b.ovr - a.ovr);
    if (!starter || !backup) throw new Error('no quarterbacks');
    starter.injury = { bodyPart: 'knee', severity: 'medium', weeksOut: 6, lingering: 0, fragile: 0, season: 2026, week: 1, career: false }; // prettier-ignore
    rosterMoves(league, TEAM, stream(9));
    expect(starter.status).toBe('ir');
    // Four games later he's healed, and the other quarterbacks are hurt.
    for (const week of [1, 2, 3, 4]) {
      const id = `g${week}`;
      league.season.results[id] = {
        id, week, home: TEAM, away: 'BUF', homeScore: 20, awayScore: 17, homeTd: 2, awayTd: 2, playoff: false, overtime: false
      }; // prettier-ignore
    }
    starter.injury = null;
    for (const p of activeRoster(league, TEAM).filter(q => q.position === 'QB'))
      p.injury = { bodyPart: 'ankle', severity: 'short', weeksOut: 3, lingering: 0, fragile: 0, season: 2026, week: 4, career: false }; // prettier-ignore
    rosterMoves(league, TEAM, stream(10));
    expect(starter.status).toBe('active');
    expect(activeRoster(league, TEAM)).toHaveLength(league.rules.roster.active);
  });

  it('signs a kicker when the only one is hurt, even for a short injury', () => {
    const league = fresh();
    const kicker = activeRoster(league, TEAM).find(p => p.position === 'K');
    if (!kicker) throw new Error('no kicker');
    kicker.injury = {
      bodyPart: 'hamstring',
      severity: 'minor',
      weeksOut: 2,
      lingering: 1,
      fragile: 1,
      season: 2026,
      week: 1,
      career: false
    };
    rosterMoves(league, TEAM, stream(6));
    expect(kicker.status).toBe('active');
    const kickers = activeRoster(league, TEAM).filter(p => p.position === 'K');
    expect(kickers).toHaveLength(2);
    expect(activeRoster(league, TEAM)).toHaveLength(league.rules.roster.active);
  });
});

describe('opponent game plans (spec 8.7)', () => {
  it('builds different plans for different opponents from the scouting report', () => {
    const league = fresh();
    const exact = (v: number) => v;
    const ideals = (['BUF', 'DET', 'SF', 'LV', 'NO'] as const).map(o =>
      JSON.stringify(idealPlan(scoutingReport(league, TEAM, o), exact))
    );
    expect(new Set(ideals).size).toBe(ideals.length);
    const plans = (['BUF', 'DET', 'SF', 'LV', 'NO'] as const).map(o =>
      JSON.stringify(decideGamePlan(league, TEAM, o, stream(8, o)).plan)
    );
    expect(new Set(plans).size).toBeGreaterThan(2);
  });

  it('attacks a weakness: more passing against a poor pass defense, a spy for a mobile quarterback', () => {
    const league = fresh();
    const opponent: TeamAbbr = 'BUF';
    const theirs = Object.values(league.players).filter(p => p.team === opponent);
    for (const p of theirs) {
      if (['CB', 'FS', 'SS'].includes(p.position))
        p.ratings = { ...p.ratings, mcv: 30, zcv: 30, spd: 60, prc: 30 };
      if (p.position === 'QB') p.ratings = { ...p.ratings, spd: 95, agi: 95, bsk: 95 };
    }
    const exact = (v: number) => v;
    const ideal = idealPlan(scoutingReport(league, TEAM, opponent), exact);
    expect(ideal.passLean).toBeGreaterThan(0.05);
    const dc = staffIn(league, TEAM, 'DC');
    if (dc) dc.ratings = { ...dc.ratings, playCalling: 99 };
    expect(decideGamePlan(league, TEAM, opponent, stream(9)).plan.spy).toBe(true);
  });

  it("stays at the scheme's normal when the report finds nothing to attack", () => {
    const report = {
      team: TEAM, opponent: 'BUF' as TeamAbbr, passEdge: 0, runEdge: 0, protection: 0, poise: 0, escape: 0,
      manEdge: 0, zoneEdge: 0, deepThreat: 0, spreadShare: 0.55, passRate: 0.55, playmaker: null, topReceiver: null,
      topCorner: null, topRusher: null, quarterback: null
    }; // prettier-ignore
    const ideal = idealPlan(report, v => v);
    expect(ideal).toEqual({ passLean: 0, blitz: 1, man: 0, press: 0, nickel: 0, spread: 0, twoHigh: 0 });
  });
});

describe('weekly management (spec 14.10)', () => {
  it('sets depth charts and plans for AI teams and leaves the user team on manual alone', () => {
    const league = fresh();
    const user = league.meta.start.userTeam;
    league.teams[user].depth.auto = false;
    league.teams[user].plan.auto = false;
    const logs = manageWeek(league, stream(1, 'week'), stream(1, 'season'));
    expect(Object.keys(league.teams.KC.depth.order)).toHaveLength(27);
    expect(league.teams[user].depth.order).toEqual({});
    expect(league.teams[user].plan.plan).toEqual(NEUTRAL_PLAN);
    expect(logs.some(l => l.actor === 'KC defensive coordinator')).toBe(true);
    expect(logs.some(l => l.actor.startsWith(user))).toBe(false);
  });

  it("makes the user team's roster moves only while its roster management is on auto (spec 22.7)", () => {
    const league = fresh();
    const user = league.meta.start.userTeam;
    const hurt = activeRoster(league, user).find(p => p.position === 'WR');
    if (!hurt) throw new Error('no receiver');
    hurt.injury = {
      bodyPart: 'knee',
      severity: 'medium',
      weeksOut: 6,
      lingering: 2,
      fragile: 3,
      season: 2026,
      week: 1,
      career: false
    };
    const signed = () =>
      league.season.transactions.filter(
        t => t.team === user && (t.kind === 'signed' || t.kind === 'promoted')
      );
    manageWeek(league, stream(2, 'week'), stream(2, 'season'));
    expect(hurt.status).toBe('active');
    expect(signed()).toHaveLength(0);
    league.settings.auto.roster = true;
    manageWeek(league, stream(3, 'week'), stream(3, 'season'));
    expect(hurt.status).toBe('ir');
    expect(signed()).toHaveLength(1);
  });

  it("claims players on waivers for the user team only while its roster management is on auto", () => {
    const league = fresh();
    const user = league.meta.start.userTeam;
    const star = Object.values(league.players).find(p => p.team === 'KC' && p.position === 'QB');
    if (!star) throw new Error('no quarterback');
    const entry = { playerId: star.id, from: 'KC' as const, contractId: star.contractId ?? '', placed: { ...league.date }, claims: [] };
    // A player far better than every team's weakest at his group draws claims from everyone who may claim.
    const better = { ...star, ovr: 99 };
    expect(waiverClaims(league, entry, better)).not.toContain(user);
    league.settings.auto.roster = true;
    expect(waiverClaims(league, entry, better)).toContain(user);
  }); // prettier-ignore
});
