/**
 * The fictional league (spec 3.2, 10.2 item 4; build order "Starting without the Madden CSV"): the 32
 * real franchises with generated players, coaches, staff, and owners. Every team gets 53 active and 16
 * practice squad players, about 300 free agents wait unsigned, and contracts fit each team under the cap.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { stream, type Rng } from '../rng';
import type { Position } from '../model/positions';
import type { Player } from '../model/player';
import type { Owner, StaffMember } from '../model/staff';
import { pickJersey } from '../model/jerseys';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import type { Contract } from '../contracts/types';
import { capHit } from '../contracts/cap';
import { marketCeiling, marketValue } from '../contracts/market';
import {
  minimumContract,
  practiceSquadContract,
  rookieContract,
  tierFor,
  typicalBonusShare,
  udfaContract,
  veteranContract,
  type VeteranTerms
} from '../contracts/build';
import { TUNING } from '../tuning';
import { pickAbilities, pickCoachAbilities } from '../abilities/assign';
import { generatePlayer, type GenContext, type NameData } from './player';
import { generateOwner, generateTeamStaff } from './staff';

const L = TUNING.league;
const C = TUNING.contracts;

export interface FictionalLeague {
  season: number;
  players: Player[];
  contracts: Contract[];
  staff: StaffMember[];
  owners: Owner[];
}

export interface LeagueInput {
  seed: number;
  season: number;
  names: NameData;
  rules: RuleSet;
  /** Called after each team, for progress bars. */
  onTeam?: (done: number, total: number) => void;
}

/** The standard 53-man roster by position (a 4-3 base with three safeties and a long snapper). */
export const ACTIVE_ROSTER: readonly (readonly [Position, number])[] = [
  ['QB', 2], ['HB', 3], ['FB', 1], ['WR', 6], ['TE', 3], ['LT', 2], ['LG', 2], ['C', 1], ['RG', 2], ['RT', 2],
  ['LE', 2], ['RE', 2], ['DT', 4], ['LOLB', 2], ['MLB', 3], ['ROLB', 2], ['CB', 6], ['FS', 2], ['SS', 3],
  ['K', 1], ['P', 1], ['LS', 1]
]; // prettier-ignore

/** Starters by position; the rest of each position group is depth. */
export const STARTERS: Readonly<Record<Position, number>> = {
  QB: 1, HB: 1, FB: 1, WR: 3, TE: 1, LT: 1, LG: 1, C: 1, RG: 1, RT: 1,
  LE: 1, RE: 1, DT: 2, LOLB: 1, MLB: 1, ROLB: 1, CB: 3, FS: 1, SS: 1, K: 1, P: 1, LS: 1
}; // prettier-ignore

export const PRACTICE_SQUAD: readonly Position[] = [
  'QB', 'HB', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'LE', 'DT', 'RE', 'MLB', 'ROLB', 'CB', 'CB', 'SS'
]; // prettier-ignore

/** Positions that gain the next roster spot when a rule set allows more than 53, in order. */
const GROW_ORDER: readonly Position[] = [
  'WR',
  'CB',
  'DT',
  'LOLB',
  'LG',
  'TE',
  'SS',
  'RE',
  'HB',
  'RT',
  'MLB',
  'LE'
];

/**
 * Position counts for one team: the standard template resized to the rule set's active roster limit,
 * with the small variations real rosters show.
 */
export function rosterPlan(rng: Rng, size: number): Map<Position, number> {
  const plan = new Map<Position, number>(ACTIVE_ROSTER.map(([p, n]) => [p, n]));
  const total = () => [...plan.values()].reduce((a, b) => a + b, 0);
  for (let i = 0; total() < size; i++) {
    const position = GROW_ORDER[i % GROW_ORDER.length] as Position;
    plan.set(position, (plan.get(position) ?? 0) + 1);
  }
  for (let i = 0; total() > size; i++) {
    // Shrink from the deepest spots first; every position keeps at least its starters.
    const position = GROW_ORDER[GROW_ORDER.length - 1 - (i % GROW_ORDER.length)] as Position;
    if ((plan.get(position) ?? 0) > STARTERS[position]) plan.set(position, (plan.get(position) ?? 0) - 1);
    if (i > GROW_ORDER.length * 10) break;
  }
  const move = (from: Position, to: Position) => {
    if ((plan.get(from) ?? 0) > 1 || (from === 'FB' && plan.get('FB') === 1)) {
      plan.set(from, (plan.get(from) ?? 0) - 1);
      plan.set(to, (plan.get(to) ?? 0) + 1);
    }
  };
  if (rng.chance(L.noFullbackShare)) move('FB', rng.pick(['TE', 'WR', 'HB'] as Position[]));
  if (rng.chance(L.thirdQbShare)) move(rng.pick(['HB', 'SS', 'MLB'] as Position[]), 'QB');
  if (rng.chance(L.extraSwapShare)) {
    move(rng.pick(['DT', 'CB', 'WR'] as Position[]), rng.pick(['LE', 'RE', 'C', 'LOLB'] as Position[]));
  }
  return plan;
}

/** Practice squad positions, resized to the rule set's practice squad limit. */
export function practiceSquadPlan(size: number): Position[] {
  return Array.from({ length: size }, (_, i) => PRACTICE_SQUAD[i % PRACTICE_SQUAD.length] as Position);
}

/** A typical starter's latent quality at a position, stars included. */
export function typicalStarter(position: Position): number {
  if (position === 'K' || position === 'P' || position === 'LS') return L.specialistQuality;
  const star = L.starShare * ((L.starBonus[0] + L.starBonus[1]) / 2);
  return L.starterQuality + star + (position === 'QB' ? L.qbStarterBonus : 0);
}

/**
 * Cap parity (D-19): how far to move a whole roster so it lands closer to a typical one. Strength is the
 * starters' average quality above typical, the quarterback weighted most; within balanceFrom of typical a
 * roster stays as drawn, and beyond it only balanceKeep of the excess remains.
 */
export function balanceShift(
  slots: readonly { position: Position; depth: number; starters: number; quality: number }[]
): number {
  let sum = 0;
  let weight = 0;
  for (const s of slots) {
    if (s.depth >= s.starters || s.position === 'K' || s.position === 'P' || s.position === 'LS') continue;
    const w = s.position === 'QB' ? L.balanceQbWeight : 1;
    sum += w * (s.quality - typicalStarter(s.position));
    weight += w;
  }
  const strength = weight ? sum / weight : 0;
  const excess = Math.abs(strength) - L.balanceFrom;
  if (excess <= 0) return 0;
  return Math.sign(strength) * (L.balanceFrom + excess * L.balanceKeep) - strength;
}

function slotQuality(
  rng: Rng,
  depth: number,
  starters: number,
  position: Position,
  teamOffset: number
): number {
  const special = position === 'K' || position === 'P' || position === 'LS';
  if (depth < starters) {
    // A few starters are stars, which gives the league a realistic top tail.
    const star = !special && rng.chance(L.starShare) ? rng.range(L.starBonus[0], L.starBonus[1]) : 0;
    const qb = position === 'QB' ? L.qbStarterBonus : 0;
    return (
      rng.normal(special ? L.specialistQuality : L.starterQuality, L.starterSpread) + star + qb + teamOffset
    );
  }
  const behind = depth - starters;
  const [mean, sd] = L.depthQuality[Math.min(behind, L.depthQuality.length - 1)] as readonly [number, number];
  return rng.normal(mean, sd) + teamOffset;
}

function slotAge(rng: Rng, position: Position, depth: number, starters: number): number {
  const veteranPosition = position === 'QB' || position === 'K' || position === 'P' || position === 'LS';
  const [mean, sd] =
    depth < starters
      ? veteranPosition
        ? L.age.starterVeteran
        : L.age.starter
      : depth === starters
        ? L.age.backup
        : L.age.depth;
  return Math.max(
    TUNING.generation.ageRange[0],
    Math.min(veteranPosition ? L.maxAgeLongCareer : L.maxAge, Math.round(rng.normal(mean, sd)))
  );
}

interface Counter {
  next(prefix: string): string;
}

function contractFor(
  rules: RuleSet,
  rng: Rng,
  player: Player,
  team: TeamAbbr,
  season: number,
  ids: Counter
): { contract: Contract; terms: VeteranTerms | null } {
  const base = { id: ids.next('c'), playerId: player.id, team };
  const age = season - Number(player.birthDate.slice(0, 4));
  if (player.status === 'practice') {
    return { contract: practiceSquadContract(rules, base, season, player.accrued, rng), terms: null };
  }
  if ('round' in player.draft && player.experience <= 3) {
    return { contract: rookieContract(rules, base, player.draft.year, player.draft.pick), terms: null };
  }
  if (!('round' in player.draft) && player.experience <= 2) {
    return {
      contract: udfaContract(
        rules,
        base,
        season - player.experience,
        rng.int(C.udfaBonus[0] / 1000, C.udfaBonus[1] / 1000) * 1000
      ),
      terms: null
    };
  }
  const apy = Math.min(
    marketCeiling(rules, player.position),
    Math.round(
      marketValue(rules, player.position, player.ovr, age, player.experience) *
        Math.exp(rng.normal(0, TUNING.market.noise))
    )
  );
  if (apy <= minimumSalary(rules, player.experience) * C.minimumDealBand) {
    return { contract: minimumContract(rules, base, season, player.experience), terms: null };
  }
  const [shortest, longest] = tierFor(C.length, apy).years;
  const length = rng.int(shortest, longest);
  const elapsed = rng.int(0, length - 1);
  const terms: VeteranTerms = {
    apy,
    length,
    elapsed,
    creditedAtSigning: Math.max(0, player.experience - elapsed),
    bonusShare: typicalBonusShare(rng, apy)
  };
  return { contract: veteranContract(rules, base, season, terms), terms };
}

/** Scales veteran deals so the team's cap total lands at `target` (spec 10.2: contracts fit under the cap). */
function fitUnderCap(
  rules: RuleSet,
  season: number,
  deals: { contract: Contract; terms: VeteranTerms | null }[],
  target: number,
  positions: ReadonlyMap<string, Position>
): Contract[] {
  let contracts = deals.map(d => d.contract);
  for (let pass = 0; pass < 6; pass++) {
    const total = contracts.reduce((sum, c) => sum + capHit(c, season, rules), 0);
    const variable = deals.reduce(
      (sum, d, i) => (d.terms ? sum + capHit(contracts[i] as Contract, season, rules) : sum),
      0
    );
    if (variable === 0 || Math.abs(total - target) < 250_000) break;
    const factor = Math.max(L.capScaleMin, Math.min(L.capScaleMax, (target - (total - variable)) / variable));
    contracts = deals.map((d, i) => {
      const current = contracts[i] as Contract;
      if (!d.terms) return current;
      const ceiling = marketCeiling(rules, positions.get(current.playerId) ?? 'QB');
      d.terms = {
        ...d.terms,
        apy: Math.min(
          ceiling,
          Math.max(
            minimumSalary(rules, d.terms.creditedAtSigning) + 5000,
            Math.round((d.terms.apy * factor) / 5000) * 5000
          )
        )
      };
      return veteranContract(
        rules,
        { id: current.id, playerId: current.playerId, team: current.team },
        season,
        d.terms
      );
    });
  }
  return contracts;
}

/**
 * Team strength offsets (C-20, D-40): the league's contenders, middle teams, and rebuilding teams, in an
 * order drawn from `rng`, with as many contenders and rebuilding teams as `tierSizes` draws for this league
 * and the middle tier taking the rest. Each tier centers on its offset (`tierGap` above average, average,
 * `tierGap` below) with its teams evenly spaced across `tierWidth`, so no league's best or worst team runs
 * far past another's.
 */
export function strengthTiers(rng: Rng): Map<TeamAbbr, number> {
  const order = [...TEAM_ABBRS]
    .map(abbr => ({ abbr, key: rng.float() }))
    .sort((a, b) => a.key - b.key)
    .map(t => t.abbr);
  const [contenders, rebuilding] = L.tierSizes.map(([low, high]) => rng.int(low, high)) as [number, number];
  const tiers = [contenders, TEAM_ABBRS.length - contenders - rebuilding, rebuilding];
  const offsets: number[] = [];
  tiers.forEach((count, tier) => {
    const center = L.tierGap * ((tiers.length - 1) / 2 - tier);
    for (let i = 0; i < count; i++) offsets.push(center + L.tierWidth * (0.5 - (i + 0.5) / count));
  });
  return new Map(order.map((abbr, i) => [abbr, offsets[i] ?? 0] as const));
}

export function generateFictionalLeague(input: LeagueInput): FictionalLeague {
  const { seed, season, names, rules } = input;
  const counts = new Map<string, number>();
  const ids: Counter = {
    next(prefix) {
      const n = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, n);
      return `${prefix}${n}`;
    }
  };
  const usedNames = new Set<string>();
  const context = (rng: Rng, prefix: string): GenContext => ({
    rng,
    names,
    season,
    usedNames,
    newId: () => ids.next(prefix)
  });

  const players: Player[] = [];
  const contracts: Contract[] = [];
  const staff: StaffMember[] = [];
  const owners: Owner[] = [];
  const tiers = strengthTiers(stream(seed, 'fictional', 'tiers'));

  for (const team of TEAM_ABBRS) {
    const rng = stream(seed, 'fictional', 'team', team);
    const ctx = context(rng, 'p');
    // Team strength: its tier and place in it, and a roster balanced toward the norm. The draw that set a
    // uniform offset before C-20 stays, so the rest of the team's stream is unchanged.
    rng.float();
    const teamOffset = tiers.get(team) ?? 0;
    const plan = rosterPlan(rng, rules.roster.active);
    const slots: { position: Position; depth: number; starters: number; quality: number }[] = [];
    for (const [position, count] of plan) {
      const starters = Math.min(count, STARTERS[position]);
      for (let depth = 0; depth < count; depth++)
        slots.push({ position, depth, starters, quality: slotQuality(rng, depth, starters, position, 0) });
    }
    const shift = teamOffset + balanceShift(slots);
    const roster: Player[] = slots.map(s =>
      generatePlayer(ctx, {
        position: s.position,
        quality: s.quality + shift,
        age: slotAge(rng, s.position, s.depth, s.starters),
        team,
        status: 'active'
      })
    );
    // Practice squad (spec 12.1): the rule set's size, with no more veterans than the rules allow.
    const { practiceSquad, practiceSquadVeterans, practiceSquadVeteranSeasons } = rules.roster;
    const youngEnough = TUNING.generation.entryAge + practiceSquadVeteranSeasons;
    let veterans = 0;
    for (const position of practiceSquadPlan(practiceSquad)) {
      const [mean, sd] = L.practiceSquadQuality;
      let age = Math.max(
        TUNING.generation.ageRange[0],
        Math.round(rng.normal(L.age.practiceSquad[0], L.age.practiceSquad[1]))
      );
      if (veterans >= practiceSquadVeterans) age = Math.min(age, youngEnough);
      const player = generatePlayer(ctx, {
        position,
        quality: rng.normal(mean, sd) + teamOffset * L.practiceSquadTeamShare,
        age,
        team,
        status: 'practice'
      });
      if (player.accrued > practiceSquadVeteranSeasons) veterans++;
      roster.push(player);
    }
    const taken = new Set<number>();
    for (const player of roster) {
      player.jersey = pickJersey(player.position, taken, total => rng.float() * total) ?? 0;
      taken.add(player.jersey);
    }
    const contractRng = stream(seed, 'fictional', 'contracts', team);
    const deals = roster.map(p => contractFor(rules, contractRng, p, team, season, ids));
    const target = rules.cap.amount * contractRng.range(L.capUseMin, L.capUseMax);
    const fitted = fitUnderCap(rules, season, deals, target, new Map(roster.map(p => [p.id, p.position])));
    fitted.forEach((c, i) => ((roster[i] as Player).contractId = c.id));
    players.push(...roster);
    contracts.push(...fitted);

    const staffCtx = context(stream(seed, 'fictional', 'staff', team), 's');
    staff.push(...generateTeamStaff(staffCtx, team));
    owners.push(generateOwner({ ...staffCtx, newId: () => ids.next('o') }, team));
    input.onTeam?.(TEAM_ABBRS.indexOf(team) + 1, TEAM_ABBRS.length);
  }

  const faRng = stream(seed, 'fictional', 'freeAgents');
  const faCtx = context(faRng, 'p');
  const positions = ACTIVE_ROSTER.map(([p]) => p);
  const weights = ACTIVE_ROSTER.map(([, n]) => n);
  for (let i = 0; i < L.freeAgents; i++) {
    const position = faRng.weighted(positions, weights);
    const young = faRng.chance(L.youngFreeAgentShare);
    const [ageMean, ageSd] = young ? L.age.youngFreeAgent : L.age.veteranFreeAgent;
    const [mean, sd] = L.freeAgentQuality;
    players.push(
      generatePlayer(faCtx, {
        position,
        quality: faRng.normal(mean, sd),
        age: Math.max(21, Math.min(38, Math.round(faRng.normal(ageMean, ageSd)))),
        team: null,
        status: 'freeAgent'
      })
    );
  }

  // Abilities for players (spec 7.4) and coaches (spec 13.1), each from its own stream so the catalogs can
  // change without changing the rest of the league.
  const abilityRng = stream(seed, 'fictional', 'abilities');
  for (const player of players) player.abilities = pickAbilities(abilityRng, player);
  const coachRng = stream(seed, 'fictional', 'coachAbilities');
  for (const member of staff) member.abilities = pickCoachAbilities(coachRng, member);

  return { season, players, contracts, staff, owners };
}
