/**
 * The ability catalog (spec 7.4): the game's own abilities, in the style of Madden's superstar abilities.
 * Each has positions, a tier (1 to 3), trigger situations, and an effect. The effect boosts the named
 * ratings by the given points when the sim resolves a play in one of the triggers (M4). Fit value comes
 * from how often a scheme creates the triggers (value.ts). Starter catalog, recorded in DECISIONS.md.
 */
import type { Position } from '../model/positions';
import type { RatingKey } from '../model/ratings';
import type { ContextTrigger, PlayTrigger } from '../schemes/situations';

export interface Ability {
  id: string;
  name: string;
  positions: readonly Position[];
  tier: 1 | 2 | 3;
  /** Play situations; any one triggers the ability. */
  triggers: readonly PlayTrigger[];
  /** Game contexts that narrow the triggers: with contexts, a trigger counts only inside one of them. */
  contexts?: readonly ContextTrigger[];
  /** Rating boosts while the ability is active (spec 7.4 effect). */
  boosts: Partial<Record<RatingKey, number>>;
  description: string;
  /** Minimum ratings a generated player needs to be given the ability (spec 10.2). */
  requires: Partial<Record<RatingKey, number>>;
}

const EDGE: readonly Position[] = ['LE', 'RE', 'LOLB', 'ROLB'];
const LINE: readonly Position[] = ['LT', 'LG', 'C', 'RG', 'RT'];
const LINEBACKERS: readonly Position[] = ['LOLB', 'MLB', 'ROLB'];
const SAFETIES: readonly Position[] = ['FS', 'SS'];

export const ABILITIES = [
  {
    id: 'poisedPocket', name: 'Poised Pocket', positions: ['QB'], tier: 2,
    triggers: ['facingBlitz'], boosts: { tup: 10, awr: 4 },
    description: 'Keeps his accuracy and reads against the blitz.', requires: { tup: 80, awr: 80 }
  },
  {
    id: 'deepBallArtist', name: 'Deep Ball Artist', positions: ['QB'], tier: 2,
    triggers: ['deepPass'], boosts: { dac: 8, thp: 3 },
    description: 'Drops deep passes in stride.', requires: { dac: 82, thp: 85 }
  },
  {
    id: 'offScript', name: 'Off-Script', positions: ['QB'], tier: 2,
    triggers: ['outsidePocket'], boosts: { tor: 10, bsk: 5 },
    description: 'Makes throws on the move when the play breaks down.', requires: { tor: 80, spd: 72 }
  },
  {
    id: 'redZoneSurgeon', name: 'Red Zone Surgeon', positions: ['QB'], tier: 1,
    triggers: ['dropback'], contexts: ['redZone'], boosts: { sac: 6, mac: 6 },
    description: 'Fits throws into tight windows near the goal line.', requires: { sac: 82, awr: 78 }
  },
  {
    id: 'twoMinuteMaestro', name: 'Two-Minute Maestro', positions: ['QB'], tier: 3,
    triggers: ['dropback'], contexts: ['twoMinute', 'lateAndClose'], boosts: { awr: 8, sac: 5, mac: 5, dac: 5 },
    description: 'At his best with the game on the line.', requires: { awr: 88, mac: 84 }
  },
  {
    id: 'slippery', name: 'Slippery', positions: ['HB', 'WR'], tier: 2,
    triggers: ['openField'], boosts: { jkm: 10, spm: 10, agi: 4 },
    description: 'Makes the first defender miss in space.', requires: { agi: 85, jkm: 78 }
  },
  {
    id: 'batteringRam', name: 'Battering Ram', positions: ['HB', 'FB'], tier: 2,
    triggers: ['contactAtLine'], boosts: { trk: 10, btk: 8 },
    description: 'Falls forward through contact at the line.', requires: { trk: 82, str: 70 }
  },
  {
    id: 'chainMover', name: 'Chain Mover', positions: ['HB', 'TE', 'WR'], tier: 1,
    triggers: ['carry', 'target'], contexts: ['thirdDown'], boosts: { btk: 6, cit: 6 },
    description: 'Finds the extra yard on third down.', requires: { awr: 75, cth: 70 }
  },
  {
    id: 'routeTechnician', name: 'Route Technician', positions: ['WR', 'TE'], tier: 2,
    triggers: ['versusMan'], boosts: { srr: 8, mrr: 8, drr: 8, rls: 6 },
    description: 'Wins against man coverage with crisp breaks.', requires: { mrr: 84, srr: 80 }
  },
  {
    id: 'zoneFinder', name: 'Zone Finder', positions: ['WR', 'TE', 'HB'], tier: 1,
    triggers: ['versusZone'], boosts: { awr: 8, srr: 4 },
    description: 'Sits down in the soft spots of zone coverage.', requires: { awr: 80, srr: 78 }
  },
  {
    id: 'highPoint', name: 'High Point', positions: ['WR', 'TE'], tier: 2,
    triggers: ['contestedCatch', 'deepPass'], boosts: { spc: 10, cit: 8 },
    description: 'Wins jump balls at the highest point.', requires: { spc: 82, jmp: 80 }
  },
  {
    id: 'afterburner', name: 'Afterburner', positions: ['WR', 'HB', 'TE'], tier: 2,
    triggers: ['shortPass'], boosts: { bcv: 8, acc: 5, btk: 5 },
    description: 'Turns short catches into long gains.', requires: { acc: 88, bcv: 75 }
  },
  {
    id: 'anchor', name: 'Anchor', positions: LINE, tier: 2,
    triggers: ['passRush'], boosts: { pbp: 10, pbk: 6 },
    description: 'Stonewalls power rushers in pass protection.', requires: { pbk: 84, str: 85 }
  },
  {
    id: 'roadGrader', name: 'Road Grader', positions: [...LINE, 'TE', 'FB'], tier: 2,
    triggers: ['insideRun'], boosts: { rbp: 10, ibl: 8 },
    description: 'Drives defenders off the ball on inside runs.', requires: { rbp: 84, str: 85 }
  },
  {
    id: 'reachMaster', name: 'Reach Master', positions: LINE, tier: 1,
    triggers: ['outsideRun'], boosts: { rbf: 10, agi: 4 },
    description: 'Seals the edge on outside zone and toss plays.', requires: { rbf: 82, agi: 65 }
  },
  {
    id: 'edgeBurst', name: 'Edge Burst', positions: EDGE, tier: 2,
    triggers: ['passRush'], boosts: { fmv: 10, acc: 4 },
    description: 'Wins around the edge with his first step.', requires: { fmv: 84, acc: 80 }
  },
  {
    id: 'gapWrecker', name: 'Gap Wrecker', positions: ['DT', 'LE', 'RE'], tier: 2,
    triggers: ['contactAtLine'], boosts: { bsh: 10, pmv: 6 },
    description: 'Blows up runs in the backfield.', requires: { bsh: 84, str: 85 }
  },
  {
    id: 'closer', name: 'Closer', positions: [...EDGE, 'DT'], tier: 1,
    triggers: ['passRush'], contexts: ['thirdDown', 'lateAndClose'], boosts: { pmv: 8, fmv: 8 },
    description: 'Gets home when the offense has to throw.', requires: { pmv: 78, fmv: 78 }
  },
  {
    id: 'sidelineToSideline', name: 'Sideline to Sideline', positions: [...LINEBACKERS, ...SAFETIES], tier: 1,
    triggers: ['outsideRun', 'openField'], boosts: { pur: 10, tak: 4 },
    description: 'Runs down plays to the boundary.', requires: { pur: 85, spd: 80 }
  },
  {
    id: 'lockdown', name: 'Lockdown', positions: ['CB'], tier: 3,
    triggers: ['versusMan'], boosts: { mcv: 10, prs: 8 },
    description: 'Erases his man in press coverage.', requires: { mcv: 88, prs: 80 }
  },
  {
    id: 'ballHawk', name: 'Ball Hawk', positions: ['CB', 'FS', 'SS', 'MLB'], tier: 2,
    triggers: ['versusZone', 'deepPass'], boosts: { zcv: 8, cth: 10 },
    description: 'Jumps routes and turns breakups into interceptions.', requires: { zcv: 84, cth: 65 }
  },
  {
    id: 'enforcer', name: 'Enforcer', positions: [...SAFETIES, 'MLB'], tier: 1,
    triggers: ['contestedCatch'], boosts: { pow: 10, tak: 4 },
    description: 'Punishes receivers over the middle and jars the ball loose.', requires: { pow: 84, tak: 80 }
  },
  {
    id: 'iceWater', name: 'Ice Water', positions: ['K'], tier: 2,
    triggers: ['kick'], contexts: ['lateAndClose'], boosts: { kac: 10 },
    description: "Doesn't miss when the game is on the line.", requires: { kac: 85 }
  },
  {
    id: 'allWeather', name: 'All Weather', positions: ['K', 'P', 'QB'], tier: 1,
    triggers: ['kick', 'dropback'], contexts: ['badWeather'], boosts: { kac: 8, kpw: 5, sac: 5, mac: 5 },
    description: 'Wind, rain, and snow barely touch his accuracy.', requires: { awr: 75 }
  }
] as const satisfies readonly Ability[]; // prettier-ignore

export type AbilityId = (typeof ABILITIES)[number]['id'];

const BY_ID = new Map<string, Ability>(ABILITIES.map(a => [a.id, a]));

export function ability(id: string): Ability | undefined {
  return BY_ID.get(id);
}

export const TIER_LABELS: Record<Ability['tier'], string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };
