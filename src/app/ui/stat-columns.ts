/**
 * Stat table columns for career and game log tables (spec 9.2, style guide 7.3 and 9): short headers with
 * full names for assistive technology, stored totals and derived rates, and one number format each.
 */
import type { CategoryId } from '../../engine/stats/categories';
import { DERIVED } from '../../engine/stats/derived';
import type { StatKey } from '../../engine/sim/stats';

type Source = Readonly<Partial<Record<StatKey, number>>>;

export interface StatColumn {
  label: string;
  /** The full name, for the header's accessible name and tooltip. */
  title: string;
  value: (s: Source) => number | null;
  format: 'int' | 'one' | 'pct' | 'rating';
}

const n =
  (key: StatKey) =>
  (s: Source): number =>
    s[key] ?? 0;
const col = (
  label: string,
  title: string,
  value: StatColumn['value'],
  format: StatColumn['format'] = 'int'
): StatColumn => ({ label, title, value, format });

export const CATEGORY_TITLES: Record<CategoryId, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  blocking: 'Blocking',
  defense: 'Defense',
  kicking: 'Kicking',
  punting: 'Punting',
  returns: 'Returns',
  scoring: 'Scoring',
  participation: 'Snaps'
};

export const STAT_COLUMNS: Record<CategoryId, readonly StatColumn[]> = {
  passing: [
    col('Cmp', 'Completions', n('passCmp')),
    col('Att', 'Attempts', n('passAtt')),
    col('Pct', 'Completion percentage', DERIVED.completionPct, 'pct'),
    col('Yds', 'Passing yards', n('passYds')),
    col('Y/A', 'Yards per attempt', DERIVED.yardsPerAttempt, 'one'),
    col('TD', 'Passing touchdowns', n('passTd')),
    col('Int', 'Interceptions', n('passInt')),
    col('Lng', 'Longest completion', n('passLong')),
    col('Sk', 'Times sacked', n('sacked')),
    col('Rate', 'Passer rating', DERIVED.passerRating, 'rating')
  ],
  rushing: [
    col('Att', 'Carries', n('rushAtt')),
    col('Yds', 'Rushing yards', n('rushYds')),
    col('Avg', 'Yards per carry', DERIVED.yardsPerCarry, 'one'),
    col('TD', 'Rushing touchdowns', n('rushTd')),
    col('Lng', 'Longest run', n('rushLong')),
    col('1D', 'Rushing first downs', n('rushFirstDowns')),
    col('YAC', 'Yards after contact', n('rushYac')),
    col('BTk', 'Broken tackles', n('brokenTackles')),
    col('Fum', 'Fumbles', n('fumbles')),
    col('Lost', 'Fumbles lost', n('fumblesLost'))
  ],
  receiving: [
    col('Tgt', 'Targets', n('targets')),
    col('Rec', 'Receptions', n('receptions')),
    col('Yds', 'Receiving yards', n('recYds')),
    col('Avg', 'Yards per catch', DERIVED.yardsPerCatch, 'one'),
    col('TD', 'Receiving touchdowns', n('recTd')),
    col('Lng', 'Longest reception', n('recLong')),
    col('1D', 'Receiving first downs', n('recFirstDowns')),
    col('YAC', 'Yards after the catch', n('yac')),
    col('Ctch%', 'Catch rate', DERIVED.catchRate, 'pct'),
    col('Drop', 'Drops', n('drops'))
  ],
  blocking: [
    col('Sk', 'Sacks allowed', n('sacksAllowed')),
    col('Prs', 'Pressures allowed', n('pressuresAllowed')),
    col('RBW%', 'Run block win rate', DERIVED.runBlockWinRate, 'pct'),
    col('Pnk', 'Pancakes', n('pancakes'))
  ],
  defense: [
    col('Tkl', 'Tackles', DERIVED.tackles),
    col('Solo', 'Solo tackles', n('soloTackles')),
    col('Ast', 'Assisted tackles', n('assistedTackles')),
    col('TFL', 'Tackles for loss', n('tacklesForLoss')),
    col('Sk', 'Sacks', n('sacks')),
    col('Prs', 'Pressures', n('pressures')),
    col('Int', 'Interceptions', n('defInt')),
    col('PD', 'Passes defended', n('passesDefended')),
    col('FF', 'Forced fumbles', n('forcedFumbles')),
    col('FR', 'Fumble recoveries', n('fumbleRecoveries')),
    col('TD', 'Defensive touchdowns', s => (s.defIntTd ?? 0) + (s.fumbleReturnTd ?? 0))
  ],
  kicking: [
    col('FGM', 'Field goals made', n('fgMade')),
    col('FGA', 'Field goals attempted', n('fgAtt')),
    col('FG%', 'Field goal percentage', DERIVED.fieldGoalPct, 'pct'),
    col('40–49', 'Made from 40 to 49 yards', n('fgMade40')),
    col('50+', 'Made from 50 yards or more', n('fgMade50')),
    col('Lng', 'Longest field goal', n('fgLong')),
    col('XPM', 'Extra points made', n('xpMade')),
    col('XPA', 'Extra points attempted', n('xpAtt')),
    col('KO', 'Kickoffs', n('kickoffs')),
    col('TB', 'Kickoff touchbacks', n('kickoffTouchbacks'))
  ],
  punting: [
    col('Punts', 'Punts', n('punts')),
    col('Yds', 'Punt yards', n('puntYds')),
    col('Avg', 'Gross average', DERIVED.puntAverage, 'one'),
    col('Net', 'Net average', DERIVED.netPuntAverage, 'one'),
    col('In20', 'Inside the 20', n('puntsIn20')),
    col('TB', 'Touchbacks', n('puntTouchbacks')),
    col('Lng', 'Longest punt', n('puntLong')),
    col('Blk', 'Blocked', n('puntsBlocked'))
  ],
  returns: [
    col('KR', 'Kick returns', n('kickReturns')),
    col('KR Yds', 'Kick return yards', n('kickReturnYds')),
    col('KR Avg', 'Kick return average', DERIVED.kickReturnAverage, 'one'),
    col('KR TD', 'Kick return touchdowns', n('kickReturnTd')),
    col('PR', 'Punt returns', n('puntReturns')),
    col('PR Yds', 'Punt return yards', n('puntReturnYds')),
    col('PR Avg', 'Punt return average', DERIVED.puntReturnAverage, 'one'),
    col('PR TD', 'Punt return touchdowns', n('puntReturnTd')),
    col('FC', 'Fair catches', n('fairCatches'))
  ],
  scoring: [col('2PT', 'Two-point conversions', n('twoPointMade'))],
  participation: [
    col('Off', 'Offensive snaps', n('snapsOffense')),
    col('Def', 'Defensive snaps', n('snapsDefense')),
    col('ST', 'Special teams snaps', n('snapsSpecial'))
  ]
};

/**
 * A formatted cell value (style guide 9): thousands separators, one decimal for rates, and a true minus
 * sign on negatives. Undefined rates show an em dash.
 */
export function formatStat(value: number | null, format: StatColumn['format']): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const digits = format === 'int' ? 0 : 1;
  // Round first, so a value that rounds to zero shows no sign.
  const rounded = Number(Math.abs(value).toFixed(digits));
  const text = rounded.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  return value < 0 && rounded !== 0 ? `−${text}` : text;
}

/** Full stat names for records and leaders. */
export const STAT_NAMES: Record<StatKey, string> = {
  passAtt: 'Pass attempts',
  passCmp: 'Completions',
  passYds: 'Passing yards',
  passTd: 'Passing touchdowns',
  passInt: 'Interceptions thrown',
  sacked: 'Times sacked',
  sackYds: 'Sack yards lost',
  passLong: 'Longest completion',
  passFirstDowns: 'Passing first downs',
  passAirYds: 'Air yards',
  pass20: 'Completions of 20+ yards',
  pressured: 'Times pressured',
  throwAways: 'Throwaways',
  passDrops: 'Passes dropped by receivers',
  rushAtt: 'Carries',
  rushYds: 'Rushing yards',
  rushTd: 'Rushing touchdowns',
  rushLong: 'Longest run',
  rushFirstDowns: 'Rushing first downs',
  fumbles: 'Fumbles',
  fumblesLost: 'Fumbles lost',
  rushYac: 'Yards after contact',
  brokenTackles: 'Broken tackles',
  rush10: 'Runs of 10+ yards',
  targets: 'Targets',
  receptions: 'Receptions',
  recYds: 'Receiving yards',
  recTd: 'Receiving touchdowns',
  recLong: 'Longest reception',
  recFirstDowns: 'Receiving first downs',
  yac: 'Yards after the catch',
  drops: 'Drops',
  contestedCatches: 'Contested catches',
  rec20: 'Receptions of 20+ yards',
  sacksAllowed: 'Sacks allowed',
  pressuresAllowed: 'Pressures allowed',
  pancakes: 'Pancakes',
  runBlockWins: 'Run block wins',
  runBlockSnaps: 'Run block snaps',
  tackles: 'Tackles',
  soloTackles: 'Solo tackles',
  assistedTackles: 'Assisted tackles',
  tacklesForLoss: 'Tackles for loss',
  sacks: 'Sacks',
  qbHits: 'Quarterback hits',
  pressures: 'Pressures',
  passesDefended: 'Passes defended',
  defInt: 'Interceptions',
  defIntYds: 'Interception return yards',
  defIntTd: 'Interception return touchdowns',
  forcedFumbles: 'Forced fumbles',
  fumbleRecoveries: 'Fumble recoveries',
  fumbleReturnTd: 'Fumble return touchdowns',
  safeties: 'Safeties',
  targetsAllowed: 'Targets allowed',
  completionsAllowed: 'Completions allowed',
  yardsAllowed: 'Yards allowed in coverage',
  tdsAllowed: 'Touchdowns allowed in coverage',
  missedTackles: 'Missed tackles',
  fgMade: 'Field goals made',
  fgAtt: 'Field goals attempted',
  fgLong: 'Longest field goal',
  fgMade40: 'Field goals made from 40 to 49 yards',
  fgAtt40: 'Field goals tried from 40 to 49 yards',
  fgMade50: 'Field goals made from 50+ yards',
  fgAtt50: 'Field goals tried from 50+ yards',
  xpMade: 'Extra points made',
  xpAtt: 'Extra points attempted',
  kickoffs: 'Kickoffs',
  kickoffTouchbacks: 'Kickoff touchbacks',
  punts: 'Punts',
  puntYds: 'Punt yards',
  puntNetYds: 'Net punt yards',
  puntsIn20: 'Punts inside the 20',
  puntTouchbacks: 'Punt touchbacks',
  puntLong: 'Longest punt',
  puntsBlocked: 'Punts blocked',
  kickReturns: 'Kick returns',
  kickReturnYds: 'Kick return yards',
  kickReturnTd: 'Kick return touchdowns',
  kickReturnLong: 'Longest kick return',
  puntReturns: 'Punt returns',
  puntReturnYds: 'Punt return yards',
  puntReturnTd: 'Punt return touchdowns',
  puntReturnLong: 'Longest punt return',
  fairCatches: 'Fair catches',
  twoPointMade: 'Two-point conversions',
  penalties: 'Penalties',
  penaltyYds: 'Penalty yards',
  snapsOffense: 'Offensive snaps',
  snapsDefense: 'Defensive snaps',
  snapsSpecial: 'Special teams snaps',
  started: 'Games started'
};
