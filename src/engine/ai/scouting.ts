/**
 * The opponent scouting report (spec 8.7): how our units match up with theirs, their tendencies, and the
 * players worth planning around. The auto game plan reads it, and the user sees the same report. Matchups
 * are in rating points from the sim's composite edges (spec 8.3), starters only.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { chosenLineup, type LineupPlayer } from '../fit/cohesion';
import { startersOf } from '../league/depth';
import { leagueFitContext } from '../league/fit';
import type { League } from '../league/types';
import { fullName, type Player } from '../model/player';
import type { Position } from '../model/positions';
import type { Slot } from '../schemes/slots';
import { PERSONNEL } from '../schemes/tendencies';
import { cannotPlay, designation } from '../season/injuries';
import { compositeEdges, type CompositeId } from '../sim/composites';

export interface ScoutedPlayer {
  id: string;
  name: string;
  position: Position;
  /** His rating in the matchup that matters, and how far he stands above the comparison. */
  value: number;
  margin: number;
}

export interface ScoutingReport {
  team: TeamAbbr;
  opponent: TeamAbbr;
  /** Our passing game against their pass defense, and our running game against their run defense. */
  passEdge: number;
  runEdge: number;
  /** Their pass protection against our pass rush: below zero, our rush wins. */
  protection: number;
  /** Their quarterback's poise under pressure and his escapability. */
  poise: number;
  escape: number;
  /** Our man coverage against their receivers' releases, and our zone coverage against their routes. */
  manEdge: number;
  zoneEdge: number;
  /** Their deep passing threat: their outside receivers' deep routes and their quarterback's deep accuracy. */
  deepThreat: number;
  /** Their share of three-receiver personnel, and their average pass rate. */
  spreadShare: number;
  passRate: number;
  /** Our best receiver against our others. */
  playmaker: ScoutedPlayer | null;
  /** Their best receiver against their others. */
  topReceiver: ScoutedPlayer | null;
  /** Our best corner in man coverage against our others. */
  topCorner: ScoutedPlayer | null;
  /** Their best pass rusher against our line's pass blocking. */
  topRusher: ScoutedPlayer | null;
  /** Their quarterback, by his escapability. */
  quarterback: ScoutedPlayer | null;
}

const LINE = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
const RECEIVERS = ['X', 'Z', 'SLOT', 'TE1'] as const;
const WIDEOUTS = ['X', 'Z', 'SLOT'] as const;
const RUSHERS = ['LEDGE', 'REDGE', 'DT1', 'DT2'] as const;
const CORNERS = ['CB1', 'CB2', 'NCB'] as const;
const SECONDARY = ['CB1', 'CB2', 'NCB', 'FS', 'SS'] as const;
const FRONT = ['LEDGE', 'REDGE', 'DT1', 'DT2', 'MIKE', 'WILL'] as const;

const mean = (values: readonly number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** A team's starters this week, with each one's composite edges. */
function starters(league: League, abbr: TeamAbbr) {
  const roster = Object.values(league.players).filter(
    p =>
      p.team === abbr &&
      p.status === 'active' &&
      !cannotPlay(designation(p.injury)) &&
      !league.teams[abbr].resting.includes(p.id)
  );
  const ctx = leagueFitContext(league, abbr);
  const ids = new Set(roster.map(p => p.id));
  const starting = startersOf(league.teams[abbr].depth.order, id => ids.has(id));
  const lineup = chosenLineup(roster as readonly LineupPlayer[], ctx, starting);
  const edges = new Map<string, ReturnType<typeof compositeEdges>>();
  const at = (slot: Slot): Player | undefined => lineup.get(slot)?.player as Player | undefined;
  const edge = (slot: Slot, id: CompositeId): number | null => {
    const p = at(slot);
    if (!p) return null;
    let e = edges.get(p.id);
    if (!e) {
      e = compositeEdges(p.ratings);
      edges.set(p.id, e);
    }
    return e[id];
  };
  /** The mean of a composite (or the mean of several) over the slots that have a starter. */
  const unit = (slots: readonly Slot[], ...ids: CompositeId[]): number =>
    mean(slots.flatMap(s => (at(s) ? [mean(ids.map(id => edge(s, id) ?? 0))] : [])));
  return { at, edge, unit, tendencies: ctx.offense.tendencies };
}

/** The best of a group by a value, and how far above the rest of the group (or a fixed mark) he stands. */
function standout(
  slots: readonly Slot[],
  at: (slot: Slot) => Player | undefined,
  value: (slot: Slot) => number,
  against?: number
): ScoutedPlayer | null {
  const rated = slots.flatMap(s => {
    const p = at(s);
    return p ? [{ p, v: value(s) }] : [];
  });
  if (!rated.length) return null;
  rated.sort((a, b) => b.v - a.v);
  const top = rated[0] as { p: Player; v: number };
  const rest = rated.slice(1).map(r => r.v);
  const mark = against ?? (rest.length ? mean(rest) : top.v);
  return {
    id: top.p.id,
    name: fullName(top.p),
    position: top.p.position,
    value: top.v,
    margin: top.v - mark
  };
}

export function scoutingReport(league: League, team: TeamAbbr, opponent: TeamAbbr): ScoutingReport {
  const us = starters(league, team);
  const them = starters(league, opponent);
  const ourPass = mean([
    us.edge('QB', 'accMid') ?? 0,
    us.unit(RECEIVERS, 'routeMid'),
    us.unit(LINE, 'passBlock')
  ]);
  const theirPassD = mean([them.unit(SECONDARY, 'manCover', 'zoneCover'), them.unit(RUSHERS, 'passRush')]);
  const ourRun = mean([
    us.unit(LINE, 'runBlockZone', 'runBlockGap'),
    us.at('RB1') ? mean(['vision', 'elusive', 'power'].map(id => us.edge('RB1', id as CompositeId) ?? 0)) : 0
  ]);
  const theirRunD = mean([them.unit(FRONT, 'runStop'), them.unit(['MIKE', 'WILL', 'SS'], 'tackle')]);
  const ourLine = us.unit(LINE, 'passBlock');
  const personnel = them.tendencies.personnel;
  const total = PERSONNEL.reduce((n, p) => n + personnel[p], 0);
  const spread = PERSONNEL.filter(p => 5 - Number(p[0]) - Number(p[1]) >= 3).reduce(
    (n, p) => n + personnel[p],
    0
  );
  const receiving = (side: typeof us) => (s: Slot) =>
    mean([side.edge(s, 'routeMid') ?? 0, side.edge(s, 'hands') ?? 0]);
  return {
    team,
    opponent,
    passEdge: ourPass - theirPassD,
    runEdge: ourRun - theirRunD,
    protection: them.unit(LINE, 'passBlock') - us.unit(RUSHERS, 'passRush'),
    poise: them.edge('QB', 'poise') ?? 0,
    escape: them.edge('QB', 'escape') ?? 0,
    manEdge: us.unit(CORNERS, 'manCover') - them.unit(WIDEOUTS, 'routeShort'),
    zoneEdge: us.unit(SECONDARY, 'zoneCover') - them.unit(WIDEOUTS, 'routeMid'),
    deepThreat: mean([them.unit(['X', 'Z'], 'routeDeep'), them.edge('QB', 'accDeep') ?? 0]),
    spreadShare: total > 0 ? spread / total : 0,
    passRate: mean(Object.values(them.tendencies.passRate)),
    playmaker: standout(RECEIVERS, us.at, receiving(us)),
    topReceiver: standout(RECEIVERS, them.at, receiving(them)),
    topCorner: standout(CORNERS, us.at, s => us.edge(s, 'manCover') ?? 0),
    topRusher: standout(RUSHERS, them.at, s => them.edge(s, 'passRush') ?? 0, ourLine),
    quarterback: standout(['QB'], them.at, s => them.edge(s, 'escape') ?? 0, 0)
  };
}
