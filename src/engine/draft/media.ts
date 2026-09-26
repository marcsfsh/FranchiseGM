/**
 * The media around a draft class (spec 10.4; D-45): its big board, the consensus view moved by the hype
 * prospects make in the headlines, and mock drafts of the first round, weekly from midseason through the
 * draft. Hype moves the media's board only: AI teams' grades follow the headlines once M18's news-effects
 * setting exists.
 */
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { perceivedValue, type DraftClass, type Prospect } from './class';
import { draftWorth, needs } from './needs';
import { picksIn } from './picks';
import { teamGrades } from './scouting';

const M = TUNING.draft.media;

/** A prospect's standing on the media's board: the consensus view and his hype. */
export const mediaValue = (p: Prospect): number => perceivedValue(p) + p.hype;

/** The media's big board, best first. */
export function mediaBoard(draft: DraftClass, size = draft.prospects.length): Prospect[] {
  return [...draft.prospects]
    .sort((a, b) => mediaValue(b) - mediaValue(a) || (a.player.id < b.player.id ? -1 : 1))
    .slice(0, size);
}

export interface MockPick {
  number: number;
  team: TeamAbbr;
  prospectId: string;
}

/** A published mock draft of the first round. */
export interface MockDraft {
  /** The step it came out: a timeline week (the regular season, the playoffs, then the offseason). */
  week: number;
  picks: MockPick[];
}

/**
 * The AI's projected first round: each team in `order` takes the prospect worth most to it, by its own
 * grades and needs (D-45).
 */
export function mockDraft(league: League, draft: DraftClass, order: readonly TeamAbbr[]): MockPick[] {
  const taken = new Set<string>();
  const picks: MockPick[] = [];
  order.forEach((team, i) => {
    const grades = teamGrades(league, draft, team);
    const needAt = needs(league, team);
    let best: Prospect | null = null;
    let bestWorth = -Infinity;
    for (const p of draft.prospects) {
      if (taken.has(p.player.id)) continue;
      const worth = draftWorth(grades.get(p.player.id)?.value ?? 0, needAt.get(p.player.position) ?? 0);
      if (worth > bestWorth) [best, bestWorth] = [p, worth];
    }
    if (!best) return;
    taken.add(best.player.id);
    picks.push({ number: i + 1, team, prospectId: best.player.id });
  });
  return picks;
}

/**
 * The first round's order as it stands: the numbered picks' holders once the draft is numbered, and before
 * that the finish so far (`finish`, worst first), each team's pick with whoever holds it.
 */
export function firstRoundOrder(league: League, year: number, finish: readonly TeamAbbr[]): TeamAbbr[] {
  const firsts = picksIn(league, year).filter(p => p.round === 1 && !p.compensatory);
  if (firsts.length && firsts.every(p => p.number !== null)) return firsts.map(p => p.owner);
  const holder = new Map(firsts.map(p => [p.original, p.owner]));
  return finish.map(t => holder.get(t) ?? t);
}

export interface DraftHeadline {
  headline: string;
  teams: TeamAbbr[];
  score: number;
}

/**
 * A week of draft news: from `hypeFrom`, a prospect or two near the top of the media's board makes a
 * headline and moves on it (spec 10.4); from `mocksFrom`, a new mock draft, with a headline when its first
 * pick changes. `week` is the step's timeline week, `seasonWeek` the regular season's week, or null after it.
 */
export function draftMediaWeek(
  league: League,
  week: number,
  seasonWeek: number | null,
  finish: readonly TeamAbbr[],
  rng: Rng
): DraftHeadline[] {
  const draft = league.draft;
  if (!draft) return [];
  const out: DraftHeadline[] = [];
  if (seasonWeek === null || seasonWeek >= M.hypeFrom) {
    const board = mediaBoard(draft, M.hypeAmong);
    for (let i = 0; i < M.hypePerWeek && board.length; i++) {
      const p = rng.pick(board);
      const by = Math.round(rng.range(M.hypeBy[0], M.hypeBy[1]) * 10) / 10;
      const name = `${p.player.position} ${p.player.firstName} ${p.player.lastName} (${p.player.college})`;
      if (rng.chance(M.fallShare)) {
        p.hype = Math.round((p.hype - by) * 10) / 10 || 0;
        out.push({ headline: p.player.personality.volatility >= M.volatile ? `Draft stock: ${name} faces questions after an off-field incident` : `Draft stock: ${name} slides down big boards`, teams: [], score: 20 }); // prettier-ignore
      } else {
        p.hype = Math.round((p.hype + by) * 10) / 10 || 0;
        out.push({ headline: `Draft stock: ${name} climbs big boards`, teams: [], score: 20 });
      }
    }
  }
  if (seasonWeek === null || seasonWeek >= M.mocksFrom) {
    const picks = mockDraft(league, draft, firstRoundOrder(league, draft.year, finish));
    const first = picks[0];
    const before = draft.mock?.picks[0];
    draft.mock = { week, picks };
    const top = first ? draft.prospects.find(p => p.player.id === first.prospectId) : undefined;
    if (first && top && first.prospectId !== before?.prospectId)
      out.push({ headline: `Mock draft: the ${TEAM_COLORS[first.team].name} take ${top.player.position} ${top.player.firstName} ${top.player.lastName} first overall`, teams: [first.team], score: 30 }); // prettier-ignore
  }
  return out;
}
