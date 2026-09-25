import type { RouteName } from '../router';
import { placeholderScreen } from './placeholder';
import { homeScreen } from './home';
import { newLeagueScreen } from './new-league';
import { settingsScreen } from './settings';
import { startScreen } from './start';
import type { Screen } from './types';

/** Screen factories by route. Each navigation gets a fresh screen. */
export const SCREENS: Record<RouteName, () => Screen> = {
  home: homeScreen,
  roster: () =>
    placeholderScreen('Roster', 'Every player on your roster with ratings, contracts, and status.'),
  depth: () =>
    placeholderScreen('Depth chart', 'Starters and backups at every position, with packages and rotations.'),
  gameplan: () => placeholderScreen('Game plan', 'Your weekly plan against the next opponent.'),
  staff: () => placeholderScreen('Staff', 'Your coaches, coordinators, scouts, and front office.'),
  scouting: () =>
    placeholderScreen('Scouting and draft', 'Prospects, scouting assignments, and the draft board.'),
  freeagency: () => placeholderScreen('Free agency', 'Available players and contract offers.'),
  trades: () => placeholderScreen('Trades', 'Trade offers, the trade block, and proposals.'),
  finances: () => placeholderScreen('Finances', 'Revenue, expenses, and the salary cap.'),
  league: () => placeholderScreen('League', 'Standings, schedule, league stats, and news.'),
  history: () => placeholderScreen('History', 'Past seasons, awards, and the records book.'),
  settings: settingsScreen,
  player: () => placeholderScreen('Player', 'A player profile with ratings, contract, and stats.'),
  team: () => placeholderScreen('Team', "Another team's roster and results."),
  start: startScreen,
  newLeague: newLeagueScreen
};
