/**
 * Draft classes (spec 10.3; D-41). Each class is made as the season before its draft starts, so it can be
 * scouted all year: its size and position mix from the settings, a strength draw for the class and one for
 * each position group ("a deep quarterback class"), and for every prospect his true ratings and ceiling,
 * hidden from teams, and the consensus misjudgment of his value that makes busts and gems. A prospect can
 * be made any number of years before his class (post-M23 section 1.1's college pipeline).
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { fullName, type Player } from '../model/player';
import { POSITION_GROUP, type Position, type PositionGroup } from '../model/positions';
import { POSITION_GROUPS } from '../progression/settings';
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import { ACTIVE_ROSTER } from '../generate/league';
import { generatePlayer, type GenContext } from '../generate/player';
import type { MockDraft } from './media';
import type { DraftSettings } from './settings';

const D = TUNING.draft;

export interface Prospect {
  /** The player he'll be once he's drafted or signs: his true ratings and ceiling, hidden from teams. */
  player: Player;
  /**
   * The consensus misjudgment of his draft value, in points: above 0 he's overrated (a bust in the
   * making), below 0 underrated (a gem). Scouting grades start from it.
   */
  perception: number;
  /** His college's scouting region; null for the International Player Pathway. */
  region: string | null;
  /** Each team's own error on his grade, in hundredths of a standard deviation, in TEAM_ABBRS order. */
  noise: number[];
  /** Where he worked out, and his results (D-44); null until then. */
  workout: 'combine' | 'proDay' | null;
  measurables: Measurables | null;
  /** Points the headlines have moved him on the media's board (D-45). */
  hype: number;
}

/** Workout results (spec 10.4): seconds for the runs, reps at 225 pounds, and inches for the jumps. */
export interface Measurables {
  forty: number;
  bench: number;
  vertical: number;
  broad: number;
  cone: number;
  shuttle: number;
}

/** What one team's scouting department has done on a class (spec 10.4; D-43). */
export interface TeamScouting {
  /** Scouting points spent on each prospect, by player ID. */
  points: Record<string, number>;
  /** Points on hand, by region; the director of scouting's and national scouts' go anywhere, under "National". */
  bank: Record<string, number>;
  /** Prospects the team brought in for a top-30 visit, whose personality it knows. */
  visits: string[];
}

export interface DraftClass {
  /** The league year of its draft. */
  year: number;
  /** Its strength draws in quality units: the class's, and each position group's on top. */
  strength: { overall: number; groups: Record<PositionGroup, number> };
  prospects: Prospect[];
  scouting: Record<TeamAbbr, TeamScouting>;
  /** The latest mock draft of the first round (D-45); null before the first. */
  mock: MockDraft | null;
  /**
   * The media's final big board, by player ID, best first: set as the draft opens (D-48), when the class
   * moves into the draft room, for the media's grades once it's over. Null before.
   */
  board: string[] | null;
}

const emptyScouting = (): TeamScouting => ({ points: {}, bank: {}, visits: [] });

/** A position's worth in the draft, in points: what the position is paid, on a log scale (D-47). */
export const positionValue = (position: Position): number =>
  D.positionWeight * Math.log(TUNING.market.topShare[position] / D.positionReference);

/** A prospect's draft value: his ceiling and his overall now, blended, and his position's worth. */
export const draftValue = (p: Pick<Player, 'potential' | 'ovr' | 'position'>): number =>
  D.valuePotential * p.potential + (1 - D.valuePotential) * p.ovr + positionValue(p.position);

/** What the consensus sees: his draft value misjudged. */
export const perceivedValue = (p: Prospect): number => draftValue(p.player) + p.perception;

/**
 * The positions a class draws from, with each one's share under the settings: by default a standard
 * roster's, since a class holds the undrafted rookies who fill out rosters as well as the draft picks.
 */
function positionWeights(settings: DraftSettings): [Position[], number[]] {
  const positions = ACTIVE_ROSTER.map(([p]) => p);
  return [positions, ACTIVE_ROSTER.map(([p, n]) => n * Math.max(0, settings.positionMix[p] ?? 1))];
}

/**
 * A prospect for the class of `classYear`, whatever the season now: `ctx.season` is taken as his class
 * year, so his age is his age as that class's rookies start their first season.
 */
export function generateProspect(
  ctx: GenContext,
  req: { position: Position; quality: number; age: number; classYear: number }
): Player {
  const player = generatePlayer(
    { ...ctx, season: req.classYear },
    { position: req.position, quality: req.quality, age: req.age, team: null, status: 'freeAgent' }
  );
  return Object.assign(player, {
    experience: 0,
    accrued: 0,
    draft: { year: req.classYear, undrafted: true as const },
    jersey: 0
  });
}

/** The consensus misjudgment of one prospect: a small error, and sometimes a bust's or a gem's. */
function perception(rng: Rng, settings: DraftSettings, group: PositionGroup): number {
  let error = rng.normal(0, D.perceptionSd);
  const shift = () => rng.range(D.misjudgedBy[0], D.misjudgedBy[1]);
  if (rng.chance(Math.min(1, D.bustRate * settings.bust[group]))) error += shift();
  else if (rng.chance(Math.min(1, D.gemRate * settings.gem[group]))) error -= shift();
  // Tenths, and never -0, which a save's JSON can't keep.
  return Math.round(error * 10) / 10 || 0;
}

/**
 * Names in use: every player in the league who is active or retired within 20 years, so no generated
 * full name repeats in that window (spec 10.1).
 */
export function namesInUse(league: League, year: number): Set<string> {
  const names = new Set<string>();
  for (const p of Object.values(league.players))
    if (p.status !== 'retired' || (p.retiredIn ?? year) >= year - D.nameWindow) names.add(fullName(p));
  for (const p of league.draft?.prospects ?? []) names.add(fullName(p.player));
  return names;
}

/** The class for the draft of league year `year`, with prospect IDs from `newId`. */
export function generateClass(
  league: League,
  year: number,
  ctx: Omit<GenContext, 'season' | 'usedNames'>,
  rng: Rng
): DraftClass {
  const s = league.settings.draft;
  const overall = rng.normal(s.strengthMean * D.strengthMax, D.strengthSd * s.strengthSpread);
  const groups = Object.fromEntries(
    POSITION_GROUPS.map(g => [g, rng.normal(s.groupMean[g] * D.strengthMax, D.groupStrengthSd * s.groupSpread[g])])
  ) as Record<PositionGroup, number>; // prettier-ignore
  const [positions, weights] = positionWeights(s);
  const usedNames = namesInUse(league, year);
  const { names, regions: collegeRegions } = ctx.names.colleges;
  const regions = new Map(names.map((name, i) => [name, collegeRegions[i] ?? null]));
  const prospects: Prospect[] = [];
  const [mean, spread] = D.classQuality;
  for (let i = 0; i < s.classSize; i++) {
    const position = rng.weighted(positions, weights) as Position;
    const group = POSITION_GROUP[position];
    const quality = rng.normal(mean + D.classQualityByGroup[group] + overall + groups[group], spread);
    const player = generateProspect(
      { ...ctx, rng, season: year, usedNames },
      { position, quality, age: rng.int(D.classAge[0], D.classAge[1]), classYear: year }
    );
    const noise = TEAM_ABBRS.map(() => Math.round(rng.normal() * 100) || 0);
    prospects.push({ player, perception: perception(rng, s, group), region: regions.get(player.college) ?? null, noise, workout: null, measurables: null, hype: 0 }); // prettier-ignore
  }
  const scouting = Object.fromEntries(TEAM_ABBRS.map(t => [t, emptyScouting()] as const)) as Record<TeamAbbr, TeamScouting>; // prettier-ignore
  return { year, strength: { overall, groups }, prospects, scouting, mock: null, board: null };
}
