# Franchise GM: game specification

Version 1.0. Companion documents: `franchise-gm-styleguide.md` (all UI), `franchise-gm-build-order.md` (milestones), and `franchise-gm-tooling.md` (the Claude Code setup).

## 0. How to use this document

This is the source of truth for what the game does. The style guide is the source of truth for how it looks. The build order says what to build first.

- **MUST** means required. **SHOULD** means expected unless there's a documented reason not to. **MAY** means optional.
- Every tunable number in this spec is a named constant in code (see section 22 on settings and section 23 on calibration). Numbers written here are starting values to be calibrated, not final truths.
- When the spec is silent, choose the behavior of the real NFL, write the choice to `docs/DECISIONS.md`, and keep going. Don't stop the build to ask.
- Sections marked **(default, review)** were decided without a dedicated interview round. They use NFL-accurate defaults and are open for revision.

### 0.1 Glossary

| Term | Meaning |
|---|---|
| User | The human player. Runs exactly one team as owner, GM, and head coach. |
| AI team | Any of the other 31 teams, run by AI owners, GMs, and coaches. |
| Role rating | A player's effective rating in a specific scheme role (section 7). |
| Fit | Role rating minus the player's generic overall. Positive is good. |
| Phase | A step of the offseason calendar ("Free agency week 1"). |
| Harness | The calibration and AI health test system (section 23). |
| Stat line | One player's stats in one game, in one stat category. Kept forever. |
| Base database | The read-only starting data embedded in the HTML (Madden roster, teams, schedule). |
| Save | A league's changing state, stored in IndexedDB. |

---

## 1. Vision and pillars

A single-file, offline NFL franchise simulation where the user builds and runs a team for decades. There's no on-field gameplay. Everything is decided by roster, scheme, coaching, and management.

1. **The league feels alive.** AI owners, GMs, coaches, and players have personalities, memories, pressures, and biases. They make believable decisions, including mistakes, and the league develops eras, identities, and storylines on its own.
2. **Any given Sunday.** Better teams win more often, but parity is real. Perfect and winless seasons are extremely rare, contenders fall off, and bad teams rise.
3. **Stats you can believe.** Season and career numbers look like real NFL numbers, good players produce consistently, and year-to-year changes have causes (age, scheme, teammates, injuries).
4. **Depth beyond ratings.** Scheme fit, traits, abilities, roles, personnel, weather, and coaching all shape results.
5. **Deep history.** Every game stat line for every player is kept forever, alongside awards, records, the Hall of Fame, and franchise histories.
6. **Sandbox.** No win conditions and no firing the user. Everything is configurable.
7. **One file.** The shipped game is one standalone HTML file that works offline on Safari (Mac, iPad, iPhone) and Chrome and Edge (desktop).

---

## 2. Platform and technical architecture

### 2.1 Deliverable

- The game ships as `dist/game.html`: one self-contained file. No network requests at runtime, no external scripts, fonts, or images. Fonts are embedded per style guide section 3.2.
- File size has no limit, but it SHOULD stay under 25 MB with the base database embedded.
- Supported browsers: current Safari on macOS, iPadOS, and iOS; current Chrome and Edge on desktop. Other browsers may work but aren't tested.
- The game MUST NOT include EA logos or artwork. Madden-derived player data stays in the user's private copy and isn't distributed.

### 2.2 Repository and tooling

The code lives in normal source files in a git repo. A build step bundles everything into the single HTML file.

```
/
  src/
    app/            UI: screens, components, routing (hash-based)
    engine/         Pure game logic, no DOM: sim, contracts, AI, draft, etc.
    engine/sim/     Game simulation
    engine/ai/      AI decision system
    data/           Static data modules (teams, stadiums, climate, names, colleges)
    storage/        IndexedDB access, save/export/import
    worker/         Web Worker entry for long simulations
    styles/         Style guide CSS, split by section
  data-raw/         Source data before build: madden-roster.csv, schedule-2026.csv, names, colleges
  tools/            Build scripts: embed fonts, build base database, mapping reports
  tests/            unit/, calibration/, layout/, saves/, ai/
  docs/             design/, STATUS.md, DECISIONS.md, KNOWN-ISSUES.md, CALIBRATION.md, MAPPING.md, milestones/
  dist/             game.html (build output, committed on tagged releases only)
```

- **Language:** TypeScript in strict mode.
- **Bundler:** Vite with `vite-plugin-singlefile` (or esbuild plus a custom inliner), configured so JS, CSS, fonts, the worker, and data all inline into one HTML file.
- **UI:** plain TypeScript with a small component pattern, or Preact if a framework is wanted. It must inline cleanly and stay under about 50 KB of framework code. No CSS frameworks: all styling comes from the style guide.
- **Tests:** Vitest for unit, calibration, save, and AI tests. Playwright for layout tests in WebKit and Chromium at 390x844, 834x1194, and 1440x900.
- **Lint and format:** ESLint and Prettier. CI runs lint, type check, unit tests, a short calibration run, and the build on every push.
- **Commands:** `npm run dev` (dev server with hot reload), `npm run build` (produces `dist/game.html`), `npm test`, `npm run calibrate -- --seasons 100`, `npm run layout`.

### 2.3 Runtime architecture

- **Engine and UI are separate.** `src/engine` has no DOM access and is fully unit-testable. The UI calls engine functions and renders results.
- **Web Worker.** Season sims, calibration runs, and AI batch decisions run in a worker created at runtime from an inlined script (`new Worker(URL.createObjectURL(new Blob([code])))`). The UI shows a progress bar and stays responsive.
- **Randomness.** All randomness goes through one seeded PRNG (for example PCG32 or xoshiro128**). See section 8.9 for the weighted-seed model.
- **Storage.** IndexedDB for saves (section 21). `localStorage` only for small preferences (layout, last opened league).
- **Routing.** Hash-based (`#/team/MIN/roster`) so the single file can deep-link to screens.
- **Numbers.** Money is stored as integer dollars. Ratings are integers 0 to 99. Dates are game-calendar objects (season, phase, week, day), never wall-clock time.

### 2.4 Save compatibility

Saves carry a schema version. By default, saves from an older game version are not migrated and open with a clear message. Updates are never constrained by old saves. A migration MAY be written when cheap, but it's never required.

---

## 3. League setup and the user's role

### 3.1 The user

- Controls exactly one team for the life of the league.
- Holds three jobs at once: **owner, GM, and head coach**. The user can also hire a GM whose abilities apply as bonuses (section 13.2); that GM doesn't make decisions.
- Every job can be set to auto: game plan, depth chart, training, scouting, contract negotiations, roster management, coordinator management, and head coach and GM management. Auto uses the same AI as AI teams, with the user's team personality settings.
- Sandbox: the user can't be fired, and there are no goals or fail states.

### 3.2 Creating a league

| Choice | Options | Locked at start |
|---|---|---|
| Data source | Real (embedded Madden roster, 2026) or fully fictional (generated) | Yes |
| Starting rosters | Actual rosters or fantasy draft (all players pooled, snake draft, AI drafts for others) | Yes |
| User's team | Any of the 32 teams | Yes |
| Start season | 2026 | Yes |
| League name | Free text | No |
| Seed | Random by default, or entered | Yes |
| Relocation permission | None, user only, or any team | Yes |
| Rebrand permission | None, user only, or any team | Yes |
| League style drift | On or off | Yes |
| AI owners can propose rules | On or off | Yes |
| Starting settings | All section 22 settings, pre-filled with defaults | No (changeable later) |

A **fictional league** keeps the 32 real franchises, cities, stadiums, and colors, but all players, coaches, and staff are generated. A **fantasy draft** uses whichever player pool the data source provides. Coaches and staff keep their teams.

### 3.3 Base database

- Built at compile time from `data-raw/madden-roster.csv` (the user will supply it when the build starts) by `tools/build-db.ts` into a compact embedded block (section 6.8).
- Until the CSV arrives, development uses a synthetic fixture with a placeholder header set documented in `docs/MAPPING.md`, and the starting league is a generated fictional league (build order: "Starting without the Madden CSV").
- Also embedded: 32 teams (section 6.2 and style guide section 2.6), stadiums and climate (section 17), the 2026 schedule (section 5.1), name and college lists (section 10.1), and default coaches and staff (generated for all teams, since the Madden roster file covers players only).

---

## 4. Calendar and phases

Time advances **week by week in the regular season and playoffs**, and **phase by phase in the offseason**. The user can advance one step, advance to a chosen phase, or sim the rest of the season. Advancing pauses for configurable event types (section 19.6).

### 4.1 Season calendar

| Order | Phase | Notes |
|---|---|---|
| 1 | Regular season, weeks 1 to 18 | 17 games and one bye per team. Trade deadline after week 9 (configurable). |
| 2 | Wild Card round | 6 games |
| 3 | Divisional round | 4 games |
| 4 | Conference championships | 2 games |
| 5 | Super Bowl week | Neutral site. Unsigned rookie UDFAs are removed from the game at the end of this week. |
| 6 | Staff management | Firings, hirings, coordinator and position coach re-signings, poaching, retirements |
| 7 | Awards and Hall of Fame | Season awards announced, Hall of Fame class inducted |
| 8 | Re-sign window and tags | Extensions, franchise and transition tags, RFA tenders, 5th-year options |
| 9 | Combine | Measurables and drills revealed, scouting points spent, media hype shifts |
| 10 | Annual meeting | Rules committee proposals and votes (section 16). Compensatory picks are announced. |
| 11 | Free agency week 1 to week 4 | Bidding, signings, and the start of the new league year (contracts roll over, cap resets) |
| 12 | Pro days and pre-draft events | Pro days, top-30 visits, interviews, final scouting |
| 13 | Draft | 7 rounds with trades (section 10.4) |
| 14 | UDFA scramble | Bidding for undrafted rookies |
| 15 | OTAs and minicamp | Offseason training program and depth chart setup |
| 16 | Training camp | Position battles, camp injuries, development bumps |
| 17 | Preseason weeks 1 to 3 | Games that don't count and generate stat lines tagged as preseason (not in career totals) |
| 18 | Final cutdown | Down to 53, practice squad signings, waiver claims |

Compensatory picks for the coming draft are based on the previous league year's free agent losses and gains (section 11.8).

### 4.2 Weekly loop (in season)

For each week: injuries heal and statuses update, AI teams re-evaluate plans, depth charts and game plans are set (auto or manual), trades and signings can happen, games are simulated, stats and records update, news and social posts generate, awards of the week are chosen, and autosave runs.

---

## 5. Schedule

### 5.1 The 2026 season

- The 2026 schedule MUST be the real published 2026 NFL schedule (released May 14, 2026, available at nfl.com/schedules/2026). It's stored in `data-raw/schedule-2026.csv` with columns: `week, day, date, time_et, away, home, site_type (home|neutral|international), site_name`.
- International and neutral-site games keep their venues. Home field advantage uses the designated home team's crowd factor at 25% strength for international games.
- The Week 18 order is as published. Its flex timing is flavor only.

### 5.2 Generating 2027 and later

Each team plays 17 games using the NFL formula:

1. Home and away against its 3 division rivals (6 games).
2. The 4 teams of one division in its own conference, rotating on a 3-year cycle (4 games: 2 home, 2 away).
3. The 4 teams of one division in the other conference, rotating on a 4-year cycle (4 games: 2 home, 2 away).
4. Two games against the same-place finishers in the two same-conference divisions it isn't already playing (1 home, 1 away).
5. A 17th game against the same-place finisher of a division in the other conference that it isn't already playing, on a rotating basis. The conference hosting the 17th game alternates by year (NFC in 2026, so AFC in 2027).

- Rotation tables are derived by matching the 2026 schedule as the seed year, then advancing the 3-year and 4-year cycles. A unit test checks that over a full 12-year window every team plays every other team the correct number of times and home and away sites alternate.
- Home and away for rotating opponents alternates relative to the previous meeting in the same rotation.
- **Week assignment:** an 18-week grid with one bye per team between weeks 5 and 14. Constraints: no team plays more than 3 straight road games, division games appear in week 18 where possible, no team has back-to-back byes or two byes. A greedy constraint solver with retries is enough.
- Thursday, Monday, and international games MAY be assigned as flavor, and short weeks after a Thursday game SHOULD apply the rest effect (section 17.3).

### 5.3 Standings, tiebreakers, and playoffs

- Standings track wins, losses, ties, division and conference records, points for and against, streaks, and strength of victory and schedule.
- Tiebreakers follow current NFL procedures, both for division ties and wild card ties: head-to-head, division record, common games (minimum 4), conference record, strength of victory, strength of schedule, combined ranking in points, net points in common games, net points overall, net touchdowns, and coin toss (seeded). **(default, review)**
- 14-team playoffs, 7 per conference: 4 division winners seeded 1 to 4 by record, then 3 wild cards seeded 5 to 7. The 1 seed gets a bye. Re-seeding after each round. Higher seed hosts. The Super Bowl is at a neutral site that rotates from a list.

---

## 6. Data model

All entities have stable string IDs (`p_000123`, `t_MIN`, `s_00045`). Entities reference each other by ID, never by name.

### 6.1 Player

| Group | Fields |
|---|---|
| Identity | id, firstName, lastName, position, jersey, birthDate, age (derived), college, hometown, height, weight, handedness (QB, K, P), experience (seasons), draft info (year, round, pick, team or undrafted) |
| Ratings | Every Madden rating kept as an integer 0 to 99 (section 6.3), plus hidden `potential` for generated and young players |
| Overall | Computed per position from ratings (section 7.1). Stored and recomputed when ratings change. |
| Traits | Madden traits (section 6.4) |
| Abilities | Up to 3 game abilities for elite players, 1 for strong players (section 7.4) |
| Dev trait | Normal, Star, Superstar, X-Factor (Madden names), changeable over a career |
| Personality | See section 10.9: ego, loyalty, work ethic, leadership, competitiveness, greed, volatility, media style, social activity |
| Status | team, roster status (active, practice squad, IR, PUP, NFI, suspended, free agent, retired, removed), injury record, morale, contract ID |
| History | Links to stat lines, transactions, awards, and injuries (stored separately) |

### 6.2 Team

id (abbreviation), city, name, conference, division, colors (primary, accent, palette from style guide 2.6), stadium ID, owner ID, GM ID, head coach ID, coordinators and position coach IDs, scheme (offense, defense, special teams), personality snapshot (identity tags), finances, fan base, facilities, history (season records, titles, retired numbers, ring of honor), rebrand history, relocation history.

### 6.3 Ratings

Use Madden's rating set as the canonical ratings so imports are lossless. Codes (Madden abbreviations in parentheses, final names confirmed against the CSV in `docs/MAPPING.md`):

- **Physical:** speed (SPD), acceleration (ACC), agility (AGI), change of direction (COD), strength (STR), jumping (JMP), stamina (STA), injury (INJ), toughness (TGH).
- **Mental:** awareness (AWR), play recognition (PRC).
- **Ball carrier:** carrying (CAR), ball carrier vision (BCV), break tackle (BTK), trucking (TRK), stiff arm (SFA), spin move (SPM), juke move (JKM).
- **Receiving:** catching (CTH), catch in traffic (CIT), spectacular catch (SPC), release (RLS), short, medium, and deep route running (SRR, MRR, DRR).
- **Blocking:** run block (RBK), run block power (RBP), run block finesse (RBF), pass block (PBK), pass block power (PBP), pass block finesse (PBF), impact blocking (IBL), lead block (LBK).
- **Passing:** throw power (THP), short, medium, and deep accuracy (SAC, MAC, DAC), throw on the run (TOR), throw under pressure (TUP), play action (PAC), break sack (BSK).
- **Defense:** tackle (TAK), hit power (POW), pursuit (PUR), block shedding (BSH), finesse moves (FMV), power moves (PMV), man coverage (MCV), zone coverage (ZCV), press (PRS).
- **Special teams:** kick power (KPW), kick accuracy (KAC), kick return (RET), long snap (LSP) if present.

Any extra CSV columns are preserved as `extra.*` fields and listed in the import report.

### 6.4 Traits (from Madden)

QB style (pocket, balanced, scrambling), sense pressure (paranoid, trigger happy, ideal, average, oblivious), throw away, tight spiral, forces passes (conservative, ideal, aggressive), covers ball (never to always), fight for yards, feet in bounds, drops open passes, possession catch, aggressive catch, YAC (RAC) catch, high motor, big hitter, strips ball, plays ball (conservative, balanced, aggressive), penalty (disciplined, normal, undisciplined), clutch, predictable, DL swim, DL spin, DL bull rush, LB style (pass rush, balanced, cover). Exact values and names follow the CSV. Missing traits on generated players are generated (section 10.2).

### 6.5 Contract

id, playerId, teamId, signed date, type (rookie, veteran, extension, franchise tag, transition tag, RFA tender, minimum, practice squad, UDFA), years with per-year base salary, signing bonus and proration schedule, roster bonuses, option bonuses, per-game roster bonuses, workout bonuses, incentives (likely and not likely to be earned, each with a condition), guarantees (full, injury only, and vesting dates), void years, team or player options, 5th-year option status, no-trade clause, and restructure history. Cap hits and dead money are always computed from this, never stored as the source of truth (section 11).

### 6.6 Staff, coaches, owners

- **Coach and staff member:** id, name, age, role (HC, OC, DC, STC, position coach by group, director of scouting, director of personnel, GM, scout), ratings by skill (section 13.1), abilities, preferred scheme, flexibility, personality, contract, career record (head coach records only count head coach games, section 18.6).
- **Owner:** id, name, personality (section 14.8), wealth tier, patience, meddling, spending style, relocation appetite, voting tendencies.

### 6.7 Games and stats

- **Game:** id, season, week, type (preseason, regular, playoff), home, away, site, weather, result, score by quarter, team stats, scoring summary, drive summaries, recap text, officiating crew tendency, attendance.
- **Stat lines:** stored per season in category tables (section 9.2). One row per player per game per category that player recorded.
- **Transaction:** every signing, release, trade, tag, restructure, waiver claim, IR move, practice squad move, and retirement, with date and details.

### 6.8 Embedded base database format

- Built by `tools/build-db.ts` into a JSON block inside `<script type="application/json" id="base-db">`, gzipped and base64-encoded if it exceeds 2 MB, decoded at startup with `DecompressionStream`.
- Columnar layout per table (arrays per field) to keep it compact.
- The build also writes `docs/MAPPING.md`: every CSV column, what it maps to, any value transforms, and any rows rejected with reasons.

### 6.9 Madden CSV import

- A declarative mapping file (`src/data/madden-mapping.ts`) maps CSV headers to model fields with transforms (enum lookups, height parsing, contract field splitting).
- Validation checks: required fields present, ratings in range, one team per player, jersey conflicts, roster counts per team, contract sanity. Problems go into the mapping report and non-fatal rows are fixed with documented defaults.
- The same mapping powers an in-game import (MAY, later) for future Madden files.

---

## 7. Positions, roles, schemes, and fit

### 7.1 Overall ratings

Each position has an overall formula: a weighted sum of relevant ratings, scaled to Madden's range. Weights are fitted by regression against Madden's own OVR column in the imported CSV so imported players keep overalls close to Madden's, then used for all players. Overall is a display and generic-value number. The sim uses role ratings.

### 7.2 Schemes

A scheme is a set of tendencies plus a set of roles.

**Named offensive schemes (starting set):** West Coast, Air Raid, Spread, Vertical (Air Coryell), Shanahan outside zone and play action, Power run (gap), Run and shoot style four-wide, RPO and zone read, Pro style balanced.

**Named defensive schemes:** 4-3 over, 4-3 under, 3-4 two-gap, 3-4 one-gap, Wide 9 4-3, Cover 2 (Tampa 2), Cover 3 single-high, Quarters (Cover 4), Man blitz (Cover 1 pressure), Hybrid multiple-front.

**Named special teams philosophies:** conservative, balanced, aggressive (fakes, onside tendencies, return aggressiveness).

**Tendency sliders (every scheme is defined by these):**

- Offense: pass rate by down and distance, average depth of target, play-action rate, RPO rate, screen rate, designed QB runs, scramble tolerance, tempo, personnel usage (10, 11, 12, 13, 21, 22 shares), run concept mix (inside zone, outside zone, power, counter, draw), target priority by role, deep shot frequency, 4th-down aggressiveness baseline.
- Defense: front (4-man or 3-man base), base versus nickel versus dime usage, blitz rate, simulated pressure rate, man versus zone split, coverage shell mix (1, 2, 3, 4, 6), press rate, run fit style (gap control versus penetration), stunt and twist rate.

**Blends and custom:** a blend is a weighted average of two named schemes' tendencies and role recipes. A custom scheme starts from any named scheme or blend and lets every slider change. Custom schemes can be saved and reused.

### 7.3 Roles and role recipes

Each scheme defines the roles its depth chart uses (for example QB, RB1, RB2 (change of pace), FB, X, Z, slot, TE1 (move or inline), LT, LG, C, RG, RT, and defensive roles such as 3-4 OLB, 4-3 DE, 3-tech DT, 1-tech NT, Mike, Will, Sam, press CB, zone CB, slot CB, free safety, strong safety, box safety, K, P, KR, PR, LS, gunner).

A **role recipe** has three layers.

1. **Rating weights.** Each relevant rating gets a weight, and the weights sum to 1. Role rating (base) is the weighted average. Example: zone scheme RB weights vision 0.25, agility and change of direction 0.20, acceleration 0.15, juke and spin 0.15, speed 0.10, carrying 0.10, trucking and break tackle 0.05. Power scheme RB weights trucking and break tackle 0.35, strength and stiff arm 0.20, carrying 0.15, vision 0.10, acceleration 0.10, agility 0.05, speed 0.05.
2. **Trait adjustments.** A list of traits the role rewards or penalizes, each with a point adjustment. Style traits (QB style, LB style) match or clash with the role directly. Behavior traits change per-play behavior in the sim, and the recipe records how much those behaviors are worth in this scheme (for example, aggressive "forces passes" is worth +1 in Vertical and -2 in West Coast).
3. **Ability value.** Each ability has trigger situations (section 7.4). Its fit contribution is its strength times how often the scheme creates its triggers for that role, using the scheme's measured situation profile.

**Role rating = base + trait adjustments + ability value**, then capped. **Fit = role rating minus overall.** Fit is capped at plus or minus 8 by default (setting). Calibration checks that the best-fit versus worst-fit gap for the same player produces meaningful but not dominant stat differences (section 23).

The UI explains fit with a breakdown: "Good fit for Outside zone: +3 ratings (vision, agility), +1 traits (YAC catch), +2 abilities (Elusive, triggers often here), -1 traits (fumble prone)."

### 7.4 Abilities

- The game has its own ability catalog (original names), in the style of Madden's superstar abilities. Each ability has: a name, positions, a tier (1 to 3), trigger situations (open field, contact at line, deep target, red zone, third down, two-minute, facing blitz, versus man, versus zone, bad weather, late and close, and so on), and an effect (a modifier to a specific resolution in the sim).
- If the Madden CSV includes ability names, they are mapped to the closest game abilities in `docs/MAPPING.md`.
- Abilities are earned and lost through development (section 10.6).
- Coaches also have abilities (section 13.1). Some boost specific player traits or open up specific trigger situations.

### 7.5 Situation profile

Every scheme has a measured situation profile: the share of snaps in each trigger situation for each role, produced by running the sim (not hand-written). It's recomputed when a scheme or custom scheme changes, and cached.

### 7.6 Scheme cohesion and coaching

- **Scheme cohesion** is the snap-weighted average fit of the starting lineup plus how well the coaching staff's abilities line up with the players. High cohesion gives a small execution bonus: fewer negative plays, penalties, and blown assignments. Low cohesion gives a small penalty.
- **Coordinator mismatch.** Coordinators have a preferred scheme. If the head coach (the user, or an AI head coach) picks a scheme that differs from a coordinator's preference, that coordinator's play-calling effectiveness and development bonuses drop in proportion to the distance between the two schemes' tendencies, and his morale drops.
- **Coach flexibility.** A flexible coach bends the team's tendencies toward what the roster does well, at the cost of part of the cohesion bonus. A rigid coach runs the scheme as written.
- **Adaptive play calling.** In every game, the play caller shifts tendencies toward the roster's strengths within limits set by the game plan and flexibility (for example, more 12 personnel with a strong TE2).

### 7.7 Where fit shows up

Roster, depth chart, free agency, trade, draft, and scouting screens show fit for the user's scheme. AI teams value players by fit in their own schemes, which creates real trade and free agency markets.

---

## 8. Game simulation

### 8.1 Model

A play-level simulation. Every game runs play by play internally so stats come from individual plays, but plays are not stored (section 9). Output per game: box score, scoring summary, drive summaries, written recap, full stat lines, injuries, and events for news.

### 8.2 Inputs

Both teams' depth charts and packages, role ratings and fit, traits and abilities, fatigue, injuries, game plans (section 8.7), coaching tendencies, scheme cohesion, weather, stadium, home field factors, rest, the current rule set (section 16), sim sliders (section 22.3), and the seeded random stream.

### 8.3 Play loop

1. **Situation:** down, distance, field position, clock, score, timeouts, weather.
2. **Coaching decision:** go for it, punt, or kick on 4th down; 2-point tries; timeouts; clock management. Uses the coach's tendencies (aggressiveness, clock skill), the game situation, and a win-probability estimate.
3. **Personnel and formation:** chosen from game plan and scheme usage shares, adjusted by who's available (injuries, fatigue) and adaptive play calling. The defense responds with a package (base, nickel, dime, goal line) based on its scheme and the offense's personnel.
4. **Play call:** run concept or pass concept drawn from tendencies by situation. The defense draws a front, coverage shell, and pressure call from its tendencies.
5. **Resolution** (each step draws from distributions shaped by the matchups):
   - Pass plays: protection versus rush (pressure, sack, or clean pocket, with QB sense pressure and break sack), target selection (role priority, coverage matchups, QB traits, game plan player focus), throw quality (accuracy by depth, throw under pressure or on the run), catch (catching, traffic, spectacular catch, drops trait), yards after catch (elusiveness, YAC trait, tackling), turnovers (forces passes, plays ball, strips ball), scrambles (QB style, speed, pressure).
   - Run plays: blocking versus front (run block types versus block shedding and power moves), gap or lane outcome, ball carrier result (vision, elusiveness or power by concept, trucking, break tackle versus tackling and pursuit), fumbles (carrying, covers ball, strips ball, weather).
   - Special teams: kickoff (current kickoff rules), returns (return rating, blocking, coverage), punts (power, accuracy, hang time, fair catches), field goals and extra points (power, accuracy, distance, weather, altitude, clutch), fakes and onside kicks (special teams philosophy and game plan).
6. **Penalties:** drawn per play type from player discipline traits, crowd noise (false starts for the visiting offense), fatigue, officiating crew tendency, and the rule set's penalty definitions (yardage, automatic first downs, ejection eligibility).
7. **Injuries:** per-play injury chance from exposure, the injury and toughness ratings, fatigue, surface, and the injury slider (section 10.8).
8. **Update** fatigue, clock, stats, and events. Ability triggers are checked at each relevant step.

### 8.4 Fatigue and rotations

Each player has in-game fatigue driven by snaps, stamina, heat, and tempo. The substitution system follows the depth chart, rotation rules, and packages (section 12.3), plus snap limits for players returning from injury.

### 8.5 Game-to-game variance

Randomness is spread across many sources, so no single roll decides a game: play-level outcomes, turnovers, special teams, injuries, weather, and penalties. A team **form** value per game (small, drawn from a distribution scaled by the upset slider) captures "off days." Calibration tunes these so better teams win more often without being predictable (section 23).

### 8.6 Coaching tendencies

Every head coach has: 4th-down aggressiveness, 2-point aggressiveness, clock management skill, halftime adjustment skill, challenge skill (flavor), and conservatism when leading. Halftime adjustments shift the second-half tendencies toward what worked and away from what didn't, scaled by skill.

### 8.7 Game plan

Set weekly by the user or auto. AI coaches build a plan tailored to each opponent.

- Run and pass balance, by down and distance, with situation overrides (red zone, two-minute).
- Personnel and formation usage shares.
- Blitz rate, man versus zone split, coverage shell preferences, press rate.
- Player focus: feature a player (target share or carry share boost), shadow a receiver with a corner, double-team a receiver or pass rusher, spy a mobile QB.
- Opponent scouting report: the auto plan uses the opponent's tendencies and weaknesses. The user sees the same report.

### 8.8 Output

- **Box score:** team totals and every player's stat lines.
- **Scoring summary:** every score with quarter, time, and description.
- **Drive summaries:** each drive's start, plays, yards, time, and result.
- **Recap:** 2 to 4 paragraphs generated from templates using key events, top performers, turning points, milestones, and injuries.
- **Stat log:** stat lines saved permanently (section 9).

### 8.9 Randomness and repeatability

- One seeded PRNG stream per league, with sub-streams per game, per offseason phase, and per AI decision so changes in one area don't reshuffle others.
- **Weighted seed:** each league has a base seed, but every advance mixes in a "variance nonce" drawn from the league stream plus the user's actions since the last advance. The result is that the same choices lead to similar, not identical, outcomes, which is what the user wants.
- For tests and bug reports, a **fixed mode** (dev menu and test harness) disables the nonce so results are exactly reproducible.

---

## 9. Stats, logs, and history storage

### 9.1 Principles

- **Every player's stat line from every game is stored permanently.** Looking up a player's receiving yards, receptions, and touchdowns from 12 seasons ago must be one tap from his career page.
- Play-by-play is never stored.
- Box scores, scoring summaries, drive summaries, and recaps are also kept forever by default. The user can export and then clear old history (section 21) if storage or speed ever becomes a problem.

### 9.2 Stat categories (default, review)

Stored per game per player in category tables:

| Category | Fields |
|---|---|
| Passing | attempts, completions, yards, TDs, INTs, sacks taken, sack yards, longest, first downs, air yards, 20+ yard completions, times pressured, throwaways, dropped passes by receivers |
| Rushing | carries, yards, TDs, longest, first downs, fumbles, fumbles lost, yards after contact, broken tackles, 10+ yard runs |
| Receiving | targets, receptions, yards, TDs, longest, first downs, yards after catch, drops, contested catches, 20+ yard catches |
| Blocking | snaps, sacks allowed, pressures allowed, penalties, pancakes (flavor), run block win rate |
| Defense | snaps, solo tackles, assisted tackles, tackles for loss, sacks, QB hits, pressures, INTs, INT yards, INT TDs, passes defended, forced fumbles, fumble recoveries, fumble return TDs, safeties, targets allowed, completions allowed, yards allowed, TDs allowed, missed tackles |
| Kicking | FG attempts and makes by distance band (0-39, 40-49, 50+), longest, XP attempts and makes, kickoffs, touchbacks |
| Punting | punts, yards, net yards, inside 20, touchbacks, longest, blocked |
| Returns | kick returns, yards, TDs, punt returns, yards, TDs, fair catches |
| Participation | offensive snaps, defensive snaps, special teams snaps, started (yes or no) |
| Penalties | count and yards by type |

Derived stats are computed, not stored: passer rating, completion percentage, yards per attempt, adjusted yards per attempt, yards per carry, catch rate, yards per route (if routes are tracked), and so on.

Team game stats are stored per game (totals, third and fourth down conversions, red zone trips and TDs, time of possession, penalties, turnovers).

### 9.3 Storage layout

- One IndexedDB record per season per category, stored in columnar form (typed arrays for player ID, game ID, and each numeric field). A season is about 20,000 rows total, roughly 0.5 MB packed.
- Indexes: player ID to row positions per season (built on load of that season), so a career game log loads one season at a time.
- **Running aggregates** updated after every game: player season totals, career totals, team season totals, franchise totals, league leaders, and the records book (section 18.5). History screens read aggregates, not raw logs, except for game logs.
- Preseason stat lines are stored and labeled but excluded from season and career totals.

---

## 10. Player lifecycle

### 10.1 Names, colleges, hometowns

- **First names:** from US Social Security Administration baby name data (public domain), filtered to birth years matching each prospect's age and weighted by frequency. About 3,000 names embedded.
- **Last names:** from the US Census Bureau surname list (public domain), weighted by frequency. About 5,000 names embedded.
- **Colleges:** real NCAA programs (FBS and FCS, plus a small share of Division II and III), weighted by how often each produces NFL players, with conference and region.
- **Hometowns:** US cities weighted by population, with a small international share.
- New names are checked against every existing player (active and retired) so no duplicate full names are generated within a 20-year window, and no generated name matches a player in the base database.

### 10.2 Player generation (draft classes and fictional leagues)

Generated players must look statistically like real ones.

1. **Fit archetype templates from the Madden CSV** (build step `tools/fit-archetypes.ts`): for each position, cluster players into archetypes (for example speed rusher and power rusher, scrambling and pocket QB, possession and deep-threat WR). For each archetype, record the mean and spread of every rating, the correlations between ratings, height and weight ranges, and trait frequencies conditional on ratings. Save as `src/data/archetypes.json`.
2. **Generate a player:** choose position (by class mix), then archetype (by frequency), then draw correlated ratings from the archetype's distribution (a multivariate normal with the fitted correlations, clamped to range), then height and weight, then traits (conditional on ratings, so a high-trucking back is more likely to have "fight for yards"), then personality.
3. **True and potential ratings:** every prospect has hidden true current ratings and a hidden ceiling. Ratings at draft time reflect college-level development, so most rookies start below their ceiling.
4. **Fictional leagues** generate full rosters using the same system, with ages and experience spread like a real league, and generated contracts that fit each team under the cap.

### 10.3 Draft classes

- About **450 prospects** per class by default (setting).
- **Position mix** defaults to a balanced mix close to real drafts, adjustable per position (setting).
- **Class strength:** each class draws an overall strength modifier and a per-position strength modifier (a "deep QB class" or a "thin tackle class"), with sliders for mean and variance, overall and by position.
- **Bust and gem frequency:** controlled by the spread between perceived and true value and by development variance, with sliders by position.
- Each class is generated before the season that precedes its draft, so it can be scouted all year, and its details are revealed progressively.

### 10.4 Scouting and the draft

- **What teams see:** every team, including the user, sees each prospect's **scouting grade** (true value plus noise). All players' actual ratings are visible once they're in the league, per the user's choice. For prospects, the noise shrinks with scouting investment and the director of scouting's skill.
- **Scouting model:** scouts are assigned to regions (national, Northeast, Southeast, Midwest, West, and so on). Each week, each scout generates scouting points for prospects in his region, which are spent on specific prospects to reduce uncertainty and reveal traits and abilities. Auto scouting assigns scouts and spends points.
- **Combine and pro days:** reveal measurables and drill results (40-yard dash, bench, vertical, broad jump, 3-cone, shuttle), each derived from ratings with noise. Big risers and fallers generate headlines.
- **Interviews and character:** top-30 visits and interviews reveal personality traits.
- **Media hype:** notable prospects get headlines (strong combine, off-field issue, big pro day) that move media big boards and, if the news-effects setting is on, AI teams' rankings.
- **Mock drafts:** published weekly from the midseason point, based on the AI's projected picks.
- **Draft:** 7 rounds plus compensatory picks. Picks can be traded before and during the draft by the user and AI (section 15). The clock is phase-based: the user makes each pick or sets auto.
- **Media draft grades:** after the draft, each team gets a letter grade with a short blurb.
- **UDFA scramble:** after the draft, undrafted players get offers. Players choose using the same decision model as free agents (section 11.7), weighting roster opportunity heavily. Any rookie UDFA still unsigned at the end of the following Super Bowl week is removed from the game.

### 10.5 Progression and regression

Each player's ratings change during the season (small, weekly) and in the offseason (larger, at training camp).

- **Four curve settings,** as in Madden: progression by age, regression by age, progression by position, regression by position. Each is a table (age or position to a multiplier) in settings, plus overall progression speed and regression speed sliders, each split by age and by position.
- **Drivers:** age curve, potential remaining, dev trait, playing time and snaps, practice and training focus, position coach and coordinator quality and ability bonuses, scheme fit (slightly faster development in well-fitting roles), mentors (section 10.9), facilities (small effect), injuries, and work ethic.
- **Training focus:** weekly focus per unit and per player (for example "footwork" or "ball security"), and offseason training programs. Auto mode sets these.
- Different ratings age differently: speed and agility decline earliest, awareness and route running keep improving later.

### 10.6 Dev traits and abilities

- Dev traits can upgrade or downgrade based on performance, playing time, and age (rates are settings).
- Abilities are earned when a player crosses rating thresholds and performs in the ability's trigger situations. They're lost when ratings fall below thresholds.

### 10.7 Retirement

Each offseason every veteran gets a retirement chance from age, recent decline, injuries, contract status, whether he just won a title, personality, and the retirement-age slider. Surprise retirements (young players, sudden) happen at a low rate. Retired players keep full history and become Hall of Fame candidates after 5 seasons.

### 10.8 Injuries

- **Model:** injury type and body part, severity, weeks out, and status (out, doubtful, questionable, probable designations for the week).
- **Lingering effects:** players returning from some injuries play with reduced ratings for a few weeks.
- **Re-injury risk:** raised for a period after return, and raised further if the player is rushed back.
- **Career-altering injuries:** rare severe injuries permanently reduce specific ratings (for example speed after an Achilles tear) or end careers.
- **Playing hurt:** questionable players can be activated by the user or AI, with performance penalties and higher re-injury risk.
- Medical facilities slightly shorten recovery (small effect, section 20.4).
- Injury frequency and severity are settings (section 22.3).

### 10.9 Personality, morale, and the locker room

- **Personality traits (hidden, revealed through interviews and time):** ego, loyalty, work ethic, leadership, competitiveness, greed, volatility, media style, social activity.
- **Morale** changes with performance and role, contract compared to peers, team success, how the team treated teammates (cutting or trading popular players, lowball offers), coaching conflicts, and playing time.
- **Locker room:** leaders raise teammates' morale, mentors speed up development of young players at their position group, disruptive players lower morale, and chemistry grows with time together (small bonus for continuity along the offensive line and in the secondary).
- **Drama (setting-controlled):** holdouts, trade demands, public complaints, and clashes between star players and coaches (only star players clash with coaches).
- **Off-field events and suspensions** (setting, can be disabled): conduct and PED suspensions, legal issues as flavor, and positive events (charity work that feeds Man of the Year).

---

## 11. Contracts, salary cap, and free agency

### 11.1 Salary cap

- The 2026 cap is set from the base database (or entered at league creation if the CSV doesn't carry it).
- **Growth:** each new league year, the cap grows by a blend of a fixed rate and league revenue growth: `newCap = oldCap x (1 + w x fixedRate + (1 - w) x revenueGrowth)`. The fixed rate, the blend weight `w`, and a floor and ceiling on yearly change are settings.
- A salary floor (minimum cash spending over a rolling window) is enforced as in the CBA, as a setting. **(default, review)**
- Unused cap space rolls over to the next league year (setting, on by default).

### 11.2 Cap accounting (default, review)

Computed from contract structure, never stored as totals:

- Base salary counts in its year. Signing bonuses are prorated evenly over the contract years (maximum 5 years), including void years.
- Roster, option, and workout bonuses count in the year earned. Per-game roster bonuses count by games active.
- Incentives: likely to be earned (based on last season's stats) count now. Not likely to be earned count only if earned, charged to next year's cap.
- **Releases and trades:** remaining proration accelerates as dead money. With a June 1 designation (up to 2 per year, setting), the current year keeps one year of proration and the rest moves to next year.
- **Restructures:** convert base salary to signing bonus, spreading it over remaining years plus any void years.
- **Void years:** extra years that void automatically, used to spread proration. When they void, remaining proration accelerates.
- **Options:** team options and player options with exercise deadlines.
- **Guarantees:** fully guaranteed, injury-only guaranteed, and guarantees that vest on set dates. Guaranteed money owed when cut becomes dead money.
- The contract screen shows each year's cap hit, cash, dead money if cut (pre and post June 1), and savings.

### 11.3 Contract types

Veteran contracts and extensions, minimum contracts (with the veteran salary benefit if modeled), rookie contracts, 5th-year options, franchise tags, transition tags, RFA tenders, practice squad contracts, and UDFA contracts.

### 11.4 Rookie contracts

- A rookie wage scale by pick: 4-year contracts with slotted values and signing bonuses. The scale grows with the cap.
- First-round picks carry a **5th-year option**, exercised in the re-sign window after year 3, with the option salary set by the CBA-style formula (based on playing time and Pro Bowls, simplified to tiers). **(default, review)**

### 11.5 Tags and tenders (default, review)

- **Franchise tag, exclusive:** one-year salary equal to the average of the top 5 cap hits at the position, or 120% of the player's prior salary, whichever is higher. No other team can negotiate.
- **Franchise tag, non-exclusive:** same salary, other teams can offer, and the original team can match or take two first-round picks.
- **Transition tag:** average of the top 10 at the position, right of first refusal only.
- One tag per team per year. A second consecutive tag costs 120% of the prior tag, and a third costs 144% or the QB tag amount.
- **RFA tenders** for players with 3 accrued seasons: first-round, second-round, and original-round tenders, plus right of first refusal only.

### 11.6 Negotiation

- The user makes an offer (years, salary per year, signing bonus, guarantees, incentives, void years). The player's agent responds with accept, reject, or a counter that states which terms matter most.
- Negotiation patience is limited. Repeated lowball offers lower the player's interest and morale.
- The user can mark any offer, including an opening offer, as **take it or leave it**. The player then accepts or rejects outright, with no counter.
- Auto negotiation uses the AI contract logic with the user's cap strategy settings.

### 11.7 Player decision model (free agency, re-signing, UDFA)

A player scores each offer using weights from his personality:

- **Money:** total value, guaranteed money, and yearly average compared to his market value.
- **Contender status:** team strength projection and recent results.
- **Role and playing time:** projected depth chart spot and snap share.
- **Location, loyalty, and coach:** hometown, climate preference, loyalty to his current team, and relationships with the head coach or coordinators.
- **Scheme fit:** how well he fits the team's scheme.

Players can accept the best offer, wait for better offers if unhappy with the market, or take less to stay home or chase a ring, all driven by personality.

### 11.8 Free agency and compensatory picks

- **Phases:** Free agency week 1 to 4, then open signing through the season.
- **Bidding:** teams submit offers during a week. At the end of each week, players choose among offers (or wait). Top players sign early, and the market softens for those who wait.
- **Compensatory picks (default, review):** up to 32 per draft, rounds 3 to 7, awarded to teams that lost more (or better) qualifying unrestricted free agents than they signed in the previous league year, using contract value, playing time, and postseason honors as the value measure. Maximum 4 per team. Announced at the annual meeting phase.

### 11.9 Holdouts and trade demands

Unhappy players under contract may hold out of training camp or games (fines apply per the CBA, setting), request a trade, or demand a new deal. Resolution options: extension, trade, or waiting it out, each with morale and locker room consequences. Frequency is a setting.

---

## 12. Rosters, depth charts, and packages

### 12.1 Roster rules (defaults are current NFL rules, configurable at start and anytime)

**(default, review: verify each number against the current CBA and league rules before shipping)**

- 53-man active roster in season, 90 in the offseason.
- Game-day actives: 48, provided at least 8 are offensive linemen, otherwise 47. An emergency third QB can be designated.
- Practice squad of 16 plus one international pathway exemption, with a limit on veterans with more than 2 accrued seasons (6 by default).
- Practice squad elevations: up to 2 per game, each player elevated at most 3 times per season before he must be signed to the active roster.
- Injured reserve: minimum 4 games for players placed after the final cutdown, with up to 8 designated-to-return activations per season.
- PUP and NFI lists, reserve lists for suspensions, and the waiver wire with priority by draft order in the offseason and early season, then by record.

### 12.2 Depth chart

- A depth chart per scheme role (section 7.3), plus special teams roles.
- **Auto depth chart** depends on the head coach's personality. Coach types (as a weighted profile): meritocrat (highest role rating starts), veteran-leaning (experience tiebreaks), developer (gives young high-potential players snaps), loyalist (keeps established starters until they clearly decline), and contract-sensitive (plays expensive players). AI head coaches and the user's auto mode use these.
- The depth chart advisor (section 19.5) shows suggested changes and why.

### 12.3 Rotations and packages

- **RB committees:** split carries by role (early down, third down, goal line) and by fatigue.
- **Defensive line rotation:** snap targets per lineman by stamina and depth.
- **WR packages:** slot, 3-WR, and 4-WR sets by personnel usage.
- **Nickel and dime DB packages:** substitution of linebackers for defensive backs by down and distance and offensive personnel.
- **TE rotation by personnel:** inline and move tight ends by 11, 12, and 13 personnel usage.
- **Goal-line and short-yardage units.**
- **Snap limits:** for fatigue and for players returning from injury.
- **Development snaps:** planned snaps for young players, set by the coach's developer tendency or manually.
- **Situational subs:** third-down back, red zone tight end, pass-rush specialist, dime linebacker, and other named situations, set in the depth chart's package tab.

---

## 13. Staff and coaching

### 13.1 Staff ratings and abilities

- **Head coach:** game management (clock, 4th down, 2-point, halftime), motivation, player development, scheme knowledge, discipline, and flexibility. Plus abilities.
- **Coordinators (OC, DC, STC):** play calling, scheme mastery, development of their side, and a preferred scheme. Plus abilities (for example a "QB whisperer" OC ability that boosts QB progression).
- **Position coaches** (QB, RB, WR, TE, OL, DL, LB, DB, ST): development bonus for their group and technique bonuses for specific ratings.
- **Front office:** director of scouting (scouting accuracy and points), director of personnel (player evaluation accuracy, contract value sense), scouts (points and regional expertise).
- **GM** (section 13.2).

### 13.2 The GM the user hires

The user is the GM. A hired GM contributes only through his abilities, as bonuses (for example "Cap wizard: dead money from cuts is 15% lower," or "Trade shark: AI teams demand slightly less in trades"). He makes no decisions.

### 13.3 Staff job market

- Staff have contracts (years, salary), ratings, ages, and career histories.
- **Staff management phase** (end of season): firings, contract expirations, re-signings, hirings, and retirements.
- **Poaching:** other teams can hire a coordinator away for a head coaching job (a promotion can't be blocked) or hire a position coach away for a coordinator job. Lateral moves are blocked while under contract.
- Coordinators and position coaches age, improve, decline, and retire. Promising position coaches become coordinators, and coordinators become head coaches.
- Staff salaries come out of the team's budget, not the player salary cap.

### 13.4 Coaching records

Head coach records count only games as a head coach. A coordinator promoted to head coach starts with no head coach record (section 18.6).

---

## 14. AI system

The AI is the glue of the game. It MUST make the league feel alive for decades: varied, believable, sometimes wrong, never stale.

### 14.1 Architecture: weighted utility decisions

All AI decisions (for AI owners, GMs, coaches, and players) use one decision framework:

1. **Generate options** for the decision (for example: all feasible free agent offers, trade packages, draft picks, cuts, depth chart orders, or hire candidates).
2. **Score each option** with a set of **considerations**. Each consideration reads inputs from the world, turns them into a 0 to 1 score through a response curve, and has a weight.
3. **Weights come from the decision-maker's personality, current pressures, biases, memory, and team mode**, so two AI GMs facing the same situation score options differently.
4. **Combine** scores (weighted geometric mean, so one very bad consideration can veto an option).
5. **Pick** with controlled randomness: a softmax over the top options, with a temperature set by competence (section 14.5). Low competence means more mistakes and more randomness.
6. **Log** the decision (section 14.10).

Considerations are small, named, testable functions in `src/engine/ai/considerations/`. Decisions are composed from them in `src/engine/ai/decisions/`.

### 14.2 Inputs available to the AI

The AI has access to everything a real front office would know, and nothing it shouldn't (it never sees true prospect ratings, only its own scouting grades):

- **Players:** ratings, role ratings and fit in its own scheme, stats and production (current and career), age and aging curve projection, contract (cost, years, guarantees, dead money), injury history and current injuries, personality (as far as revealed), morale, dev trait, abilities, traits.
- **Team:** depth chart and holes, positional needs by role now and in 1 to 3 years, cap space now and projected, dead money, team strength projection, win-loss record and trend, schedule strength, scheme and cohesion, coaching staff ratings and preferences, locker room state.
- **League:** other teams' needs, cap space, and modes, the free agent pool, the draft class (via its own scouting), market prices by position, trade history, league trends (which schemes are winning).
- **Organization:** owner demands and patience, GM and coach job security, fan and media pressure, finances (for owners), relationships and grudges.

### 14.3 Personality

Every AI GM, head coach, and owner has a personality profile (numeric traits, 0 to 100), generated at creation and drifting slowly over time.

- **GM traits:** risk tolerance, patience (win-now versus long view), aggression in trades, analytics versus scouting lean, loyalty to own players, positional value beliefs, veteran versus youth lean (can change year to year), draft philosophy (need versus best available), negotiation toughness, cap discipline, extension timing (early versus wait), and preferred contract structures (front-loaded, back-loaded, void years).
- **Head coach traits:** depth chart style (section 12.2), scheme preferences, rigidity, player relationships, in-game tendencies (section 8.6), and how much personnel power he pushes for.
- **Owner traits:** see section 14.8.

### 14.4 Team mode and strategy

Each AI team has a mode, re-evaluated at every decision point: **win now**, **contend**, **soft rebuild (retool)**, or **full rebuild**. The mode depends on team strength projection, age of core players, cap health, QB situation, owner patience, and GM personality. Modes shift the weights of considerations: win-now teams value current ability and pay for veterans, rebuilders value youth, picks, and cap flexibility.

Over decades, teams go through **eras and cycles** naturally: they build, peak, get expensive, age, and rebuild.

### 14.5 Competence

- Each GM, coach, and scout has a competence rating that sets how accurately they read value and how much randomness enters their choices.
- A league-wide **AI competence slider** scales everyone's competence (section 22.6).
- Mistakes are real but explainable: overpaying in a bidding war, reaching for a favorite prospect, trading future picks for an aging veteran, keeping a declining starter out of loyalty.

### 14.6 Biases (they shift over time)

Each GM has a few biases, each a small adjustment to how he values specific things: loves speed, overvalues combine results, trusts production over ratings, undervalues running backs, prizes pass rushers, favors players from certain conferences, avoids injury histories, and so on. Biases drift: they strengthen after successes and weaken or flip after failures (section 14.7).

### 14.7 Memory

The AI remembers, with decay over time:

- **Past mistakes:** a GM burned by a big free agent bust becomes more cautious with similar contracts. A GM whose late-round pick hit gains trust in that scouting approach.
- **Loyalty to franchise players:** long-tenured stars get extensions and patience that pure value wouldn't justify.
- **Relationships with players and agents:** players who were treated well (fair offers, kept promises) are warmer to the team, and agents remember lowballs.
- **Grudges:** after a lopsided trade, the losing GM is less willing to deal with the winning team for a while. Grudges also form after tampering accusations and bitter holdouts.

### 14.8 Pressure

Current pressures change decision weights:

- **Hot seat and job security:** GMs and coaches on the hot seat make desperate, short-term moves.
- **Owner demands:** meddling owners push for star signings or specific players.
- **Fan and media pressure:** losing streaks, bad press, and fan anger push toward visible moves.
- **Cap crunch:** teams over or near the cap must cut, restructure, or trade.

**AI owners** have personalities that drive spending on facilities and staff, patience with coaches and GMs, relocation and rebranding appetite, rules committee voting, ticket pricing, and willingness to meddle in personnel.

### 14.9 Organization structure and conflict

Each AI team has a power structure: **GM-led**, **coach-led**, or **meddling owner**. It decides whose preferences win on personnel. Friction is modeled: a GM may draft a QB the head coach didn't want, or a coach may push for a veteran the GM didn't want, which affects the coach's use of that player, morale, and firing decisions later.

### 14.10 Decision cadence and the debug log

- **Cadence:** AI teams re-evaluate weekly in season, at every offseason phase, and immediately on big events (a major injury, a trade offer, a star's holdout, a coach firing).
- **Debug log:** every AI decision records the decision type, the options considered, every consideration's input values, curve outputs, weights, and scores, the chosen option, and the rejected options with the reasons they lost. The log is viewable in the dev menu and debug build (section 23.5), filterable by team and decision type. News and rumors surface the most interesting reasons as hints.

### 14.11 AI behavior by domain

**Roster strategy:** contend and rebuild cycles, cap management, need versus best available by GM, player development and longevity planning, succession planning (drafting a QB behind an aging starter), and occasional bad decisions.

**Draft:** blend need and best available by GM, positional value premium (QB, EDGE, LT, CB), reaches for favorite prospects, trades down when the board is thin, trades up for players they love. QB-needy teams draft QBs early, and desperate teams trade up for them. Rankings are swayed by combine and pro day results, media hype, interviews and character, and their own scouts' misses.

**Free agency:** bidding wars and overpays for top players, waiting for late bargains, recruiting on fit and the contender pitch, and contract structures that match cap strategy.

**Contracts and cap:** extension timing varies by GM (early versus letting the market set the price), franchise tags, restructures to create space, cap casualty cuts, and void years to push costs out.

**Trades:** section 15.

**In season:** sign free agents to cover injuries, adjust depth charts and game plans weekly, bench struggling starters, and play for draft position in lost seasons (roster decisions only, never throwing games).

**Coaching staff:** AI owners fire head coaches and GMs based on results, expectations, and patience. Hiring weighs scheme fit with the current roster, reputation and past record, promoting coordinators from within, and owner and GM preferences. The coaching carousel includes poaching coordinators for head coaching jobs.

**Game planning:** every AI coach builds a plan tailored to each opponent using the opponent's tendencies and weaknesses, scaled by coach skill.

**Players:** free agent choices, morale, holdouts, trade demands, retirement, social posts, and locker room effects all use the same decision framework with player personality weights.

### 14.12 Keeping the league alive over decades

- **Team identities:** teams develop identity tags from their history and leadership (defense-first, analytics-driven, draft-and-develop, win-now spenders, ground-and-pound), which persist while leadership stays and shift when a new front office takes over.
- **New front offices change direction:** a new GM or coach brings his own scheme, biases, and roster philosophy, so teams visibly change.
- **Copycat league:** schemes that win get copied. Scheme popularity is tracked league-wide, and AI coaches drift toward successful schemes (and defenses adapt to popular offenses, slowly lowering their edge). If league style drift is on, this also shifts league-wide tendencies over decades.
- **Anti-staleness checks:** the harness flags repeated identical moves (the same team trading the same types of players every year, every team drafting the same way), low variety in team-building approaches, and teams stuck in cap trouble or with unfilled roster holes (section 23.3).

### 14.13 How the AI treats the user

Configurable (section 22.6): exactly like any AI team, or slightly tougher (harder to fleece in trades, less willing to be exploited repeatedly, smarter about the user's patterns).

---

## 15. Trades

### 15.1 Valuation

Every team values assets from its own point of view:

- **Player value** = projected on-field value over the remaining contract (role rating in the receiving team's scheme, projected with aging, weighted by positional value) minus cost (cap hits versus market value), adjusted for injury risk, personality, and the team's mode. The same player has different value to different teams.
- **Positional value** weights (QB highest, then EDGE, LT, CB, WR, and so on down to RB, LB, TE, K, P) are GM beliefs with personality variation.
- **Draft picks:** valued with a pick value chart. The default blends the classic Jimmy Johnson chart with a modern outcomes-based chart (setting chooses the blend). Future picks are projected from the trading team's expected finish and discounted per year (by the GM's patience). Picks can be traded up to 3 years out.
- **Team context:** needs (surplus at a position lowers value), cap room and dead money created, scheme fit, mode, owner demands, GM biases, relationships and grudges, and deadline urgency.

### 15.2 Acceptance and negotiation

- A trade is acceptable to an AI team when its value gain exceeds a threshold set by GM personality, competence, the trade difficulty slider, and how the AI treats the user.
- The AI can accept, reject, or counter. Counters add or remove assets to balance value, searching the other team's roster and picks for combinations that work for both.
- The user can send any offer as **take it or leave it** (no counter comes back).
- **"What would it take":** the user picks a player, and the AI returns packages it would accept.
- The AI explains rejections with its top reasons (from the decision log), phrased in plain language.

### 15.3 Trade behaviors

- AI teams propose trades to the user and to each other, with frequency set by a slider.
- **Trade block:** the user and AI teams list players they're shopping. The rumor mill reports interest, some of it real and some not.
- **Deadline frenzy:** activity rises in the weeks before the deadline, driven by contenders and sellers.
- **Player trade demands:** unhappy players can demand trades, which lowers their trade value slightly and creates pressure.
- **Draft-day trades:** during the draft, teams trade picks, picks for players, and future picks.

### 15.4 Rules and guardrails

- **Real NFL trade rules (toggle, default on):** trade deadline, cap compliance after the trade, roster limits, no trading recently signed free agents until a set date, and restrictions on tagged players.
- **Anti-exploit guardrails (separate toggle, default on):** consolidation penalty (several average players don't add up to a star), salary-dump pricing (taking bad money costs assets), no rapid re-trading of the same player, AI learns the user's repeated patterns, and a sanity check against obviously lopsided accepts.

---

## 16. Rules committee

- The rules committee meets at the annual meeting phase each year.
- **The user can always propose rules.** AI owners proposing rules is a setting locked at league start.
- **Proposals can change:** roster and cap rules, on-field rules (kickoffs, overtime, two-point conversions, fair catches), draft and free agency rules, player safety rules, and penalty rules (yardage, automatic first downs, and whether a foul can lead to ejection or suspension).
- **Voting:** 24 of 32 owners must approve. Each AI owner votes using the decision framework with considerations for his team's competitive interest (does this help my roster?), league health (parity, safety, scoring), tradition, and personality. The user sees a whip count before the vote.
- **Effects:** every rule lives in the league's **rule set**, a versioned data object. The sim, cap, roster, draft, and free agency code read rules only from the rule set, never from hard-coded constants. Rule changes take effect the next league year unless marked immediate. Rule history is recorded in league history.
- The season format (17 games, 14-team playoffs) is fixed and isn't votable.

---

## 17. Stadiums, weather, and home field

### 17.1 Stadiums

Each stadium has: name, city, capacity, roof (open, dome, retractable), surface (grass or turf), altitude, climate profile (monthly temperature, wind, and precipitation normals), crowd noise factor, luxury suite count, and age and condition (for upgrades). Real stadium data for all 32 teams is embedded. New stadiums (section 20.5) replace these values.

### 17.2 Weather

- Open-air and retractable (when open) stadiums draw game weather from the stadium's climate for that week: temperature, wind, precipitation (none, rain, snow), and intensity.
- **Effects:** wind shortens and reduces accuracy of deep passes and kicks. Rain and snow raise fumbles and drops and shift play calling toward the run. Cold shortens kicks and gives a small penalty to dome-based teams on the road. Heat speeds fatigue. Altitude lengthens kicks and speeds visitors' fatigue. Surface slightly affects speed and injury risk.
- Weather triggers relevant abilities and changes the scheme's situation profile for that game.
- A weather impact slider scales all effects (section 22.3).

### 17.3 Home field advantage

Built from specific sources, not one flat bonus:

- **Crowd noise:** raises false starts and communication errors for the visiting offense, scaled by the stadium's noise factor and team hype.
- **Travel and time zones:** long trips and West-to-East early kickoffs.
- **Rest:** short weeks after Thursday games, and extra rest after byes.
- **Familiarity:** a small bonus in division games.

The combined effect is calibrated to modern NFL levels (roughly 1.5 to 2.5 points per game, confirmed by sourced data in the harness) and scaled by the home field slider.

---

## 18. Media, awards, and history

### 18.1 News feed

- News is generated from events. The sim, transactions, and AI emit events (injuries, milestones, streaks, records, trades, signings, cuts, holdouts, coaching changes, draft risers, upsets, big performances).
- Each event gets a **newsworthiness score** (player or team prominence, rarity, stakes, recency). Each week the feed shows the top items plus weekly features: power rankings, players of the week, injury report roundup, and the playoff picture late in the season.
- **Rumors and insider reports** come from real AI interest (trade interest, contract talks, coaching candidates), with some false rumors mixed in.
- **Milestones, records, and streaks** reference history ("first 1,500-yard rushing season since 2031").
- **Variety:** many templates per event type, with tone variants. The same template isn't reused for the same team within 4 weeks.
- **Effects (setting):** flavor only, or news moves player hype, morale, and prospect stock.

### 18.2 Social feed

- A feed of posts from **commentators** (generated media personalities with styles: analyst, hot-take artist, insider, local beat reporter) and **players**.
- Player posts depend on personality (social activity, ego, media style), individual and team performance, and league events: celebrating wins, reacting to trades of teammates, contract complaints, trash talk before rivalry games, milestones.
- Volume is a setting. **(default, review: tone guidelines, frequency, and moderation of content)** Posts stay PG-13.

### 18.3 Press conferences

- Weekly and after big events, the user answers a few questions by picking from 2 to 4 responses.
- Responses affect player morale (praising or criticizing a player), locker room, fan hype, and media narrative. **(default, review: which choices change what, and by how much)**

### 18.4 Awards

- **Season awards (real names):** MVP, Offensive Player of the Year, Defensive Player of the Year, Offensive Rookie of the Year, Defensive Rookie of the Year, Comeback Player of the Year, Coach of the Year, Walter Payton Man of the Year, All-Pro first and second teams, and Pro Bowl rosters.
- **Weekly and monthly:** offensive, defensive, and special teams players of the week and month, rookie of the week.
- **Voting simulation:** candidates are scored on production (ranked against their position), team success, and narrative (performance versus preseason expectations). A panel of 50 simulated voters, each with their own random lean, casts ballots. Vote shares are shown. Man of the Year uses off-field events and personality.

### 18.5 Records book

League, franchise, and player records for single game, single season, and career, across all tracked stats, plus team records (wins, points, streaks). Records update after each game, and broken records generate news.

### 18.6 History screens

- **Player career page:** bio, ratings history by season, awards, transactions, and **season-by-season and game-by-game stat logs for every season played**.
- **Franchise history:** season-by-season records, playoff results, titles, coaches, draft history with career outcomes, retired numbers, ring of honor, relocation and rebrand history.
- **League record book** (section 18.5).
- **Season archives:** final standings, playoff brackets, awards, stat leaders, all-pros, draft results, and major transactions for every season.
- **Coaching records:** head coach regular season and playoff W-L, playoff appearances, conference titles, Super Bowl results and stats. Coordinator wins don't count toward head coach records.

### 18.7 Hall of Fame and team honors

- **Eligibility:** players, coaches, and executives, 5 seasons after retirement.
- **Career score:** All-Pro selections (heaviest), awards, Pro Bowls, championships, longevity, and all-time rank at the position in key stats. Scored against position peers so kickers and linemen are judged fairly. Coaches and executives use wins, titles, and sustained success.
- **Voting:** a simulated committee reviews finalists each year. Induction needs 80% approval, and classes are capped at a handful per year, so borderline candidates wait and some get in late.
- **Rings of honor and retired numbers:** AI teams add former players based on franchise impact. The user can add them manually.

---

## 19. Interface and screens

All UI follows `franchise-gm-styleguide.md`: tokens, components, the three form factors with automatic layout and manual override, Day and Night modes, and team theming. The theme always follows the user's team.

### 19.1 Navigation

Main sections: Home, Roster, Depth chart, Game plan, Staff, Scouting and draft, Free agency, Trades, Finances, League (standings, schedule, stats, news, social), History, Settings. The phone tab bar shows Home, Roster, Staff, Scout, and More, per the style guide.

### 19.2 Home screen

In this order: next game and game plan (with auto status), roster and injuries, inbox and news, standings and playoff picture. Plus quick actions (advance, set lineup, open offers).

### 19.3 Core screens

- **Roster:** table (desktop and tablet) or list (phone) with filters, role, fit, contract, and status. Player page with ratings, role ratings by scheme, fit breakdown, traits, abilities, contract, injuries, personality (revealed parts), morale, and history.
- **Depth chart:** by role, with packages and rotations tabs, drag to reorder, auto toggle, and advisor suggestions.
- **Game plan:** tendencies, personnel usage, defensive calls, player focus, opponent scouting report, auto toggle.
- **Schedule and results:** by week, with box scores, scoring and drive summaries, recaps, and stat logs for each game.
- **Standings and playoff picture**, including tiebreak explanations.
- **League stats:** leaderboards by season and career, with filters.
- **Scouting and draft:** big board, prospect pages, scouting assignments, combine results, mock drafts, and the draft room.
- **Free agency:** market, offers, player interest indicators.
- **Trades:** trade builder, trade block, proposals inbox, "what would it take," and trade value view.
- **Contracts and cap:** team cap sheet by year, contract detail, restructure and extension tools.
- **Staff:** coaching staff and front office, hiring market, contracts.
- **Finances and owner:** revenue and expenses, ticket and concession pricing, facilities, stadium projects, relocation, rebranding.
- **Rules committee:** proposals, whip count, voting results, rule history.
- **News, social feed, press conferences.**
- **History:** section 18.6.
- **Editor:** section 19.7.
- **Settings:** section 22.

### 19.4 Transactions and waivers

Sign, release (with June 1 option), place on IR or PUP, elevate from the practice squad, claim off waivers, and move between roster and practice squad. Every action shows its cap effect before confirming.

### 19.5 Analysis tools

- Player comparison (ratings, role ratings, stats, contracts, side by side).
- Trade value view (how much each team values each asset).
- Multi-year cap projections (with pending decisions: options, tags, extensions).
- Depth chart advisor.
- Contract value analysis (a contract compared to production and market).
- Team projections: projected win-loss record and playoff odds (from quick sim runs in the worker), for the user's team and the league.

### 19.6 Pausing and the inbox

Advancing pauses for event types the user selects (setting per event type): trade offers, injuries to starters, contract demands and holdouts, expiring deadlines (tags, options, cutdown), draft picks on the clock, free agent decisions on the user's offers, staff poaching attempts, and rules votes. Everything else goes to the inbox.

### 19.7 Editor

A full editor for players (ratings, traits, abilities, contracts, personality, team), teams (names, colors, stadium, finances), staff and coaches, owners, and draft classes. Using the editor marks the save as **edited** (shown in the save list and league info).

---

## 20. Owner, finances, fans, and facilities

The user is the owner. There's no pressure or firing: finances shape resources and flavor.

### 20.1 Revenue sources

Ticket sales, concessions, parking, luxury suites and club seats, personal seat licenses, merchandise and jersey sales, sponsorships and stadium naming rights, local radio and media, non-football stadium events (concerts, college games), home playoff gates, and shared national revenue (TV deals and league licensing, split evenly).

### 20.2 Expenses

Player salaries (cash, not cap), staff salaries, stadium operations, facility maintenance and upgrades, travel, scouting budget, marketing, debt service on stadium projects, and relocation costs.

### 20.3 Pricing, attendance, and fans

- The owner sets ticket, concession, and parking prices. Demand depends on price, team success, hype, market size, star players, rivalry games, weather, and stadium quality.
- **Fan base:** market size (fixed per city), fan loyalty (grows with history and stability, drops with relocation), hype (moves with results, signings, and news), and rivalry intensity (grows with close games and playoff meetings).
- **Merchandise:** jersey sales driven by star players, hype, and rebrands.

### 20.4 Facilities

Training facility, medical facility, stadium amenities, and scouting and analytics department, each with levels 1 to 5, upgrade costs, and maintenance.

- **Training facility:** small boost to player development.
- **Medical facility:** small reduction in injury recovery time.
- **Stadium amenities:** attendance and revenue.
- All facility levels also raise free agent appeal slightly.
- Development and recovery effects are deliberately small (not insignificant) so facilities can't buy wins. Calibration checks the size of the effect.

### 20.5 Stadium projects

Renovations and new stadiums with cost, public funding share (negotiated with the city, a simple model), construction time (seasons), temporary home venue if needed, and effects on capacity, noise, roof, surface, and revenue.

### 20.6 Relocation and rebranding

- **Relocation** (setting locked at start: none, user only, or any team): choose a target market from a list of cities with market size and stadium options. Costs: relocation fee, stadium deal, lost fan loyalty. AI owners may relocate based on personality, finances, and stadium situation.
- **Rebranding** (setting locked at start: none, user only, or any team): change team name and colors (the palette must pass the style guide's contrast rules, section 2.6), with a merchandise sales bump. Relocating teams usually rebrand.
- History is preserved across relocations and rebrands (records stay with the franchise).

---

## 21. Saves and storage

- **Multiple leagues,** each with its own save slot, listed on the start screen with team, season, week, and the edited flag.
- **Autosave** after every week and every offseason phase.
- **IndexedDB** stores everything. The game calls `navigator.storage.persist()` on first save to reduce the chance of the browser clearing data.
- **Export and import:** a league exports as a gzipped JSON file (via `CompressionStream`) that can be imported on another device.
- **History is kept forever.** An **export and clear history** tool exports the full league, then removes game-level detail (drive summaries, recaps, box scores, and optionally stat lines) older than a chosen season, keeping season and career aggregates, awards, and records.
- **Storage note:** a 20-season league with full stat lines and box scores is expected to use tens of MB, which is well within IndexedDB limits. Safari clears website data more readily, so the UI reminds Safari users to export periodically.
- **Save versioning:** section 2.4.

---

## 22. Settings catalog

### 22.1 Conventions

- Sliders run 0 to 100, where **50 is the calibrated default** (realistic NFL). Each slider maps to one or more internal multipliers through a documented curve.
- **When changeable:** every setting below is changeable **anytime** mid-save, except the ones marked **Start only**, which are the settings in section 3.2 (data source and starting rosters, relocation and rebrand permissions, league style drift, and whether AI owners can propose rules, plus user team, start season, and seed).
- Changing a setting mid-save applies from the next week or phase and is recorded in league history (so records set under different settings can be noted).

### 22.2 League rules (anytime; also changeable by rules votes)

Roster size (in season and offseason), game-day actives, practice squad size and veteran limit, elevation limits, IR minimum games and return designations, salary cap growth (fixed rate, revenue weight, floor and ceiling), salary floor, cap rollover, June 1 designations per year, rookie wage scale growth, 5th-year option on or off, franchise and transition tag formulas, RFA tender levels, compensatory picks on or off, trade deadline week, real NFL trade rules on or off, anti-exploit guardrails on or off, and draft rounds (7 by default).

### 22.3 Game sim and stat sliders

**General:** upset frequency (game randomness), home field strength, injury frequency, injury severity, weather impact, fit effect strength, cohesion effect strength.

**Madden-style gameplay sliders, each with separate values for the user's team and for AI teams:** QB accuracy, pass blocking, WR catching, run blocking, fumbles, pass defense reaction time, interceptions, pass coverage, tackling, FG power, FG accuracy, punt power, punt accuracy, kickoff power.

**Penalty frequency sliders (user and AI):** offside, false start, offensive holding, defensive holding, facemask, defensive pass interference, offensive pass interference, illegal block in the back, roughing the passer, intentional grounding, kick catch interference.

**League stat output sliders:** passing volume, passing efficiency, rushing volume, rushing efficiency, turnovers, penalties, scoring.

### 22.4 Development and draft

- Progression by age, regression by age, progression by position, regression by position (each a table).
- Progression speed and regression speed, each split by age and by position.
- Retirement age tendency, dev trait upgrade rate, dev trait downgrade rate, ability gain and loss rate.
- Draft class size (450 default), position mix (per position), class strength mean and variance (overall and per position), bust frequency and gem frequency (per position), scouting accuracy.

### 22.5 Contracts and finances

Player salary demands, AI free agency aggressiveness, holdout and trade demand frequency, player loyalty and hometown discount strength, cap growth rate, revenue level, attendance level, facility and stadium costs, relocation costs.

### 22.6 AI and world

AI competence (league-wide), trade acceptance difficulty, AI-to-AI trade frequency, AI trade proposals to the user frequency, AI coach and GM firing patience, how AI treats the user's team (same as others or tougher), off-field events and suspensions on or off, news effects (flavor only or moves hype, morale, and stock), player drama frequency, social feed volume.

### 22.7 Automation and display

- **Auto toggles** for each of the user's jobs: game plan, depth chart, training, scouting, contract negotiations, roster management (signings, cuts, IR and practice squad moves), coordinator management, head coach and GM management. Each can be on or off independently.
- **Pause rules** per event type (section 19.6).
- **Display:** layout (Auto, Phone, Tablet, Desktop), Day or Night mode, reduced motion. The team theme always follows the user's team.

---

## 23. Calibration harness and testing

The harness proves the sim works, and shows why. It MUST check the whole picture, not a handful of numbers.

### 23.1 How it runs

- `npm run calibrate -- --seasons N` runs N seasons headless (in Node, using the engine directly) with full AI, from a chosen starting state (real or fictional league), and writes a report to `calibration/reports/` (Markdown plus JSON) comparing every metric to its target band, with pass, warn, or fail.
- The same runner is available in the dev menu and debug build, running in the worker with a progress bar and an in-app report.
- CI runs a short version (20 seasons, a subset of metrics with wide bands). A full run (100+ seasons) runs on demand and before each milestone sign-off.
- Every tunable constant lives in `src/engine/tuning.ts`, so calibration changes are one-file diffs recorded in `docs/CALIBRATION.md`.

### 23.2 Targets

- Targets live in `calibration/targets.json`, each with a band, a source, and a note. They're built from public historical NFL data (recent seasons, and for rare events, longer history).
- Starting reference points (approximate, to be replaced by sourced values): home teams win somewhat more than half of games, with home field worth roughly 1.5 to 2.5 points in recent seasons; the better team (by a large rating gap) wins about two games in three; teams score in the low 20s per game; completion rate is in the mid 60s percent; yards per pass attempt is around 7; yards per carry is in the low 4s. The user's target: about 31% of Super Bowl teams miss the playoffs the next season.
- Perfect regular seasons and winless seasons must be extremely rare (target: a handful per 100 simulated seasons at most).

### 23.3 Metrics checked

**Games and seasons:** home win rate, home field point value, win rate of favorites by rating gap, points per game, score margin distribution, one-score game share, overtime rate, fourth-quarter comeback rate, blowout rate, win total distribution (spread and extremes), 15+ win and 2-or-fewer win seasons per decade, perfect and winless seasons, division winner repeat rate, playoff team repeat rate, Super Bowl teams missing the next postseason, worst-to-first frequency, dynasty frequency (3+ titles in 6 years), longest playoff droughts, title distribution across franchises over 50 years.

**League stats per season:** pass attempts, completion rate, yards per attempt, touchdown and interception rates, sack rate, rush attempts, yards per carry, third-down conversion rate, red zone TD rate, turnovers, penalties per game, field goal rate by distance, punt average, kick return and punt return averages.

**Stat leaders and distributions:** leader ranges for passing, rushing, receiving, sacks, and interceptions, the number of 4,000-yard passers and 1,000-yard rushers and receivers per season, and target and carry share distributions by role.

**Player consistency:** year-to-year correlation of individual stats (for example a WR's receiving yards) given similar role and health, stat changes explained by age, scheme change, teammates, and injury, and production versus rating relationships (good players produce consistently).

**Aging and development:** rating curves by age and position, peak ages, career length by position, retirement ages, dev trait counts over time, and **rating inflation or deflation** across decades (league average overall by position must stay flat).

**Draft:** hit rates by round (becomes a multi-year starter, reaches a Pro Bowl), bust rates for first-round picks, gem rates for day-3 picks, compared to published draft studies, plus QB draft behavior (QBs per first round, trade-ups for QBs, reaches).

**Injuries:** injuries per team season, games lost, season-ending injury counts, and re-injury rates.

**Effect sizes:** scheme fit (best versus worst fit for the same player), home field, each weather type, facilities (must stay small), coaching quality, cohesion, and locker room effects.

**Economy:** cap space distribution, teams over the cap, dead money share, contract values by position and rating versus market, free agent signing counts and prices, compensatory pick counts, team finances (no franchise bankrupt, revenue spread reasonable).

**Trades and AI (AI health):** trades per season (AI-to-AI and with the user), **trade fairness spread**, deadline share of trades, team mode distribution and how often teams switch modes, **variety index of team-building approaches**, **repeated identical moves**, **teams stuck in cap trouble** for multiple seasons, **roster holes left unfilled** (starters well below replacement level), realistic draft behavior, coaching firing rate and head coach tenure, carousel volume, relocation and rebrand frequency, rules votes pass rate, and AI decision log coverage (every decision has a complete log).

**Awards and history:** award winners by position (MVP mostly QBs), All-Pro distribution, Hall of Fame inductees per year and by position.

**Performance:** time to sim a season (desktop and iPhone), memory use, and storage growth per season.

### 23.4 Test suites

- **Unit tests:** rules and cap accounting (golden tests for proration, June 1 cuts, void years, restructures, tags, rookie scale), tiebreakers and seeding, schedule generation (formula and rotations over 12 years), roster rule enforcement, contract negotiation outcomes, the rule set (changing a rule changes behavior), and determinism in fixed mode.
- **Calibration tests:** section 23.1.
- **AI tests:** each consideration's response curve, decision logs complete, no illegal moves (cap, roster), and scripted scenarios (a team with no QB drafts or signs one, a capped-out team clears space).
- **Layout tests:** Playwright in WebKit and Chromium at phone, tablet, and desktop sizes, checking the main screens render with no horizontal overflow and touch targets meet the style guide minimums, in Day and Night.
- **Save tests:** save, load, export, import, and export-and-clear round trips produce identical league state.
- **Offline test:** the built file makes zero network requests.

### 23.5 Dev tools

Available both as a **hidden dev menu** in the shipped game (unlocked by tapping the version number in Settings 7 times) and in a **debug build** (`npm run build:debug` produces `dist/game-debug.html` with dev tools always on):

- Calibration runner and report viewer.
- AI decision log viewer with filters.
- Fixed-seed mode toggle.
- Sim inspector: re-run a finished game in fixed mode with extra logging (plays are generated but not stored).
- Performance overlay.

---

## 24. Defaults to review

These were decided without dedicated interview rounds and use NFL-accurate defaults. Review before or during the build:

1. Tiebreaker procedure details (section 5.3).
2. Cap accounting specifics: salary floor, rollover, June 1 designations (sections 11.1 and 11.2).
3. 5th-year option formula tiers, tag formulas, RFA tender levels, compensatory pick formula (sections 11.4, 11.5, 11.8).
4. Roster rule numbers (section 12.1), verified against the current CBA.
5. Stat categories (section 9.2).
6. Social feed tone and frequency, and press conference effects (sections 18.2 and 18.3).
7. Holdout fines and resolution (section 11.9).

## 25. Open items

- The Madden roster CSV (the user supplies it at build start). Its headers finalize section 6.3, 6.4, and the mapping.
- The 2026 salary cap figure (from the CSV or entered at setup).
- `data-raw/schedule-2026.csv`, built from the official 2026 schedule on NFL.com.
- The initial ability catalog (names, triggers, effects) and the named scheme definitions (tendency values and role recipes), drafted in milestone work and reviewed at the playable-season checkpoint.
- Calibration target values with sources (`calibration/targets.json`).
