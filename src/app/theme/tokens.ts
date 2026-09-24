/** Team token generation from style guide 2.2 and 13.2. Pure; checked by the theme matrix test. */
import {
  colorAgainst,
  contrast,
  hexToRgb,
  liftToLuminance,
  mix,
  readableText,
  saturation,
  uiPrimary
} from './colors';

export type Mode = 'day' | 'night';

export type TeamTokens = Record<`--${string}`, string>;

/** Night shades come from the adjusted primary, lifted to this luminance floor (style guide 2.2). */
export const NIGHT_SHADE_FLOOR = 0.045;

export function computeTeamTokens(primary: string, accent: string, mode: Mode): TeamTokens {
  hexToRgb(primary);
  hexToRgb(accent);
  if (mode !== 'day' && mode !== 'night') throw new TypeError('Resolve System to Day or Night first');
  const p = uiPrimary(primary);
  const night = mode === 'night';
  // Night surfaces are team shades. The luminance floor keeps black primaries from collapsing into one color.
  const base = liftToLuminance(p, NIGHT_SHADE_FLOOR);
  const dk = {
    ground: mix(base, '#000000', 0.72),
    panel: mix(base, '#000000', 0.58),
    raised: mix(base, '#000000', 0.42),
    rule: mix(base, '#000000', 0.25),
    tint: mix(base, '#FFFFFF', 0.72)
  };
  const surface = night ? dk.panel : '#FFFFFF';
  const raised = night ? dk.raised : '#ECEFF3';
  const text = night ? '#FFFFFF' : '#161A22';
  const secondary = night ? dk.tint : '#4F5867';
  const neutral = contrast(accent, '#FFFFFF') < 3.2 && saturation(accent) < 0.25;
  const starterBg = neutral ? (contrast(p, surface) >= 2 ? p : 'transparent') : '#FFFFFF';
  const starterText = neutral ? '#FFFFFF' : '#111418';
  const wash = mix('#FFFFFF', p, 0.07);
  return {
    '--team': p,
    '--on-team': '#FFFFFF',
    '--accent': accent,
    '--on-accent': readableText(accent),
    '--dk-ground': dk.ground,
    '--dk-panel': dk.panel,
    '--dk-raised': dk.raised,
    '--dk-rule': dk.rule,
    '--dk-tint': dk.tint,
    '--lt-tint': mix('#FFFFFF', p, 0.2),
    '--lt-wash': wash,
    '--ground': night ? dk.ground : '#F2F3F6',
    '--surface': surface,
    '--surface-2': raised,
    '--text': text,
    '--text-2': secondary,
    '--focus': night ? '#FFFFFF' : '#161A22',
    '--focus-on-team': '#FFFFFF',
    '--control-border': colorAgainst(night ? '#9DA5B4' : '#737B89', [surface, raised]),
    '--selection-bg': night ? raised : wash,
    '--selection-text': text,
    '--selection-indicator': colorAgainst(p, [surface, raised, night ? raised : wash]),
    '--n-starter-bg': starterBg,
    '--n-starter-text': starterText,
    '--n-starter-border': starterBg === 'transparent' ? '#FFFFFF' : 'transparent',
    '--tier-starter-fill': night ? (starterBg === 'transparent' ? '#FFFFFF' : starterBg) : p
  };
}
