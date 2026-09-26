/**
 * Draft class settings (spec 22.4, 10.3): the class size, each position's share, the class strength draws
 * overall and by position group, bust and gem frequency and development variance by position group, and
 * scouting accuracy. Shares, spreads, frequencies, variance, and accuracy are multipliers where 1 is normal;
 * the strength means shift classes by up to `TUNING.draft.strengthMax` quality units at 1 or -1.
 */
import { TEAM_ABBRS } from '../../data/team-colors';
import { POSITION_GROUP, type Position, type PositionGroup } from '../model/positions';
import type { RuleSet } from '../rules/ruleset';
import { POSITION_GROUPS } from '../progression/settings';
import { TUNING } from '../tuning';

export interface DraftSettings {
  /** Prospects in each class (450 by default). */
  classSize: number;
  /** Each position's share of a class, as a multiplier on its default share. */
  positionMix: Record<Position, number>;
  /** Each class's overall strength draw: its mean (-1 to 1) and its spread. */
  strengthMean: number;
  strengthSpread: number;
  /** Each position group's strength draw in a class: its mean (-1 to 1) and spread. */
  groupMean: Record<PositionGroup, number>;
  groupSpread: Record<PositionGroup, number>;
  /** How often prospects at each position group are badly overrated (busts) or underrated (gems). */
  bust: Record<PositionGroup, number>;
  gem: Record<PositionGroup, number>;
  /** How far each position group's young players stray from their expected development (spec 10.3). */
  development: Record<PositionGroup, number>;
  /** How fast scouting narrows each team's error (M11 slice 3). */
  scoutingAccuracy: number;
}

/** The multipliers' range, as for the development settings; the strength means run from -1 to 1. */
export const DRAFT_RANGE = { min: 0, max: 2 } as const;
/** A class's size: at least a prospect for every regular pick in the rules' draft, and at most 700. */
export const classSizeRange = (rules: RuleSet): { min: number; max: number } => ({
  min: rules.season.draftRounds * TEAM_ABBRS.length,
  max: 700
});
/** The least scouting accuracy: grades' errors grow at most tenfold. */
export const ACCURACY_MIN = 0.1;

const everyGroup = (value: number): Record<PositionGroup, number> =>
  Object.fromEntries(POSITION_GROUPS.map(g => [g, value])) as Record<PositionGroup, number>;

export function defaultDraftSettings(): DraftSettings {
  return {
    classSize: TUNING.draft.classSize,
    positionMix: Object.fromEntries(Object.keys(POSITION_GROUP).map(p => [p, 1])) as Record<Position, number>,
    strengthMean: 0,
    strengthSpread: 1,
    groupMean: everyGroup(0),
    groupSpread: everyGroup(1),
    bust: everyGroup(1),
    gem: everyGroup(1),
    development: everyGroup(1),
    scoutingAccuracy: 1
  };
}
