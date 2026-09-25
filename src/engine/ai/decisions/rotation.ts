/**
 * Rotations and packages on auto (spec 12.3): the head coach splits the backfield by how close his backs
 * are, rotates the line by how close its backups are, names situational subs who beat the starter at the
 * job, limits the snaps of players back from an injury, and plans development snaps for young backups by
 * his developer lean.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { roleRating } from '../../fit/role-rating';
import { leagueFitContext } from '../../league/fit';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, fullName, type Player } from '../../model/player';
import type { Position } from '../../model/positions';
import type { Rng } from '../../rng';
import type { Slot } from '../../schemes/slots';
import { designation } from '../../season/injuries';
import { compositeEdges, type CompositeId } from '../../sim/composites';
import { PLAN_LIMITS, type Rotation } from '../../sim/plan';
import { TUNING } from '../../tuning';
import type { DecisionLog } from '../framework';
import { coachProfile, competence, staffIn } from '../profile';
import { decideDial, decideFocus } from './settings';

const R = TUNING.ai.rotation;
const D = TUNING.ai.depth;

const mean = (values: readonly number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

export interface RotationChoice {
  rotation: Rotation;
  logs: DecisionLog[];
}

/** The team's rotation for the week, from the players who dress and this week's starters. */
export function decideRotation(
  league: League,
  abbr: TeamAbbr,
  roster: readonly Player[],
  starters: Partial<Record<Slot, string>>,
  rng: Rng
): RotationChoice {
  const ctx = leagueFitContext(league, abbr);
  const hc = staffIn(league, abbr, 'HC');
  const skill = competence(hc);
  const rigidity = (hc?.tendencies?.rigidity ?? 50) / 100;
  const actor = `${abbr} head coach`;
  const logs: DecisionLog[] = [];
  const byId = new Map(roster.map(p => [p.id, p]));
  const at = (slot: Slot): Player | undefined => byId.get(starters[slot] ?? '');
  const starting = new Set(Object.values(starters));
  const cache = new Map<string, ReturnType<typeof compositeEdges>>();
  const edge = (p: Player, ...ids: CompositeId[]): number => {
    let e = cache.get(p.id);
    if (!e) {
      e = compositeEdges(p.ratings);
      cache.set(p.id, e);
    }
    const values = e;
    return mean(ids.map(id => values[id]));
  };

  // The backfield split, by how far the lead back out-rates the second.
  const rb1 = at('RB1');
  const rb2 = at('RB2');
  const backGap =
    rb1 && rb2 ? roleRating(rb1, 'RB1', ctx).rating - roleRating(rb2, 'RB1', ctx).rating : D.meritSpan;
  const backfield = decideDial(
    'Rotation: backfield',
    actor,
    R.backfieldRange,
    TUNING.situations.rb1Share,
    clamp(TUNING.situations.rb1Share + (backGap - R.backfieldGap) * R.backfieldPerPoint, R.backfieldRange),
    rigidity,
    skill,
    rng,
    R.backfieldSteps
  );
  if (backfield) logs.push(backfield.log);

  // The line rotation, by how close the best backups come to the starters.
  const line = (['LEDGE', 'REDGE', 'DT1', 'DT2'] as const).flatMap(s => (at(s) ? [at(s) as Player] : []));
  const DL: readonly Position[] = ['LE', 'RE', 'DT'];
  const lineBackups = roster
    .filter(p => DL.includes(p.position) && !starting.has(p.id))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, line.length);
  const lineGap = lineBackups.length
    ? mean(line.map(p => p.ovr)) - mean(lineBackups.map(p => p.ovr))
    : R.lineFarGap;
  const rotationIdeal = clamp(1 - (lineGap - R.lineCloseGap) / (R.lineFarGap - R.lineCloseGap), [0, 1]);
  const lineDial = decideDial(
    'Rotation: defensive line',
    actor,
    PLAN_LIMITS.lineRotation,
    0.5,
    rotationIdeal,
    rigidity,
    skill,
    rng
  );
  if (lineDial) logs.push(lineDial.log);

  // Situational subs: the best candidate at the job, if he beats the man he'd replace by enough.
  const sub = (
    name: string,
    pool: readonly Player[],
    value: (p: Player) => number,
    against: number | null
  ) => {
    const best = [...pool].sort((a, b) => value(b) - value(a) || (a.id < b.id ? -1 : 1))[0];
    const candidate =
      best && against !== null
        ? { id: best.id, name: fullName(best), margin: value(best) - against - R.subFrom }
        : null;
    const d = decideFocus(`Rotation: ${name}`, actor, candidate, skill, rng);
    if (d) logs.push(d.log);
    return d?.chosen.id ?? null;
  };
  const bench = roster.filter(p => !starting.has(p.id));
  const receivingBack = (p: Player) => edge(p, 'routeShort', 'hands', 'passBlock');
  const rusher = (p: Player) => edge(p, 'passRush');
  const target = (p: Player) => edge(p, 'contested');
  const edges = (['LEDGE', 'REDGE'] as const).flatMap(s => (at(s) ? [rusher(at(s) as Player)] : []));
  const bigTargets = bench.filter(p => p.position === 'WR' || p.position === 'TE');
  const bestTarget = [...bigTargets].sort((a, b) => target(b) - target(a))[0];
  const replaced = bestTarget ? at(bestTarget.position === 'TE' ? 'TE1' : 'SLOT') : undefined;
  const subs = {
    thirdDownBack: sub(
      'third-down back',
      bench.filter(p => p.position === 'HB'),
      receivingBack,
      rb1 ? receivingBack(rb1) : null
    ),
    passRusher: sub(
      'pass-rush specialist',
      bench.filter(p => ['LE', 'RE', 'DT', 'LOLB', 'ROLB'].includes(p.position)),
      rusher,
      edges.length ? Math.min(...edges) : null
    ),
    redZoneTarget: sub('red zone target', bigTargets, target, replaced ? target(replaced) : null)
  };

  // Snap limits for players back from an injury.
  const snapLimits: Record<string, number> = {};
  for (const p of roster) {
    const d = designation(p.injury);
    if (d === 'questionable' || d === 'probable') snapLimits[p.id] = R.returnLimit[d];
  }

  // Development snaps for young backups with room to grow, by the coach's developer lean.
  const devSnaps: Record<string, number> = {};
  const share = Math.min(PLAN_LIMITS.devSnaps[1], coachProfile(hc).developer * R.devSnapScale);
  const today = calendarDay(league.date);
  if (share > 0)
    for (const p of bench)
      if (ageOn(p.birthDate, today) <= D.youngAge && p.potential - p.ovr >= R.devUpsideFrom)
        devSnaps[p.id] = share;

  return {
    rotation: {
      rb1Share: backfield?.chosen.value ?? TUNING.situations.rb1Share,
      lineRotation: lineDial?.chosen.value ?? 0.5,
      subs,
      snapLimits,
      devSnaps
    },
    logs
  };
}
