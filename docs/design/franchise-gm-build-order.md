# Franchise GM: build order

Companion to `franchise-gm-spec.md` (what the game does) and `franchise-gm-styleguide.md` (how it looks). This document says what to build, in what order, and how to know each step is done.

## Working rules for Claude Code

1. **Read the design documents before starting.** Section numbers below refer to the spec unless marked "style guide." The Claude Code tooling in `franchise-gm-tooling.md` is set up before M0 begins.
2. **Build in milestone order.** Don't start a milestone until the previous one meets its "done when" list. Don't build features from later milestones early, except for stubs and interfaces needed to keep the code clean.
3. **The build must always work.** Every commit keeps `npm run build`, `npm test`, and the type check passing. `dist/game.html` must open offline at every milestone.
4. **One commit per logical change, one tag per milestone** (`m04-sim-v1`). The milestone report in `docs/milestones/mNN.md` records what changed.
5. **Decide, record, and continue.** When the spec is silent or ambiguous, choose NFL-accurate behavior, record it in `docs/DECISIONS.md` (the question, the choice, why), and keep going. Only stop for the user at checkpoints.
6. **No hard-coded rules or tuning.** League rules come from the rule set (section 16). Tunable numbers live in `src/engine/tuning.ts`. Styling comes only from the style guide tokens and classes.
7. **Engine code never touches the DOM.** Everything in `src/engine` is testable in Node.
8. **Every milestone ends with a short report** in `docs/milestones/mNN.md`: what was built, test results, calibration results where relevant, decisions made, and known gaps.
9. **Priorities when time is short:** game sim and stats first, then rosters, contracts, and cap, then draft, scouting, and development, then trades and AI front offices.

## What the user supplies

- `data-raw/madden-roster.csv`: the Madden player table, supplied when the build starts. Until it arrives, work from a fixture and keep the import mapping declarative so it's quick to finish.
- Review at each checkpoint.

### Starting without the Madden CSV

If `data-raw/madden-roster.csv` is missing when M1 starts, take the no-CSV path below. Nothing else in the build order changes.

- M1 builds the import pipeline against a small synthetic fixture, with its headers marked provisional in `docs/MAPPING.md`.
- M1 also builds the player generator from spec 10.1 and 10.2 early, with hand-written archetype templates in `src/data/archetypes.json` (marked provisional) and hand-set overall formulas per position. It uses the generator to create the starting league as a fictional league: all 32 teams with 53 active and 16 practice squad players, a free agent pool of about 300, generated coaches, staff, and owners, and contracts that fit each team under the real 2026 salary cap. Look up the cap and record the figure with the decision skill.
- Real teams, cities, stadiums, colors, and the 2026 schedule are used as normal.
- Two checks are deferred until the CSV arrives and listed in `docs/KNOWN-ISSUES.md`: M1's "overall formulas reproduce Madden's OVR" and M11's "generated players match the fitted archetypes."
- M11 extends the M1 generator instead of building a second one.

**When the CSV arrives:** finish the import mapping against the real headers, refit the overall formulas and archetype templates from it (`tools/fit-archetypes.ts`), clear the two deferred checks, and enable the real-data league option. The fictional-league option stays.

---

## Phase 1: the playable season

### M0. Repository, tooling, and the single-file build

**Build:**
- Repo layout from spec section 2.2, TypeScript strict, ESLint, Prettier, Vitest, Playwright (WebKit and Chromium).
- Vite with single-file output: JS, CSS, the worker, data, and fonts all inlined into `dist/game.html`. A `build:debug` variant.
- Font embedding script (style guide section 3.2) and the full style guide stylesheet (style guide section 12) in `src/styles/`.
- Theme and layout runtime from style guide section 13: all 32 team palettes, `applyTeamTheme`, Day and Night, auto layout with manual override.
- App shell with hash routing: sidebar, rail, top bar, and tab bar per style guide section 11, with placeholder screens.
- Seeded PRNG with sub-streams, the weighted-seed nonce, and fixed mode (section 8.9).
- IndexedDB wrapper and a worker bootstrap (worker created from an inlined blob) with a progress-reporting message protocol.
- `src/engine/tuning.ts`, `docs/STATUS.md`, `docs/DECISIONS.md`, `tools/doc.mjs`, and CI (lint, type check, unit tests, build).

**Done when:**
- `npm run build` produces one HTML file that opens from disk with no network (offline test passes).
- The shell renders correctly in Day and Night for any team, and switches between phone, tablet, and desktop layouts automatically and by the Layout setting. Playwright layout tests pass at all three sizes in WebKit and Chromium.
- The same seed in fixed mode produces the same random sequence across runs.

### M1. Base data

**Build:**
- Team data: 32 teams, conferences, divisions, palettes (style guide 2.6), and stadiums with roof, surface, altitude, capacity, noise factor, and monthly climate normals (section 17.1).
- `data-raw/schedule-2026.csv` from the official 2026 schedule on NFL.com, and its loader (section 5.1).
- The Madden CSV import pipeline: declarative mapping, validation, transform rules, and `docs/MAPPING.md` generation (sections 6.3, 6.4, 6.9). Use a fixture until the real CSV arrives.
- Overall rating formulas per position, fitted by regression to Madden's OVR column (section 7.1). Run against the fixture first, then the real CSV.
- Generated coaches, coordinators, position coaches, front office staff, and owners for all 32 teams (section 6.6), since the Madden file covers players only.
- `tools/build-db.ts`: builds the compact embedded base database (section 6.8).

**Done when:**
- The base database embeds in `game.html` and loads at startup in under 1 second on desktop.
- The mapping report lists every CSV column and any rejected rows, and import validation tests pass.
- Overall formulas reproduce Madden's OVR within a small error for most players (report the error by position in the milestone report).

### M2. League creation and saves

**Build:**
- New league flow: real data with actual rosters, or the generated fictional league on the no-CSV path (fantasy drafts and fictional-league options for real-data builds come in M19), user team selection, seed, and the start-only settings (section 3.2) with defaults for everything else.
- Save slots, autosave hooks, export and import (gzipped JSON), and save versioning with the "no migration" message (sections 2.4 and 21).
- Start screen listing leagues.

**Done when:**
- A league can be created, the page reloaded, and the league continued.
- Save, load, export, and import round-trip tests produce identical state.

### M3. Ratings, schemes, roles, and fit

**Build:**
- The scheme model and tendency sliders (section 7.2), starting with 4 offensive schemes (West Coast, Shanahan outside zone, Air Raid, Power run) and 4 defensive schemes (4-3 over, 3-4 one-gap, Cover 3 single-high, Man blitz), plus blends. The rest of the named schemes and custom schemes come in M21.
- Roles and role recipes with all three layers: rating weights, trait adjustments, and ability value (section 7.3).
- An ability framework with a starter catalog of about 20 abilities with triggers and effects (section 7.4).
- Situation profiles (section 7.5), which will be measured once the sim exists in M4. Until then, use estimated profiles.
- Fit, fit caps, scheme cohesion, coordinator mismatch, and coach flexibility (section 7.6).
- Player page fit breakdown in the UI.

**Done when:**
- Unit tests cover role rating math, trait adjustments, ability value, and caps.
- The example from section 7.3 holds: an agile, high-vision back rates higher as a zone RB than as a power RB, and vice versa.

### M4. Game simulation v1

**Build:** the full play loop from section 8.3: situations, coaching decisions and tendencies, personnel and packages, play calls from game plan and scheme, pass, run, and special teams resolution, penalties from the rule set, in-game injuries, fatigue and rotations (section 12.3), weather and home field (section 17), game-to-game form (section 8.5), and outputs (section 8.8: box score, scoring summary, drive summaries, recap v1, stat lines). The sim runs in the worker. Measure and cache situation profiles for M3.

**Done when:**
- A single game sims in under 100 ms on desktop.
- Stat lines are internally consistent (team totals equal player sums, scores match scoring plays).
- Fixed mode reproduces a game exactly, and weighted mode produces similar but not identical results.
- Rule set changes (for example penalty yardage) change sim behavior in tests.

### M5. Stats storage and history v1

**Build:** the columnar per-season stat tables and indexes (section 9.3), the full stat categories (section 9.2), running aggregates (season, career, team, league leaders), team game stats, and the records book v1 (section 18.5). Player career pages with season and game-by-game logs.

**Done when:**
- Any player's game-by-game log for any stored season loads in under 300 ms.
- Measured storage per season is reported in the milestone report (expect about 0.5 MB packed).

### M6. Calibration harness v1

**Build:** the runner (section 23.1), `calibration/targets.json` with sourced target bands for the game, season, league stats, stat leader, injury, and effect-size metrics (section 23.3), and reports. Because the offseason doesn't exist yet, calibrate by replaying the 2026 season many times with different seeds. Tune the sim until those metrics pass or have documented warnings.

**Done when:**
- A 100-replay run produces a report where game-level and stat metrics pass, including win distribution and parity, home field value, favorite win rates, and fit effect size.
- Every tuning change is recorded in `docs/CALIBRATION.md`.

### M7. Season loop

**Build:**
- Week-by-week advance from week 1 through the Super Bowl (section 4), standings, tiebreakers, playoff seeding and bracket (section 5.3).
- Weekly injury updates, questionable decisions, and playing hurt (section 10.8).
- Basic AI weekly management so AI teams stay legal and competitive: auto depth charts by coach personality (section 12.2), injury replacements from the free agent pool, and opponent-tailored game plans v1 (section 8.7). The full AI brain comes in M14. Build these on the decision framework interfaces from section 14.1 so they can be upgraded later.
- The user's game plan and depth chart screens, with packages, rotations, and auto toggles.
- Pause rules and inbox v1 (section 19.6), news feed v1 (results, injuries, transactions, milestones), and players of the week.

**Done when:**
- A full season plays from week 1 through the Super Bowl, with the user managing lineups and game plans or leaving them on auto.
- Tiebreaker and seeding tests pass.

### M8. Rosters, contracts, and cap v1

**Build:** the full contract model and cap accounting (sections 6.5, 11.1 to 11.3), roster rules (section 12.1), transactions with cap previews (section 19.4), the cap sheet and contract screens, releases with June 1 designations, restructures, and in-season free agent signings using a simple acceptance model (the full player decision model comes in M12).

**Done when:**
- Golden tests pass for proration, dead money, June 1 cuts, void years, restructures, and guarantees.
- Illegal states can't be reached (over the cap, over roster limits, invalid elevations) in the UI or through AI moves.

### M9. Playable-season UI pass

**Build:** finish every screen a season needs: home (section 19.2), roster, player page, depth chart, game plan, schedule and results with box scores, drive summaries, recaps and stat logs, standings and playoff picture, league stats, inbox and news, contracts and cap, and settings for display, pause rules, and sim sliders (section 22.3). Verify phone, tablet, and desktop layouts and Day and Night on every screen.

**Done when:**
- Layout tests pass for every screen at all three sizes.
- A full season can be played start to finish on an iPhone-sized screen.

### Checkpoint A: playable season

Stop and hand the user:
- `dist/game.html`.
- The latest calibration report.
- `docs/DECISIONS.md`, including the scheme definitions and ability catalog drafted so far.
- Known issues and gaps.
- A short "how to play" note.

Wait for the user's review before starting Phase 2.

---

## Phase 2: the multi-season league

### M10. Offseason engine and schedules

**Build:** the offseason phase engine (section 4.1), contract expirations and the new league year, the re-sign window, tags, RFA tenders, 5th-year options (sections 11.4 and 11.5), retirements (section 10.7), progression and regression with the four curve settings and speed sliders (section 10.5), training focus (weekly and offseason), OTAs, training camp, preseason, and final cutdown. Schedule generation for 2027 and later (section 5.2).

**Done when:** schedule generation tests pass over a 12-year window, and aging curves in a 10-season run match targets.

### M11. Player generation, scouting, and the draft

**Build:** names, colleges, and hometowns from public data (section 10.1), archetype fitting from the Madden CSV (section 10.2), draft class generation with strength, position mix, and bust and gem controls (section 10.3), scouting with regions, points, and auto mode, the combine, pro days, interviews, media hype, mock drafts, the draft room, media draft grades, the UDFA scramble with removal after Super Bowl week, and rookie contracts (section 10.4). AI teams draft with a simple need-and-value model until M14.

**Done when:** generated players' rating distributions match the fitted archetypes, and draft hit rates by round are in range over a 20-season run.

### M12. Free agency, negotiation, and personalities

**Build:** the player decision model (section 11.7), free agency weeks and bidding (section 11.8), negotiation with counters and take-it-or-leave-it (section 11.6), compensatory picks, holdouts and trade demands (resolved without trades until M15), personality, morale, and the locker room (section 10.9), and off-field events and suspensions (setting).

**Done when:** a 10-season unattended run keeps every team legal and competitive, and the contract market metrics (section 23.3, economy) are in range.

### Checkpoint B: ten seasons

Run 10 seasons unattended and hand the user a calibration report, a league summary (champions, standings spread, stat leaders by season), and decisions made. Continue unless the user stops the build.

### M13. Staff and coaching

**Build:** staff ratings and abilities (section 13.1), the user's hired GM as abilities only (section 13.2), the staff job market with contracts, poaching, and retirements, the staff management phase (section 13.3), and head coach records (section 13.4).

**Done when:** coordinators and position coaches move through careers over a 20-season run, and staff effects show in development and scheme cohesion.

### M14. AI brain

**Build:** the full AI system from section 14: the decision framework, considerations, personalities, team modes, competence and the league slider, biases that shift, memory, pressures, AI owners, organization structures and conflict, decision cadence, and the complete decision log. Apply it to every domain listed in section 14.11 (except trades, which come in M15), team identities, new front office direction changes, and copycat schemes (section 14.12). Upgrade M7's basic AI to the full system.

**Done when:** the AI health metrics (section 23.3) pass in a 50-season run, every AI decision has a complete log entry, and the scripted AI scenario tests pass.

### M15. Trades

**Build:** valuation (section 15.1), acceptance, counters, and take-it-or-leave-it (section 15.2), AI proposals, AI-to-AI trades, the trade block and rumors, the deadline frenzy, player trade demands, draft-day trades (section 15.3), rules and guardrails as separate toggles (section 15.4), the trade builder, "what would it take," and the trade value view.

**Done when:** trade volume and fairness spread are in range over 50 seasons, guardrail tests block known exploits, and AI rejections come with readable reasons.

### Checkpoint C: living league

Run 50 seasons unattended and hand the user the full calibration and AI health report plus a history summary. Continue unless the user stops the build.

---

## Phase 3: the full world

### M16. Owner, finances, fans, and facilities

Section 20 in full: revenue and expenses, pricing and attendance, fan base, facilities with deliberately small effects, stadium projects, relocation and rebranding with their start-only permissions.

**Done when:** finances stay sane over 50 seasons, and facility effect sizes stay within their calibration bands.

### M17. History and honors

Section 18.4 to 18.7 in full: award voting simulation, the complete records book, season archives, franchise history, coaching records, Hall of Fame for players, coaches, and executives, rings of honor, and retired numbers.

**Done when:** award and Hall of Fame distributions pass calibration, and any player's full career stats from any season are one tap from his page.

### M18. Media

Section 18.1 to 18.3 in full: the event-driven news feed with rumors, power rankings, variety rules, and the news effects setting, plus the social feed and press conferences.

**Done when:** a season's feed shows no repeated template for the same team within 4 weeks, and news effects toggle cleanly between flavor only and live effects.

### M19. Rules committee, fictional leagues, and fantasy drafts

The rules committee (section 16) with proposals, AI voting, whip counts, and rule history. Fictional league creation and fantasy drafts (section 3.2).

**Done when:** a passed rule changes the next season's behavior in tests, and fictional leagues pass the same calibration as real ones.

### M20. Editor, settings, and automation

The full editor with the edited flag (section 19.7), the complete settings catalog (section 22) with anytime and start-only enforcement, and auto toggles for every user job (section 22.7).

**Done when:** every setting in section 22 is present, persists, and has a test showing it affects the game, and the edited flag appears whenever the editor is used.

### M21. Schemes and abilities complete

The remaining named schemes (section 7.2), custom schemes and saved blends, and the full ability catalog, with situation profiles measured for each.

**Done when:** every scheme produces a distinct, recognizable statistical profile in calibration (for example Air Raid pass rates and depth of target differ clearly from Power run).

### M22. Full calibration, performance, and storage

A full 100+ season calibration and AI health pass, performance tuning for iPhone (season sim time, memory), storage growth checks, and export and clear history (section 21).

**Done when:** every metric in section 23.3 passes or has an accepted, documented warning.

### M23. Polish and accessibility

Accessibility per style guide section 8, reduced motion, copy review per style guide section 9, empty and loading states everywhere, and final layout tests.

### Checkpoint D: release candidate

Hand the user the final `game.html`, the full calibration report, the decisions log, and the milestone reports.
