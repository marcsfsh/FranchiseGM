/**
 * Stat lines (spec 8.8, 9). Flat records of whole numbers so they store as columns (M5). Team totals add
 * up player lines plus the team-only counts the lines can't hold.
 */

export const STAT_KEYS = [
  // Passing (passDrops: passes his receivers dropped)
  'passAtt', 'passCmp', 'passYds', 'passTd', 'passInt', 'sacked', 'sackYds', 'passLong', 'passFirstDowns',
  'passAirYds', 'pass20', 'pressured', 'throwAways', 'passDrops',
  // Rushing (rushYac: yards after contact)
  'rushAtt', 'rushYds', 'rushTd', 'rushLong', 'rushFirstDowns', 'fumbles', 'fumblesLost', 'rushYac',
  'brokenTackles', 'rush10',
  // Receiving
  'targets', 'receptions', 'recYds', 'recTd', 'recLong', 'recFirstDowns', 'yac', 'drops', 'contestedCatches',
  'rec20',
  // Blocking
  'sacksAllowed', 'pressuresAllowed', 'pancakes', 'runBlockWins', 'runBlockSnaps',
  // Defense
  'tackles', 'soloTackles', 'assistedTackles', 'tacklesForLoss', 'sacks', 'qbHits', 'pressures', 'passesDefended',
  'defInt', 'defIntYds', 'defIntTd', 'forcedFumbles', 'fumbleRecoveries', 'fumbleReturnTd', 'safeties',
  'targetsAllowed', 'completionsAllowed', 'yardsAllowed', 'tdsAllowed', 'missedTackles',
  // Kicking and punting
  'fgMade', 'fgAtt', 'fgLong', 'fgMade40', 'fgAtt40', 'fgMade50', 'fgAtt50', 'xpMade', 'xpAtt', 'kickoffs',
  'kickoffTouchbacks', 'punts', 'puntYds', 'puntNetYds', 'puntsIn20', 'puntTouchbacks', 'puntLong', 'puntsBlocked',
  // Returns
  'kickReturns', 'kickReturnYds', 'kickReturnTd', 'kickReturnLong', 'puntReturns', 'puntReturnYds',
  'puntReturnTd', 'puntReturnLong', 'fairCatches',
  // Scoring, penalties, and participation
  'twoPointMade', 'penalties', 'penaltyYds', 'snapsOffense', 'snapsDefense', 'snapsSpecial', 'started'
] as const; // prettier-ignore

export type StatKey = (typeof STAT_KEYS)[number];
export type PlayerLine = Record<StatKey, number>;

/** Stats where the season value is the highest game, not the sum. */
export const LONG_STATS: ReadonlySet<StatKey> = new Set([
  'passLong', 'rushLong', 'recLong', 'fgLong', 'puntLong', 'kickReturnLong', 'puntReturnLong'
]); // prettier-ignore

export const emptyLine = (): PlayerLine => Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as PlayerLine;

export const TEAM_KEYS = [
  'points', 'firstDowns', 'firstDownsPass', 'firstDownsRush', 'firstDownsPenalty', 'thirdDownAtt',
  'thirdDownConv', 'fourthDownAtt', 'fourthDownConv', 'redZoneTrips', 'redZoneTd', 'plays', 'totalYards',
  'netPassYds', 'rushYds', 'passAtt', 'passCmp', 'passYds', 'passTd', 'passInt', 'sacked', 'sackYds',
  'rushAtt', 'rushTd', 'fumbles', 'fumblesLost', 'turnovers', 'penalties', 'penaltyYds', 'timeOfPossession',
  'twoPointAtt', 'twoPointMade', 'punts', 'fgMade', 'fgAtt', 'xpMade', 'xpAtt', 'defIntTd', 'fumbleReturnTd',
  'kickReturnTd', 'puntReturnTd', 'safeties'
] as const; // prettier-ignore

export type TeamKey = (typeof TEAM_KEYS)[number];
export type TeamTotals = Record<TeamKey, number>;

export const emptyTotals = (): TeamTotals => Object.fromEntries(TEAM_KEYS.map(k => [k, 0])) as TeamTotals;

/** The team totals that are sums of player lines. */
export const SUMMED: readonly (StatKey & TeamKey)[] = [
  'passAtt', 'passCmp', 'passYds', 'passTd', 'passInt', 'sacked', 'sackYds', 'rushAtt', 'rushTd', 'fumbles',
  'fumblesLost', 'penalties', 'penaltyYds', 'punts', 'fgMade', 'fgAtt', 'xpMade', 'xpAtt', 'defIntTd',
  'fumbleReturnTd', 'kickReturnTd', 'puntReturnTd', 'safeties'
]; // prettier-ignore

/** Adds player lines into team totals, including the derived yardage totals. */
export function sumLines(lines: readonly PlayerLine[], into: TeamTotals): TeamTotals {
  for (const key of SUMMED) into[key] = lines.reduce((sum, l) => sum + l[key], 0);
  into.rushYds = lines.reduce((sum, l) => sum + l.rushYds, 0);
  into.netPassYds = into.passYds - into.sackYds;
  into.totalYards = into.netPassYds + into.rushYds;
  into.turnovers = into.passInt + into.fumblesLost;
  into.twoPointMade = lines.reduce((sum, l) => sum + l.twoPointMade, 0);
  return into;
}
