/**
 * Contract history (D-35): a compact record of each deal, saved in the player's history before the deal
 * itself leaves the league (D-31), for career timelines and comparisons across eras.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import type { ContractEndReason, Contract, ContractType } from './types';
import { contractSummary } from './view';

export interface ContractRecord {
  id: string;
  playerId: string;
  team: TeamAbbr;
  type: ContractType;
  /** The league year it was signed in. */
  signed: number;
  /** Its first and last real league years (void years aside), and how many real years it had. */
  from: number;
  to: number;
  years: number;
  /** Money over its real years, the average a year, and what was guaranteed at signing. */
  total: number;
  apy: number;
  guaranteed: number;
  /**
   * The average a year as a share of the cap in the league year it was signed; a deal from before the
   * league's first league year is priced against that year's cap, as the generator priced it.
   */
  capShare: number;
  /** How it ended: it ran its course, or ended early, and the league year it ended in. */
  ended: ContractEndReason | 'expired';
  endedYear: number;
}

/** A deal's record, as the league stands. */
export function contractRecord(league: League, c: Contract): ContractRecord {
  const real = c.years.filter(y => !y.isVoid).map(y => y.year);
  const signed = leagueYear(c.signed);
  const first = Math.min(...Object.keys(league.caps).map(Number));
  const cap = league.caps[Math.max(signed, first)] ?? league.rules.cap.amount;
  const summary = contractSummary(c, c.signed);
  const from = real.length ? Math.min(...real) : signed;
  const to = real.length ? Math.max(...real) : signed;
  return {
    id: c.id,
    playerId: c.playerId,
    team: c.team,
    type: c.type,
    signed,
    from,
    to,
    years: summary.years,
    total: summary.total,
    apy: summary.apy,
    guaranteed: summary.guaranteed,
    capShare: cap ? Math.round((summary.apy / cap) * 10_000) / 10_000 : 0,
    ended: c.ended ? c.ended.how : 'expired',
    endedYear: c.ended ? leagueYear(c.ended.date) : to
  };
}
