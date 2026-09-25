/** Scheme identifiers (spec 7.2). M3 defines the schemes; staff reference them by ID from M1. */
export const OFFENSE_SCHEMES = ['westCoast', 'shanahanZone', 'airRaid', 'powerRun'] as const;
export const DEFENSE_SCHEMES = ['fourThreeOver', 'threeFourOneGap', 'cover3', 'manBlitz'] as const;
export type OffenseSchemeId = (typeof OFFENSE_SCHEMES)[number];
export type DefenseSchemeId = (typeof DEFENSE_SCHEMES)[number];
