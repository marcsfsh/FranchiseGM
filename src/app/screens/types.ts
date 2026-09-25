import type { Route } from '../router';
import type { AppState } from '../state';
import type { PrefsController } from '../theme/controller';

export interface ScreenContext {
  route: Route;
  prefs: PrefsController;
  app: AppState;
  /** Navigates to a hash route. */
  go(hash: string): void;
  /** Set when the user comes back from a player page opened on this screen (lists restore focus). */
  returning?: boolean;
}

export interface Screen {
  /** The page heading, also used for the document title. */
  title: string;
  render(ctx: ScreenContext): Node;
  /** Called before the next screen renders. */
  dispose?(): void;
}
