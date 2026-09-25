/**
 * Depth chart changes as events with reasons (post-M42 section 1.1, for notifications later): who took a
 * starting spot from whom in a week's lineups, and why, compared with the starters before.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { Slot } from '../schemes/slots';
import { cannotPlay, designation } from '../season/injuries';
import { startersOf } from './depth';
import type { League } from './types';

/**
 * Why a starter changed: the old one was hurt, rested, or off the active roster; the new one is back from
 * an injury; he won a camp battle for the job; or the coach chose him.
 */
export type DepthReason = 'injury' | 'rest' | 'roster' | 'return' | 'camp' | 'coach';

export interface DepthChange {
  team: TeamAbbr;
  slot: Slot;
  /** The new starter; null when nobody starts there now. */
  playerId: string | null;
  /** Who started there before; null when nobody did. */
  replaced: string | null;
  reason: DepthReason;
}

export type Starters = Record<TeamAbbr, Partial<Record<Slot, string>>>;

/** Every team's starters from its depth chart. */
export function startersByTeam(league: League): Starters {
  return Object.fromEntries(
    TEAM_ABBRS.map(abbr => [abbr, startersOf(league.teams[abbr].depth.order)])
  ) as Starters;
}

/** The starting spots that changed since `before`, with reasons. */
export function depthChanges(league: League, before: Starters): DepthChange[] {
  const after = startersByTeam(league);
  const changes: DepthChange[] = [];
  for (const abbr of TEAM_ABBRS) {
    const was = before[abbr];
    const now = after[abbr];
    const slots = new Set([...Object.keys(was), ...Object.keys(now)] as Slot[]);
    for (const slot of [...slots].sort()) {
      const old = was[slot] ?? null;
      const next = now[slot] ?? null;
      if (old === next) continue;
      changes.push({
        team: abbr,
        slot,
        playerId: next,
        replaced: old,
        reason: reasonFor(league, abbr, old, next)
      });
    }
  }
  return changes;
}

function reasonFor(league: League, abbr: TeamAbbr, old: string | null, next: string | null): DepthReason {
  const gone = old ? league.players[old] : undefined;
  if (old && (!gone || gone.team !== abbr || gone.status !== 'active')) return 'roster';
  if (gone && cannotPlay(designation(gone.injury))) return 'injury';
  if (old && league.teams[abbr].resting.includes(old)) return 'rest';
  // A player still carrying an injury's lingering effects came back from it recently.
  const returning = next ? league.players[next]?.injury : null;
  if (returning && returning.weeksOut === 0) return 'return';
  return 'coach';
}
