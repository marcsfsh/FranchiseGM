/**
 * Each team's contracts, indexed for the cap sheets, which read them constantly (spec 6.5, 11.1). The index
 * lives beside the league's contracts, never in the save: a league loaded or cloned builds its own on first
 * use. Every change to the contracts after that goes through putContract or dropContract, which keep it
 * current. Contracts keep the order they were added in, as the object holding them does.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Contract } from '../contracts/types';
import type { League } from './types';

type Index = Map<TeamAbbr, Set<string>>;

const INDEXES = new WeakMap<Record<string, Contract>, Index>();

function indexOf(contracts: Record<string, Contract>): Index {
  let index = INDEXES.get(contracts);
  if (!index) {
    index = new Map();
    for (const c of Object.values(contracts)) {
      const ids = index.get(c.team) ?? new Set<string>();
      ids.add(c.id);
      index.set(c.team, ids);
    }
    INDEXES.set(contracts, index);
  }
  return index;
}

/** Adds a contract to the league, or replaces the one with its ID. */
export function putContract(league: League, contract: Contract): void {
  const before = league.contracts[contract.id];
  league.contracts[contract.id] = contract;
  const index = INDEXES.get(league.contracts);
  if (!index) return;
  if (before && before.team !== contract.team) index.get(before.team)?.delete(contract.id);
  const ids = index.get(contract.team) ?? new Set<string>();
  ids.add(contract.id);
  index.set(contract.team, ids);
}

/** Removes a contract from the league. */
export function dropContract(league: League, id: string): void {
  const contract = league.contracts[id];
  delete league.contracts[id];
  if (contract) INDEXES.get(league.contracts)?.get(contract.team)?.delete(id);
}

/** Every contract a team signed or took on, running or ended, in the order they were added. */
export function contractsOf(league: League, abbr: TeamAbbr): Contract[] {
  const out: Contract[] = [];
  for (const id of indexOf(league.contracts).get(abbr) ?? []) {
    const c = league.contracts[id];
    if (c?.team === abbr) out.push(c);
  }
  return out;
}
