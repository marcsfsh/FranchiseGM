# Franchise GM: Post-M23 build order

Companion to `franchise-gm-spec.md`, `franchise-gm-build-order.md`, `franchise-gm-styleguide.md`, and `franchise-gm-tooling.md`. Work in this document starts after Checkpoint D. It adds fifteen features:

1. A deep, realistic playbook for offense, defense, and special teams
2. A game center with three levels of control, plus Auto
3. Advanced analytics, taken as far as the sim allows
4. Coaching trees and staff careers
5. A college pipeline for prospects
6. A draft war room
7. Rivalries and storylines (configurable)
8. Scenarios and achievements, fully configurable
9. Live roster updates from newer Madden CSV exports
10. Easy editing and commissioner tools
11. Real NFL history for teams and players
12. The web: an in-game browser with news sites, blogs, and social media
13. Football Academy
14. Player progression history
15. Neutral themes

**Starting point:** the milestones here begin after Checkpoint D, once M0 through M23 are complete. From then on, the code is the reference for every system that already exists. This document defines the new features and milestones in full, and cites original spec sections only where a new feature extends an existing system. Read a cited section with `node tools/doc.mjs spec <section>` when a task needs it, never whole documents.

**If this document arrives earlier,** during the main build order, follow section 1.1: register it now, keep building the main milestones in order, and use it only to shape those milestones so the features here extend them cleanly later.

Part 1 holds the working rules for this phase. Part 2 is the design for each feature, at the same level of detail as the spec. Part 3 is the milestone order with "done when" lists and checkpoints. Part 4 lists the defaults chosen for the user to review.

Where this document changes the spec, it says so, and this document wins. The significant changes: play-by-play can now be kept for a limited number of seasons (section 2.3.2), which spec section 9.1 previously ruled out, and fixed size and speed budgets are replaced by responsiveness rules (section 2.18).

---

## 1. Working rules for this phase

1. **All rules from the main build order still apply,** including milestone order, decide-record-continue, no hard-coded rules or tuning, and the engine never touching the DOM.
2. **Set up this document as soon as it arrives,** in one commit (as the first slice of M24 if it arrives then, or immediately if it arrives earlier):
   - Save this document as `docs/design/franchise-gm-post-m23.md`. If it arrived as an attachment, copy the file instead of retyping it.
   - Add `post: 'franchise-gm-post-m23.md'` to the FILES map in `tools/doc.mjs`, and `post` to its usage line.
   - In CLAUDE.md's design documents section, add: "Post-M23 build order (M24 onward): `docs/design/franchise-gm-post-m23.md`."
   - In `.claude/skills/milestone/SKILL.md`, change step 1 so milestones M24 and later are read with `node tools/doc.mjs post <id>` instead of `build <id>`, and checkpoints E, F, and G come from this document.
   - Note in `docs/STATUS.md` that this document is registered. If M23 is complete, set the milestone to M24.
   
   From then on, read this document's sections with `node tools/doc.mjs post <section>`.
3. **Every new feature has a setting,** and existing saves keep working. A save created before a feature existed opens with that feature at its default, without migration code beyond filling defaults (spec section 2.4 still holds: no migration of old save formats is required).
4. **The sim stays calibrated.** Any milestone that changes the sim or player generation ends with a calibration run. League-level results (scoring, parity, stat leaders, injury rates) must stay inside their target bands.
5. **Presentation never changes results.** Watching a game, making calls, or opening the war room uses the same engine functions and streams as auto mode. The only thing that changes an outcome is a user decision.
6. **Never freeze, always show progress.** There are no fixed size or time budgets (section 2.18), but the UI must never lock up, and any wait must show a loading indicator.
7. **Priorities if time is short:** playbook and analytics first, then the game center, easy editing, coaching trees, and the draft war room, then the rest.

### 1.1 Before Checkpoint D: preparing for this phase

If this document is registered while main milestones remain, the main build order still decides what gets built and when. Don't build this document's features early. Do make the following choices in the main milestones, because each one costs little now and avoids rebuilding later. Record each as a decision when you make it.

| Main milestone | Prepare for | What to do |
|---|---|---|
| Any sim work (including M21 and M22) | Game center (2.2), play log (2.3.2) | Keep the play loop's state explicit and serializable so the loop can pause between plays. Give each resolved play a typed internal result record, even though it isn't stored yet. |
| M10 and M11 (progression, player generation) | Progression history (2.14), college pipeline (2.5) | Route every rating change through one function that knows its cause. Keep the player generator able to create a prospect years before his draft class. |
| M13 (staff) | Coaching trees (2.4) | Store every staff stint (team, role, seasons, and the head coach and coordinator he worked under) from the first season. Keep staff roles as data, so more roles can be added without a new model. |
| M17 (history and honors) | Real NFL history (2.11) | Let franchise history, the records book, and the Hall of Fame accept imported seasons marked with their source, alongside played seasons. |
| M18 (media) | The web (2.12), rivalries and storylines (2.7) | Store news as structured events (who, what, stakes) and write the text from them, so other outlets and personas can write the same event later. |
| M20 (editor and settings) | Easy editing (2.10) | Build the editor as in-place table editing with bulk edits and undo, as section 2.10.2 and 2.10.3 describe, instead of a form-based editor that would be replaced. This is the one feature built early, because M20 builds an editor anyway. |

The responsiveness rules in section 2.18 apply from the moment this document is registered: no fixed size or time budgets, the UI never freezes, and every wait shows an indicator.

### 1.2 Build now: sort any table by one or more columns

Unlike the features in Part 2, this is built right away: in the first milestone after this document is registered, as its own slice, applied to every existing table. Every table added afterward uses it from the start, including the tables in Part 2. It extends style guide section 7.3, which covers sorting by a single column; where they differ, this section wins.

**What the user can do:**

- **Sort any data table by any column,** including the league stat leaderboards, rosters, standings, schedules, box scores, contracts, the cap sheet, free agents, the waiver wire, and history tables.
- **Sort by several columns at once.** For example, touchdowns high to low, then yards high to low for players tied on touchdowns. Up to four sort columns.
- **Primary sort from the header:** selecting a column header makes it the only sort column. Selecting the same header again reverses the direction. Numbers start high to low; text starts A to Z.
- **Adding sort columns:** Shift-click on a header adds that column as the next sort level, or reverses it if it's already one. Because Shift-click isn't available on touch screens and isn't discoverable, every sortable table also has a **Sort** control that opens a small panel listing the sort levels: add a column, remove one, change its direction, or move it up and down. The panel works fully by keyboard and touch, with no dragging required.
- **Reset sort** returns the table to its default order (for example, standings return to tiebreaker order).

**How it looks and reads:**

- Each sorted header shows its direction arrow and, when more than one column is sorted, its level number (1, 2, 3, 4).
- `aria-sort` goes only on the primary sort column, as the style guide requires. A polite live region announces the full order after each change, for example "Sorted by touchdowns, high to low, then passing yards, high to low."
- On phones, where tables become lists, the Sort control is the way to sort. Its choices match the columns the wider layouts show.

**Behavior rules:**

- After the user's sort columns, ties fall back to the table's default order and then to a stable ID, so the order never shuffles between renders.
- Unknown values sort after known values in either direction (style guide section 7.3).
- Sorting keeps filters, selection, and focus. The table's sort is remembered for that table across visits, alongside the other remembered screen choices.
- Sorting large tables (such as league-wide stats for every player) never freezes the UI. Work that takes more than about half a second moves to the worker and shows an indicator (section 2.18).

**Implementation:** one shared sortable-table component used by every table, not per-screen sorting code. Each table declares its columns with a sort type (number, text, date, money, rating, or custom), a default direction, and its default order.

**Done when:**
- Every table in the game uses the shared component and can be sorted by any column.
- Multi-column sorting works by Shift-click on desktop and through the Sort control on every layout, by keyboard and touch.
- Unit tests cover multi-level order, direction toggles, stable ties, and unknown values. Layout tests cover the header indicators, the announcement, the Sort control at 320 pixels with 200% text, and focus kept after sorting.

---

## 2. Feature designs

### 2.1 Playbook

The sim already picks personnel, formation, and a run or pass concept on every play (spec section 8.3). The playbook replaces those abstract picks with real plays for offense, defense, and special teams. It has to be deep enough that schemes feel distinct and play calling matters, and realistic enough that an NFL fan recognizes the concepts.

It's a **matchup model, not a physics simulation.** No player positions are simulated in space. Each play is data describing alignments, assignments, routes, and blocking, and the resolution step turns that data into probabilities.

#### 2.1.1 Offensive plays

A play is **personnel + formation + concept + protection or blocking scheme + tags.**

- **Personnel groupings:** 10, 11, 12, 13, 20, 21, 22, 23, plus jumbo (extra lineman) and empty variants.
- **Formation families:** under center (I-form pro, twins, tight, slot; offset I strong and weak; singleback ace, doubles, trips, bunch, wing), shotgun (doubles, trips, trey, bunch, spread, empty), pistol, goal line and jumbo, and a wildcat package. Each formation has strength (left or right) and can take motion tags: jet, orbit, shift, return, and trade.
- **Run concepts:** inside zone, outside (wide) zone, split zone, duo, power (guard or tackle pull), counter, trap, iso, dart, pin-and-pull toss, stretch, shotgun draw, delay draw, QB sneak, QB draw, QB power, zone read, speed option, jet sweep, end-around, and reverse.
- **Pass concepts:**
  - Quick game: slant-flat, stick, snag, hitch-seam, spacing, all curls, double slants, stick-nod.
  - Dropback: smash, flood (sail), levels, mesh, drive, dagger, Y-cross, curl-flat, four verticals, post-wheel, Yankee, shallow cross, choice routes, bench, and drift.
  - Play-action: boot and naked, keeper, deep over, play-action post, and play-action flood.
  - Screens: running back slow and fast, WR bubble, tunnel, and jailbreak, tight end, and middle screen.
  - RPOs: inside zone paired with glance, bubble, stick, or slant.
  - Trick plays: flea flicker, halfback pass, and double pass.
- **Protections:** 5-man slide, 6-man half slide, 7-man max, play-action protections, and chip help from backs and tight ends.
- **Each pass play defines:** each receiver's route (from a parametric route tree: stem, break depth, direction, option rules), the read progression in order, the hot route against pressure, timing (quick, intermediate, deep, extended), and which coverages and pressures it's built to beat.
- **Each run play defines:** the blocking scheme (zone or gap, pullers, double teams), the designed hole, the read key for option and RPO plays, and which fronts and run fits it's built to beat.
- **Required roles:** a play can need specific roles, such as a slot receiver, a move tight end, or a mobile QB. The auto play-caller avoids plays the roster can't run well.

**Size target:** about 450 offensive plays across all formations. That's more than any one team uses, so the named schemes and custom playbooks draw different subsets from it.

#### 2.1.2 Defensive calls

A call is **package + front + coverage + pressure + tags.**

- **Packages:** base 4-3, base 3-4, nickel 4-2-5, 3-3-5, dime (4-1-6 and 3-2-6), quarter and prevent, and goal line (6-2, 5-3).
- **Fronts:** 4-3 over and under, wide 9, odd (5-technique), tite (4i-0-4i), bear, and 46.
- **Coverages:**
  - Cover 0.
  - Cover 1: man-free, robber, and hole.
  - Cover 2: zone, man, and Tampa 2.
  - Cover 3: sky, buzz, cloud, and match.
  - Cover 4: quarters and palms (2-read).
  - Cover 6 (quarter-quarter-half).
  - Each coverage is flagged as spot-drop or pattern-matching.
- **Pressures:** 5-man fire zones (three under, three deep), 6-man pressures, simulated pressures (creepers), DB blitzes, stunts and twists (TEX, EXT, and others), and QB spies.
- **Disguise:** a call can show one shell before the snap and rotate into another (two-high to one-high, and the reverse). Disguise tests the QB's awareness and play recognition.
- **Run fits:** gap control, penetration, spill, and box, plus line slants.
- **Brackets and doubles** from the game plan's player focus (spec section 8.7) become coverage tags.

**Size target:** about 250 defensive calls.

#### 2.1.3 Special teams

- **Kickoff** (current rules from the rule set): deep, directional, squib, onside, and surprise onside.
- **Kick return:** middle, left, and right returns.
- **Punt:** spread, rugby, directional, pooch, and fakes (pass and run).
- **Punt return:** return, block, and safe or fair catch.
- **Field goal and extra point:** plus fake field goals.
- **Two-point plays** are drawn from a short-yardage subset of the offensive playbook.

#### 2.1.4 How plays resolve

The resolution steps in spec section 8.3 stay the same. Plays change their inputs:

- **Matchup modifiers.** Each concept has effectiveness values against coverage families, pressure types, and fronts. A smash concept is strong against Cover 2 and weaker against Cover 4. Modifiers are deliberately modest, so a good call helps but never guarantees a result. Every modifier is a tunable in `tuning.ts`.
- **Openness per route.** For each receiver, the sim draws an openness value from the route, the defender or zone responsible, both players' ratings (route running, release, speed against man and zone coverage, press), and the concept-versus-coverage modifier.
- **QB reads.** The QB works his progression in order. How far he gets depends on time before pressure and his awareness and processing, with QB traits (spec section 6.4) shaping when he throws, scrambles, or forces the ball. Disguised coverages can make him misread.
- **Run fits.** The blocking scheme meets the front and run fit. The outcome depends on blocking and shedding ratings plus the concept-versus-front modifier, and then the ball carrier's vision and elusiveness or power.
- **Defensive recognition.** Play-action and misdirection work better against defenders with low play recognition. RPOs read an actual defender assignment.
- **Special teams** use the same approach with their own modifiers.

#### 2.1.5 Playbooks, schemes, and the call sheet

- **Every named scheme has a playbook:** a weighted subset of plays built from its tendencies. A Shanahan playbook leans on outside zone, boot, and heavy motion; an Air Raid playbook on mesh, four verticals, and shotgun spread formations.
- **Custom playbooks:** the user can build a playbook by adding and removing plays from the library, starting from any scheme's playbook. There's no free-form play designer: plays are chosen from the library, not drawn.
- **Weekly call sheet:** each game plan (spec section 8.7) builds a call sheet from the playbook, grouped by situation: openers, 1st and 10, 2nd and long, 3rd and short, 3rd and medium, 3rd and long, red zone, goal line, two-minute, four-minute, and backed up. The auto plan tailors the sheet to the opponent's tendencies. The user can edit it.
- **Familiarity:** each player has a familiarity level with his team's playbook, which grows with time in the system. New plays and new players run slightly worse at first. This connects to scheme cohesion (spec section 7.6) instead of adding a separate system.
- **Adaptive calling:** AI play-callers track what's working during a game and adjust, using the head coach's and coordinators' play-calling and flexibility ratings.

#### 2.1.6 Play diagrams

Every play renders as a diagram from its data: alignments, routes, blocking arrows, and for defense, zone drops and blitz paths. Diagrams are generated SVG that follow the style guide's tokens. They appear in the playbook browser, the call sheet, the play-caller view, and the play finder (section 2.3.6).

#### 2.1.7 Data and validation

- Plays are data modules in `src/data/playbook/`, split by side and family. Routes use a shared route tree, and zones use a shared zone vocabulary: flat, curl, hook, hole, robber, deep third, deep half, and deep quarter.
- **Validation tests:**
  - Every offensive play is legal: seven on the line, correct eligible receivers.
  - Every play has matchup data.
  - Every named scheme's playbook covers every call-sheet situation.
  - Every diagram renders.
- **Calibration targets** (league-wide, sourced from public NFL charting data and recorded in `calibration/targets.json`): personnel usage shares, play-action rate, RPO rate, screen rate, motion rate, blitz rate, man and zone split, coverage shell mix, average depth of target, and time to throw.

### 2.2 Game center

A live game screen for any game, with a toggle for how much the user controls.

#### 2.2.1 Control levels

| Level | What the user does |
|---|---|
| **Auto** | Nothing. The game sims instantly, as today. |
| **Watch** | Watches the game unfold live and can take over at any time. |
| **Head coach** | Makes the situational decisions: 4th downs, 2-point tries, timeouts, challenges, accepting or declining penalties, onside kicks, kneel-downs, and halftime adjustments. Play calls stay automatic. |
| **Play caller** | Calls plays for offense, defense, or both, plus everything in Head coach. |

- A **default level** is set in Settings, separately for regular-season, playoff, and preseason games. Each game can be changed before kickoff.
- **Switching mid-game** is always allowed. The user can take over or hand the game back to Auto at any snap.
- **Auto-pause** options send the game to the user only for key moments: 4th downs in the second half, the final two minutes, or any challengeable play. The rest runs on its own.

#### 2.2.2 Screen

- A scoreboard with clock, timeouts, down and distance, and possession.
- A field strip showing the ball, the line to gain, and the current drive.
- A play-by-play feed written from each play's result, in plain broadcast style.
- A live win-probability chart and expected-points readout (from section 2.3.3).
- Tabs for the box score, drive summary, team stats, and injuries.
- Speed control from one play per second up to instant, plus "skip to end of drive, quarter, or half."
- Phone, tablet, and desktop layouts following the style guide.

#### 2.2.3 Head coach decisions

- Each decision shows the analytics recommendation, such as "Go for it: +3.1% win probability," computed from the win-probability model. The user can follow it or not.
- **Challenges** need a model for reviewable calls. The sim marks certain plays as reviewable, with a chance the on-field call was wrong. Challenging a correct call costs a timeout, following the rule set. The head coach's challenge skill (spec section 13.1) adds an estimate of the odds.
- **Halftime adjustments** change the second-half game plan: run and pass balance, blitz rate, coverage preferences, and player focus.

#### 2.2.4 Play caller

- Before each snap the user picks from the call sheet for the current situation, with the top three suggestions highlighted. Any play in the playbook is available through search.
- Each call shows its diagram. Defensive calls work the same way.
- Tempo control: huddle, hurry-up, and no-huddle.
- The QB changes protections and checks out of bad plays automatically, based on his awareness. The user doesn't micromanage audibles.
- AI opponents never see the user's call. Both sides call at the same time, as in a real game.

#### 2.2.5 Engine requirements

- The play loop becomes **steppable:** the worker runs until the next decision point, returns the state, and waits. Auto mode runs the same steps without pausing, so results match exactly given the same decisions.
- **Mid-game saves:** a game in progress can be saved and resumed, including after closing the app.
- Watching or calling a game produces the same stat lines, logs, and history as an auto-simmed game.

### 2.3 Advanced analytics

The goal is analytics as deep as a modern NFL analytics department's, built from the sim's own plays. Metrics are computed during each game as plays resolve. They don't need the play log, except for the splits and play-finder tools.

#### 2.3.1 Principles

- **Per-game advanced lines are permanent,** like box score stat lines (spec section 9.1). They're stored as new stat categories, so career advanced stats last forever.
- **Models are fitted from the league's own sim.** Expected points, win probability, and the other expected-value models come from simulating many seasons, the same way public NFL models are fitted from real play-by-play. They're refitted when the rule set changes enough to shift scoring.
- **Every metric has a plain-language definition** in the UI, and every leaderboard can require a minimum number of snaps, dropbacks, routes, or carries.

#### 2.3.2 Play log (changes spec section 9.1)

- A compact record of every play is kept for a limited number of seasons. The setting has these options: **off, current season, current plus last season (default), last three seasons, and all seasons,** with a storage warning for "all."
- **Each record holds:**
  - the situation
  - both teams' calls (personnel, formation, play, front, coverage, pressure)
  - the players involved: passer, target, rusher, route runners, pass rushers, blockers credited, and the tackler or coverage defender
  - pressure and time to throw
  - air yards, yards after catch, and yards gained
  - the result and any penalty
  - expected points and win probability before and after
  - per-player grading contributions
- **Storage:** records are packed in columnar form like stats (spec section 9.3). The size per season is measured and shown in the Settings storage view, next to export-and-clear (spec section 21).
- When a season ages out of the play log, its per-game advanced lines and all aggregates remain. Only the play-level detail is removed.

#### 2.3.3 Models

- **Expected points (EP):** by down, distance, field position, time, and score, fitted from the league sim.
- **Win probability (WP):** by score, time, possession, field position, timeouts, and a pregame strength difference.
- **Completion probability:** by air yards, target depth and location, pressure, coverage, and receiver separation (openness).
- **Expected rushing yards:** by blocking outcome, front, box count, and concept.
- **Expected yards after catch:** by catch point, openness, and pursuit.
- **4th-down decision model:** go, punt, or kick by WP change.
- **Refit:** the calibration tool fits all models and embeds them as tables at build time. In a save, the models refit in the worker when the rule set changes scoring conditions (for example kickoff or overtime rules).

#### 2.3.4 Metrics

**Efficiency (players and teams):**

- EPA per play, per dropback, per rush, and per target
- Success rate
- Win probability added (WPA)
- Explosive play rate

**Passing:**

- Completion percentage over expected (CPOE)
- Average depth of target, air yards, and intended air yards
- Big-time throws and turnover-worthy plays, from grading
- Time to throw, pressure-to-sack rate, and performance against the blitz and under pressure
- Adjusted net yards per attempt
- EPA broken out by depth, coverage, and play-action

**Receiving:**

- Targets, target share, air yards share, and weighted opportunity rating (WOPR)
- Routes run and yards per route run
- Separation (average openness), contested catch rate, and drop rate
- Yards after catch over expected

**Rushing:**

- Rush yards over expected (RYOE)
- Yards before and after contact, and broken tackle rate
- Success rate by concept and by box count

**Blocking:**

- Pass block win rate, pressures allowed, and sacks allowed per snap
- Run block win rate

**Defense:**

- Pass rush win rate, pressure rate, and double-team rate
- Run stop win rate and missed tackle rate
- In coverage: targets, receptions, yards, and yards per coverage snap allowed; passer rating allowed; and EPA allowed

**Special teams:**

- Field goal points over expected
- Punt net EPA and return EPA

**Grades:**

- Every player gets a grade on every snap he plays, based on his contribution to the play's result compared with what his assignment called for.
- Grades roll up to game, season, and career grades on a 0 to 100 scale, split by facet: pass blocking, run defense, coverage, and so on.

**Value metrics:**

- **Wins above replacement (WAR):** EPA contributions allocated by grades and snap share, compared with a replacement level measured per position from the league's own distribution.
- **Approximate value (AV):** a simple career value score used for comparing careers across eras and for draft re-grades (section 2.6).
- **Contract surplus value:** production value minus cap cost, per season and over the life of a deal.

**Team metrics:**

- Opponent-adjusted efficiency (EPA per play adjusted for schedule, offense, defense, and special teams, in the style of DVOA)
- A simple rating system (margin adjusted for schedule)
- Pythagorean expected wins and luck (record in one-score games compared with expectation)
- Pass rate over expected (PROE) and neutral-situation pass rate
- Pace in seconds per play
- Points per drive, drive success rate, and red zone touchdown rate
- Havoc rate
- 4th-down decision quality compared with the model

**Era adjustment:**

- Every rate stat has an indexed "+" version (100 is league average that season), so a passer from season 3 and one from season 43 can be compared fairly.
- League baselines are stored per season.

#### 2.3.5 Where analytics show up

- An **analytics hub** with leaderboards, player analytics cards (percentile bars against the position), team dashboards, game analytics (WP chart, EPA by drive, top plays by WPA), and league trend charts across decades.
- **Player pages** get an advanced tab with season and career lines, and **team pages** get an efficiency tab.
- **Draft and contract analytics:** realized value by draft slot, the league's draft pick value curve measured from outcomes, and contract surplus rankings.
- **The AI uses them.** GMs with a strong analytics lean (spec section 14.3) weight advanced metrics in player evaluation, trades, and contracts. Head coaches' 4th-down aggressiveness can drift league-wide over decades toward what the model recommends, like the real NFL's shift.

#### 2.3.6 Tools

- **Leaderboard builder:** any metric, any seasons, position, minimum volume, and team filters, sortable, with CSV export.
- **Splits builder** (needs the play log): filter by down, distance, quarter, score state, field zone, personnel, formation, coverage, pressure, blitz or not, play-action or not, opponent, home or away, and weather.
- **Play finder** (needs the play log): search plays by any field, with each play's diagram and result.
- **Custom charts:** scatter any two metrics, with trend lines and highlighted players or teams.
- **Comparison:** the spec's player comparison (section 19.5) gains advanced lines and percentile views.
- Every table can export to CSV as a download.

### 2.4 Coaching trees and staff careers

Builds on spec section 13. The spec already has staff careers and poaching. This adds a full staff ladder, staff development, lineage, and scheme inheritance, so hiring a young assistant QB coach who becomes a head coach ten seasons later is something the game tracks and celebrates.

#### 2.4.1 Staff ladder

- **Roles per team:**
  - Head coach and an optional assistant head coach.
  - OC, DC, and STC.
  - Passing game and run game coordinators.
  - Position coaches: QB, RB, WR, TE, OL, DL, LB, and DB.
  - Assistant position coaches: assistant QB, assistant OL, assistant DL, and assistant DB.
  - Offensive and defensive quality control coaches (two each) and an assistant special teams coach.
  
  That's about 22 staff per team.
- **Typical career path:** quality control, then assistant position coach, then position coach, then coordinator, then head coach. Former players can enter as assistants.
- **Staff ratings** gain two hidden attributes: **potential** (shown as a range that narrows with time, like prospect grades) and **ambition** (how hard he pushes for promotions and interviews).

#### 2.4.2 Development

- Staff ratings change every season based on role, experience, age, team success, and the **mentorship** rating of the coach above them. The mentorship rating is new for head coaches and coordinators.
- Coaches working under a strong mentor on a winning team develop fastest. A great assistant stuck under a poor staff stalls.

#### 2.4.3 Lineage

- Every stint is recorded: team, role, seasons, and the head coach and coordinator he worked under.
- A **mentor link** forms after two or more seasons working directly under a head coach or coordinator.
- A **coaching tree** is everyone connected through mentor links. Tree stats include head coaches produced, combined wins, playoff appearances, and championships.

#### 2.4.4 Scheme inheritance and staff movement

- When a coach becomes a coordinator or head coach, his preferred scheme comes mostly from his mentors' schemes (weighted by time together) plus his own lean. System families spread through the league the way real coaching trees spread schemes.
- A newly hired head coach brings assistants from his tree, weighted by loyalty and past time together. Poaching and contract rules from spec section 13.3 still apply.
- The staff job market adds interviews for coordinator and head coach openings. Assistants with high ambition leave for promotions sooner.

#### 2.4.5 Screens and news

- **Hiring screen:** candidate cards show ratings, the potential range, preferred scheme, lineage ("four seasons under Dana Okafor"), and interest level.
- **Coaching tree view:** an interactive, collapsible tree from any coach, with records at each node. The tree view works by keyboard and on a phone.
- **League coaching trees:** a ranking of trees by head coaches produced and success.
- **News:** stories when a former assistant of yours gets a head coaching job, when two coaches from the same tree meet in a playoff game, and when a tree reaches milestones.

#### 2.4.6 Calibration

Targets from public NFL data: head coach turnover per season, the share of first-time head coaches, age at first head coaching job, and how often coordinators are promoted to head coach.

### 2.5 College pipeline

Prospects exist before their draft year. Their college careers make each class feel real, and their stats become part of their history.

#### 2.5.1 Model

- **Programs:** about 130 college programs from the public-domain college list, grouped into generated regional conferences. Each has a prestige, a talent level, a coaching quality, and a preferred offensive and defensive style (Air Raid, spread option, pro style, and so on). All of these drift over time.
- **Prospects:** the game tracks every future draftable prospect for three classes ahead: roughly 1,400 players. College teammates who will never be drafted are not tracked individually; they exist only as each program's team strength.
- **Development in college:** prospects' hidden ratings develop through college, so risers and fallers happen naturally. The bust and gem settings (spec section 10.3) still control the final class at draft time, so draft quality stays calibrated.

#### 2.5.2 College seasons

- Each program plays 12 regular-season games, a conference championship, bowl games, and a 12-team national playoff.
- Games resolve at the **game level,** not play by play: scores come from team strengths and style matchups.
- Each tracked prospect gets a **season stat line** generated from his role, usage, ratings, his program's style and strength, and his opponents' strength. College stats are stored per season, not per game.
- **Awards:** a national player of the year, position awards, and All-American teams, all with generic names.
- **College events:**
  - Injuries, including ones that end a season.
  - Redshirt years.
  - A light transfer portal, where some prospects move programs for playing time.
  - Early declaration decisions for underclassmen, based on projected round, personality (greed and ambition), and program.

#### 2.5.3 Scouting and the draft

- Scouts can start on underclassmen early. Points spent before the draft year still reduce uncertainty.
- **Watch lists** for the next two classes.
- College stats come with **context:** a strength-of-schedule adjustment and the program's style. An Air Raid passer's numbers are marked as inflated by his system.
- **An all-star week** (a Senior Bowl-style showcase) between the season and the combine: practice reports reveal traits, and standout weeks move boards.
- Media hype and mock drafts (spec section 10.4) react to college seasons.

#### 2.5.4 History and settings

- Drafted players keep their college stats and awards forever, on a College tab of their career page. Undrafted prospects' college records are discarded when they leave the game (spec section 10.4's UDFA rule).
- **Setting:** college pipeline on (default) or off. Off restores the current behavior, where classes are generated just before the draft.
- **Calibration:** draft class quality distributions unchanged from the baseline; college stat leaders in realistic ranges (targets sourced from public college data).

### 2.6 Draft war room

The draft already has deep mechanics (spec section 10.4 and section 15). The war room gives draft day the presentation and tension to match.

#### 2.6.1 Before the draft

- **Big board:** the user ranks prospects into tiers. Tiers can be reordered by dragging, with a full keyboard alternative. Flags: target, avoid, and medical concern.
- Side-by-side views: the user's board, the consensus media board, team needs, and the latest mock drafts.
- **Team fit:** each prospect's projected role rating in the user's scheme.

#### 2.6.2 Draft day

- **Pick clock:** off, fast (a short timer), or realistic. Speed for AI picks is adjustable, and any stretch can be skipped.
- **On every pick:** a pick card with the player, his team, and a reaction: a grade compared with consensus (steal, value, fair, or reach), plus a line from the media feed and fan reaction.
- **Trade calls:**
  - As the user's pick approaches, AI teams call with offers to move up or down. Calls get more frequent when a prospect the AI wants is sliding.
  - The user can shop the pick. A trade-up finder lists every team ahead of him and the price.
  - Counteroffers use the existing "what would it take" tool.
- **AI-to-AI draft trades** happen live and appear in the feed.
- **Best available** lists by position and overall, filtered by the user's board or the consensus board.
- **Clock pressure:** if the clock runs out on the user, the pick falls to his board's top available player. This happens only on the realistic clock, and the clock is off by default.

#### 2.6.3 After the draft

- Media grades (spec section 10.4) and a class report card for the user.
- **Re-grades:** three and five years later, every class is re-graded from actual value (approximate value and WAR from section 2.3), with news stories about the biggest steals and misses.
- **Redraft rankings:** any past class can be re-ordered by career value, showing where each player "should" have gone.
- **Draft history:** each team's drafting record by round and position, and each GM's hit rate.

#### 2.6.4 Settings and calibration

- **Settings:** war room on (default) or off (the current phase-based draft), and the pick clock option.
- **Calibration:** the number of draft-day trades and how picks are valued in them stay in realistic ranges (targets sourced from public draft trade data).

### 2.7 Rivalries and storylines

The league remembers its own history and talks about it.

#### 2.7.1 Settings

The feature has two separate toggles, so it can be dialed from nothing to fully active:

| Setting | Options | Default |
|---|---|---|
| Rivalries and storylines | Off, On | On |
| Storyline effects on games and players | Off, On | Off |

With effects off, rivalries and storylines appear in news, social posts, press conferences, the game center, and history screens, but change no results. With effects on, they add small, capped effects: crowd noise in rivalry games, morale boosts and dips from storyline outcomes, and a slight motivation bonus in revenge games.

#### 2.7.2 Rivalries

- Every pair of teams has a **rivalry score.** Division opponents start with a baseline.
- The score rises from playoff meetings (especially eliminations), close games, lopsided results, notable trades between the teams, star players moving between them, and coaches with ties to both teams. It decays slowly over time.
- Rivalries have names and histories: an all-time series record, memorable games, and streaks.

#### 2.7.3 Storylines

- **Player storylines:**
  - Revenge games against a former team.
  - Record and milestone chases.
  - Contract years.
  - Comebacks from major injuries.
  - Award races (MVP, rookies of the year).
  - A rookie taking over for a veteran.
- **Team storylines:** surprise contenders, collapses, playoff droughts ending, dynasties, and hot seats.
- **Coaching storylines:** tree matchups (section 2.4), a coach facing his former team, and first-time head coaches.
- Storylines have a start, updates, and a resolution, stored so the history screens can tell them later ("The 2031 Vikings: from 2-6 to the Super Bowl").

#### 2.7.4 Calibration

With effects on, league parity, home field advantage, and scoring stay inside their target bands. The effects must be too small to shift league-wide results.

### 2.8 Scenarios and achievements

The sandbox stays the default. Scenarios are optional starting points with goals, and everything about them is configurable.

#### 2.8.1 Scenario builder

A dedicated builder screen, with four parts:

- **Start:**
  - League type: fictional or real-data, with or without real history (section 2.11).
  - The user's team, and the starting point: preseason, the trade deadline, or any offseason phase.
  - Roster, contract, cap, and staff changes, made with the editing tools (section 2.10).
  - Overrides for any league setting or rule.
- **Modifiers** (optional constraints):
  - Trading and free agency: no trades, no draft pick trades, or no free agents above a chosen price.
  - Rules and difficulty: a changed salary cap, AI competence, injury rate, and league rule tweaks.
  - Forced choices, such as starting a rookie QB.
  - Owner patience: within a scenario, the owner can fire the user for missing goals.
- **Goals,** combined with "and" and "or":
  - Results: win a number of games, make the playoffs, win the division, win the title, set a record.
  - Team building: cap space above a target, dead money below a target, develop a player to an overall rating, draft a number of starters.
  - The franchise: fan hype or attendance targets, a new stadium, a coaching tree producing a head coach.
  - Every goal can have a deadline ("by season 3").
- **Scoring:**
  - One to three stars for the main goals, plus optional bonus goals.
  - A time limit, and whether failing ends the scenario or just records the result.

#### 2.8.2 Library and sharing

- **25 built-in scenarios,** every one editable and clonable, for example:
  - cap hell: get under the cap and back to the playoffs in three seasons
  - win now with an aging contender
  - rookie QB: build around a first-round QB
  - the worst roster in the league
  - a new owner who wants a stadium
  - defend a title
  - a no-trades rebuild
- Real-data scenarios that use real history are marked as needing a real-data league.
- **Randomizer:** generates a scenario from a difficulty and a focus (cap, draft, rebuild, contend).
- **Sharing:** scenarios and scenario packs export and import as small JSON files.
- **Scenario history:** each attempt's result, stars, date, and seasons taken.

#### 2.8.3 Achievements

- About 60 achievements for milestones such as the first title, a dynasty, a draft steal, a perfect cap year, and a coaching tree producing five head coaches.
- Stored per device across saves, with a toggle to turn them off.
- Some settings (such as slider changes in the user's favor, or commissioner edits, section 2.10) mark a save as ineligible for achievements. The rule is shown before it applies.

### 2.9 Live roster updates

Real-data leagues can import a newer export of the same Madden player table (ratings, traits, and contracts) into an existing save, keeping the league current through the real season. This needs the Madden CSV and the import mapping from M1. It can't be built or tested until at least one real export exists, and it gets a second real export for proper testing.

- **Player matching:** by the export's player ID column if present. Otherwise by name, birthdate, and college, with ambiguous matches listed for the user to resolve.
- **Preview before applying:** changes grouped into rating changes, new players, players missing from the export, and contract changes, with counts and a searchable list.
- **Apply options:**

| Option | Default |
|---|---|
| Ratings and traits (all players, or chosen positions or teams) | On |
| Contracts | Off |
| Team assignments (sync rosters to the export) | Off |
| Add new players | On, as free agents |

- **Safety:** an automatic backup save before applying, an undo, and a change log. Each updated player's page notes the update ("Ratings updated, week 6").
- Progression still runs afterward. An update replaces current ratings, and potential is recalculated from the new values.
- Available only in real-data leagues. Fictional leagues don't show the option.

### 2.10 Easy editing and commissioner tools

This is a sandbox, so changing anything should be fast. Extends the editor in spec section 19.7. Making an all-99 team should take seconds, not an evening.

#### 2.10.1 Commissioner mode

- A setting, on by default. On shows editing controls throughout the game; off hides them for a cleaner screen.
- **Rule enforcement** is a separate setting:
  - On (default): commissioner actions that would break league rules (roster limits, the cap) are blocked with the reason.
  - Off: anything is allowed, and a league health panel lists illegal states, such as teams over the cap or rosters over the limit.

#### 2.10.2 Editing in tables

- **Every data table can be edited in place:** league-wide players, rosters, ratings, contracts, staff, teams, draft picks, and prospects. Select a cell, type, and press Enter. No record needs to be opened.
- **Spreadsheet behavior:**
  - Arrow-key and Tab navigation.
  - Selecting ranges of cells, and fill down.
  - Copy out, and paste from a spreadsheet (tab-separated text).
  - Multi-level undo and redo.
- **Touch:** tap a cell to edit it inline. Long-press starts a multi-selection.
- Edited values are checked for type and range as they're entered, with the reason shown inline.

#### 2.10.3 Bulk editing

- Act on a selection or a filter, for example "all wide receivers on Green Bay" or "every player under 25."
- **Operations:** set, add, subtract, multiply, or randomize within a range. They work on ratings, dev traits, ages, contract terms, injury status, morale, and personality.
- **Set overall:** raises or lowers the ratings that matter for each player's position until he reaches a target overall. That makes "all-99 team" one action.
- **Presets:** max out a team, reset players to their original values, and swap two players' ratings.
- **Every bulk edit previews first:** how many records change, with sample before-and-after values. Then confirm, and undo if needed.

#### 2.10.4 Commissioner transactions

- **Force-accept** any trade the user proposes, per trade.
- **Trades between other teams:** build a trade between any two or three teams, none of them the user's, then choose:
  - **Propose:** each AI team evaluates it normally and shows its answer and reasons.
  - **Force:** it happens regardless.
- **Players:**
  - Sign any free agent to any team on any terms, release any player, or move players between teams.
  - Retire or un-retire players, and set or heal injuries.
- **Staff and draft picks:** change staff on any team, and edit draft order and pick ownership.

#### 2.10.5 Records and AI response

- Every commissioner action is recorded in the transaction log, marked as a commissioner move and filterable.
- AI teams re-evaluate their plans after edits that affect them.
- Achievement eligibility follows section 2.8.3.

### 2.11 Real NFL history

In a real-data league, players arrive with their real careers: Patrick Mahomes shows his real stats, awards, and Super Bowl rings, and teams show their real histories. Every franchise's real history is also available in fictional leagues, since the franchises are real.

#### 2.11.1 Sources

| Source | What it provides | License |
|---|---|---|
| **nflverse** (nflverse-data releases on GitHub) | Player game stats from 1999 on, rosters, schedules and results, draft picks, combine results, contract history, trades, and player biographical data with IDs across sites | Creative Commons Attribution 4.0 (CC BY 4.0) for the core data. Skip the FTN charting and participation files, which use a different license (CC BY-SA 4.0). |
| **Wikipedia** | Award winners (MVP, offensive and defensive player of the year, rookies of the year, comeback player, coach of the year), All-Pro and Pro Bowl selections, every championship and Super Bowl, the Hall of Fame, retired numbers and rings of honor, and all-time record and leader lists covering players before 1999 | Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) |

- **Attribution:** a Credits screen names each source, links its license, and states that the data was modified. CC BY 4.0 requires visible credit, a link to the license, and a note if the data was changed.
- **Not used:** Pro Football Reference (its terms don't allow reuse) and anything from Madden beyond the user's own roster CSV.
- `docs/HISTORY-SOURCES.md` records every file, its source URL, retrieval date, and license.

#### 2.11.2 Build pipeline

- `tools/fetch-history.mjs` downloads the nflverse files and the Wikipedia tables into `data-raw/history/`. This needs `github.com`, GitHub's release-asset download domains, and `en.wikipedia.org` in the cloud environment's network allowlist. As a fallback, the user can download the files and add them to `data-raw/history/`.
- `tools/build-history.ts` maps the sources into the game's formats through a declarative mapping (`src/data/history-mapping.ts`), like the Madden mapping, and embeds the result in the build.
- Stat fields the sources don't have (for example pressures allowed before charting existed) are stored as **unknown,** never as zero, and shown with the style guide's unknown-value treatment.
- Rerunning the fetch before a build adds the latest completed season.

#### 2.11.3 What gets built

- **Team history (any league):** every franchise's seasons from 1999 on (records, playoff results, points for and against), every championship and Super Bowl, retired numbers, and rings of honor. It feeds the franchise history and honors screens (spec sections 18.6 and 18.7).
- **Player history (real-data leagues):**
  - For each player in the Madden CSV matched to the historical data: career game logs from 1999 on in the game's stat categories, season totals, draft details, awards, All-Pro and Pro Bowl selections, and contract history.
  - **Super Bowl rings,** derived from rosters: a player earns a ring if he was on the winning team's roster for the Super Bowl.
- **Retired players:** a setting chooses none, notable only (Hall of Famers, award winners, and statistical leaders), or everyone since 1999. They exist as history-only records for the records book, the Hall of Fame, and comparisons, never as playable players.
- **Records book:** seeded with real records, including pre-1999 all-time leaders, so record chases in the game chase real records.
- **Hall of Fame:** seeded with the real inductees. In-game Hall of Fame voting counts active players' real pre-2026 careers.
- **The first game season** continues from real history: the 2026 season is season one of the save, and everything before it is real.

#### 2.11.4 Matching and settings

- The historical player data includes names, birth dates, colleges, and IDs. Madden players are matched by name, birth date, and college, with position as a tiebreaker. Ambiguous matches are listed for the user to resolve in a review screen. Rookies with no NFL history simply start fresh.
- **Setting at league creation:** real history off, teams only, or teams and players. Defaults: teams and players in real-data leagues, teams only in fictional leagues.

### 2.12 The web: news sites, blogs, and social media

An in-game browser with six fictional websites that cover the league. It's narrative depth: the same events the news feed tracks (spec section 18), told by different outlets and people with their own voices.

#### 2.12.1 The browser

- A browser-style screen with an address bar, back and forward, tabs, and bookmarks.
- Each site has its own fictional name, look, and voice. Site looks are themed content inside the browser frame, defined as token sets so they stay accessible. The style guide's rules for the rest of the game still apply.
- **Every player, team, and coach name links into the game's own screens.**

#### 2.12.2 The six sites

| Site | What it covers |
|---|---|
| **National sports network** | League-wide headlines, scores, standings, power rankings, features, and columns |
| **Local newspaper** | A beat reporter for each team's market: injuries, depth chart moves, press conference quotes, and local angles. The user's market is the default, and any city can be opened |
| **Analytics blog** | Charts and analysis from the analytics system (section 2.3), and contrarian takes |
| **Fan blog network** | A fan site for every team, with homer voices and the fan base's mood |
| **Microblog** | Short posts from players, reporters, insiders, and fans, with threads, trending topics, and like and repost counts |
| **Community forum** | Threads with votes and comment trees: trade ideas, rumor threads, game threads, and "rate your GM" polls |

#### 2.12.3 Content

- **Personas:** generated writers, insiders, and fans, each with a voice, biases, and favorite topics. Insiders have an accuracy rating, and their rumor record is tracked, so some insiders become trustworthy over time.
- **Article types:** recaps, previews, features, columns, rumors, analysis, power rankings, mailbags, and lists.
- **Generation:** events and storylines become story candidates by newsworthiness (spec section 18.1). A grammar-based template system writes each one in its persona's voice, filled with facts from the engine: stats, history, storylines, and analytics.
- **Variety:** a large template library with a memory of recently used templates and phrases, so the same wording doesn't repeat within a season on the same site.
- **Comments** under articles and forum posts come from fan personas.
- **Archive:** all content is kept for every season and is searchable by team, player, and season.
- **Real people:** in real-data leagues, content about real players and coaches stays with on-field play, contracts, team moves, and games. No stories about real people's off-field conduct, legal matters, or personal lives. Fictional players can have off-field flavor as the spec already allows.
- **Effects:** content follows the spec's existing news-effects setting. The browser adds no new gameplay effects.

#### 2.12.4 Settings

The web on or off, each site on or off, and content volume (light, normal, heavy).

### 2.13 Football Academy

A learning center that takes someone with a basic understanding of football to a solid understanding of the game, especially the playbooks, so the choices in this game make sense. It teaches football itself, not how to use this game's screens.

#### 2.13.1 Tracks

About 80 lessons in nine tracks:

1. **Football basics:** the field, downs, scoring, the clock, penalties, officials, and overtime. Lessons read the current rule set, so they stay accurate when rules change.
2. **Positions:** what each position does, what makes a player good at it, and what the ratings in this game measure.
3. **Offense:** personnel groupings, formations, motion, zone versus gap blocking, run concepts, the route tree, pass concepts, progressions, protections, play-action, screens, and RPOs.
4. **Defense:** fronts and techniques, gaps and run fits, man versus zone, coverages from Cover 0 to Cover 6, pattern matching, pressures, stunts, and disguise.
5. **Special teams.**
6. **Schemes:** every named offensive and defensive scheme, with its ideas, strengths, weaknesses, and the players it needs.
7. **Game management:** situational football, the clock, 4th downs, 2-point tries, timeouts, and challenges.
8. **Analytics:** EPA, success rate, win probability, CPOE, grades, and WAR, including what they mean and how to use them.
9. **Building a team:** the salary cap, contracts, positional value, draft value, free agency, and trades.

#### 2.13.2 Lessons

- Short readings in plain language, each ending with key takeaways and an "in this game" note linking the idea to the screens and settings where it matters.
- **Illustrated with the game's own play diagrams** (section 2.1.6), so what the Academy teaches matches the playbook exactly.
- **Animated diagrams:** step through a play from pre-snap to the snap to how it develops. They're illustrations, not physics, and they follow the reduced-motion setting.
- A short knowledge check at the end of each lesson.

#### 2.13.3 Drills

- **Read the defense:** a pre-snap look is shown; identify the front, coverage, or pressure. Feedback explains the tells.
- **Call it:** a situation and a defensive look; choose a play. Feedback explains which calls work and why.
- **Film room lab:** pick any offensive play and any defensive call, and the real sim runs the matchup hundreds of times, showing success rate, EPA, and the spread of outcomes. It teaches matchups with the actual engine.

#### 2.13.4 Learning inside the game

- **Tap-to-learn:** every football term in the interface (coverages, concepts, schemes, metrics, contract terms) can be tapped for a short definition and a link to its lesson.
- **Coach's eye** in the game center: after each play, an optional one-line explanation of why it worked or failed, drawn from the play record (the concept against the coverage, the read the QB made, the defender who was beaten).
- **Glossary:** about 400 terms, searchable and linked.
- **Progress:** lessons completed, drill scores, and cosmetic levels (Rookie, Starter, Coordinator, Head Coach), stored per device.

#### 2.13.5 Accuracy

- Diagrams come from the playbook data, rules from the rule set, and scheme descriptions from the scheme data, so the Academy can't contradict the game.
- Validation tests check that every term used in the interface is in the glossary, and that every play, call, and scheme a lesson references exists.
- Football explanations follow standard coaching terminology. Where sources disagree on a term, the choice is recorded with the decision skill.

### 2.14 Player progression history

The spec's career page shows ratings by season (spec section 18.6). This expands it into a full record of how every player developed, and why.

#### 2.14.1 What's recorded

- **Every rating change,** whenever it happens: the small weekly in-season changes, training camp, and offseason changes (spec section 10.5). Each change records the ratings that moved, by how much, and the date.
- **Why it changed.** The progression model already weighs its drivers: age curve, playing time, dev trait, training focus, coaching, mentors, scheme fit, facilities, injuries, and work ethic. Each change stores its largest contributions, so the history can explain itself.
- **Other events on the same timeline:**
  - Abilities gained and lost, and dev trait changes.
  - Injuries, with their effects on ratings.
  - Live roster updates (section 2.9), marked as ratings updates.
  - Commissioner edits (section 2.10), marked as edits and excluded from development analytics.
- **Snapshots:** the full ratings at the start of each season, after training camp, and at the end of the season.
- **The starting point:** for drafted players, the history begins with their pre-draft scouting grades and their true ratings as rookies. For players imported from the Madden CSV, it begins with their imported ratings in season one.
- Everything is kept permanently, like stat lines. Saves created before this feature have only the per-season ratings from spec section 18.6.

#### 2.14.2 The Progression tab

A tab on every player's page:

- **Overall over time:** a chart of overall by week and season, with markers for training camps, injuries, ability and dev trait changes, roster updates, and commissioner edits.
- **Any rating over time:** choose one or more ratings to chart, or view a table of seasons by ratings, with increases and decreases marked by both color and sign.
- **Why he changed:** for any season, a breakdown of what drove the change (age, playing time, coaching, mentor, training focus, scheme fit, injury, work ethic), as labeled bars.
- **Against the norm:** the player's path compared with the typical curve for his position, age, and dev trait, with a percentile ("developed faster than 85% of cornerbacks with Star development").
- **Role and fit over time:** his role rating in his team's scheme each season, including changes caused by scheme or team changes.
- **From prospect to pro:** for drafted players, his scouting grade before the draft compared with his actual ratings as a rookie and at his peak.
- **Timeline:** abilities gained and lost, and dev trait changes, in order.

#### 2.14.3 League and team views

- **Risers and fallers:** leaderboards for the biggest changes by week, by training camp, and by season, filterable by position, age, and team.
- **Team development report:** how much each team's players improved compared with expectation, by position group and season.
- **Coaching credit:** each coach's players' development against expectation. This feeds coaching trees (section 2.4) and the hiring screen.
- **Development analytics** in the analytics hub (section 2.3.5): development by age, position, dev trait, and draft round across the league's history.
- **News:** notable risers and fallers, such as training camp breakouts, become stories for the news feed and the web (section 2.12).

### 2.15 Neutral themes

Team themes color the whole interface with the user's team colors (style guide section 2). Neutral themes give the game its own look instead, not based on any team. "Neutral" describes that independence, not the colors themselves, which are bold.

#### 2.15.1 Settings

- **Colors:** Team (default) or Neutral, changeable anytime.
- **Neutral palette:** the three palettes below.
- Both are separate from the existing Day, Night, and System setting, so every combination works: any neutral palette in Day or Night.
- They're stored with the other display preferences (style guide section 13.3) and applied before the first paint, like Day and Night, so the screen never flashes the wrong colors.

#### 2.15.2 The palettes

| Palette | Base | Accent | Character |
|---|---|---|---|
| **Film Room** | `#2B3A4E` slate | `#F2DF3A` telestrator yellow | Calm, like a coaches' film session |
| **Deep Ice** | `#171C22` near-black | `#3BE8F0` electric cyan | High contrast, the most striking of the three |
| **Carbon and Jade** | `#1D2024` deep carbon | `#2EE6A8` vivid jade | Dark and energetic |

The approved mockups are on the design canvas "Franchise GM Neutral Theme Finalists" (options B1, H2, and G3).

#### 2.15.3 How they work

- **Each palette is a base and an accent run through the style guide's existing token generator** (`computeTeamTokens`, style guide section 13), exactly like a team palette. Day and Night, every component, and every contrast rule work with no new component styling. The palettes live in `src/app/theme/neutral-palettes.ts`.
- **What uses the neutral palette:** everything team colors normally style: the sidebar and navigation, top bar rule, sign bars, name plates, buttons, rating plates, development tags, and selection.
- **The sidebar brand** shows the "Franchise GM" wordmark in place of the team name plate, with the user's team name and team chip underneath.
- **Team colors appear only as identifiers.** A small square **team chip** in the team's primary color appears next to team names: standings, schedules, scores, a player's team, trade screens, and the draft board. A chip always sits beside the team's name, never alone, so color is never the only way to tell teams apart.
- **Night mode and very dark bases:** Deep Ice and Carbon and Jade have bases darker than the style guide's luminance floor (style guide section 2.2), so their Night surfaces lift to nearly the same charcoal. The accents keep them distinct. This is expected and matches the mockups.
- **Film Room and warnings:** Film Room's yellow is near the amber used for warnings. Warnings already carry text labels (style guide section 2.4), so they stay distinct. The acceptance tests check this.

#### 2.15.4 Acceptance

- The style guide's theme matrix (style guide section 14.1) extends to the three neutral palettes in Day and Night, with the same contrast requirements as team themes.
- Switching between Team and Neutral, and between palettes, keeps the current screen, filters, selection, and scroll position.
- Team chips appear next to every team name in the listed places, and nowhere without the name.

### 2.16 Settings added

| Setting | Options | Default | When |
|---|---|---|---|
| Game day control (regular season, playoffs, preseason) | Auto, Watch, Head coach, Play caller (offense, defense, both) | Auto | Anytime |
| Game center auto-pause | Off, key moments, every decision | Key moments | Anytime |
| Analytics recommendations in game | Off, On | On | Anytime |
| Play log retention | Off, current season, current plus last, last three, all | Current plus last | Anytime |
| Advanced stats visibility | Hidden, standard, full | Full | Anytime |
| College pipeline | Off, On | On | Start only |
| Draft war room | Off, On | On | Anytime |
| Pick clock | Off, fast, realistic | Off | Anytime |
| Rivalries and storylines | Off, On | On | Anytime |
| Storyline effects | Off, On | Off | Anytime |
| Achievements | Off, On | On | Anytime |
| Commissioner mode | Off, On | On | Anytime |
| Enforce league rules on commissioner actions | Off, On | On | Anytime |
| Real history | Off, teams only, teams and players | Teams and players (real-data), teams only (fictional) | Start only |
| Retired players in history | None, notable only, everyone since 1999 | Notable only | Start only |
| The web | Off, On | On | Anytime |
| Web sites (each) | Off, On | On | Anytime |
| Web content volume | Light, normal, heavy | Normal | Anytime |
| Learning hints (tap-to-learn) | Off, On | On | Anytime |
| Coach's eye in the game center | Off, On | Off | Anytime |
| Colors | Team, Neutral | Team | Anytime |
| Neutral palette | Film Room, Deep Ice, Carbon and Jade | Deep Ice | Anytime |

Custom playbooks, call sheets, and scenarios are managed on their own screens, not in Settings. Football Academy is always available from the navigation.

### 2.17 Calibration added

New metrics in the harness (spec section 23.3), each with a target band sourced from public data and recorded in `calibration/targets.json`:

- **Play calling:** personnel usage shares, play-action rate, RPO rate, screen rate, motion rate, blitz rate, man and zone split, coverage shell mix, average depth of target, time to throw, pressure rate, and neutral-situation pass rate.
- **Analytics models:** EP and WP calibration (predicted against observed in held-out simulated seasons), completion probability calibration, and league-average EPA per play and success rate by season.
- **Staff:** head coach turnover, first-time head coach share, age at first head coaching job, and coordinator-to-head-coach promotions.
- **College:** stat leader ranges, declaration rates, and unchanged draft class quality.
- **Draft day:** trade counts and pick values in trades.
- **Storylines:** parity and home field advantage unchanged with effects on.
- **Web content:** repetition (share of repeated sentences per site per season) below a set threshold, and every number in generated content matches the engine's data (tested on samples).
- **Progression history:** the recorded changes for every player sum exactly to his current ratings, and league-wide development by age and position matches the existing aging-curve targets (spec section 23.3).
- **Real history:** imported career totals match the source totals for a sample of players, and ring counts match known Super Bowl rosters for a sample of seasons.

### 2.18 Responsiveness and size

This replaces fixed budgets, both in this document and in the original spec's budgets, from the moment this document is registered.

- **No file size limit.** The single HTML file can grow as large as the features need, including embedded history data and the playbook.
- **No fixed time limits** for loading or processing.
- **The UI never freezes.** Long work runs in the worker, or in chunks, so the page stays responsive to input.
- **Every wait shows an indicator.** Anything that takes more than about half a second shows a loading indicator. Operations with measurable progress show a progress bar with a short label of what's happening:
  - season and multi-season sims
  - imports and the history build
  - calibration runs
  - bulk edits
  - college seasons
  - long analytics queries
- **Long operations can be canceled** where it's safe to stop partway.
- **Sizes and times are still measured** and written into milestone reports, so a large regression is visible. They never block a milestone.
- These rules apply as soon as this document is registered, including to main milestones still in progress.
- The Settings storage view shows storage used by category, with export-and-clear (spec section 21).

---

## 3. Milestones

### Phase 4: football depth

### M24. Offensive playbook

**Build:**

- First slice: set up this phase (working rule 2).
- The offensive play data model: personnel, formations, strength and motion tags, the route tree, run blocking schemes, protections, read progressions, and matchup data (section 2.1.1).
- The offensive library of about 450 plays.
- Playbooks for every named offensive scheme, and custom playbooks.
- The call sheet with situation groups and auto generation from the game plan.
- Sim integration: offensive play selection from the call sheet, openness per route, QB progression reads, and run blocking against the existing abstract defensive calls.
- Playbook familiarity tied to scheme cohesion.
- Play diagrams for offensive plays, and a playbook browser screen.

**Done when:**
- Every offensive play passes validation, and every named scheme's playbook covers every call-sheet situation.
- A 100-season calibration run keeps scoring, passing, and rushing leaders inside their bands, and offensive play-calling metrics (personnel, play-action, RPO, screen, motion, and depth of target) inside theirs.
- Different named schemes produce clearly different play mixes and stat profiles, measured in the harness.
- Diagrams render for every play in all three layouts, in Day and Night.

### M25. Defensive and special teams playbook

**Build:**

- Defensive call data: packages, fronts, coverages (spot-drop and pattern-match), pressures, stunts, spies, disguise and rotation, and run fits (section 2.1.2).
- The defensive library of about 250 calls, with playbooks for every named defensive scheme.
- Special teams plays (section 2.1.3).
- Full sim integration: concept-versus-coverage and concept-versus-front modifiers, disguise against QB recognition, defensive play recognition against play-action and misdirection, and adaptive calling during games.
- Defensive diagrams and call sheets.

**Done when:**
- All calls pass validation.
- Calibration stays in band for all existing metrics, plus blitz rate, man and zone split, coverage shell mix, pressure rate, and time to throw.
- No single call or concept dominates: in the harness, no offensive play or defensive call has an EPA per play more than a set margin above its family's average across 100 seasons. The margin is a tunable.

### M26. Play log and expected-value models

**Build:**

- The play record emitted by the sim and the packed play log storage with the retention setting (section 2.3.2). This updates spec section 9.1: record the change with the decision skill.
- The EP, WP, completion probability, expected rushing yards, expected yards after catch, and 4th-down models (section 2.3.3), fitted by a new calibration step and embedded at build time.
- In-save refitting in the worker when the rule set changes scoring conditions.
- The loading and progress indicator pattern from section 2.18, used by every later milestone.

**Done when:**
- Retention changes remove only play-level data, the storage view shows the play log's size, and older saves open with the default retention.
- Model calibration is in band: predicted against observed on held-out simulated seasons.
- Changing a scoring rule triggers a refit, with a progress indicator, and the refit models pass the same checks.

### M27. Advanced metrics, grades, and value

**Build:**

- Per-play metric computation during the sim: EPA, WPA, success, CPOE, air yards, openness, time to throw, pressures and win rates, and coverage stats.
- Snap-level grading and rolled-up grades.
- New permanent stat categories for per-game advanced lines, with running aggregates (spec section 9.3).
- WAR, approximate value, and contract surplus value (section 2.3.4).
- Team metrics: opponent-adjusted efficiency, the simple rating system, Pythagorean wins and luck, PROE, pace, drive stats, and havoc rate.
- Era-adjusted "+" indexes with per-season league baselines.
- The AI: analytics-leaning GMs weight advanced metrics, and head coaches' 4th-down aggressiveness can drift toward the model over decades.

**Done when:**
- Every metric has a test on a scripted play sequence with hand-checked values.
- Advanced totals reconcile with box score stats where they overlap (for example, air yards plus yards after catch equal receiving yards on completions).
- League-average EPA per play and success rate are in band, and WAR's replacement level produces realistic league-wide totals.
- The milestone report records the change in sim time per game.

### M28. Analytics hub

**Build:**

- The analytics hub (section 2.3.5):
  - leaderboards
  - player analytics cards with percentiles
  - team dashboards
  - game analytics (WP chart, EPA by drive, top plays)
  - league trend charts across decades
- The advanced tab on player pages and the efficiency tab on team pages.
- The tools (section 2.3.6): leaderboard builder, splits builder, play finder, custom charts, comparison upgrades, and CSV export.
- Draft and contract analytics.
- Plain-language metric definitions everywhere.

**Done when:**
- Every analytics screen passes the style guide's definition of done in all layouts.
- Long queries run without freezing the UI and show progress.
- Splits and play-finder screens explain clearly when a season is outside the play log's retention.
- CSV exports open correctly in a spreadsheet.

### M29. Game center

**Build:**

- The steppable play loop and mid-game saves (section 2.2.5).
- The four control levels with per-game-type defaults, per-game overrides, mid-game switching, and auto-pause (section 2.2.1).
- The game screen (section 2.2.2).
- Head coach decisions with analytics recommendations, reviewable calls and challenges, and halftime adjustments (section 2.2.3).
- Play caller for offense, defense, or both, with call sheet suggestions, search, diagrams, and tempo (section 2.2.4).

**Done when:**
- Given the same decisions, a watched game and an auto-simmed game produce identical results and stat lines.
- A game can be saved and resumed mid-drive after closing the app.
- Every decision type works in Head coach and Play caller modes on phone, tablet, and desktop, including by keyboard.
- The game center never freezes the UI, and any wait shows an indicator.

### M30. Neutral themes

**Build:**

- The Colors and Neutral palette settings, stored and applied before first paint (section 2.15.1).
- The three palettes through the existing token generator (sections 2.15.2 and 2.15.3).
- The "Franchise GM" sidebar brand and the team chip component, placed next to team names throughout the game (section 2.15.3).

**Done when:**
- Every screen passes the theme matrix in all three neutral palettes, in Day and Night (section 2.15.4).
- Switching colors or palettes preserves the current screen state.
- Team chips never appear without the team's name, and warnings stay distinguishable in Film Room.

### Checkpoint E: football depth

Stop for the user. Hand over the build, the calibration report including the new play-calling and model metrics, and a short guided tour: calling a game, reading the analytics hub, comparing two schemes' play mixes, and switching to a neutral theme.

### Phase 5: the living world

### M31. Player progression history

**Build:**

- Recording every rating change with its drivers, the other timeline events, and the snapshots (section 2.14.1).
- The Progression tab (section 2.14.2).
- Risers and fallers, the team development report, coaching credit, development analytics, and news stories (section 2.14.3).

**Done when:**
- For any player, the recorded changes plus his starting ratings equal his current ratings exactly.
- Every chart and table on the Progression tab passes the style guide's definition of done in all layouts, with changes marked by more than color.
- Coaching credit is stored for every coach, ready for the coaching tree and hiring screens in M33.
- Commissioner edits appear on the timeline but are excluded from development analytics.

### M32. Easy editing and commissioner tools

**Build:**

- Commissioner mode and the rule enforcement setting, with the league health panel (section 2.10.1).
- In-place editing for every data table, with spreadsheet behavior, paste from spreadsheets, touch editing, and multi-level undo (section 2.10.2).
- Bulk editing with preview, set overall, and presets (section 2.10.3).
- Commissioner transactions, including force-accept and trades between other teams in Propose and Force modes (section 2.10.4).
- Commissioner entries in the transaction log and on progression timelines (section 2.14.1), and AI re-evaluation after edits (section 2.10.5).

**Done when:**
- Setting every player on a team to 99 overall takes a single bulk action, with a preview and a working undo.
- A trade between two AI teams can be proposed (with each team's evaluation shown) or forced.
- With rule enforcement on, illegal actions are blocked with the reason. With it off, they're allowed and appear in the league health panel.
- Table editing works fully by keyboard, and by touch on a phone.

### M33. Coaching trees and staff careers

**Build:**

- The full staff ladder with about 22 roles per team, and the new hidden attributes (potential, ambition) and mentorship rating (section 2.4.1).
- Staff development (section 2.4.2), using coaching credit from progression history (section 2.14.3).
- Stint records, mentor links, and trees (section 2.4.3).
- Scheme inheritance, head coaches bringing their assistants, and interviews (section 2.4.4).
- The hiring screen, the coaching tree view, the league tree rankings, and news stories (section 2.4.5).

**Done when:**
- Over a 50-season run, assistants climb the ladder and some become head coaches, and coaching trees form and spread schemes.
- Staff calibration metrics are in band (section 2.4.6).
- The tree view works by keyboard and on a phone.
- An assistant QB coach hired by the user can be followed through his career to a head coaching job in a test league.

### M34. College pipeline

**Build:**

- College programs and conferences.
- Prospects tracked three classes ahead with college development (section 2.5.1).
- The game-level college season with stat lines, awards, injuries, redshirts, transfers, and declarations (section 2.5.2).
- Early scouting, watch lists, stat context, and the all-star week (section 2.5.3).
- The College tab on career pages and the pipeline setting (section 2.5.4).

**Done when:**
- College stat leaders are in band, and draft class quality distributions match the baseline over 50 drafts.
- College seasons show progress while they sim.
- Turning the pipeline off restores the previous draft class behavior.

### M35. Draft war room

**Build:**

- The big board with tiers and flags, and the side-by-side boards (section 2.6.1).
- Draft day: the pick clock, pick cards with reactions, trade calls, the trade-up finder, live AI-to-AI trades, and best-available lists (section 2.6.2).
- After the draft: report cards, re-grades at three and five years, redraft rankings, and draft history (section 2.6.3).
- The settings (section 2.6.4).

**Done when:**
- A full draft runs in the war room with every clock option, and with the war room off it matches the previous draft behavior.
- Draft-day trade calibration is in band.
- Re-grades and redraft rankings match approximate value in tests.
- The big board works fully by keyboard.

### M36. Real NFL history

**Build:**

- The fetch and build tools, the history mapping, and `docs/HISTORY-SOURCES.md` (sections 2.11.1 and 2.11.2).
- Team history for every league (section 2.11.3).
- Player history, rings, retired players, the seeded records book, and the seeded Hall of Fame for real-data leagues (section 2.11.3).
- Matching with the review screen, and the settings (section 2.11.4).
- The Credits screen with source attribution.

Team history can be built and tested without the Madden CSV. Player history needs a real-data league: build and test it against a small sample of real players in the synthetic fixture, and finish the matching checks when the CSV arrives. List that in KNOWN-ISSUES.md if it's still missing.

**Done when:**
- Every franchise's seasons and championships match the sources.
- For a sample of players, imported career totals and Super Bowl ring counts match the sources.
- Missing source fields show as unknown, never as zero.
- The records book and Hall of Fame show real entries, and in-game record chases compare against them.
- The Credits screen names each source and license.

### M37. Rivalries and storylines

**Build:**

- Rivalry scores and histories (section 2.7.2), seeded from real history when it's on.
- Player, team, and coaching storylines with start, updates, and resolution (section 2.7.3).
- Their use in news, social posts, press conferences, the game center, and history screens.
- Capped effects behind the effects setting (section 2.7.1).

**Done when:**
- A 30-season run produces rivalries and storylines that reference real league history correctly, tested against the stored records.
- With effects on, parity, home field advantage, and scoring stay in band.
- With the feature off, no storyline content appears anywhere.

### M38. The web

**Build:**

- The browser screen with tabs, history, and bookmarks (section 2.12.1).
- The six sites with their themes (section 2.12.2).
- Personas, article types, the generation system, variety memory, comments, and the archive (section 2.12.3).
- The real-people content rules, and the settings (section 2.12.4).

**Done when:**
- Over a 10-season run, every site publishes in its own voice, and repetition stays below the calibration threshold.
- Every number in sampled generated content matches the engine's data.
- Every linked name opens the right screen.
- In a real-data league, sampled content about real people contains no off-field or personal-life stories.

### M39. Scenarios and achievements

**Build:**

- The scenario builder with start, modifiers, goals, and scoring (section 2.8.1).
- The 25 built-in scenarios, the randomizer, sharing, and scenario history (section 2.8.2).
- Achievements with eligibility rules (section 2.8.3).

**Done when:**
- Every built-in scenario loads in the leagues it supports, and its goals are checked correctly in tests.
- A scenario built from scratch in the builder plays through and scores correctly.
- A custom scenario survives a round trip through export and import.
- Achievements persist across saves on the same device.

### Checkpoint F: the living world

Stop for the user with a 30-season demo save that shows progression history, easy editing, coaching trees, college classes, war room drafts, real history, storylines, and the web.

### Phase 6: learning and finishing

### M40. Football Academy

The Academy comes last among features so its lessons match the finished playbook, game center, and analytics.

**Build:**

- The nine tracks and about 80 lessons (sections 2.13.1 and 2.13.2).
- Animated diagrams and knowledge checks.
- The three drills, including the film room lab on the real sim (section 2.13.3).
- Tap-to-learn, coach's eye, the glossary, and progress (section 2.13.4).
- The accuracy validation tests (section 2.13.5).

**Done when:**
- Every lesson, drill, and glossary entry passes validation, and every term used in the interface has a glossary entry.
- The film room lab's results match the sim's calibrated behavior for the same matchup.
- Animated diagrams respect reduced motion.
- Every Academy screen passes the style guide's definition of done in all layouts.

### M41. Live roster updates (needs the Madden CSV)

Skip this milestone until the user has supplied a Madden player table, and ideally a second, newer export for testing. Continue with M42 and come back to it.

**Build:** matching, the preview, apply options, backup, undo, the change log, and player page notes (section 2.9).

**Done when:**
- Importing a newer export into a real-data save applies the chosen changes and nothing else.
- Undo restores the save exactly.
- Ambiguous matches are listed for the user instead of guessed.

### M42. Final calibration and polish

**Build:**

- A full calibration pass over all metrics, old and new.
- A responsiveness pass: every long operation shows progress and nothing freezes the UI (section 2.18).
- An accessibility and layout pass over every new screen.
- Updated in-game help, linked to the Academy where it fits.

**Done when:**
- All calibration metrics are in band over 100 seasons.
- No interaction freezes the UI, and every wait shows an indicator.
- Every new screen passes the style guide's acceptance criteria.

### Checkpoint G: release

Hand the user the final `game.html`, the full calibration report, and the milestone reports for M24 through M42.

---

## 4. Defaults for the user to review

These were chosen without the user's input. Each is a setting or a tunable, so changing one later is cheap.

- Game day control defaults to Auto for every game type, with auto-pause at key moments.
- The play log keeps the current and previous season by default.
- Library sizes: about 450 offensive plays and 250 defensive calls.
- The college pipeline tracks three classes ahead, with about 130 programs and a 12-team national playoff.
- The war room is on, with the pick clock off.
- Rivalries and storylines are on, with gameplay effects off.
- 25 built-in scenarios and about 60 achievements.
- Roster updates import ratings and traits by default, but not contracts or team assignments.
- Commissioner mode is on, with league rules enforced on commissioner actions.
- Real history defaults to teams and players in real-data leagues, teams only in fictional leagues, with notable retired players only.
- The web has six sites, all on, at normal volume.
- Football Academy has about 80 lessons and 400 glossary terms. Learning hints are on; coach's eye is off.
- Colors default to Team. When Neutral is chosen, the palette defaults to Deep Ice.
