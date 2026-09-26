/**
 * Draft picks (spec 10.4; D-42): every team's picks for the next three drafts, as records that trades move
 * (M15) and that compensatory picks join (M12, spec 11.8). A draft is numbered when the season before it
 * ends, in the order of that season's finish, each compensatory pick after its round's regular picks.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';

export interface DraftPickRecord {
  /** "2027-3-MIN", or "2027-3-MIN-c1" for a compensatory pick. */
  id: string;
  /** The league year of its draft. */
  year: number;
  round: number;
  /** The team it was issued to, and the team that holds it now. */
  original: TeamAbbr;
  owner: TeamAbbr;
  /** Awarded for free agents lost (spec 11.8), taken after the round's regular picks. */
  compensatory: boolean;
  /** Its place in the draft, from 1, once the draft is numbered. */
  number: number | null;
  /** The player taken with it. */
  playerId: string | null;
}

/** Drafts ahead that teams hold picks in: this one and the next two. */
export const PICK_YEARS = 3;

/** Every team's regular picks, `rounds` of them, in the draft of league year `year`. */
export function issuePicks(rounds: number, year: number): DraftPickRecord[] {
  const picks: DraftPickRecord[] = [];
  for (let round = 1; round <= rounds; round++)
    for (const team of TEAM_ABBRS)
      picks.push({ id: `${year}-${round}-${team}`, year, round, original: team, owner: team, compensatory: false, number: null, playerId: null }); // prettier-ignore
  return picks;
}

/** A draft's picks in order: numbered ones by number, the rest by round. */
export function picksIn(league: League, year: number): DraftPickRecord[] {
  return league.picks
    .filter(p => p.year === year)
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.round - b.round || (a.id < b.id ? -1 : 1));
} // prettier-ignore

/**
 * Numbers the draft of league year `year` by `order` (first pick first): each round's regular picks in
 * that order, then its compensatory picks in the order they were awarded.
 */
export function numberDraft(league: League, year: number, order: readonly TeamAbbr[]): void {
  const slot = new Map(order.map((t, i) => [t, i]));
  const picks = league.picks.filter(p => p.year === year);
  let number = 1;
  for (let round = 1; round <= league.rules.season.draftRounds; round++) {
    const regular = picks.filter(p => p.round === round && !p.compensatory).sort((a, b) => (slot.get(a.original) ?? 0) - (slot.get(b.original) ?? 0)); // prettier-ignore
    const extra = picks.filter(p => p.round === round && p.compensatory);
    for (const p of [...regular, ...extra]) p.number = number++;
  }
}

/**
 * The order of the latest numbered draft, by original team: the waiver order from the season's end
 * through its early weeks (spec 12.1). Null until a draft has been numbered.
 */
export function latestDraftOrder(league: League): TeamAbbr[] | null {
  const numbered = league.picks.filter(p => p.number !== null && p.round === 1 && !p.compensatory);
  if (numbered.length < TEAM_ABBRS.length) return null;
  const year = Math.max(...numbered.map(p => p.year));
  return numbered
    .filter(p => p.year === year)
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    .map(p => p.original);
}

/**
 * When a season ends, its draft is numbered by the finish (`order`), and the picks of drafts already held
 * leave the league: their players carry their draft details.
 */
export function closeDraftYear(league: League, year: number, order: readonly TeamAbbr[]): void {
  league.picks = league.picks.filter(p => p.year >= year);
  numberDraft(league, year, order);
}

/** After a draft, teams get their picks in the draft `PICK_YEARS` - 1 years on. */
export function issueNextYear(league: League, drafted: number): void {
  const year = drafted + PICK_YEARS;
  if (!league.picks.some(p => p.year === year))
    league.picks.push(...issuePicks(league.rules.season.draftRounds, year));
}
