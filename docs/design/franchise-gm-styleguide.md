# Franchise GM style guide

## F2 “Switch” — Minnesota Vikings default, all-team theming

**Version:** 3.0 · **Updated:** September 24, 2026 · **Deliverable:** one self-contained HTML game that works offline.

This revision builds on v2 and restores three project decisions: team-shaded Night surfaces, the aspect-aware Auto layout with an always-honored manual override, and the home screen order. Development tags now use Madden's development traits to match the game spec. It defines the visual system, component behavior, reference CSS and JavaScript, canonical screen examples, and acceptance criteria. The default identity remains Vikings purple and gold. Players, coaches, and staff in examples are fictional.

The embedded code is a reference UI layer. It implements theming, preferences, navigation, roster rendering, selection and comparison, dialogs, and display formatting. The game engine owns simulation, scouting results, transactions, eligibility, cap calculations, and saving franchise state. Wire those domain operations to the documented UI events; never display a successful transaction before it actually succeeds.

### Implementation contract

- Use semantic tokens and the components in this guide. Change a shared token or component before introducing screen-specific styling.
- Recurring colors, typography, spacing, target sizes, and interaction states belong in tokens. Component geometry such as an SVG viewBox, a clipping polygon, or a one-pixel divider may be literal in the shared stylesheet. Percentage widths derived from data are also allowed.
- Small optical corrections have named tokens; do not scatter one-off padding fixes through screens.
- Keep source text in sentence case. Uppercase display treatments are applied with CSS.
- Use one data model for all responsive representations. Never maintain separate desktop and phone player state.
- Build-time tools may fetch packages. The shipped HTML must make no network requests.
- The code blocks in sections 11–13 are authoritative examples for this revision. The acceptance criteria in section 14 are requirements, not claims that an unbuilt game has passed them.

## Contents

1. Design principles and visual hierarchy
2. Color and team themes
3. Typography and embedded fonts
4. Responsive layout and density
5. Spacing, shape, and elevation
6. Iconography
7. Components and interaction behavior
8. Accessibility
9. Copy, numbers, and uncertainty
10. Reference data
11. Canonical screen markup
12. Reference stylesheet
13. Reference JavaScript
14. Acceptance criteria
15. Migration notes and references

---

## 1. Design principles and visual hierarchy

The system has Day and Night modes, an adaptive app shell, and independent Comfortable and Compact density preferences. Team identity comes from color, typography, names, and uniform-inspired details. No logos, mascots, or emoji icons appear.

### 1.1 Give decoration a job

| Treatment | Use | Limit |
|---|---|---|
| Twill numerals and sleeve stripes | Team identity, featured player headers | One featured treatment per major panel; never every data row |
| Large name plates | Page titles and player detail headers | Use plain names in dense tables |
| Sign bars | Major dashboard sections | Nested sections use plain headings |
| Arrow tiles | Link to a distinct destination | Omit when there is no destination; label the link specifically |
| Slanted rating plates | OVR and prominent summary ratings | Attribute numbers remain plain; use bars as supporting information |
| Slanted buttons | Primary and secondary filled actions | Keep the actual hit area and focus outline rectangular |
| Accent rules | Active navigation and important grouping | Do not outline every card in the accent color |

A screen has one most prominent task. Routine navigation, supporting labels, and decorative elements have lower visual weight. Use Overpass 400–600 for ordinary content; reserve 700–800 for important values, active states, and actions. A roster can be dense while the page header retains the broadcast identity.

### 1.2 Separate visual roles

Team identity, action priority, rating quality, development potential, selection, and health status are distinct concepts. Their tokens may initially share a color, but components must reference their own semantic role. A red team accent does not make a primary action destructive; destructive actions use the danger role, explicit wording, and a consequence summary.

---

## 2. Color and team themes

### 2.1 Brand inputs

| Token / input | Vikings default | Purpose |
|---|---|---|
| Official primary | `#4F2683` | Preserved in the team data for reference |
| `--team` | `#4F2683` | Accessible UI primary; darkened if white text would fall below 4.5:1 |
| `--accent` | `#FFC62F` | Team secondary or approved UI accent |
| `--on-team` | `#FFFFFF` | Text on the adjusted UI primary |
| `--on-accent` | Computed black or white | Text on the team accent |

Choose accent text using the higher contrast of pure black and white. For an opaque sRGB color, this avoids the borderline cases created by always comparing a softened dark gray against white. Status foregrounds are separate: `--on-warning` never follows the team accent foreground.

### 2.2 Team-shaded Night surfaces

Night surfaces are shades of the team primary, so every team's Night mode carries its color. Vikings Night is deep purple.

All Night shades come from a **shade base**: the adjusted UI primary, lightened toward white only if its relative luminance is below **0.045**. Without that floor, black and near-black primaries (Bengals, Raiders, Steelers, Saints, Panthers, Bears, Texans) would collapse every surface into one color. With it, they get distinct charcoal or deep-navy shades that still read as their team. Teams already above the floor, including the Vikings, are unchanged.

`mix(a, b, t)` moves each sRGB channel of `a` toward `b` by `t`. `liftToLuminance(c, L)` mixes `c` toward white in 1% steps until its relative luminance reaches `L`.

| Token | Formula | Vikings | Purpose |
|---|---|---|---|
| Shade base | `liftToLuminance(team, .045)` | `#4F2683` | Source of every Night shade |
| `--dk-ground` | `mix(base, '#000000', .72)` | `#160B25` | Page background |
| `--dk-panel` | `mix(base, '#000000', .58)` | `#211037` | Cards and tables |
| `--dk-raised` | `mix(base, '#000000', .42)` | `#2E164C` | Insets, table headers, controls |
| `--dk-rule` | `mix(base, '#000000', .25)` | `#3B1D62` | Decorative separators |
| `--dk-tint` | `mix(base, '#FFFFFF', .72)` | `#CEC2DC` | Secondary text |
| `--lt-wash` | `mix('#FFFFFF', team, .07)` | `#F3F0F6` | Day selected row |
| `--lt-tint` | `mix('#FFFFFF', team, .20)` | `#DCD4E6` | Day supporting tint |

Checked across all 32 teams: adjacent Night surfaces stay ordered and distinct, white text on the raised surface stays above 9:1, and secondary text on the raised surface stays above 6:1. Surface separation is a hierarchy choice; decorative dividers do not all need the same contrast as an input boundary.

### 2.3 Semantic roles

| Role | Tokens | Rule |
|---|---|---|
| Surfaces | `--ground`, `--surface`, `--surface-2` | Ordered page, panel, inset hierarchy |
| Type | `--text`, `--text-2` | Primary and secondary readable text |
| Decorative lines | `--line`, `--border` | Quiet card boundaries and separators |
| Control boundary | `--control-border` | At least 3:1 against both relevant panel surfaces |
| Primary action | `--action-primary-bg`, `--action-primary-text` | Defaults to team accent; may be independently overridden |
| Secondary action | `--action-secondary-bg`, `--action-secondary-text` | Team fill in Day; light fill in Night |
| Selection | `--selection-bg`, `--selection-text`, `--selection-indicator` | Selected rows also show a checkbox, check, or explicit selected state |
| Navigation | `--nav-active-bg`, `--nav-active-text` | Team accent plus active label/indicator |
| Rating | `--rating-elite-bg`, `--rating-elite-text`, tier tokens | Current ability only |
| Development | `--development-bg`, `--development-text` | Independent future progression classification |
| Focus | `--focus`, local `--focus-on-team` | Contrast with the actual surrounding surface; never assume accent works |
| Feedback | `--success`, `--warning`, `--danger` and their foregrounds | Labels and icons accompany color |

The reference generator computes control boundaries and selection indicators against both `--surface` and `--surface-2`. A team-colored header overrides the focus color with white. Do not apply a general focus token to a different background without checking it.

### 2.4 Status colors

| Role | Fill | Foreground | Examples |
|---|---|---|---|
| Success | `#1E7A45` | White | Healthy, accepted, beneficial result |
| Warning | `#F0B429` | Black | Questionable, expiring, action needed |
| Danger | `#C8322A` | White | Out, release action, cap limit exceeded |

Use separate text colors for positive and negative feedback on surfaces. Do not use the fill color automatically as small text. Unknown, unscouted, and unavailable are neutral states, never injury or error states.

### 2.5 Rating and development

| Tier | Known OVR | Display |
|---|---|---|
| Elite | 90–99 | Accent plate with “Elite” text in the legend/details |
| Starter | 80–89 | Team plate in Day; light plate in Night |
| Depth | 70–79 | Outlined plate and numeric value |
| Low overall | 0–69 | Muted plate and numeric value |
| Unknown | Missing / invalid | Neutral dashed plate with an em dash and accessible explanation |

The reference display domain is integer 0–99; if the game engine has a narrower valid domain, validate that upstream. Out-of-range, fractional, empty, or nonnumeric values are not silently clamped into an apparently valid OVR.

Depth uses an outlined plate for every team, providing a stable visual distinction. For light neutral accents, the Night starter plate uses the team primary when distinguishable; otherwise it uses a white outline. Outlined bar fills use a contrasting solid color, not a transparent fill.

Development tags use Madden's development traits, matching the game spec: **X-Factor**, **Superstar**, **Star**, and **Normal**. They describe future progression, not current ability, so they never change because a player's current OVR crosses a threshold. A player can be 68 OVR with Superstar development.

| Development trait | Display |
|---|---|
| X-Factor | Development plate (`--development-bg`, team accent by default) |
| Superstar | Secondary action fill (team fill in Day, light fill in Night) |
| Star | Outlined plate |
| Normal | Muted fill |
| Unknown (unscouted) | Dashed outline with “Not known” |

### 2.6 All-team palette reference

The following values are carried forward from the supplied guide as UI palette inputs. They are not a newly verified statement of current official brand standards. Before publishing a branded release, reconcile them with the relevant current brand references. Store intentional UI substitutions separately from official palette metadata.

| Team | Abbr | Division | Primary input | Accent input | UI note |
|---|---|---|---|---|---|
| Buffalo Bills | BUF | AFC East | `#00338D` | `#C60C30` |  |
| Miami Dolphins | MIA | AFC East | `#008E97` | `#FC4C02` |  |
| New England Patriots | NE | AFC East | `#002244` | `#C60C30` |  |
| New York Jets | NYJ | AFC East | `#125740` | `#8FB8A8` | Tinted green UI accent |
| Baltimore Ravens | BAL | AFC North | `#241773` | `#9E7C0C` |  |
| Cincinnati Bengals | CIN | AFC North | `#000000` | `#FB4F14` | Black UI primary |
| Cleveland Browns | CLE | AFC North | `#311D00` | `#FF3C00` |  |
| Pittsburgh Steelers | PIT | AFC North | `#101820` | `#FFB612` |  |
| Houston Texans | HOU | AFC South | `#03202F` | `#A71930` |  |
| Indianapolis Colts | IND | AFC South | `#002C5F` | `#A2AAAD` |  |
| Jacksonville Jaguars | JAX | AFC South | `#006778` | `#D7A22A` |  |
| Tennessee Titans | TEN | AFC South | `#0C2340` | `#4B92DB` |  |
| Denver Broncos | DEN | AFC West | `#002244` | `#FB4F14` | UI primary uses navy |
| Kansas City Chiefs | KC | AFC West | `#E31837` | `#FFB81C` |  |
| Las Vegas Raiders | LV | AFC West | `#000000` | `#A5ACAF` | Black UI primary |
| Los Angeles Chargers | LAC | AFC West | `#0080C6` | `#FFC20E` |  |
| Dallas Cowboys | DAL | NFC East | `#003594` | `#869397` |  |
| New York Giants | NYG | NFC East | `#0B2265` | `#A71930` |  |
| Philadelphia Eagles | PHI | NFC East | `#004C54` | `#A5ACAF` |  |
| Washington Commanders | WAS | NFC East | `#5A1414` | `#FFB612` |  |
| Chicago Bears | CHI | NFC North | `#0B162A` | `#C83803` |  |
| Detroit Lions | DET | NFC North | `#0076B6` | `#B0B7BC` |  |
| Green Bay Packers | GB | NFC North | `#203731` | `#FFB612` |  |
| Minnesota Vikings | MIN | NFC North | `#4F2683` | `#FFC62F` |  |
| Atlanta Falcons | ATL | NFC South | `#A71930` | `#A5ACAF` |  |
| Carolina Panthers | CAR | NFC South | `#101820` | `#0085CA` | UI accent uses blue |
| New Orleans Saints | NO | NFC South | `#101820` | `#D3BC8D` |  |
| Tampa Bay Buccaneers | TB | NFC South | `#D50A0A` | `#FF7900` | UI accent uses orange |
| Arizona Cardinals | ARI | NFC West | `#97233F` | `#FFB612` |  |
| Los Angeles Rams | LAR | NFC West | `#003594` | `#FFD100` |  |
| San Francisco 49ers | SF | NFC West | `#AA0000` | `#B3995D` |  |
| Seattle Seahawks | SEA | NFC West | `#002244` | `#69BE28` |  |

The programmatic `TEAM_COLORS` map in section 13 is the palette source for the implementation. Derived UI primaries and surface values are computed; do not maintain a second hand-written table of computed hex values.

---

## 3. Typography and embedded fonts

Use Barlow Condensed for display and Overpass for UI/data. Embed fonts into the final HTML; no runtime font requests.

| Family | Embedded file | Use |
|---|---|---|
| Barlow Condensed | Latin 700 upright | Section titles, position and development tags |
| Barlow Condensed | Latin 800 italic | Page names, featured names, rating plates, twill numerals |
| Overpass variable | Latin normal 100–900 | Body, controls, tables, numeric data |

Do not request unembedded Barlow weights/styles. Ordinary tables use Overpass 400–600, important values 700–800, with tabular numerals. Body line height is 1.5; display line height is 1.05–1.1 to protect accents and descenders. Avoid fixed-height text containers.

### 3.1 Scale

All values below are rem units, assuming the browser's normal 16px base for illustration. Do not force a fixed root font size. Text enlargement must remain usable.

| Role | Wide shell | Narrow shell |
|---|---|---|
| Display | 4.5rem / 72px | 2.5rem / 40px |
| Page title | 2.75rem / 44px | 1.875rem / 30px |
| Player name | 2.125rem / 34px | 1.75rem / 28px |
| Section | 1.375rem / 22px | 1.25rem / 20px |
| Card title | 1.25rem / 20px | 1.125rem / 18px |
| Prominent data | 1.375rem / 22px | 1.125rem / 18px |
| Body and inputs | 1rem / 16px | 1rem / 16px |
| Supporting text | .875rem / 14px | .875rem / 14px |
| Small label | .8125rem / 13px | .8125rem / 13px |

Compact density reduces padding and row height, not body font size. Long names wrap in detail views. Tables may ellipsize with an accessible full-name link; touch users can open the full name without hovering. Retain punctuation, suffixes, and diacritics. Test the actual font coverage; expand the subset or allow a legible system fallback when a character is absent.

### 3.2 Embedding the fonts

Pin dependency versions with the project lockfile. Font size is measured from the actual build rather than guaranteed by this document. Preserve the fonts' required license notices in the distributed file; the helper embeds package license text when present.

The build runs this script as its last step, on the assembled output file, so every build ships with embedded fonts. It uses the Fontsource npm packages, which contain the same fonts as Google Fonts, already split into Latin woff2 files.

```bash
npm install --save-dev @fontsource/barlow-condensed @fontsource-variable/overpass
node tools/embed-fonts.mjs dist/game.html
```

```js
// tools/embed-fonts.mjs
// Reads the woff2 files, base64-encodes them, and writes the @font-face block
// into the built HTML file (default dist/game.html) between the FONTS:START and FONTS:END markers.
import { readFile, writeFile } from 'node:fs/promises';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONTS = [
  { family: 'Barlow Condensed', weight: '700', style: 'normal',
    file: 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2' },
  { family: 'Barlow Condensed', weight: '800', style: 'italic',
    file: 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2' },
  { family: 'Overpass', weight: '100 900', style: 'normal',
    file: 'node_modules/@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2' }
];

const licenses = [];
for (const pkg of ['@fontsource/barlow-condensed', '@fontsource-variable/overpass']) {
  let license = null;
  for (const filename of ['LICENSE', 'LICENSE.txt', 'OFL.txt']) {
    try { license = await readFile(`node_modules/${pkg}/${filename}`, 'utf8'); break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!license) throw new Error(`Missing font license in ${pkg}; locate its package license before distributing.`);
  // Avoid terminating the CSS comment or enclosing HTML style element.
  const safe = license.replaceAll('*/', '* /').replace(/<\/style/gi, '< /style');
  licenses.push(`/* ${pkg}\n${safe}\n*/`);
}
const blocks = [];
for (const f of FONTS) {
  const b64 = (await readFile(f.file)).toString('base64');
  blocks.push(
`@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  unicode-range: ${LATIN};
}`);
}
const css = `/* FONTS:START */
/* Barlow Condensed and Overpass, SIL Open Font License 1.1 (https://openfontlicense.org) */
${licenses.join('\n')}
${blocks.join('\n')}
/* FONTS:END */`;

const target = process.argv[2] ?? 'dist/game.html';
const html = await readFile(target, 'utf8');
const startMarker = '/* FONTS:START */', endMarker = '/* FONTS:END */';
if (html.split(startMarker).length !== 2 || html.split(endMarker).length !== 2 || html.indexOf(startMarker) >= html.indexOf(endMarker)) {
  throw new Error('Expected exactly one ordered FONTS:START / FONTS:END marker pair');
}
const out = html.replace(/\/\* FONTS:START \*\/[\s\S]*?\/\* FONTS:END \*\//, () => css);
await writeFile(target, out);
console.log('Embedded', FONTS.length, 'fonts,', Math.round(css.length / 1024), 'KB of CSS');
```

The first `<style>` element in `game.html` starts with the empty marker pair, and the rest of the stylesheet from section 12 follows it:

```html
<style>
/* FONTS:START */
/* FONTS:END */

/* section 12 stylesheet follows */
</style>
```

If the package file names differ from the paths above (Fontsource renames files between major versions), list the package's `files/` folder and update the three paths. Check the result by turning on airplane mode, opening `dist/game.html`, and confirming the italic numerals and condensed headings still render.


---

## 4. Responsive layout and density

### 4.1 Shell layout

Settings contains the Layout select: Auto, Phone, Tablet, Desktop.

**Auto** measures the viewport in CSS pixels and applies these rules in order:

| Rule | Shell |
|---|---|
| Short side (the smaller of width and height) under 520px | Phone: top bar and five-item bottom navigation |
| Width 1100px or more, and width divided by height 1.2 or more | Desktop: top bar and sidebar |
| Anything else | Tablet: top bar and icon rail |

The short side is checked first so a phone held sideways stays a phone. Reference results: a 390 × 844 phone and the same phone at 844 × 390 get Phone; an 834 × 1194 iPad in portrait gets Tablet; an 1194 × 834 iPad in landscape and a 1440 × 900 laptop get Desktop. Auto re-runs on every resize and orientation change.

**Manual choices are always honored,** at any size, and saved until the player sets Layout back to Auto. Settings shows the state as “Auto: showing tablet” or “Set to desktop.” Because a forced shell can be larger than the window, every shell must stay operable when forced: the sidebar and rail scroll independently of the main content, main content scrolls, and no navigation is hidden. A forced shell may be cramped; it must not be broken. Input size is controlled separately by pointer capability (section 4.3).

Use `min-height: 100dvh` with a `100vh` fallback, scrollable sidebar/rail content, and safe-area insets. Do not give the app a fixed height that cuts off content. Keep selected navigation, filters, comparison selection, and franchise data stable when the shell changes.

### 4.2 Component width

A component responds to its container independently of the shell. The dashboard roster is always a compact preview. The full roster owns the available main width.

| Roster container width | Representation |
|---|---|
| Under 640px | Labeled list cards |
| 640–959px | Semantic table: selection, position, player, OVR, status |
| 960px and above | Full table: adds age, development, cap hit |

Use container queries. The reference CSS falls back to the accessible list when container queries are unavailable. Hidden representations are `display: none` and contain no duplicate IDs. Both are generated from the same state.

The card grid uses minimum readable card widths, not a fixed three-column count on every desktop. A featured card can span two columns only when its container has room. Preserve DOM and visual order: no dense grid backfilling.

### 4.3 Density and touch

| Setting | Default row minimum | Control target |
|---|---|---|
| Comfortable | 56px | 44px on precise pointers |
| Compact | 44px | 44px on precise pointers |
| Any density with a coarse pointer, or Phone shell | At least 56px | At least 48 × 48px |

A switch may have a 32px visual track inside a 48px target. Its label can enlarge the clickable area. Checkboxes retain a compact visual glyph inside a full-size label target. Enlarged text can increase rows beyond their minimum.

### 4.4 Navigation and home order

Primary destinations: Home, Roster, Depth chart, Staff, Scouting, Trades, Finances. Phone tabs: Home, Roster, Staff, Scout, More. More is a labeled menu/dialog containing the remaining destinations and Settings. Desktop and rail controls are links for navigation and buttons for actions.

Home order: next game and game plan, roster and injuries, inbox and news, standings and playoff picture, then cap summary, featured player, and staff. Use the same DOM order in all layouts. Critical deadlines may appear in a dedicated alert region above the grid, rather than being silently reordered by CSS.

---

## 5. Spacing, shape, and elevation

Use the spacing scale 4, 8, 12, 16, 20, 24, 32, 48, 64px through `--s1`–`--s9`. Optical adjustments use `--optical-y`. Geometry-specific constants live once in shared CSS; new screens do not invent spacing values.

Cards/dialogs use 6px radii; inputs/chips 4px; selection tracks 8px; pills fully rounded. Filled action backgrounds and rating plates may slant. Inputs, table cells, and focus outlines do not slant.

Implement a button's slanted background in `::before`. Its label, border focus indicator, and clickable rectangle remain unclipped. Name plates can have a decorative slanted background but must not clip multiline names. Depth tier outlines follow the same full rectangular box; do not fake a slanted border with a clipped box-shadow that loses its edges.

Cards use flat surfaces and quiet one-pixel boundaries. Only dialogs, popovers, and toasts receive shadows. Define elevation and z-index tokens centrally. Decorative sleeve stripes are 6/3/6px; page-level stripes are used sparingly.

---

## 6. Iconography

Icons are inline SVG, 24x24 viewBox, stroke only, `stroke="currentColor"`, stroke width 2.2 (3 for small icons inside tiles), round caps and joins. Paths used so far:

| Name | Path `d` |
|---|---|
| home | `M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z` |
| roster | `M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6` |
| depth | `M4 6h16M4 12h16M4 18h10` |
| staff | `M9 3h6v4H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5` |
| scouting | `M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5` |
| trades | `M7 7h13l-4-4M17 17H4l4 4` |
| finances | `M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6` |
| more | `M5 12h.01M12 12h.01M19 12h.01` |
| arrow right | `M4 12h15M13 5l7 7-7 7` (sign bar tile, stroke 3, square caps) |
| chevron | `M9 5l7 7-7 7` |
| moon (switch to Night) | `M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z` |
| sun (switch to Day) | `M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4` |
| bell | `M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0` |
| check | `M5 12l5 5 9-10` |
| alert | `M12 7v6M12 17h.01` |
| close | `M6 6l12 12M18 6L6 18` |
| add person | `M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M19 8v6M16 11h6` |

Never use emoji as icons. Icon-only buttons need `aria-label`. Decorative SVGs also use `aria-hidden="true" focusable="false"`. A meaningful icon has a visible label or an accessible name on its parent. Small visual icons still sit inside the full target area. A sign-bar arrow uses an explicit destination such as “Open roster,” not “More.”

---

## 7. Components and interaction behavior

### 7.1 Buttons

Primary names the main task; Solid is a supporting action; Outline is a neutral action; Text is a low-emphasis link/action; Danger names a destructive action. Use sentence-case verbs: Sign player, Send offer, Compare players, Release player.

Every variant has default, hover, pressed, focus-visible, disabled, and busy states. Hover changes the background layer rather than dimming all text with `filter: brightness()`. A disabled action explains the reason nearby, associated with `aria-describedby`. A busy action preserves its width, changes its label, sets `aria-busy`, and blocks duplicate submission. Do not use `aria-disabled` without actually preventing activation.

Destructive confirmations name the affected player, show relevant roster/cap consequences, and use an explicit action such as “Release Marcus Hale.” Initial focus goes to Cancel or the dialog heading when the action has significant consequences. Dismissal returns focus to the trigger.

### 7.2 Inputs and selection

Inputs have visible labels, supporting hints, and linked error messages. Errors set `aria-invalid`; actionable errors explain the correction. Inputs remain at least 1rem on phone. Steppers expose a labeled numeric input as well as decrease/increase buttons. Validate min/max in code as well as HTML.

Use native radio inputs for exclusive choices and native checkboxes for multiple choices. Use `role="switch"` only for an immediate on/off setting. A visual segmented control can contain radios for an exclusive filter; a true tab interface uses tab/panel semantics and arrow-key navigation. Do not apply `aria-pressed` indiscriminately to tabs, navigation, or rows that merely open a player.

### 7.3 Tables, lists, and comparison

Use `<table>`, `<caption>`, `<thead>`, `<tbody>`, `<th scope="col">`, and appropriate row headers for tabular data. Place the player link inside its cell. Rows themselves are not buttons, and links/checkboxes are never nested inside another button.

Sortable headers contain a button; set `aria-sort` only on the active sort column. Sorting preserves selection and uses a stable secondary key such as player ID. Unknown numeric values sort after known values in either direction. Filtering preserves sort; selected players remain selected until explicitly cleared, and a count identifies selections hidden by the filter.

Checkboxes control comparison selection; opening a profile is a separate action. Compare is available for 2–4 players, with a nearby explanation otherwise. Preserve filters, sort, selection, and the originating scroll position when returning from a detail view. Announce meaningful result counts after interaction without announcing every intermediate keystroke.

Tables can scroll horizontally within a labeled region for inherently comparative matrices, with a visible affordance and keyboard access. Ordinary roster views use the responsive representations in section 4. Never allow accidental page-level horizontal scrolling.

### 7.4 Depth chart

Drag handles are supplementary. Every assignment also offers Move up, Move down, and/or Assign to slot controls. A successful change announces player and destination and retains focus on the moved item. Keyboard-only users must be able to complete every assignment. Domain rules explain prohibited assignments and never silently discard them.

### 7.5 Ratings, stats, and scouting

The OVR helper accepts only valid known values. Unknown ratings display an em dash with “Overall not known.” Bars repeat their numeric meaning in text and may be `aria-hidden` when redundant.

Use separate data states: Known, Estimated, Unscouted, Unavailable, Not applicable. Estimates display a range or an approximate marker and a label such as “Estimated OVR 72–78.” Scouting completion (“60% scouted”) is not a probability that an estimate is correct. Show confidence only if the engine actually models it, with an explanation of the model's meaning.

Scouted percentage, projected round, measured attributes, and development knowledge have independent fields. Never infer hidden potential from an OVR color. Unknown bars remain empty and labeled; they do not show a 0% value or a low-quality color.

Morale uses a labeled `<meter>` or a complete accessible equivalent, plus a word. Trend charts include time labels and readable values. Cap bars provide a text legend with amounts; overflow beyond a cap is shown explicitly rather than hidden by clipping.

### 7.6 Canonical cards

- **Next game and game plan:** week, opponent identifier, both records, a labeled probability only if modeled, the game plan's status (Auto or Custom), and Set game plan.
- **Roster and injuries:** injured and questionable players first, then key starters, each with position, full-name link, OVR, and status; Open roster links to the full screen.
- **Featured player:** one decorated header, current ability, development, age, current-year cap hit, years remaining, health, and a small set of relevant attributes.
- **Staff:** role, name, ability rating, scheme, and concise ability effects. Detailed level progression lives in the staff screen.
- **Prospect:** position, school, projected round, completion, known/estimated measures, hidden information explanation, and Assign scout.
- **Trade offer:** source team, expiry, You give/You receive lists, roster/cap consequences, and Accept/Counter/Decline. Show a value estimate as an estimate rather than an authoritative guarantee.
- **Inbox:** labeled event type, concise subject, summary, simulation date/week, and read state.

### 7.7 Dialogs and feedback

Use native `<dialog>` with `showModal()` in supported target browsers. It provides the modal focus boundary; supply a title, sensible initial focus, Escape behavior, and focus restoration. Keep the body scrollable within the viewport, with visible actions and safe-area padding. Phone dialogs become bottom sheets. A custom fallback must implement equivalent focus/inert behavior before it is considered supported.

Toasts announce completed actions with a polite status region. Routine noninteractive confirmations may disappear after five seconds. Errors, decisions, Undo actions, and information necessary to continue remain available until dismissed or in a persistent activity log. Do not put urgent choices in an auto-disappearing toast. Pause dismissal while hovered or keyboard focus is inside.

Tooltips are supplemental, available on hover and focus, dismissible with Escape, and never the only way to learn an essential value or disabled reason. Empty states distinguish no data from no matching results. Loading and simulation states retain context and show progress only when progress can be measured. Respect reduced motion.

### 7.8 Offline preferences and persistence

Keep UI preferences in a separate object from saved franchise state. Storage failure falls back to in-memory preferences for the current session; it must not prevent theme/layout changes. If game saving fails, display a persistent actionable message and offer export where available. Never interpret a failed preference write as a successful franchise save.

Theme supports System, Day, and Night. System follows later OS changes. Apply stored preferences before first paint where possible. Layout and density changes do not recreate or reset game state.

---

## 8. Accessibility

- Meet WCAG 2.2 AA as the release target. Normal text needs 4.5:1; qualifying large text needs 3:1. Meaningful custom control boundaries, focus indicators, and state graphics need 3:1 against relevant adjacent backgrounds. Do not apply control requirements indiscriminately to decorative lines.
- Test actual foreground/background pairs in default, hover, selected, error, and focus states, across all team themes. Font weight does not compensate for insufficient contrast.
- Keep focus visible on surfaces, team headers, dialogs, and slanted controls. Never clip it at card boundaries; allow focus space or an inset treatment.
- Use native semantics first. Add ARIA only for meaning not already provided. Do not describe every link as a button.
- Include a skip link, page heading, named navigation, and a main landmark. When changing screen, move focus to its heading unless returning to a prior control is more helpful.
- Keep DOM, reading, and keyboard order aligned. Do not use dense grid placement to backfill cards.
- Honor the project's 44/48px target policy, including switches, checkboxes, icon buttons, and segment labels. This is the project's usability policy, not a claim that every WCAG criterion uses those exact sizes.
- Support 200% text enlargement and reflow at a 320 CSS-pixel viewport. Essential tables may use their own documented horizontal scrolling region.
- Test keyboard-only operation, a representative screen reader, coarse pointers, reduced motion, and forced-colors mode. A decorative cutout must not hide a button when backgrounds are replaced.

---

## 9. Copy, numbers, and uncertainty

Use direct, consistent action names. Errors explain what happened and how to recover. Simulation time and real time are distinct: “Week 7” and “2026 season” refer to the franchise, while “Saved just now” refers to the local save.

| Data | Display rule | Example |
|---|---|---|
| Current cap hit | Explicit label, compact money | “2026 cap hit: $42.5M” |
| Annual average | Explicitly AAV | “AAV: $40.0M” |
| Contract total | Total plus length | “Total: $120.0M over 3 years” |
| Years remaining | Label independently | “3 years remaining” |
| Small money values | Use K rather than $0.0M | “$850K” |
| Exact contract detail | Whole-dollar detail available in dialog | “$42,500,000” |
| Record | Wins–losses, include ties when present | “5–1” or “5–1–1” |
| Estimated value | Label as estimated; include range when modeled | “Estimated OVR 72–78” |
| Unknown value | Em dash plus explanation | “— · Not yet scouted” |
| No value applies | Explicit state | “Not applicable” |
| Beneficial / unfavorable delta | Meaning controls color, sign controls text | “+$2.0M dead money” is unfavorable |

Never use `$42.5M × 3` without explaining whether the number is annual value, total value, or cap hit. Comparison and acceptance dialogs show the exact values needed for the decision. Compact display rounding does not change underlying calculations.

Opponents must be unambiguous: city alone is insufficient for New York and Los Angeles. Use the full team name or a unique team abbreviation where space is limited. Source names remain fictional in examples and preserve their punctuation/diacritics.

---

## 10. Reference data

These fixtures demonstrate the UI contract, not a complete franchise or a verified financial model. Money is stored as integer dollars. Known OVR and unknown OVR have different data representations. Contract consequences must come from the game engine.

```js
const SAMPLE_ROSTER = [
  { id: 'p001', pos: 'QB', number: 12, name: 'Marcus Hale', age: 27, ovr: 91, development: 'X-Factor', capHit: 42500000, yearsRemaining: 3, status: 'Healthy', side: 'Offense', attrs: [['Arm strength',94],['Accuracy',92],['Awareness',90],['Poise',95]] },
  { id: 'p002', pos: 'EDGE', number: 99, name: 'Isaiah Moreau', age: 26, ovr: 93, development: 'Superstar', capHit: 31000000, yearsRemaining: 4, status: 'Healthy', side: 'Defense', attrs: [['Pass rush',95],['Power',90],['Speed',88],['Motor',94]] },
  { id: 'p003', pos: 'WR', number: 18, name: 'Deshawn Price', age: 24, ovr: 88, development: 'Star', capHit: 4100000, yearsRemaining: 1, status: 'Questionable', side: 'Offense', attrs: [['Speed',94],['Route running',89],['Hands',87],['Release',85]] },
  { id: 'p004', pos: 'LT', number: 72, name: 'Tom Brekke', age: 31, ovr: 84, development: 'Normal', capHit: 19800000, yearsRemaining: 2, status: 'Healthy', side: 'Offense', attrs: [['Pass block',88],['Run block',83],['Strength',90],['Awareness',85]] },
  { id: 'p005', pos: 'S', number: 31, name: 'Kareem Dole', age: 29, ovr: 82, development: 'Normal', capHit: 9600000, yearsRemaining: 2, status: 'Healthy', side: 'Defense', attrs: [['Zone coverage',86],['Tackling',84],['Speed',85],['Hit power',80]] },
  { id: 'p006', pos: 'CB', number: 24, name: 'Jalen Ortiz', age: 22, ovr: 68, development: 'Superstar', capHit: 1200000, yearsRemaining: 3, status: 'Healthy', side: 'Defense', attrs: [['Man coverage',67],['Speed',92],['Zone coverage',64],['Press',70]] },
  { id: 'p007', pos: 'K', number: 3, name: 'Nils Åberg', age: 34, ovr: 68, development: 'Normal', capHit: 2900000, yearsRemaining: 1, status: 'Out', side: 'Special teams', attrs: [['Kick power',88],['Accuracy',70],['Composure',61],['Durability',52]] }
];
const SAMPLE_PROSPECT = {
  id: 'd001', name: 'André Thompson-Williams Jr.', pos: 'WR', school: 'North Valley State',
  overall: { state: 'estimated', min: 72, max: 78 },
  scoutingCompletion: 60, projectedRound: '2–3',
  development: { state: 'unscouted', value: null },
  fortyTime: { state: 'known', value: 4.42, unit: 'seconds' },
  benchReps: { state: 'unavailable', value: null, reason: 'Did not participate' }
};
const SAMPLE_STAFF = [
  { id: 's001', role: 'Offensive coordinator', name: 'Dana Okafor', rating: 84, scheme: 'West Coast', ability: 'QB whisperer', effect: 'Quarterbacks gain +2 progression each offseason.' },
  { id: 's002', role: 'Director of scouting', name: 'Omar Lindqvist', rating: 81, ability: 'Small-school eye', effect: 'Reveals hidden traits on eligible day-3 prospects.' }
];
```

---

## 11. Canonical screen markup

This is an offline UI reference with Home, Roster, Player detail, Settings, Comparison, and a contract-preview dialog. Its reduced navigation only includes implemented reference destinations. The full game uses the destinations in section 4.4; never ship nonfunctional navigation as if it worked.

Assembly: replace `/* SECTION_12_CSS */` with section 12; insert the font block at the font markers; replace `/* SECTION_10_DATA */` with section 10 and `/* SECTION_13_JS */` with section 13. Keep all three scripts/styles inline in the delivered HTML. Run font embedding after assembly. The reference contains no external assets.

The reference contract dialog previews entered terms. It never claims to send an offer or computes an NFL cap hit from total value alone. In the game, replace that adapter with validated domain calculations and an explicit Send offer action.

```html
<!doctype html>
<html lang="en" data-theme="day" data-layout="phone" data-density="comfortable">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Franchise GM — F2 reference</title>
  <script>
    // Set initial preferences before paint; all input is validated again in section 13.
    (() => {
      let p = {}; try { p = JSON.parse(localStorage.getItem('gm.ui.v2') || '{}') || {}; } catch {}
      const root = document.documentElement;
      root.dataset.theme = p.theme === 'day' || p.theme === 'night' ? p.theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
      root.dataset.density = p.density === 'compact' ? 'compact' : 'comfortable';
      const w = innerWidth, h = innerHeight;
      const auto = Math.min(w, h) < 520 ? 'phone' : w >= 1100 && w / h >= 1.2 ? 'desktop' : 'tablet';
      root.dataset.layout = ['phone','tablet','desktop'].includes(p.layout) ? p.layout : auto; // manual choice always honored
    })();
  </script>
  <style>
/* FONTS:START */
/* FONTS:END */
/* SECTION_12_CSS */
  </style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="app">
  <nav class="sidebar on-team" aria-label="Main">
    <div class="sidebar-brand"><span class="twill twill-sm" data-team-abbr aria-hidden="true">MIN</span><strong data-team-name>Minnesota Vikings</strong><span>2026 season · Week 7</span></div>
    <div class="sidebar-items"><a class="nav-item" href="#home">Home</a><a class="nav-item" href="#roster">Roster</a></div>
    <button class="btn btn-outline" data-open="settingsDialog">Settings</button>
  </nav>
  <header class="topbar on-team"><span class="topbar-title">Franchise GM</span><button class="btn btn-outline" data-open="settingsDialog">Settings</button></header>
  <nav class="rail" aria-label="Main"><a href="#home">Home</a><a href="#roster">Roster</a></nav>
  <main class="main" id="main" tabindex="-1">
    <section class="view" id="view-home" aria-labelledby="homeTitle">
      <div class="page-head"><div class="nameplate"><span class="nameplate-tag">5–1 · 1st in NFC North</span><h1 class="nameplate-name nameplate-title" id="homeTitle" tabindex="-1">Team hub</h1></div></div>
      <div class="cards-host"><div class="cards">
        <section class="card"><div class="signbar"><h2 class="signbar-title">Next game and game plan</h2></div><div class="card-body"><p class="label">Week 7 · Away</p><p class="hero-title">Detroit Lions</p><p>Your record: 5–1 · Detroit: 4–2</p><p class="muted">Game plan: Auto, tailored to Detroit.</p><a class="btn btn-primary" href="#roster">Review roster</a></div></section>
        <section class="card span-2"><div class="signbar"><h2 class="signbar-title">Roster and injuries</h2><a class="signbar-arrow" href="#roster">Open roster</a></div><div class="card-body"><ul class="preview-list" id="rosterPreview"></ul></div></section>
        <section class="card"><div class="signbar"><h2 class="signbar-title">Inbox</h2></div><div class="card-body"><p><strong>Injury update</strong></p><p>Nils Åberg is out. Review special teams assignments before advancing.</p><a href="#player/p007">View Nils Åberg</a></div></section>
        <section class="card"><div class="signbar"><h2 class="signbar-title">Division standings</h2></div><div class="card-body"><div class="standing-row is-us"><span>Minnesota</span><span class="num">5–1</span></div><div class="standing-row"><span>Detroit</span><span class="num">4–2</span></div><div class="standing-row"><span>Green Bay</span><span class="num">3–3</span></div><div class="standing-row"><span>Chicago</span><span class="num">2–4</span></div></div></section>
        <section class="card"><div class="signbar"><h2 class="signbar-title">Cap summary</h2></div><div class="card-body"><span class="label">2026 cap space</span><p class="big-number">$18.4M</p><p class="muted">Dead money: $6.2M</p><p class="small">Review exact contract consequences before making an offer.</p></div></section>
        <section class="card"><div class="signbar"><h2 class="signbar-title">Featured player</h2></div><div class="card-body"><p class="hero-title">Marcus Hale</p><p>QB · #12 · 91 OVR</p><p class="muted">2026 cap hit: $42.5M</p><a class="btn btn-solid" href="#player/p001">View player</a></div></section>
        <section class="card"><div class="signbar"><h2 class="signbar-title">Staff</h2></div><div class="card-body"><strong>Dana Okafor</strong><p class="muted">Offensive coordinator · 84 rating</p><p>QB whisperer: quarterbacks gain +2 progression each offseason.</p></div></section>
      </div></div>
    </section>
    <section class="view" id="view-roster" aria-labelledby="rosterTitle" hidden>
      <div class="page-head"><h1 class="nameplate-name nameplate-title" id="rosterTitle" tabindex="-1">Roster</h1><p class="muted">2026 cap hits shown</p></div>
      <div class="filterbar">
        <div class="field"><label for="rosterQuery">Search players</label><input class="input" id="rosterQuery" type="search" autocomplete="off"></div>
        <div class="field"><label for="rosterSide">Unit</label><select class="select" id="rosterSide"><option>All</option><option>Offense</option><option>Defense</option><option>Special teams</option></select></div>
        <div class="field"><label for="rosterSort">Sort</label><select class="select" id="rosterSort"><option value="ovr:desc">Overall: high to low</option><option value="ovr:asc">Overall: low to high</option><option value="name:asc">Name: A–Z</option><option value="name:desc">Name: Z–A</option></select></div>
      </div>
      <p id="rosterCount" role="status" aria-live="polite"></p>
      <div class="inline"><button class="btn btn-solid" id="compareBtn" aria-describedby="selectionNote" disabled>Compare players</button><button class="btn btn-outline" id="clearSelection">Clear selection</button><span class="hint" id="selectionNote">Select 2–4 players to compare.</span></div>
      <div class="roster-region">
        <table class="roster-table"><caption class="sr-only">Roster, current overall ratings and 2026 cap hits</caption><thead><tr>
          <th class="selection-col" scope="col">Select</th><th class="pos-col" scope="col">Pos</th><th scope="col" data-sort-heading="name"><button class="sort-btn" data-sort="name">Player</button></th><th class="wide age-col" scope="col">Age</th><th class="ovr-col" scope="col" data-sort-heading="ovr"><button class="sort-btn" data-sort="ovr">OVR</button></th><th class="wide dev-col" scope="col">Development</th><th class="wide cap-col" scope="col">Cap hit</th><th class="status-col" scope="col">Status</th>
        </tr></thead><tbody id="rosterBody"></tbody></table>
        <ul class="roster-list" id="rosterList" aria-label="Roster"></ul>
      </div>
      <p class="empty" id="rosterEmpty" hidden>No players match these filters. Clear the search or choose All units.</p>
    </section>
    <section class="view" id="view-player" aria-labelledby="playerTitle" hidden>
      <p><a href="#roster">Back to roster</a></p>
      <article class="card"><div class="player-head on-team"><div class="nameplate"><span class="nameplate-tag" id="playerTag"></span><h1 class="nameplate-name nameplate-on-team" id="playerTitle" tabindex="-1"></h1></div><span class="twill" id="playerNumber" aria-hidden="true"></span></div><div class="stripes" aria-hidden="true"><i></i><i></i><i></i></div><div class="card-body"><div class="stat-grid" id="playerStats"></div><h2>Attributes</h2><div class="stack" id="playerAttrs"></div><div class="btn-row"><button class="btn btn-primary" id="contractBtn">Review contract terms</button></div></div></article>
    </section>
  </main>
  <nav class="tabbar" aria-label="Main"><a href="#home">Home</a><a href="#roster">Roster</a><button data-open="settingsDialog">Settings</button></nav>
</div>
<dialog id="settingsDialog" aria-labelledby="settingsTitle"><div class="dialog-frame">
  <div class="dialog-head on-team"><h2 class="dialog-title" id="settingsTitle">Settings</h2><button class="btn btn-outline" data-close>Close</button></div>
  <div class="dialog-body">
    <div class="field"><label for="themeSel">Appearance</label><select class="select" id="themeSel"><option value="system">System</option><option value="day">Day</option><option value="night">Night</option></select></div>
    <div class="field"><label for="layoutSel">Layout</label><select class="select" id="layoutSel"><option value="auto">Auto</option><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select><p class="hint" id="layoutNote" role="status"></p></div>
    <div class="field"><label for="densitySel">Density</label><select class="select" id="densitySel"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
    <div class="field"><label for="teamSel">Preview team colors</label><select class="select" id="teamSel"></select><p class="hint">Changes appearance. The example franchise remains Minnesota.</p></div>
  </div>
</div></dialog>
<dialog id="compareDialog" aria-labelledby="compareTitle"><div class="dialog-frame"><div class="dialog-head on-team"><h2 class="dialog-title" id="compareTitle">Compare players</h2><button class="btn btn-outline" data-close>Close</button></div><div class="dialog-body"><p class="hint">Scroll the comparison horizontally to see all selected players.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Player comparison" id="comparison"></div></div></div></dialog>
<dialog id="contractDialog" aria-labelledby="contractTitle"><div class="dialog-frame">
  <div class="dialog-head on-team"><h2 class="dialog-title" id="contractTitle">Preview contract terms</h2><button class="btn btn-outline" data-close>Close</button></div>
  <form class="dialog-body" id="contractForm">
    <p id="contractPlayer"></p>
    <div class="field"><label for="contractTotal">Total contract value, dollars</label><input class="input" id="contractTotal" type="number" min="0" max="9999999999" step="1" required aria-describedby="contractHint contractError"></div>
    <div class="field"><label for="contractYears">Contract length, years</label><input class="input" id="contractYears" type="number" min="1" max="7" step="1" required aria-describedby="contractError"></div>
    <p class="hint" id="contractHint">This preview calculates average annual value. Cap hit and guarantees require the complete contract structure.</p>
    <p class="field-error" id="contractError" role="alert" hidden></p>
    <output class="stack" id="contractOutput" aria-live="polite"></output>
    <div class="btn-row"><button class="btn btn-primary" type="submit">Calculate preview</button><button class="btn btn-outline" type="button" data-close>Cancel</button></div>
  </form>
</div></dialog>
<div class="toast-region" id="toastRegion" aria-live="polite" aria-atomic="false"></div>
<script>
/* SECTION_10_DATA */
/* SECTION_13_JS */
</script>
</body>
</html>
```

---

## 12. Reference stylesheet

Component classes are shared across the reference screens. Token aliases preserve the original F2 vocabulary where useful. State styling follows semantic classes and native states. Breakpoints and geometry constants are centralized in this stylesheet; screen code must not duplicate them.

```css
/* 12.1 Shared primitives and component defaults */
:root {
  --white: #FFFFFF; --black: #000000; --ink: #111418;
  --team: #4F2683; --on-team: var(--white); --accent: #FFC62F; --on-accent: var(--black);
  --font-display: 'Barlow Condensed', 'Bahnschrift Condensed', 'Avenir Next Condensed', 'Arial Narrow', sans-serif;
  --font-ui: 'Overpass', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  --s1: .25rem; --s2: .5rem; --s3: .75rem; --s4: 1rem; --s5: 1.25rem;
  --s6: 1.5rem; --s7: 2rem; --s8: 3rem; --s9: 4rem; --optical-y: .125rem;
  --radius: .375rem; --radius-sm: .25rem; --radius-seg: .5rem;
  --fs-display: 4.5rem; --fs-title: 2.75rem; --fs-name: 2.125rem;
  --fs-section: 1.375rem; --fs-card: 1.25rem; --fs-data: 1.375rem;
  --fs-body: 1rem; --fs-small: .875rem; --fs-label: .8125rem;
  --fs-big: 3rem; --fs-twill: 6rem; --fs-plate: 2.5rem;
  --tap: 2.75rem; --row-h: 3.5rem; --row-pad: var(--s3);
  --pad: var(--s7); --gap: var(--s6); --card-pad: var(--s5);
  --sidebar-w: 15rem; --rail-w: 5.25rem; --tabbar-h: 4.25rem;
  --slant: .625rem; --focus-width: 3px; --focus-offset: 3px;
  --shadow-toast: 0 6px 18px rgb(0 0 0 / .18);
  --shadow-dialog: 0 16px 40px rgb(0 0 0 / .35);
  --backdrop: rgb(0 0 0 / .62); --z-nav: 10; --z-toast: 30;
  --motion-fast: 150ms; --hover-overlay: rgb(0 0 0 / .035);
  --success: #1E7A45; --warning: #F0B429; --danger: #C8322A;
  --on-success: var(--white); --on-warning: var(--black); --on-danger: var(--white);
  --action-primary-bg: var(--accent); --action-primary-text: var(--on-accent);
  --rating-elite-bg: var(--accent); --rating-elite-text: var(--on-accent);
  --development-bg: var(--accent); --development-text: var(--on-accent);
  --nav-active-bg: var(--accent); --nav-active-text: var(--on-accent);
  --focus-on-team: var(--white);
}
:root, [data-theme='day'] {
  color-scheme: light;
  --ground: #F2F3F6; --surface: #FFFFFF; --surface-2: #ECEFF3;
  --line: #DEE2E8; --border: #D3D8E1; --control-border: #737B89;
  --text: #161A22; --text-2: #4F5867; --focus: #161A22;
  --selection-bg: #F2EDF6; --selection-text: #161A22; --selection-indicator: #4F2683;
  --bar: var(--team); --bar-text: var(--on-team);
  --plate: var(--team); --plate-text: var(--on-team);
  --action-secondary-bg: var(--team); --action-secondary-text: var(--on-team);
  --tier-starter-bg: var(--team); --tier-starter-text: var(--on-team); --tier-starter-border: transparent;
  --tier-depth-bg: transparent; --tier-depth-text: var(--text); --tier-depth-border: var(--text-2);
  --tier-low-bg: var(--surface-2); --tier-low-text: var(--text);
  --sidebar: var(--team); --toast: #161A22; --toast-text: var(--white);
  --success-text: #196638; --danger-text: #B42318;
}
[data-theme='night'] {
  color-scheme: dark;
  --ground: var(--dk-ground, #160B25); --surface: var(--dk-panel, #211037);
  --surface-2: var(--dk-raised, #2E164C); --line: var(--dk-rule, #3B1D62); --border: var(--line);
  --control-border: #9DA5B4; --text: #FFFFFF; --text-2: var(--dk-tint, #CEC2DC); --focus: #FFFFFF;
  --selection-bg: var(--dk-raised, #2E164C); --selection-text: #FFFFFF; --selection-indicator: #FFFFFF;
  --bar: var(--surface-2); --bar-text: var(--white); --plate: var(--white); --plate-text: var(--ink);
  --action-secondary-bg: var(--white); --action-secondary-text: var(--ink);
  --tier-starter-bg: var(--n-starter-bg, #FFFFFF); --tier-starter-text: var(--n-starter-text, #111418);
  --tier-starter-border: var(--n-starter-border, transparent);
  --tier-low-bg: var(--surface-2); --tier-low-text: var(--white);
  --sidebar: var(--surface); --toast: #FFFFFF; --toast-text: #111418;
  --success-text: #6EE7A0; --danger-text: #FF9B9B; --hover-overlay: rgb(255 255 255 / .05);
}
[data-density='compact'] { --row-h: 2.75rem; --row-pad: var(--s1); --card-pad: var(--s4); }
[data-layout='phone'] {
  --pad: var(--s4); --gap: var(--s3); --tap: 3rem; --row-h: 3.5rem;
  --fs-title: 1.875rem; --fs-name: 1.75rem; --fs-section: 1.25rem;
  --fs-card: 1.125rem; --fs-data: 1.125rem; --fs-twill: 4.5rem; --fs-display: 2.5rem;
}
@media (any-pointer: coarse) { :root { --tap: 3rem; --row-h: 3.5rem; --row-pad: var(--s3); } }
/* 12.2 Base and focus */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--ground); color: var(--text); font: var(--fs-body)/1.5 var(--font-ui); }
button, input, select, textarea { font: inherit; color: inherit; }
button, select, input[type='checkbox'], input[type='radio'] { cursor: pointer; }
button:disabled { cursor: not-allowed; }
a { color: inherit; text-underline-offset: .18em; }
button, a, input, select, textarea { touch-action: manipulation; }
:focus-visible { outline: var(--focus-width) solid var(--focus); outline-offset: var(--focus-offset); }
[hidden] { display: none !important; }
h1, h2, h3, p { margin: 0; }
svg { flex-shrink: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.skip-link { position: fixed; z-index: 100; top: var(--s2); left: var(--s2); padding: var(--s3); background: var(--surface); transform: translateY(-200%); }
.skip-link:focus { transform: none; }
.num, .value { font-variant-numeric: tabular-nums; }
.muted, .hint { color: var(--text-2); }
.hint, .small { font-size: var(--fs-small); }
.label { color: var(--text-2); font-size: var(--fs-label); font-weight: 700; }
.stack { display: flex; flex-direction: column; gap: var(--s4); }
.inline { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); }
.on-team { background: var(--team); color: var(--on-team); --focus: var(--focus-on-team); }
.on-team .muted, .on-team .label { color: var(--on-team); }
/* 12.3 Shell */
.app { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: var(--sidebar-w) minmax(0,1fr); grid-template-areas: 'side top' 'side main'; grid-template-rows: auto 1fr; }
.sidebar { grid-area: side; position: sticky; top: 0; align-self: start; max-height: 100vh; max-height: 100dvh; overflow-y: auto; padding: var(--s5); background: var(--sidebar); color: var(--white); --focus: var(--white); }
.sidebar-brand { display: flex; flex-direction: column; gap: var(--s2); padding-bottom: var(--s5); border-bottom: 4px solid var(--accent); }
.sidebar-items { display: flex; flex-direction: column; gap: var(--s2); padding-block: var(--s4); }
.nav-item { display: flex; gap: var(--s3); align-items: center; min-height: var(--tap); padding: var(--s2) var(--s3); text-decoration: none; border-radius: var(--radius-sm); }
.nav-item[aria-current='page'] { background: var(--nav-active-bg); color: var(--nav-active-text); font-weight: 800; }
.nav-item[aria-current='page']::before { content: ''; width: 4px; align-self: stretch; background: currentColor; }
.topbar { grid-area: top; position: sticky; top: 0; z-index: var(--z-nav); border-bottom: 4px solid var(--accent); padding: var(--s2) var(--pad); display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); }
.topbar-title { flex: 1; font-family: var(--font-display); font-weight: 700; font-size: var(--fs-section); text-transform: uppercase; }
.main { grid-area: main; min-width: 0; padding: var(--pad); }
.view { display: flex; flex-direction: column; gap: var(--gap); }
.rail, .tabbar { display: none; }
[data-layout='tablet'] .app { grid-template-columns: var(--rail-w) minmax(0,1fr); grid-template-areas: 'top top' 'rail main'; }
[data-layout='tablet'] .sidebar, [data-layout='phone'] .sidebar { display: none; }
[data-layout='tablet'] .rail { grid-area: rail; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s2); align-self: start; }
.rail a { min-height: var(--tap); padding: var(--s2); font-size: var(--fs-label); text-align: center; overflow-wrap: anywhere; }
.rail a[aria-current='page'] { background: var(--nav-active-bg); color: var(--nav-active-text); font-weight: 800; }
[data-layout='phone'] .app { grid-template-columns: minmax(0,1fr); grid-template-areas: 'top' 'main'; }
[data-layout='phone'] .main { padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom,0px) + var(--pad)); }
[data-layout='phone'] .tabbar { display: flex; position: fixed; z-index: var(--z-nav); inset: auto 0 0; min-height: calc(var(--tabbar-h) + env(safe-area-inset-bottom,0px)); padding-bottom: env(safe-area-inset-bottom,0px); background: var(--surface); border-top: 1px solid var(--border); }
.tabbar > * { flex: 1; min-width: 0; min-height: var(--tap); display: flex; justify-content: center; align-items: center; border: 0; background: transparent; text-align: center; padding: var(--s2); font-size: var(--fs-small); text-decoration: none; }
.tabbar [aria-current='page'] { border-top: 4px solid var(--selection-indicator); font-weight: 800; }
.page-head { display: flex; flex-wrap: wrap; gap: var(--s4); align-items: flex-end; justify-content: space-between; }
.cards-host { container-type: inline-size; container-name: dashboard; }
.cards { display: grid; gap: var(--gap); align-items: start; grid-template-columns: repeat(auto-fit,minmax(min(100%,19rem),1fr)); }
@container dashboard (min-width: 680px) { .cards .span-2 { grid-column: span 2; } }
/* 12.4 Cards and broadcast treatments */
.card { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.card-body { padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--s3); }
.signbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); background: var(--bar); color: var(--bar-text); padding: var(--s3) var(--s4); border-radius: var(--radius) var(--radius) 0 0; --focus: var(--white); }
.signbar-title { flex: 1; font: 700 var(--fs-section)/1.15 var(--font-display); text-transform: uppercase; }
.signbar-meta { font-size: var(--fs-small); }
.signbar-arrow { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); background: var(--accent); color: var(--on-accent); padding: var(--s2); font-weight: 800; }
.nameplate { display: flex; flex-direction: column; align-items: flex-start; gap: 0; min-width: 0; }
.nameplate-tag { padding: var(--s1) var(--s3); background: var(--accent); color: var(--on-accent); font-weight: 800; font-size: var(--fs-label); }
.nameplate-name { position: relative; isolation: isolate; padding: var(--s2) var(--s6) var(--s2) var(--s3); max-width: 100%; color: var(--plate-text); font: italic 800 var(--fs-name)/1.1 var(--font-display); text-transform: uppercase; overflow-wrap: anywhere; }
.nameplate-name::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--plate); clip-path: polygon(0 0,100% 0,calc(100% - var(--slant)) 100%,0 100%); }
.nameplate-title { font-size: var(--fs-title); }
.nameplate-on-team { --plate: var(--white); --plate-text: var(--ink); }
.twill { font: italic 800 var(--fs-twill)/1.1 var(--font-display); color: var(--accent); -webkit-text-stroke: 2px var(--white); paint-order: stroke fill; }
.twill-sm { font-size: var(--fs-big); }
.stripes { display: grid; grid-template-rows: 6px 3px 6px; }
.stripes i { background: var(--accent); } .stripes i:nth-child(2) { background: var(--white); }
.player-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s4); padding: var(--card-pad); border-radius: var(--radius) var(--radius) 0 0; }
.hero-title { font: italic 800 var(--fs-name)/1.1 var(--font-display); text-transform: uppercase; }
.big-number { font: italic 800 var(--fs-big)/1.1 var(--font-display); }
/* 12.5 Controls: the decorative layer can slant; the focusable element cannot */
.btn { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: var(--s2); min-width: var(--tap); min-height: var(--tap); padding: var(--s2) var(--s5); border: 2px solid transparent; background: transparent; color: var(--text); font-weight: 800; text-decoration: none; text-align: center; line-height: 1.35; }
.btn::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: var(--radius-sm); background: var(--btn-bg,transparent); transition: box-shadow var(--motion-fast); }
.btn-primary { --btn-bg: var(--action-primary-bg); color: var(--action-primary-text); }
.btn-solid { --btn-bg: var(--action-secondary-bg); color: var(--action-secondary-text); }
.btn-primary::before, .btn-solid::before { clip-path: polygon(var(--slant) 0,100% 0,calc(100% - var(--slant)) 100%,0 100%); }
.btn-outline { border-color: var(--control-border); border-radius: var(--radius-sm); }
.btn-text { padding-inline: var(--s2); text-decoration: underline; }
.btn-danger { --btn-bg: var(--danger); color: var(--on-danger); }
@media (hover: hover) { .btn:hover:not(:disabled)::before { box-shadow: inset 0 0 0 2px currentColor; } }
.btn:active:not(:disabled)::before { box-shadow: inset 0 0 0 3px currentColor; }
.btn:disabled { --btn-bg: var(--surface-2); color: var(--text-2); border-color: transparent; }
.btn[aria-busy='true'] { cursor: progress; }
.btn-block { width: 100%; }
.btn-row { display: flex; flex-wrap: wrap; gap: var(--s3); }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); padding: var(--s2); border: 1px solid var(--control-border); border-radius: var(--radius); background: var(--surface-2); color: var(--text); }
/* Context modifiers follow base controls. */
.on-team .btn-outline, .on-team .icon-btn { background: transparent; color: var(--on-team); border-color: var(--on-team); }
.field { display: flex; flex-direction: column; gap: var(--s2); }
.field > label, .field-label { font-weight: 700; }
.input, .select, textarea { min-width: 0; width: 100%; min-height: var(--tap); padding: var(--s2) var(--s3); border: 2px solid var(--control-border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: var(--fs-body); }
.input.is-error, [aria-invalid='true'] { border-color: var(--danger-text); }
.field-error { color: var(--danger-text); font-size: var(--fs-small); font-weight: 700; }
.check-target { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); gap: var(--s2); }
input[type='checkbox'], input[type='radio'] { width: 1.25rem; height: 1.25rem; accent-color: var(--selection-indicator); }
.switch { position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 4rem; min-height: var(--tap); border: 0; background: transparent; color: var(--text); }
.switch::before { content: ''; width: 3.5rem; height: 2rem; background: var(--surface-2); border: 2px solid var(--control-border); border-radius: 2rem; }
.switch::after { content: ''; position: absolute; left: .5rem; width: 1.5rem; height: 1.5rem; background: var(--text); border-radius: 50%; }
.switch[aria-checked='true']::before { background: var(--team); border-color: var(--selection-indicator); }
.switch[aria-checked='true']::after { left: 2rem; background: var(--white); }
.seg { display: flex; flex-wrap: wrap; gap: var(--s2); padding: var(--s1); border: 0; border-radius: var(--radius-seg); background: var(--surface-2); }
.seg label { display: inline-flex; align-items: center; gap: var(--s2); min-height: var(--tap); padding: var(--s2) var(--s3); }
.pill { display: inline-flex; align-items: center; gap: var(--s2); min-height: var(--tap); padding: var(--s2) var(--s4); border: 2px solid var(--control-border); border-radius: 999px; }
.stepper { display: flex; gap: var(--s2); } .stepper input { max-width: 7rem; }
.range { width: 100%; min-height: var(--tap); accent-color: var(--selection-indicator); }
/* 12.6 Ratings, tags and data */
.tier { display: inline-block; min-width: 3.25rem; padding: var(--s1) var(--s2); border: 2px solid transparent; text-align: center; font: italic 800 var(--fs-section)/1.1 var(--font-display); }
.tier-elite { background: var(--rating-elite-bg); color: var(--rating-elite-text); clip-path: polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%); }
.tier-starter { background: var(--tier-starter-bg); color: var(--tier-starter-text); border-color: var(--tier-starter-border); }
.tier-depth { background: var(--tier-depth-bg); color: var(--tier-depth-text); border-color: var(--tier-depth-border); }
.tier-low { background: var(--tier-low-bg); color: var(--tier-low-text); }
.tier-unknown { border-style: dashed; border-color: var(--text-2); color: var(--text-2); }
.tier-lg { font-size: var(--fs-plate); padding: var(--s2) var(--s4); }
.pos, .dev { display: inline-block; padding: var(--s1) var(--s2); font: 700 var(--fs-body)/1.4 var(--font-display); text-transform: uppercase; }
.pos { background: var(--surface-2); color: var(--text); }
.dev-xfactor { background: var(--development-bg); color: var(--development-text); }
.dev-superstar { background: var(--action-secondary-bg); color: var(--action-secondary-text); }
.dev-star { background: transparent; color: var(--text); box-shadow: inset 0 0 0 2px var(--control-border); }
.dev-normal, .chip { background: var(--surface-2); color: var(--text-2); }
.dev-unknown { background: transparent; color: var(--text-2); outline: 2px dashed var(--control-border); outline-offset: -2px; }
.chip, .status { display: inline-block; padding: var(--s1) var(--s2); border-radius: var(--radius-sm); font-size: var(--fs-label); font-weight: 700; }
.chip-warn { border: 2px solid var(--warning); }
.status-ok { background: var(--success); color: var(--on-success); }
.status-warn { background: var(--warning); color: var(--on-warning); }
.status-bad { background: var(--danger); color: var(--on-danger); }
.status-neutral { background: var(--surface-2); color: var(--text); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,10rem),1fr)); gap: var(--s4); }
.stat { display: flex; flex-direction: column; gap: var(--s1); }
.stat .value { font-size: var(--fs-data); font-weight: 800; }
.delta-good { color: var(--success-text); } .delta-bad { color: var(--danger-text); }
.attr { display: grid; grid-template-columns: minmax(7rem,1fr) minmax(3rem,2fr) auto; gap: var(--s3); align-items: center; }
.bar { height: .625rem; background: var(--surface-2); }
.bar > i { display: block; height: 100%; background: var(--text-2); }
.bar .tier-fill-elite { background: var(--rating-elite-bg); }
.bar .tier-fill-starter { background: var(--tier-starter-fill,var(--text-2)); }
.legend { display: flex; flex-wrap: wrap; gap: var(--s3); font-size: var(--fs-small); }
.morale { width: 100%; accent-color: var(--selection-indicator); }
.capbar, .winbar { display: flex; height: .875rem; background: var(--surface-2); }
.capbar .active, .winbar .us { background: var(--team); }
.capbar .dead { background: var(--danger); }
.depth-slot, .standing-row, .ability, .trade-side, .inbox-item { padding: var(--s3); border-bottom: 1px solid var(--line); }
.depth-slot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); min-height: var(--row-h); }
.standing-row { display: flex; justify-content: space-between; gap: var(--s3); }
.standing-row.is-us { background: var(--selection-bg); font-weight: 800; }
/* 12.7 Responsive roster */
.roster-region { container-type: inline-size; container-name: roster; min-width: 0; }
.roster-table { display: none; width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--fs-small); }
.roster-table th, .roster-table td { padding: var(--row-pad) var(--s2); text-align: left; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.roster-table thead { background: var(--surface-2); }
.roster-table .selection-col { width: 4rem; } .roster-table .pos-col { width: 3.5rem; }
.roster-table .ovr-col { width: 4.5rem; } .roster-table .status-col { width: 8rem; }
.roster-table .age-col { width: 3.5rem; } .roster-table .dev-col { width: 7rem; } .roster-table .cap-col { width: 7rem; }
.roster-table .wide { display: none; }
.roster-table .sort-btn { min-height: var(--tap); padding: var(--s1); background: transparent; color: inherit; border: 0; font-weight: 700; text-decoration: underline; }
.roster-table td .tier { min-width: 0; }
.roster-table tr.is-selected { background: var(--selection-bg); color: var(--selection-text); }
.roster-table tr.is-selected > :first-child { box-shadow: inset 3px 0 var(--selection-indicator); }
.roster-table a { font-weight: 700; }
.roster-table a, .list-name, .preview-list a { display: inline-flex; align-items: center; min-height: var(--tap); }
.roster-table a:focus-visible, .roster-table input:focus-visible { outline-offset: 1px; }
.roster-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s3); }
.list-row { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: var(--s2); align-items: center; padding: var(--s3); border: 1px solid var(--border); border-radius: var(--radius); min-height: var(--row-h); background: var(--surface); }
.list-row.is-selected { background: var(--selection-bg); border-color: var(--selection-indicator); }
.list-main { min-width: 0; overflow-wrap: anywhere; }
.list-name { font-weight: 700; } .list-sub { color: var(--text-2); font-size: var(--fs-small); }
@container roster (min-width: 640px) { .roster-table { display: table; } .roster-list { display: none; } }
@container roster (min-width: 960px) { .roster-table .wide { display: table-cell; } }
.preview-list { list-style: none; padding: 0; margin: 0; }
.preview-list li { display: flex; flex-wrap: wrap; gap: var(--s3); align-items: center; padding: var(--s3) 0; border-bottom: 1px solid var(--line); }
.preview-list a { flex: 1; min-width: 8rem; }
.filterbar { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,12rem),1fr)); gap: var(--s4); }
.table-scroll { overflow-x: auto; padding: var(--s1); }
.compare-table { border-collapse: collapse; min-width: 32rem; width: 100%; }
.compare-table th, .compare-table td { padding: var(--s3); text-align: left; border-bottom: 1px solid var(--line); }
/* 12.8 Dialogs and feedback */
dialog { width: min(36rem,calc(100% - 2rem)); max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem); margin: auto; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-dialog); }
dialog::backdrop { background: var(--backdrop); }
.dialog-frame { display: flex; flex-direction: column; max-height: inherit; }
.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); padding: var(--s4); }
.dialog-title { font: italic 800 var(--fs-section)/1.1 var(--font-display); text-transform: uppercase; }
.dialog-body { padding: var(--s5); overflow-y: auto; overscroll-behavior: contain; min-height: 0; display: flex; flex-direction: column; gap: var(--s4); }
.dialog-actions { padding: var(--s4); display: flex; flex-wrap: wrap; gap: var(--s3); border-top: 1px solid var(--line); }
.kv { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s3); }
[data-layout='phone'] dialog { width: 100%; max-width: 100%; max-height: calc(100dvh - var(--s4)); margin: auto 0 0; border-radius: var(--radius-seg) var(--radius-seg) 0 0; padding-bottom: env(safe-area-inset-bottom,0px); }
[data-layout='phone'] .dialog-actions { flex-direction: column; }
.toast-region { position: fixed; z-index: var(--z-toast); right: var(--s4); bottom: var(--s4); width: min(24rem,calc(100% - 2rem)); display: flex; flex-direction: column; gap: var(--s2); }
[data-layout='phone'] .toast-region { bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom,0px) + var(--s4)); }
.toast { display: flex; align-items: center; gap: var(--s3); padding: var(--s3); border-radius: var(--radius); background: var(--toast); color: var(--toast-text); box-shadow: var(--shadow-toast); --focus: currentColor; }
.empty { padding: var(--s6); border: 2px dashed var(--border); border-radius: var(--radius); text-align: center; }
.skeleton { min-height: var(--row-h); background: var(--surface-2); }
.tooltip { max-width: 18rem; padding: var(--s3); border-radius: var(--radius-sm); background: var(--toast); color: var(--toast-text); font-size: var(--fs-small); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
@media (forced-colors: active) {
  .btn, .tier, .nav-item[aria-current='page'], .signbar-arrow { border: 2px solid ButtonText; }
  .btn::before, .nameplate-name::before { clip-path: none; }
  .tier-elite { clip-path: none; }
  .twill { -webkit-text-stroke: 0; color: CanvasText; }
  :focus-visible { outline-color: Highlight; }
}
```

---

## 13. Reference JavaScript

Place this script after the fixture data and markup as shown in section 11. The small preference bootstrap in the head sets the initial theme; this code computes all team values and manages UI state. For a production build, run the theme helpers before first paint as part of the inline bootstrap to avoid a brief default-team color flash.

`computeTeamTokens()` is a pure function for theme checks. DOM rendering uses `textContent` for user-derived labels and names. No player name, scouting label, or imported text is inserted into an HTML string. Runtime preferences work even if local storage is unavailable.

```js
// 13.1 Pure color helpers. These can be checked without a browser.
function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) throw new TypeError('Expected an opaque hex color');
  let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0,2,4].map(i => parseInt(h.slice(i,i+2),16));
}
function mix(a,b,t) {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('Mix amount must be 0–1');
  const x=hexToRgb(a), y=hexToRgb(b);
  return '#' + x.map((v,i) => Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function luminance(hex) {
  const c=hexToRgb(hex).map(v => { v/=255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
function contrast(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
function readableText(bg) { return contrast(bg,'#000000') >= contrast(bg,'#FFFFFF') ? '#000000' : '#FFFFFF'; }
function uiPrimary(hex) {
  for (let i=0;i<=100;i++) { const p=mix(hex,'#000000',i/100); if (contrast(p,'#FFFFFF')>=4.5) return p; }
  return '#000000';
}
function colorAgainst(color,backgrounds,target=3) {
  const passes=c => backgrounds.every(bg => contrast(c,bg)>=target);
  if (passes(color)) return color;
  const endpoints=['#000000','#FFFFFF'].sort((a,b) => Math.min(...backgrounds.map(bg=>contrast(b,bg)))-Math.min(...backgrounds.map(bg=>contrast(a,bg))));
  for (const end of endpoints) for (let i=1;i<=100;i++) { const c=mix(color,end,i/100); if(passes(c)) return c; }
  throw new Error('No single color satisfies these backgrounds; use a contextual or two-color indicator');
}
function liftToLuminance(hex,target) {
  // Lighten toward white in 1% steps until relative luminance reaches the target.
  for (let i=0;i<=100;i++) { const c=mix(hex,'#FFFFFF',i/100); if (luminance(c)>=target) return c; }
  return '#FFFFFF';
}
function saturation(hex) { const c=hexToRgb(hex), hi=Math.max(...c); return hi===0 ? 0 : (hi-Math.min(...c))/hi; }

// 13.2 Team input data. Brand-reference metadata is deliberately separate from computed UI values.
const TEAM_COLORS = {
  ARI: { city: 'Arizona', name: 'Cardinals', conf: 'NFC', div: 'West', primary: '#97233F', accent: '#FFB612' },
  ATL: { city: 'Atlanta', name: 'Falcons', conf: 'NFC', div: 'South', primary: '#A71930', accent: '#A5ACAF' },
  BAL: { city: 'Baltimore', name: 'Ravens', conf: 'AFC', div: 'North', primary: '#241773', accent: '#9E7C0C' },
  BUF: { city: 'Buffalo', name: 'Bills', conf: 'AFC', div: 'East', primary: '#00338D', accent: '#C60C30' },
  CAR: { city: 'Carolina', name: 'Panthers', conf: 'NFC', div: 'South', primary: '#101820', accent: '#0085CA' },
  CHI: { city: 'Chicago', name: 'Bears', conf: 'NFC', div: 'North', primary: '#0B162A', accent: '#C83803' },
  CIN: { city: 'Cincinnati', name: 'Bengals', conf: 'AFC', div: 'North', primary: '#000000', accent: '#FB4F14' },
  CLE: { city: 'Cleveland', name: 'Browns', conf: 'AFC', div: 'North', primary: '#311D00', accent: '#FF3C00' },
  DAL: { city: 'Dallas', name: 'Cowboys', conf: 'NFC', div: 'East', primary: '#003594', accent: '#869397' },
  DEN: { city: 'Denver', name: 'Broncos', conf: 'AFC', div: 'West', primary: '#002244', accent: '#FB4F14' },
  DET: { city: 'Detroit', name: 'Lions', conf: 'NFC', div: 'North', primary: '#0076B6', accent: '#B0B7BC' },
  GB:  { city: 'Green Bay', name: 'Packers', conf: 'NFC', div: 'North', primary: '#203731', accent: '#FFB612' },
  HOU: { city: 'Houston', name: 'Texans', conf: 'AFC', div: 'South', primary: '#03202F', accent: '#A71930' },
  IND: { city: 'Indianapolis', name: 'Colts', conf: 'AFC', div: 'South', primary: '#002C5F', accent: '#A2AAAD' },
  JAX: { city: 'Jacksonville', name: 'Jaguars', conf: 'AFC', div: 'South', primary: '#006778', accent: '#D7A22A' },
  KC:  { city: 'Kansas City', name: 'Chiefs', conf: 'AFC', div: 'West', primary: '#E31837', accent: '#FFB81C' },
  LAC: { city: 'Los Angeles', name: 'Chargers', conf: 'AFC', div: 'West', primary: '#0080C6', accent: '#FFC20E' },
  LAR: { city: 'Los Angeles', name: 'Rams', conf: 'NFC', div: 'West', primary: '#003594', accent: '#FFD100' },
  LV:  { city: 'Las Vegas', name: 'Raiders', conf: 'AFC', div: 'West', primary: '#000000', accent: '#A5ACAF' },
  MIA: { city: 'Miami', name: 'Dolphins', conf: 'AFC', div: 'East', primary: '#008E97', accent: '#FC4C02' },
  MIN: { city: 'Minnesota', name: 'Vikings', conf: 'NFC', div: 'North', primary: '#4F2683', accent: '#FFC62F' },
  NE:  { city: 'New England', name: 'Patriots', conf: 'AFC', div: 'East', primary: '#002244', accent: '#C60C30' },
  NO:  { city: 'New Orleans', name: 'Saints', conf: 'NFC', div: 'South', primary: '#101820', accent: '#D3BC8D' },
  NYG: { city: 'New York', name: 'Giants', conf: 'NFC', div: 'East', primary: '#0B2265', accent: '#A71930' },
  NYJ: { city: 'New York', name: 'Jets', conf: 'AFC', div: 'East', primary: '#125740', accent: '#8FB8A8' },
  PHI: { city: 'Philadelphia', name: 'Eagles', conf: 'NFC', div: 'East', primary: '#004C54', accent: '#A5ACAF' },
  PIT: { city: 'Pittsburgh', name: 'Steelers', conf: 'AFC', div: 'North', primary: '#101820', accent: '#FFB612' },
  SEA: { city: 'Seattle', name: 'Seahawks', conf: 'NFC', div: 'West', primary: '#002244', accent: '#69BE28' },
  SF:  { city: 'San Francisco', name: '49ers', conf: 'NFC', div: 'West', primary: '#AA0000', accent: '#B3995D' },
  TB:  { city: 'Tampa Bay', name: 'Buccaneers', conf: 'NFC', div: 'South', primary: '#D50A0A', accent: '#FF7900' },
  TEN: { city: 'Tennessee', name: 'Titans', conf: 'AFC', div: 'South', primary: '#0C2340', accent: '#4B92DB' },
  WAS: { city: 'Washington', name: 'Commanders', conf: 'NFC', div: 'East', primary: '#5A1414', accent: '#FFB612' }
};

function computeTeamTokens(primary,accent,mode) {
  hexToRgb(primary); hexToRgb(accent);
  if (!['day','night'].includes(mode)) throw new TypeError('Resolve System to Day or Night first');
  const p=uiPrimary(primary), night=mode==='night';
  // Night surfaces are team shades. The luminance floor keeps black primaries from collapsing into one color.
  const base=liftToLuminance(p,.045);
  const dk={ground:mix(base,'#000000',.72),panel:mix(base,'#000000',.58),raised:mix(base,'#000000',.42),rule:mix(base,'#000000',.25),tint:mix(base,'#FFFFFF',.72)};
  const surface=night?dk.panel:'#FFFFFF', raised=night?dk.raised:'#ECEFF3';
  const text=night?'#FFFFFF':'#161A22', secondary=night?dk.tint:'#4F5867';
  const neutral=contrast(accent,'#FFFFFF')<3.2 && saturation(accent)<.25;
  const starterBg=neutral ? (contrast(p,surface)>=2 ? p : 'transparent') : '#FFFFFF';
  const starterText=neutral?'#FFFFFF':'#111418';
  return {
    '--team':p,'--on-team':'#FFFFFF','--accent':accent,'--on-accent':readableText(accent),
    '--dk-ground':dk.ground,'--dk-panel':dk.panel,'--dk-raised':dk.raised,'--dk-rule':dk.rule,'--dk-tint':dk.tint,
    '--lt-tint':mix('#FFFFFF',p,.20),'--lt-wash':mix('#FFFFFF',p,.07),
    '--ground':night?dk.ground:'#F2F3F6','--surface':surface,'--surface-2':raised,
    '--text':text,'--text-2':secondary,'--focus':night?'#FFFFFF':'#161A22','--focus-on-team':'#FFFFFF',
    '--control-border':colorAgainst(night?'#9DA5B4':'#737B89',[surface,raised]),
    '--selection-bg':night?raised:mix('#FFFFFF',p,.07),'--selection-text':text,
    '--selection-indicator':colorAgainst(p,[surface,raised,night?raised:mix('#FFFFFF',p,.07)]),
    '--n-starter-bg':starterBg,'--n-starter-text':starterText,'--n-starter-border':starterBg==='transparent'?'#FFFFFF':'transparent',
    '--tier-starter-fill':night?(starterBg==='transparent'?'#FFFFFF':starterBg):p
  };
}

// 13.3 Preferences, with migration and in-memory operation when storage fails.
const PREF_KEY='gm.ui.v2', darkQuery=matchMedia('(prefers-color-scheme: dark)');
const allowed={theme:['system','day','night'],layout:['auto','phone','tablet','desktop'],density:['comfortable','compact']};
function loadPrefs() {
  let raw={};
  try {
    const stored=localStorage.getItem(PREF_KEY);
    raw=stored ? JSON.parse(stored) : {theme:localStorage.getItem('gm.theme'),layout:localStorage.getItem('gm.layout'),team:localStorage.getItem('gm.team')};
  } catch {}
  if (!raw || typeof raw!=='object') raw={};
  return {theme:allowed.theme.includes(raw.theme)?raw.theme:'system',layout:allowed.layout.includes(raw.layout)?raw.layout:'auto',density:allowed.density.includes(raw.density)?raw.density:'comfortable',team:Object.hasOwn(TEAM_COLORS,raw.team)?raw.team:'MIN'};
}
const prefs=loadPrefs();
function autoLayout(width=innerWidth,height=innerHeight) {
  if (Math.min(width,height)<520) return 'phone';            // short side first: a sideways phone stays a phone
  return width>=1100 && width/height>=1.2 ? 'desktop' : 'tablet';
}
function effectiveLayout(setting,width=innerWidth,height=innerHeight) {
  return setting==='auto' ? autoLayout(width,height) : setting; // a manual choice is always honored
}
function applyPreferences() {
  const root=document.documentElement, mode=prefs.theme==='system'?(darkQuery.matches?'night':'day'):prefs.theme;
  root.dataset.theme=mode; root.dataset.layout=effectiveLayout(prefs.layout); root.dataset.density=prefs.density; root.dataset.team=prefs.team;
  const team=TEAM_COLORS[prefs.team];
  Object.entries(computeTeamTokens(team.primary,team.accent,mode)).forEach(([k,v])=>root.style.setProperty(k,v));
  for(const key of ['theme','layout','density','team']) { const el=document.getElementById(key+'Sel'); if(el) el.value=prefs[key]; }
  const note=document.getElementById('layoutNote');
  if(note) note.textContent=prefs.layout==='auto' ? `Auto: showing ${root.dataset.layout}.` : `Set to ${prefs.layout}.`;
  // Color preview never changes franchise identity, standings, or the save.
}
function setPreference(key,value) {
  if(key==='team' ? !Object.hasOwn(TEAM_COLORS,value) : !allowed[key]?.includes(value)) return;
  prefs[key]=value; try { localStorage.setItem(PREF_KEY,JSON.stringify(prefs)); } catch {}
  applyPreferences();
}
darkQuery.addEventListener('change',()=>{if(prefs.theme==='system') applyPreferences();});
let resizeFrame=0;
const scheduleLayout=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(applyPreferences);};
addEventListener('resize',scheduleLayout);addEventListener('orientationchange',scheduleLayout);

// 13.4 Safe data and display helpers.
function knownRating(value) { return typeof value==='number' && Number.isInteger(value) && value>=0 && value<=99 ? value : null; }
function tierOf(value) { const n=knownRating(value); return n===null?'unknown':n>=90?'elite':n>=80?'starter':n>=70?'depth':'low'; }
function el(tag,className='',text) { const node=document.createElement(tag); if(className) node.className=className; if(text!==undefined) node.textContent=String(text); return node; }
function tierPlate(value,large=false) {
  const n=knownRating(value), plate=el('span',`tier tier-${tierOf(value)}${large?' tier-lg':''}`,n===null?'—':n);
  plate.setAttribute('aria-label',n===null?'Overall not known':`Overall ${n}, ${({elite:'Elite',starter:'Starter',depth:'Depth',low:'Low overall'})[tierOf(n)]}`);
  return plate;
}
function money(value,exact=false) {
  if(typeof value!=='number' || !Number.isFinite(value)) return '—';
  if(exact) return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const sign=value<0?'−':'', n=Math.abs(value);
  if(n>=1e9) return `${sign}$${(n/1e9).toFixed(1)}B`;
  if(n>=1e6) return `${sign}$${(n/1e6).toFixed(1)}M`;
  if(n>=1e3) return `${sign}$${Number((n/1e3).toFixed(1))}K`;
  return `${sign}$${Math.round(n)}`;
}
function deltaNode(value,beneficial) {
  const n=el('span',beneficial===true?'delta-good':beneficial===false?'delta-bad':'muted',`${value>0?'+':''}${value}`);
  return n; // The caller supplies domain meaning; sign alone never decides the color.
}
function attributeRow(label,value) {
  const row=el('div','attr'), n=knownRating(value), bar=el('div','bar'); bar.setAttribute('aria-hidden','true');
  if(n!==null){const fill=el('i',`tier-fill-${tierOf(n)}`);fill.style.width=`${n/99*100}%`;bar.append(fill);}
  row.append(el('span','',label),bar,el('span','num',n===null?'— · Not known':n)); return row;
}
const DEV_TRAITS={'X-Factor':'xfactor','Superstar':'superstar','Star':'star','Normal':'normal'};
function devTag(value) { const slug=DEV_TRAITS[value]; return el('span',`dev dev-${slug||'unknown'}`,slug?value:'Not known'); }
function statusNode(status) { const role=({Healthy:'ok',Questionable:'warn',Out:'bad'})[status]||'neutral'; return el('span',`status status-${role}`,status||'Unknown status'); }
function playerLink(p) { const a=el('a','list-name',p.name); a.href=`#player/${encodeURIComponent(p.id)}`; a.dataset.playerLink=p.id; return a; }

// 13.5 One state model for table and list.
const ui={query:'',side:'All',sort:'ovr',direction:'desc',selected:new Set(),playerId:'p001',route:'',rosterScroll:0,returnPlayer:null};
function visiblePlayers() {
  const q=ui.query.trim().toLocaleLowerCase();
  return SAMPLE_ROSTER.filter(p=>(ui.side==='All'||p.side===ui.side)&&`${p.name} ${p.pos}`.toLocaleLowerCase().includes(q)).sort((a,b)=>{
    let order;
    if(ui.sort==='ovr') {
      const av=knownRating(a.ovr),bv=knownRating(b.ovr);
      if(av===null||bv===null) return av===bv?a.id.localeCompare(b.id):av===null?1:-1;
      order=av-bv;
    } else order=a.name.localeCompare(b.name);
    return (ui.direction==='asc'?order:-order)||a.id.localeCompare(b.id);
  });
}
function selectionControl(p) {
  const label=el('label','check-target'), input=document.createElement('input'); input.type='checkbox';input.checked=ui.selected.has(p.id);input.dataset.selectPlayer=p.id;
  label.append(input,el('span','sr-only',`Select ${p.name} for comparison`)); return label;
}
function syncSelection() {
  const visible=new Set(visiblePlayers().map(p=>p.id)), hidden=[...ui.selected].filter(id=>!visible.has(id)).length;
  document.querySelectorAll('[data-select-player]').forEach(box=>{box.checked=ui.selected.has(box.dataset.selectPlayer);box.closest('[data-row-player]')?.classList.toggle('is-selected',box.checked);});
  document.getElementById('compareBtn').disabled=ui.selected.size<2||ui.selected.size>4;
  document.getElementById('selectionNote').textContent=`${ui.selected.size} selected${hidden?` (${hidden} hidden by filters)`:''}. Select 2–4 players to compare.`;
  document.getElementById('clearSelection').disabled=ui.selected.size===0;
}
function renderRoster() {
  const players=visiblePlayers(), body=document.getElementById('rosterBody'), list=document.getElementById('rosterList'); body.replaceChildren();list.replaceChildren();
  for(const p of players) {
    const tr=document.createElement('tr');tr.dataset.rowPlayer=p.id;
    const select=el('td');select.append(selectionControl(p));
    const name=el('th');name.scope='row';name.append(playerLink(p));
    const rating=el('td');rating.append(tierPlate(p.ovr));const status=el('td');status.append(statusNode(p.status));
    const dev=el('td','wide');dev.append(devTag(p.development));
    tr.append(select,el('td','',p.pos),name,el('td','wide num',p.age),rating,dev,el('td','wide num',money(p.capHit)),status);body.append(tr);
    const li=el('li','list-row');li.dataset.rowPlayer=p.id;const main=el('div','list-main');
    main.append(playerLink(p),el('p','list-sub',`${p.pos} · Age ${p.age} · Cap hit ${money(p.capHit)}`),statusNode(p.status));
    li.append(selectionControl(p),main,tierPlate(p.ovr));list.append(li);
  }
  document.getElementById('rosterCount').textContent=`${players.length} of ${SAMPLE_ROSTER.length} players shown.`;
  document.getElementById('rosterEmpty').hidden=players.length!==0;
  document.querySelectorAll('[data-sort-heading]').forEach(th=>{th.removeAttribute('aria-sort');if(th.dataset.sortHeading===ui.sort)th.setAttribute('aria-sort',ui.direction==='asc'?'ascending':'descending');});
  document.getElementById('rosterSort').value=`${ui.sort}:${ui.direction}`;syncSelection();
}
function renderPreview() {
  const list=document.getElementById('rosterPreview');list.replaceChildren();
  // Roster and injuries: injured and questionable players first, then highest overall.
  const urgency=p=>p.status==='Out'?0:p.status==='Questionable'?1:2;
  [...SAMPLE_ROSTER].sort((a,b)=>urgency(a)-urgency(b)||(knownRating(b.ovr)??-1)-(knownRating(a.ovr)??-1)||a.id.localeCompare(b.id)).slice(0,5).forEach(p=>{const li=el('li');li.append(el('span','pos',p.pos),playerLink(p),tierPlate(p.ovr),statusNode(p.status));list.append(li);});
}
function stat(label,value) { const d=el('div','stat');d.append(el('span','label',label),value instanceof Node?value:el('span','value',value));return d; }
function renderPlayer(id) {
  const p=SAMPLE_ROSTER.find(p=>p.id===id); if(!p)return false;ui.playerId=id;
  document.getElementById('playerTitle').textContent=p.name;document.getElementById('playerTag').textContent=`${p.pos} · #${p.number}`;document.getElementById('playerNumber').textContent=p.number;
  document.getElementById('playerStats').replaceChildren(stat('Overall',tierPlate(p.ovr,true)),stat('Development',devTag(p.development)),stat('Age',p.age),stat('2026 cap hit',money(p.capHit)),stat('Years remaining',p.yearsRemaining),stat('Health',statusNode(p.status)));
  document.getElementById('playerAttrs').replaceChildren(...p.attrs.map(([label,value])=>attributeRow(label,value)));return true;
}
function navigate() {
  let route=location.hash.slice(1)||'home';
  if(route==='main') { document.getElementById('main').focus();return; }
  if(!['home','roster'].includes(route)&&!/^player\/[a-z0-9_-]+$/i.test(route))route='home';
  if(route.startsWith('player/')&&!renderPlayer(route.slice(7)))route='roster';
  const previous=ui.route,view=route.startsWith('player/')?'player':route;
  document.querySelectorAll('.view').forEach(section=>section.hidden=section.id!==`view-${view}`);
  document.querySelectorAll('nav a').forEach(a=>{a.removeAttribute('aria-current');if(a.hash===`#${view==='player'?'roster':view}`)a.setAttribute('aria-current','page');});
  ui.route=route;
  const heading=document.querySelector(`#view-${view} h1`);document.title=`${heading.textContent} — Franchise GM`;
  if(previous) requestAnimationFrame(()=>{
    if(view==='roster'&&previous.startsWith('player/')) {
      scrollTo(0,ui.rosterScroll);
      const candidates=[...document.querySelectorAll('[data-player-link]')].filter(a=>a.dataset.playerLink===ui.returnPlayer&&a.getClientRects().length);
      (candidates[0]||heading).focus({preventScroll:true});
    } else {scrollTo(0,0);heading.focus({preventScroll:true});}
  });
}

// 13.6 Native modal lifecycle and comparison.
const dialogTriggers=new WeakMap();
function openDialog(id,trigger=document.activeElement) {
  const d=document.getElementById(id);if(d.open)return;dialogTriggers.set(d,trigger);d.showModal();
  (d.querySelector('[data-close]')||d.querySelector('input,select,button'))?.focus();
}
function showComparison(trigger) {
  const players=SAMPLE_ROSTER.filter(p=>ui.selected.has(p.id));if(players.length<2||players.length>4)return;
  const table=el('table','compare-table'),caption=el('caption','sr-only','Selected player comparison'),head=document.createElement('thead'),top=document.createElement('tr');
  const corner=el('th','','Attribute');corner.scope='col';top.append(corner);
  players.forEach(p=>{const th=el('th','',p.name);th.scope='col';top.append(th);});head.append(top);
  const body=document.createElement('tbody');
  for(const [label,key] of [['Position','pos'],['Overall','ovr'],['Development','development'],['Age','age'],['2026 cap hit','capHit'],['Years remaining','yearsRemaining'],['Health','status']]) {
    const tr=document.createElement('tr'),th=el('th','',label);th.scope='row';tr.append(th);
    players.forEach(p=>tr.append(el('td','',key==='capHit'?money(p[key],true):p[key]??'—')));body.append(tr);
  }
  table.append(caption,head,body);document.getElementById('comparison').replaceChildren(table);openDialog('compareDialog',trigger);
}
function prepareContract(trigger) {
  const p=SAMPLE_ROSTER.find(p=>p.id===ui.playerId);
  document.getElementById('contractPlayer').textContent=`${p.name} · Current 2026 cap hit: ${money(p.capHit,true)} · ${p.yearsRemaining} years remaining`;
  // Do not derive a new contract's total value from the current cap hit.
  document.getElementById('contractForm').reset();document.getElementById('contractOutput').replaceChildren();
  document.getElementById('contractError').hidden=true;
  document.querySelectorAll('#contractForm [aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  openDialog('contractDialog',trigger);
}
function toast(message,{persistent=false}={}) {
  const box=el('div','toast'),text=el('span','',message),close=el('button','btn btn-text','Dismiss');close.type='button';close.setAttribute('aria-label',`Dismiss: ${message}`);box.append(text,close);
  document.getElementById('toastRegion').append(box);
  let timer=0;const stop=()=>clearTimeout(timer),schedule=()=>{stop();if(!persistent&&!box.matches(':hover')&&!box.contains(document.activeElement))timer=setTimeout(()=>box.remove(),5000);};
  close.addEventListener('click',()=>{stop();box.remove();});box.addEventListener('mouseenter',stop);box.addEventListener('mouseleave',schedule);box.addEventListener('focusin',stop);box.addEventListener('focusout',()=>setTimeout(schedule,0));schedule();
}

// 13.7 Event wiring. The reference does not commit game transactions.
function initUI() {
  const teamSelect=document.getElementById('teamSel');
  Object.entries(TEAM_COLORS).sort(([,a],[,b])=>(a.city+a.name).localeCompare(b.city+b.name)).forEach(([abbr,t])=>{const option=el('option','',`${t.city} ${t.name}`);option.value=abbr;teamSelect.append(option);});
  for(const key of ['theme','layout','density','team'])document.getElementById(key+'Sel').addEventListener('change',e=>setPreference(key,e.target.value));
  applyPreferences();renderPreview();renderRoster();navigate();
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{const trigger=dialogTriggers.get(d);if(trigger?.isConnected&&trigger.getClientRects().length)trigger.focus();}));
  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-open]');if(open)openDialog(open.dataset.open,open);
    const close=e.target.closest('[data-close]');if(close){e.preventDefault();close.closest('dialog').close();}
    const sort=e.target.closest('[data-sort]');if(sort){ui.direction=ui.sort===sort.dataset.sort?(ui.direction==='asc'?'desc':'asc'):sort.dataset.sort==='name'?'asc':'desc';ui.sort=sort.dataset.sort;renderRoster();}
    const player=e.target.closest('[data-player-link]');if(player&&ui.route==='roster'){ui.rosterScroll=scrollY;ui.returnPlayer=player.dataset.playerLink;}
  });
  document.addEventListener('change',e=>{
    const box=e.target.closest('[data-select-player]');if(!box)return;
    const id=box.dataset.selectPlayer;
    if(box.checked&&ui.selected.size>=4){box.checked=false;toast('You can compare up to four players. Clear a selection first.');return;}
    if(box.checked)ui.selected.add(id);else ui.selected.delete(id);syncSelection();
  });
  let searchTimer=0;
  document.getElementById('rosterQuery').addEventListener('input',e=>{clearTimeout(searchTimer);const value=e.target.value;searchTimer=setTimeout(()=>{ui.query=value;renderRoster();},180);});
  document.getElementById('rosterSide').addEventListener('change',e=>{ui.side=e.target.value;renderRoster();});
  document.getElementById('rosterSort').addEventListener('change',e=>{[ui.sort,ui.direction]=e.target.value.split(':');renderRoster();});
  document.getElementById('clearSelection').addEventListener('click',()=>{ui.selected.clear();syncSelection();});
  document.getElementById('compareBtn').addEventListener('click',e=>showComparison(e.currentTarget));
  document.getElementById('contractBtn').addEventListener('click',e=>prepareContract(e.currentTarget));
  document.getElementById('contractForm').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget,totalInput=document.getElementById('contractTotal'),yearsInput=document.getElementById('contractYears');
    const total=totalInput.valueAsNumber,years=yearsInput.valueAsNumber,error=document.getElementById('contractError');
    const totalOK=Number.isSafeInteger(total)&&total>=0&&total<=9999999999,yearsOK=Number.isInteger(years)&&years>=1&&years<=7;
    totalInput.setAttribute('aria-invalid',String(!totalOK));yearsInput.setAttribute('aria-invalid',String(!yearsOK));
    if(!totalOK||!yearsOK){error.hidden=false;error.textContent='Enter a whole-dollar total from $0 to $9,999,999,999 and a term from 1 to 7 years.';(!totalOK?totalInput:yearsInput).focus();return;}
    error.hidden=true;
    document.getElementById('contractOutput').replaceChildren(el('p','',`Total: ${money(total,true)} over ${years} ${years===1?'year':'years'}.`),el('p','',`Average annual value: ${money(total/years,true)} (rounded to whole dollars).`),el('p','hint','Preview only. No offer has been sent.'));
    document.dispatchEvent(new CustomEvent('contractpreview',{detail:{playerId:ui.playerId,totalDollars:total,years}}));
  });
  addEventListener('hashchange',navigate);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUI,{once:true});else initUI();
```

---

## 14. Acceptance criteria

### 14.1 Theme matrix

Run numerical token checks for all **32 teams × 2 resolved modes**. Check normal text on every supported surface; white text on adjusted team primaries; action/rating foregrounds; control borders and selection indicators against both supported control surfaces; focus on surfaces and team headers. Require an ordered, nonidentical dark surface scale, including CIN and LV, and confirm Night surfaces carry the team hue for every team above the luminance floor. Recheck any override of the generated tokens.

Inspect representative screens for MIN, LV, CIN, HOU, MIA, LAC, and a light-neutral-accent team such as IND or DET. Include active, selected, disabled, busy, error, hover, and keyboard focus states. Passing numeric contrast checks does not prove focus management or whole-page accessibility.

### 14.2 Screen matrix

The four canonical references are Home, full Roster, Player detail, and Contract dialog. Check each in Day/Night and Phone/Tablet/Desktop: **24 baseline screen configurations**. Also inspect Compact and coarse-pointer behavior. Force each manual layout at every representative size and confirm it is honored, all navigation stays reachable, and returning to Auto restores the measured shell.

Representative viewports: 320 × 568, 390 × 844, 844 × 390, 834 × 1194, 1194 × 834, 1024 × 768, 1280 × 800, and 1440 × 900. Test the Auto boundaries: short side 519/520, width 1099/1100 at a wide aspect, and aspect 1.19/1.20 at 1200px wide. Include an on-screen keyboard; it must not change the shell. Test roster container boundaries at 639/640 and 959/960 independently of viewport width.

### 14.3 Content and state stress cases

- Empty roster, no filter matches, one player, full roster, and a **450-prospect test fixture** for scouting performance. This fixture size is a product test choice, not a requirement that the simulation must generate exactly that many prospects.
- Long hyphenated names, suffixes, diacritics, long school names, and multisentence injury details.
- OVR boundaries 0, 69, 70, 79, 80, 89, 90, 99; missing, empty, negative, fractional, and 100+ values.
- Very large money values, negative cap space, zero-dollar values, and exact-versus-rounded displays.
- A low-OVR player with Superstar or X-Factor development; unscouted and partially scouted prospects.
- Selection across filtering/sorting, 2–4-player comparison, unknown-value sorting, and return-to-roster scroll/focus.
- Invalid contract input, busy submission, rejected domain action, saving failure, and recovery.

### 14.4 Keyboard, layout, and offline gates

1. Navigate and operate every implemented control without a pointer. Reorder depth assignments without dragging.
2. Confirm correct table header associations, current navigation, input labels, result announcements, and dialog titles with a representative screen reader.
3. Open/close dialogs with keyboard, confirm initial focus and focus restoration, and verify focus does not enter the background.
4. Confirm no page-level horizontal overflow; verify documented comparison-table scrolling is discoverable.
5. Enlarge text to 200%, test 320px reflow, safe-area padding, reduced motion, and forced colors.
6. Load the final file with network disabled and verify embedded font rendering and all implemented interactions. The Network panel must show no external requests.
7. Block local storage; preferences must still work for the session. Independently test the game's save/export failure handling.
8. Run the font embedder twice with unchanged input; the second run succeeds and leaves the content unchanged.
9. Verify text contrast after hover effects and focus visibility around decorative shapes.
10. Measure responsiveness with realistic data on representative hardware. Use pagination or incremental rendering if needed; do not add virtualization solely to hide an unmeasured problem.

### 14.5 Definition of done for a new screen

The screen uses shared tokens/components; has a clear primary task; has specified empty/loading/error/selected states; works at every supported width; preserves user state across layout changes; and passes the relevant keyboard, contrast, content, and offline checks. Capture a baseline screenshot only after these gates pass. Future visual comparisons should use the same fixture data, fonts, viewport, mode, and team.

---

## 15. Migration notes and references

### 15.0 Changes in v3

- Restored team-shaded Night surfaces, with a luminance floor so black and near-black primaries keep distinct surfaces.
- Restored the Auto layout rules: short side first, then width and aspect ratio. Manual layout choices are always honored at any size.
- Restored the home order: next game and game plan, roster and injuries, inbox and news, standings and playoff picture.
- Development tags now use Madden's development traits (X-Factor, Superstar, Star, Normal) to match the game spec.
- The font embedder runs on the build output as the last build step.
- Removed stray blank lines and a duplicated paragraph.

### 15.1 Changes in v2

- Replaced black-mixing Night surfaces with an ordered tinted neutral scale. (Reversed in v3.)
- Separated action, rating, development, navigation, selection, control boundary, and focus roles.
- Added unknown/estimated data rules and renamed the lowest known OVR tier Low overall.
- Made layout width-based and safe under manual overrides (reversed in v3); introduced independent density and pointer sizing (kept).
- Added component container breakpoints, a compact dashboard roster, and semantic full tables.
- Limited decorative treatments and removed dense card backfilling.
- Added consistent selection/comparison behavior and keyboard alternatives to depth dragging.
- Clarified money, simulation time, development potential, and ambiguous opponent names.
- Moved layout/theme/density preferences into one Settings dialog.
- Protected button focus from clipping, increased small-control targets, and separated control borders from decorative rules.
- Fixed the font embedder's unchanged-output failure and documented license embedding.
- Added canonical markup, input-safe render helpers, storage fallbacks, and measurable release gates.

### 15.2 External references

- [W3C: Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) — meaningful control/state indicators and focus contrast.
- [W3C: Tables tutorial](https://www.w3.org/WAI/tutorials/tables/) — semantic header/data relationships.
- [MDN: Grid layout and accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Accessibility) — visual order, source order, and dense placement.

The palette inputs came from the supplied style guide. Other fixture values and UI decisions in this revision are design choices, not externally verified league rules.
