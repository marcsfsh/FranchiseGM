import type { RouteName } from '../router';
import { capScreen } from './cap';
import { depthScreen } from './depth';
import { devScreen } from './dev';
import { freeAgencyScreen } from './free-agency';
import { gamePlanScreen } from './gameplan';
import { placeholderScreen } from './placeholder';
import { historyScreen } from './history';
import { homeScreen } from './home';
import { leagueScreen } from './league';
import { newLeagueScreen } from './new-league';
import { playerScreen } from './player';
import { rosterScreen } from './roster';
import { settingsScreen } from './settings';
import { startScreen } from './start';
import type { Screen } from './types';

/** Screen factories by route. Each navigation gets a fresh screen. */
export const SCREENS: Record<RouteName, () => Screen> = {
  home: homeScreen,
  roster: rosterScreen,
  depth: depthScreen,
  gameplan: gamePlanScreen,
  staff: () => placeholderScreen('Staff', 'Your coaches, coordinators, scouts, and front office.'),
  scouting: () =>
    placeholderScreen('Scouting and draft', 'Prospects, scouting assignments, and the draft board.'),
  freeagency: freeAgencyScreen,
  trades: () => placeholderScreen('Trades', 'Trade offers, the trade block, and proposals.'),
  finances: capScreen,
  league: leagueScreen,
  leagueTab: leagueScreen,
  game: () => placeholderScreen('Game', "A game's box score, scoring and drive summaries, and recap."),
  history: historyScreen,
  settings: settingsScreen,
  player: playerScreen,
  team: () => placeholderScreen('Team', "Another team's roster and results."),
  start: startScreen,
  newLeague: newLeagueScreen,
  dev: devScreen
};
