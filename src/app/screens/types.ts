import type { Route } from '../router';
import type { PrefsController } from '../theme/controller';

export interface ScreenContext {
  route: Route;
  prefs: PrefsController;
}

export interface Screen {
  /** The page heading, also used for the document title. */
  title: string;
  render(ctx: ScreenContext): Node;
  /** Called before the next screen renders. */
  dispose?(): void;
}
