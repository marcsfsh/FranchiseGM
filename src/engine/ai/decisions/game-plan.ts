/**
 * The auto game plan (spec 8.7, 14.11): the staff reads the scouting report, with noise that shrinks as
 * the coordinators' play calling improves, and sets each dial toward what the report calls for, held back
 * by the head coach's rigidity. Player focus goes to a player whose case clears its threshold. The
 * offensive coordinator decides the offense's settings and the defensive coordinator the defense's.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import type { League } from '../../league/types';
import type { Rng } from '../../rng';
import { NEUTRAL_PLAN, PLAN_LIMITS, type GamePlan } from '../../sim/plan';
import { TUNING } from '../../tuning';
import type { DecisionLog } from '../framework';
import { competence, staffIn } from '../profile';
import { scoutingReport, type ScoutedPlayer, type ScoutingReport } from '../scouting';
import { decideDial, decideFocus } from './settings';

const P = TUNING.ai.plan;

type Dial = 'passLean' | 'blitz' | 'man' | 'press' | 'nickel' | 'spread' | 'twoHigh';

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** What the report calls for on each dial, read with the given noise per rating point. */
export function idealPlan(report: ScoutingReport, read: (value: number) => number): Record<Dial, number> {
  const lean = read(report.passEdge) - read(report.runEdge);
  const man = read(report.manEdge);
  const passLean = clamp(lean * P.leanPerPoint, PLAN_LIMITS.passLean);
  return {
    passLean,
    // A passing plan spreads the field; a running plan brings in tight ends and backs.
    spread: clamp(passLean * P.spreadPerLean, PLAN_LIMITS.spread),
    twoHigh: clamp(read(report.deepThreat) * P.twoHighPerPoint, PLAN_LIMITS.twoHigh),
    blitz: clamp(
      1 - read(report.protection) * P.blitzPerPoint - read(report.poise) * P.poisePerPoint,
      PLAN_LIMITS.blitz
    ),
    man: clamp((man - read(report.zoneEdge)) * P.coverPerPoint, PLAN_LIMITS.man),
    press: clamp(man * P.pressPerPoint, PLAN_LIMITS.press),
    nickel: clamp((report.spreadShare - P.spreadShare) * P.nickelPerShare, PLAN_LIMITS.nickel)
  };
}

/** Shadowing takes a standout receiver and a standout corner: the case is the weaker of the two. */
function shadowCase(report: ScoutingReport): ScoutedPlayer | null {
  const { topReceiver, topCorner } = report;
  if (!topReceiver || !topCorner) return null;
  return {
    ...topReceiver,
    margin: Math.min(topReceiver.margin - P.shadowFrom, topCorner.margin - P.cornerFrom)
  };
}

export interface PlanChoice {
  plan: GamePlan;
  report: ScoutingReport;
  logs: DecisionLog[];
}

export function decideGamePlan(league: League, abbr: TeamAbbr, opponent: TeamAbbr, rng: Rng): PlanChoice {
  const report = scoutingReport(league, abbr, opponent);
  const hc = staffIn(league, abbr, 'HC');
  const oc = staffIn(league, abbr, 'OC');
  const dc = staffIn(league, abbr, 'DC');
  const offense = competence(oc, 'playCalling');
  const defense = competence(dc, 'playCalling');
  const rigidity = (hc?.tendencies?.rigidity ?? 50) / 100;
  const noise = (skill: number) => (value: number) => value + rng.normal(0, P.readNoise * (1 - skill / 100));
  const offenseIdeal = idealPlan(report, noise(offense));
  const defenseIdeal = idealPlan(report, noise(defense));
  const logs: DecisionLog[] = [];

  const dial = (name: Dial, ideal: number, skill: number, actor: string): number => {
    const neutral = NEUTRAL_PLAN[name];
    const d = decideDial(
      `Game plan: ${name}`,
      `${abbr} ${actor}`,
      PLAN_LIMITS[name],
      neutral,
      ideal,
      rigidity,
      skill,
      rng
    );
    if (d) logs.push(d.log);
    return d?.chosen.value ?? neutral;
  };

  const focus = (
    name: string,
    player: ScoutedPlayer | null,
    threshold: number,
    skill: number,
    actor: string
  ): string | null => {
    const candidate = player ? { ...player, margin: player.margin - threshold } : null;
    const d = decideFocus(`Game plan: ${name}`, `${abbr} ${actor}`, candidate, skill, rng);
    if (d) logs.push(d.log);
    return d?.chosen.id ?? null;
  };

  const plan: GamePlan = {
    passLean: dial('passLean', offenseIdeal.passLean, offense, 'offensive coordinator'),
    // Coordinators plan one balance for every situation until M14's AI tailors them.
    situations: { ...NEUTRAL_PLAN.situations },
    blitz: dial('blitz', defenseIdeal.blitz, defense, 'defensive coordinator'),
    man: dial('man', defenseIdeal.man, defense, 'defensive coordinator'),
    press: dial('press', defenseIdeal.press, defense, 'defensive coordinator'),
    nickel: dial('nickel', defenseIdeal.nickel, defense, 'defensive coordinator'),
    spread: dial('spread', offenseIdeal.spread, offense, 'offensive coordinator'),
    twoHigh: dial('twoHigh', defenseIdeal.twoHigh, defense, 'defensive coordinator'),
    feature: focus('feature', report.playmaker, P.featureFrom, offense, 'offensive coordinator'),
    shadow: focus('shadow', shadowCase(report), 0, defense, 'defensive coordinator'),
    doubleReceiver: focus(
      'double receiver',
      report.topReceiver,
      P.doubleFrom,
      defense,
      'defensive coordinator'
    ),
    doubleRusher: focus('chip rusher', report.topRusher, P.chipFrom, offense, 'offensive coordinator'),
    spy: focus('spy', report.quarterback, P.spyFrom, defense, 'defensive coordinator') !== null
  };
  return { plan, report, logs };
}
