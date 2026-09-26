/**
 * Performance incentives in offers (spec 11.2, 11.6): a season mark in a stat his position piles up, paid
 * each year he reaches it. A player values one by how likely he thinks he is to reach it (spec 11.7), his
 * pace against the mark; it counts on the cap as likely to be earned when he's already reached the mark (last
 * season's through the offseason, the CBA's Article 13), and otherwise once it's earned, the next league year.
 */
import type { League } from '../league/types';
import type { Player } from '../model/player';
import { POSITION_GROUP, type Position, type PositionGroup } from '../model/positions';
import type { StatKey } from '../sim/stats';
import { TUNING } from '../tuning';

const I = TUNING.contracts.decision.incentive;

/** An offer's performance incentive: `amount` a season he reaches `atLeast` in `key`. */
export interface OfferIncentive {
  key: StatKey;
  atLeast: number;
  amount: number;
}

/** The stats a position's incentives can mark, among those the league totals each season. */
const BY_GROUP: Record<PositionGroup, readonly StatKey[]> = {
  QB: ['passYds', 'passTd'],
  RB: ['rushYds', 'rushTd', 'recYds'],
  WR: ['recYds', 'receptions', 'recTd'],
  TE: ['recYds', 'receptions', 'recTd'],
  OL: [],
  DL: ['sacks', 'tackles'],
  LB: ['tackles', 'sacks'],
  DB: ['defInt', 'tackles'],
  ST: []
};

/** The stats an incentive can mark for a player at `position`: none for linemen, punters, or snappers. */
export const incentiveStats = (position: Position): readonly StatKey[] =>
  position === 'K' ? ['fgMade'] : BY_GROUP[POSITION_GROUP[position]];

/** Each stat's name in an incentive's words. */
export const STAT_WORDS: Partial<Record<StatKey, string>> = {
  passYds: 'passing yards',
  passTd: 'touchdown passes',
  rushYds: 'rushing yards',
  rushTd: 'rushing touchdowns',
  recYds: 'receiving yards',
  receptions: 'catches',
  recTd: 'receiving touchdowns',
  sacks: 'sacks',
  tackles: 'tackles',
  defInt: 'interceptions',
  fgMade: 'field goals'
};

/** An incentive's mark in words: "1,000 receiving yards". */
export const incentiveCondition = (i: Pick<OfferIncentive, 'key' | 'atLeast'>): string =>
  `${i.atLeast.toLocaleString('en-US')} ${STAT_WORDS[i.key] ?? i.key}`;

/**
 * His total for a season in `key` as he sees it: last season's through the playoffs and the offseason, or
 * this season's so far at its pace over the regular season; null while the season record has no games.
 */
export function seasonPace(league: League, player: Player, key: StatKey): number | null {
  if (!Object.keys(league.season.results).length) return null;
  const total = league.season.totals[player.id]?.[key] ?? 0;
  if (league.date.phase !== 'regularSeason') return total;
  const played = league.date.week - 1;
  return played > 0 ? (total * league.rules.season.weeks) / played : null;
}

/** How likely he thinks he is to reach an incentive's mark, 0 to 1 (spec 11.7): his pace against it. */
export function incentiveOdds(league: League, player: Player, incentive: OfferIncentive): number {
  if (incentive.atLeast <= 0) return 1;
  const pace = seasonPace(league, player, incentive.key);
  if (pace === null) return I.unknown;
  return 1 / (1 + Math.exp(-(pace / incentive.atLeast - 1) / I.spread));
}

/** Whether an incentive counts on the cap as likely to be earned: he's already reached its mark (Article 13). */
export const likelyToEarn = (league: League, player: Player, incentive: OfferIncentive): boolean =>
  (league.season.totals[player.id]?.[incentive.key] ?? 0) >= incentive.atLeast;
