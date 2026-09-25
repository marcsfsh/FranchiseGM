# Franchise GM: Post-M42 build order

Companion to `franchise-gm-spec.md`, `franchise-gm-build-order.md`, `franchise-gm-styleguide.md`, `franchise-gm-tooling.md`, and `franchise-gm-post-m23.md`. The post-M23 document ends at M42 and Checkpoint G. This document continues from there with improvements to features that already exist, rather than new systems.

**Starting point:** the milestones here begin after Checkpoint G, once M0 through M42 are complete. From then on, the code is the reference for every system that already exists. This document defines each improvement in full and cites earlier sections only where it extends them: "spec" means `franchise-gm-spec.md`, and "post-M23" means `franchise-gm-post-m23.md`. Read a cited section with `node tools/doc.mjs <doc> <section>`, never whole documents.

**If this document arrives earlier,** follow section 1.1: register it, keep building the current milestones in order, and use it only to shape them so these improvements fit cleanly later.

Part 1 holds the working rules. Part 2 is the design for each improvement. Part 3 is the milestone order. Part 4 lists the defaults chosen for the user to review.

---

## 1. Working rules for this phase

1. **All earlier working rules still apply,** including those in the main build order and post-M23 Part 1: milestone order, decide-record-continue, no hard-coded rules or tuning, the engine never touching the DOM, the responsiveness rules (post-M23 section 2.18), and sortable tables everywhere (post-M23 section 1.2).
2. **Set up this document as soon as it arrives,** in one commit:
   - Save it as `docs/design/franchise-gm-post-m42.md`, copying an attached file rather than retyping it.
   - Add `post42: 'franchise-gm-post-m42.md'` to the FILES map in `tools/doc.mjs`, and `post42` to its usage line.
   - In CLAUDE.md's design documents section, add: "Post-M42 build order (M43 onward): `docs/design/franchise-gm-post-m42.md`."
   - In `.claude/skills/milestone/SKILL.md`, make milestones M43 and later read with `node tools/doc.mjs post42 <id>`, and checkpoints H and I come from this document.
   - Note in `docs/STATUS.md` that this document is registered. If M42 is complete, set the milestone to M43.
3. **Improve, don't duplicate.** Each item here extends a screen or system that exists. Reuse its components, data, and tests; don't build a parallel version.
4. **Every new behavior has a setting** when a player could reasonably want it off, and older saves open with defaults filled in.
5. **Priorities if time is short:** follow the milestone order in Part 3, which is ordered by the user's priorities.

### 1.1 Before Checkpoint G: preparing for this phase

If this document is registered while earlier milestones remain, keep building those in order and don't build these improvements early. Make these choices when the named milestone comes up, and record each as a decision:

| Earlier milestone | Prepare for | What to do |
|---|---|---|
| M14 (AI brain) | GM directives (2.3) | Keep every consideration's weight and every hard limit readable from a per-team input object, so the user's directives can supply them for the user's auto-GM. |
| M14 and M15 (AI, trades) | AI move explanations (2.3.8) | Keep each decision's top reasons with the transaction it produced, not only in the debug log. |
| M17 (history and honors) | Hall of Fame modes (2.8.4) | Keep the Hall of Fame vote as a separate step with a ballot, so a user ballot can join it later. |
| M20 (editor, settings, automation) | Settings presets (2.2), GM directives (2.3) | Keep every setting addressable by a stable key with a declared type and range, so bundles can save and apply any subset. |
| Save format work | Restore points (2.1.3) | Keep a full league state serializable in one step, so a snapshot can be stored inside a save. |
| Any weekly processing | Team ratings history (2.1.1), watchlist events (2.4) | Emit roster and depth chart changes as events with a reason, so notifications can use them later. |

---

## 2. Improvement designs

### 2.1 Seeing the league clearly

#### 2.1.1 Team ratings

Offense, defense, and overall ratings for every team, in the spirit of Madden's team ratings.

- **Scale and meaning:** ratings use a familiar 0 to 99 scale, but they come from the sim's own team-strength model (the rating the calibration harness fits, spec section 23), so they predict results. A team rated higher should usually beat a team rated lower.
- **Unit ratings** under each side: quarterback, pass catchers, offensive line, run game, pass rush, run defense, coverage, and special teams.
- **Where they appear:**
  - A league-wide Team ratings table (sortable, like every table).
  - Each team's page.
  - The league preview (section 2.1.2) and game preview (section 2.6.1).
  - Standings, as an optional column.
- **They update weekly** for injuries, depth chart changes, and roster moves, and each team's rating is kept per week, so history screens and trend charts (section 2.7.1) can show how a team's strength changed through a season.
- **Rank movement arrows** (section 2.1.4) show each team's change since last week.

#### 2.1.2 League preview before creating a league

- After the user enters or accepts a seed on the New League screen, the game builds the league in the background and shows a summary before committing:
  - Where the user's team ranks in team ratings (overall, offense, defense).
  - The user's team's best players by position group.
  - The top five teams in the league.
- A **Reroll** button tries a new random seed. The seed field stays visible, so a seed can be written down or shared.
- Building a preview shows a progress indicator, and the league is saved only when the user confirms.
- There's deliberately no automatic seed search. The scenario builder (post-M23 section 2.8) is the tool for shaping a starting situation.

#### 2.1.3 More "sim to" targets and restore points

**Sim to:**

- Targets: a chosen week, the trade deadline, the end of the regular season, the start of the playoffs, the Super Bowl, any named offseason phase (such as free agency or the draft), and "the next decision that needs me."
- Every target stops early when a pause rule fires (spec section 19.6), shows progress, and can be canceled between weeks.
- **Lineup check:** while roster automation is off (spec section 22.7), simming also stops if the user's lineup has a hole, such as no healthy quarterback, an illegal roster, or a starter who is out. The stop explains the problem and links to the fix.

**Restore points (a save within a save):**

- The user can create a **named restore point at any time** ("Before the trade deadline," "2031 preseason"). It captures the whole league state inside the current save.
- Any restore point can be restored at any time, which replaces the current league state after a confirmation. By default, the current state is saved as its own restore point first, so restoring is never a one-way trip.
- Optional **automatic restore points** before each sim, keeping the last few (setting: off, last 3, last 10).
- Restore points can be renamed, deleted, and exported as their own save file. The storage view (post-M23 section 2.18) shows their size.
- They support players who like to reload and retry. They don't affect achievements, but the scenario builder can turn restore points off for a scenario.

#### 2.1.4 Rank movement, totals, and ranks

- **Rank movement arrows:** standings, stat leaderboards, team ratings, and power rankings show how far each entry rose or fell since the last week, with the number of places. The arrow always comes with a text alternative ("up 2").
- **Stat display modes:** stat tables can switch between season totals, per-game averages, per-17-game pace, and league rank. Team stat tables show league ranks beside each value.

#### 2.1.5 Global search

- One search field, reachable from the top bar on every layout, that finds:
  - Players (active, retired, free agents, and prospects).
  - Teams, coaches, and staff.
  - Games (by teams and season) and seasons.
  - **Settings,** by name or description, since the game has many.
- Results are grouped by type, work by keyboard, and open the matching screen. Recent searches are remembered.

#### 2.1.6 Column chooser and saved views

- Every data table has a **Columns** control to show, hide, and reorder columns.
- **Filters** where they apply: position, team, age, rookies only, and minimum volume (attempts, targets, snaps).
- **Saved views:** any combination of columns, filters, and sort (post-M23 section 1.2) can be saved under a name ("QB watchlist," "Cheap veteran corners") and reopened later. The current view is kept in the page address, so Back returns to it.
- **Reset** returns a table to its default view.

### 2.2 Settings presets and the slider lab

With this many settings and sliders, saving and sharing them is essential.

#### 2.2.1 Settings presets

- A **preset** is a saved bundle of settings. When saving one, the user chooses which categories it includes: sim sliders (user side, AI side, or both), stat sliders, penalties, development and draft, contracts and finances, AI and world, automation toggles, GM directives (section 2.3), pause rules, notification settings (section 2.4.3), and display.
- Presets can be applied to the current save or chosen when creating a new league. One preset can be marked as the default for new leagues.
- Applying a preset previews exactly which settings change, and skips start-only settings in an existing save with a note.
- Presets export and import as small files for sharing. They're stored per device, across saves.
- Every setting change mid-save is still recorded in league history (spec section 22.1).

#### 2.2.2 The slider lab

- **Built-in slider presets,** each with a short description of the football it produces:
  - Calibrated (realistic NFL), always available as the reset point.
  - High scoring, Defensive era, Run-heavy era, Pass-happy modern.
  - More upsets (lower talent influence), Dynasty-friendly (higher talent influence).
- **Preview:** before applying slider changes, the lab runs a quick sample of games in the background and shows the league outputs against the calibrated baseline: points per game, passing and rushing yards, completion rate, sacks, turnovers, penalties, injuries, and upset rate, each with its change.
- **Compare** two presets side by side on the same outputs.
- **Difference view:** every slider that differs from calibrated, in one list.
- User and AI sliders stay separate (spec section 22.3). Sliders can be locked so a preset doesn't change them.
- Changes can apply now or at the start of the next season.

### 2.3 GM directives

The spec lets every job run on auto (spec section 22.7). Directives let the user **steer** that automation in as much detail as they want. The rule for this feature: whatever the user wants the auto-GM to do, there's a way to say it. Presets exist only as starting points; every value is editable, and a rules builder (section 2.3.6) covers anything the fixed controls don't.

#### 2.3.1 How directives work

- The user's auto-GM uses the same decision engine as AI front offices (spec section 14.1). Directives supply its inputs: consideration weights, team mode, budgets, and hard rules, in place of an AI personality.
- Directives are organized from broad to specific: overall strategy, then each domain, then positions, then individual players. A more specific directive overrides a broader one.
- **Each domain has an execution mode:**
  - **Auto:** the GM acts.
  - **Propose:** the GM prepares the move with its reasons and waits for approval in the inbox.
  - **Manual:** the user does it.
- Directives never break league rules. A directive that can't be met (for example, "keep $30M of cap space" together with "re-sign all four starters") is flagged with the conflict, and the user orders directive priorities so the GM knows which wins.

#### 2.3.2 Strategy

- Team mode: win now, contend, soft rebuild, full rebuild, or let the GM decide (spec section 14.4).
- Time horizon, risk tolerance, analytics lean, and youth versus veterans.
- **Positional value:** a weight for every position, deciding how much the GM invests there.
- Scheme fit strictness: how much fit matters compared with overall rating.

#### 2.3.3 Cap and contracts

- A minimum cap space to keep, per league year.
- Maximum share of the cap per position group (linked to positional spending, section 2.5.2).
- Maximum dead money, contract length, guarantees, and average salary by position.
- Restructure policy: never, only to create needed space, or freely. Void years allowed or not, and the maximum number.
- Franchise and transition tag policy, and fifth-year option policy.

#### 2.3.4 Roster, re-signing, and free agency

- **Re-signing:** an ordered priority list, and per-player instructions: keep up to a price and length, let walk, tag if needed, extend early, or wait. Age cutoffs by position.
- **Free agency:** a target list with a maximum offer per player, a need order by position, minimum rating, age, and fit, a budget per phase, bidding style (team-friendly to aggressive), an avoid list, and personality filters (for example, avoid volatile players).
- **Roster construction:** players per position, practice squad use, waiver claim policy, and injury replacements (sign a free agent or promote from the practice squad).
- **Playing time:** starters versus development snaps, rookie playing time, and rest policy.

#### 2.3.5 Draft, trades, and staff

- **Draft:**
  - A best-player-available versus need balance.
  - Position priorities and positions to avoid, by round range.
  - Prospect filters: age, athletic testing, character, injury history, scheme fit, and projected development.
  - Willingness to trade up or down, with cost limits.
  - Scouting priorities by region and position.
- **Trades:**
  - A buyer, seller, or hold stance, and trade deadline behavior.
  - An untouchables list, a list of players available, and a targets list.
  - Which assets may be traded (future picks, young players), and the most cap the GM may take on.
  - How to handle AI offers: auto-decline below a value, or forward for approval.
- **Staff:** hiring priorities (scheme, development, experience), keeping coordinators, promoting from within, and budget.
- **Game day:** instructions for the auto game plan, such as 4th-down aggressiveness, 2-point tries, tempo, and run and pass lean, applied on top of the coaching staff's tendencies.

#### 2.3.6 Rules builder

For anything the controls above don't cover, the user can write rules as "when this happens, do that":

- **Conditions** from a catalog: a player's status, rating, age, contract years left, or injury length; team record, cap space, or position depth; the phase or week; the draft round.
- **Actions** from a catalog: sign, release, claim, promote, extend, tag, restructure, trade or don't trade, draft or avoid, start or bench, and notify me.
- **Examples:**
  - "When a starter is out 4+ weeks, sign the best available free agent at his position under $2M."
  - "Never trade a first-round pick."
  - "Always keep at least 3 quarterbacks."
  - "When a player over 30 has one contract year left, notify me instead of extending."
- Rules have an order and can be switched on and off individually.

#### 2.3.7 Profiles and transparency

- **Directive profiles** save the whole set under a name and export like settings presets (section 2.2.1). A few starting profiles are included, all fully editable.
- **Every automated move lists the directives and rules that produced it.** A directive log shows what the GM did and why, filterable by domain.

#### 2.3.8 AI move explanations

- Every AI signing, release, waiver claim, trade, and draft pick can show its main reasons in plain language, such as "Needed a tackle after an injury; fits their zone scheme; cheap for one year."
- The reasons come from the AI's existing decision log (spec section 14.10).
- **Off by default,** with a setting to turn it on. When it's on, reasons appear on the transaction, in the news, and on player timelines.

### 2.4 Following players: watchlist, notifications, and notes

#### 2.4.1 Watchlist

- Follow any player, team, or coach. Followed entries are marked in every table and listed together on a Watchlist screen.
- **The main purpose is being told when something happens to them** (section 2.4.2).
- A setting treats every player on the user's own roster as followed (on by default), so the same notifications cover your team without adding each player.

#### 2.4.2 What you can be notified about

**Player movement:**
- Signed (free agency or re-signed), extended, restructured.
- Traded, released, waived, claimed off waivers.
- Signed to the practice squad, elevated, promoted to the active roster.
- Retired, or returned from retirement.
- Holdout started or ended, trade requested.

**Playing status:**
- **Benched:** moved out of a starting spot on the depth chart for a reason other than injury, with the reason when known (performance, coach's decision, a starter returning).
- Promoted to starter, or moved to a different starting spot.
- Injured (with severity and expected return), injury status changed (for example, from questionable to out).
- Placed on injured reserve or a reserve list, returning from injury or activated.
- Inactive for a game while healthy, ejected, suspended (if the game models it).

**Performance:**
- Career-high games and standout games.
- Milestones reached and records broken.
- Weekly awards, season awards, Pro Bowl and All-Pro selections.
- Joining or leaving an award race's top five (section 2.8.1).

**Development:**
- A large rating change up or down (the threshold is a setting).
- A dev trait change, an ability gained or lost.

**Contracts:**
- Entering a contract year, an option decision due, franchise-tagged, becoming a free agent.

**Career:**
- Hall of Fame semifinalist, finalist, or inducted.
- Ring of honor or retired jersey.
- A former player hired as a coach.

**For followed teams:** head coach or GM hired or fired, a major trade, clinching or elimination, a long win or losing streak, relocation or rebranding, a new stadium deal.

**For followed coaches:** hired, fired, promoted, and coaching tree milestones (post-M23 section 2.4).

#### 2.4.3 Delivery settings

- Each event type can be set to **off, inbox, or inbox and pause** (the pause uses the existing pause rules, spec section 19.6).
- Individual followed players, teams, and coaches can override the defaults ("notify me about everything for this player").
- Notification settings are included in settings presets (section 2.2.1).

#### 2.4.4 Notes and tags

- A private note on any player, team, or coach, shown on their page.
- Custom tags such as "trade bait" or "extend next year," with colors chosen from accessible tokens. Tags always show their text, never color alone.
- Tables can filter by tag, and saved views (section 2.1.6) can include tag filters.

### 2.5 The GM's office

#### 2.5.1 Cap planner

- Build a plan from several hypothetical moves before committing any: releases (with or without June 1 designation), restructures, extensions and re-signings at chosen terms, free agent signings at chosen terms, tags, options, and trades.
- The planner shows the combined effect on cap space, dead money, and cash for the current year and the next four.
- Plans can be saved, compared side by side, and committed in full or in part. Every committed move goes through the normal validation.
- It builds on the spec's multi-year cap projections (spec section 19.5).

#### 2.5.2 Positional spending

- **Allocation:** the share of the cap spent on each position group, compared with the league average, the league's top teams this season, and the league's past champions.
- **Trend:** how the user's allocation has changed over past seasons.
- **Value per dollar:** production value (WAR from post-M23 analytics) per million dollars of cap, by position group.
- **Commitments:** a grid of cap commitments by position group and year, showing when big contracts end.
- **Age:** the age profile of each position group.
- **Targets:** the user can set allocation targets, which feed GM directives (section 2.3.3), and try changes in the cap planner.

#### 2.5.3 Contract badges

Short markers on rosters, team pages, player pages, and free agency: expiring, option decision due, franchise tag candidate, void years, guarantees remaining, a no-trade clause, incentives in reach, and holdout risk. Each badge has a text label and an explanation on tap.

#### 2.5.4 Upgrade view in free agency

- For each free agent: how much better or worse he is than the user's current starter at his position, and how well he fits the user's scheme (spec section 7).
- A "Best available at my needs" filter orders free agents by the size of the upgrade at the team's weakest positions.

### 2.6 Game week

#### 2.6.1 Game preview

A page for every upcoming game, opened from the schedule and the home screen:

- **Key matchups position by position,** such as their best receiver against your top corner, with each side's ratings, player type labels (section 2.7.4), and an edge indicator.
- Team ratings and unit ratings side by side (section 2.1.1).
- Injuries on both sides, recent form, and head-to-head history.
- A projected result and win probability from the team strength model.
- The weather forecast for outdoor games, and storylines when they're on (post-M23 section 2.7).

#### 2.6.2 The coordinator's plan next to yours

- On the game plan screen, the plan the user's AI coordinator would choose against this opponent appears beside the user's plan.
- Differences are highlighted, each with the coordinator's reason.
- A one-tap option applies the coordinator's version, whole or setting by setting.

#### 2.6.3 Injury report

- A **team injury report** listing every injury with body part, severity, status, practice designations through the week, and expected return week.
- A **league injury report** with the same columns, filterable by team and position.
- On the depth chart, injured players' rows show their expected return week.

#### 2.6.4 Better game recaps

- Recaps built around the game's **turning points:** lead changes, the plays with the largest win-probability swings (post-M23 section 2.3.3), key fourth downs, and turnovers.
- A **player of the game** for each team.
- Written from structured events in the news system, so the web's outlets (post-M23 section 2.12) can reuse them.

### 2.7 Players and teams

#### 2.7.1 Team pages

- **Season trends:** points scored and allowed by week, current streaks, and strength of schedule played and remaining.
- **Team ratings history** through the season (section 2.1.1).
- **Other teams in their own colors:** when viewing another team's page, only part of the page changes: a colored band in the page header and that team's name plate use its colors. Everything else stays in the user's theme. The setting is on by default. In neutral themes (post-M23 section 2.15) the band uses the team's colors the same way.

#### 2.7.2 Player page "at a glance"

A header section on every player page:

- Current season line with league ranks ("3rd in passing yards").
- Injury status, and contract status with badges (section 2.5.3).
- Trend arrows for key stats and overall rating.
- Player type labels (section 2.7.4).

#### 2.7.3 Career timeline

A chronological list of everything in a player's career: drafted, signed, traded, released, injuries, awards, records, contracts, rating milestones (from post-M23 progression history), Hall of Fame steps, and retirement. Each entry links to its source (the game, transaction, or award).

#### 2.7.4 Player type labels

- Plain descriptions derived from ratings and traits, one or two per player, for example:
  - QB: pocket passer, scrambler, field general, gunslinger.
  - WR: deep threat, possession receiver, slot, run-after-catch.
  - DL: run stuffer, speed rusher, power rusher.
- Labels appear on player pages, as a table column and filter, in comparisons, and in game previews. They also apply to draft prospects, based on their scouted ratings.
- The label rules are data, reviewed so each position's labels match how the sim uses ratings.

#### 2.7.5 Player comparison across eras

- Compare two to four players from **any table** (stats, free agency, waivers, rosters, history), including retired players from any season.
- **Actual stats are always shown.** Era-adjusted versions (the "+" indexes from post-M23 section 2.3.4) are a toggle that shows them alongside the actual numbers, never instead of them.
- Compare by career, by a chosen season, or by per-game rates. Ratings can be compared at each player's peak or at a chosen season.
- Contracts compare as a share of that season's salary cap, so a 2030 deal and a 2060 deal are fair to compare.

### 2.8 Races, records, and the Hall of Fame

#### 2.8.1 Awards race

- During the season, weekly standings for MVP, offensive and defensive player of the year, and both rookie awards.
- Each contender shows his case: key stats, team record, and trend since last week. A followed player entering or leaving the top five can trigger a notification (section 2.4.2).

#### 2.8.2 Record watch

- Active players closing in on season or career records and milestones, with their current pace and games remaining.
- Includes imported real records when real history is on (post-M23 section 2.11).

#### 2.8.3 Playoff picture: clinch markers and odds

- Standings and the playoff picture mark teams that have clinched a playoff spot, the division, or a first-round bye, and teams that are eliminated, with a legend.
- **Playoff odds** for every team (making the playoffs, winning the division, earning the bye, winning the Super Bowl) from quick simulations of the remaining schedule in the background, updated weekly.
- Odds history is kept per week, so a team's page can chart its odds through the season.

#### 2.8.4 Hall of Fame watch and voting modes

**Hall of Fame watch:**
- For active and recently retired players: an estimate of each player's Hall of Fame chances and what he still needs ("two more All-Pro seasons," "about 1,500 more receiving yards").
- Uses the career score from spec section 18.7.

**Voting modes** (setting):

- **Auto** (default): the simulated committee decides, as in spec section 18.7. The user has no input, as in Madden.
- **Voter:** each year the user receives the ballot in the inbox and votes on the finalists, up to the class limit.
  - By default, the user's ballot counts as **one selector's vote** within the committee, so it shapes results without deciding them alone. The committee size is a setting.
  - **Nominations:** a separate setting (on by default in Voter mode) lets the user nominate a small number of eligible players each year for consideration. The committee still decides whether they become semifinalists and finalists. This keeps the user in the role of one voice in the process rather than the league's owner.
- Deciding the ballot outright stays with commissioner tools (post-M23 section 2.10), for users who want that power.
- Coaches and executives follow the same modes.

### 2.9 Home screen: franchise dashboard

A dashboard section on the Home tab, not a separate screen, summarizing the franchise's health:

- Roster age profile.
- Cap health over the next three years.
- Strength at each position compared with the league (from unit ratings).
- Draft picks owned.
- The front office's read on the team's window (contending or rebuilding), from the same team mode assessment AI teams use (spec section 14.4).

It starts collapsed to one line per item and expands in place. Each item links to its full screen.

### 2.10 Lower priority

Built last, after everything above:

- **Head-to-head grid:** every team's results against every other team for a season, plus standings by conference, by the whole league, and by point differential.
- **Visual drive chart:** each drive shown as a bar across a field graphic on the game page, from its start to its result, with scoring by quarter.

### 2.11 Settings added

| Setting | Options | Default | When |
|---|---|---|---|
| Automatic restore points | Off, last 3, last 10 | Off | Anytime |
| Stop sims when my lineup has a hole | Off, On (only while roster automation is off) | On | Anytime |
| Team ratings column in standings | Off, On | Off | Anytime |
| Default stat display mode | Totals, per game, per 17 games | Totals | Anytime |
| Treat my roster as followed | Off, On | On | Anytime |
| Notification delivery (per event type) | Off, inbox, inbox and pause | Varies by event (Part 4) | Anytime |
| Large rating change threshold | 1 to 10 points | 3 | Anytime |
| GM directives execution mode (per domain) | Auto, Propose, Manual | Follows the domain's existing auto toggle | Anytime |
| AI move explanations | Off, On | Off | Anytime |
| Other teams in their own colors | Off, On | On | Anytime |
| Hall of Fame selection | Auto, Voter | Auto | Anytime |
| Hall of Fame nominations (Voter mode) | Off, On | On | Anytime |
| Hall of Fame committee size | 20 to 100 | 50 | Anytime |
| Era-adjusted stats in comparisons | Off, On (shown beside actual stats) | Off | Anytime |

### 2.12 Calibration and checks added

- **Team ratings are predictive:** across calibration seasons, the higher-rated team wins at a rate that rises steadily with the rating gap, and team ratings correlate with season wins at least as strongly as the sim's internal strength measure.
- **Playoff odds are calibrated:** teams given about 30% odds make the playoffs about 30% of the time, checked in bands across simulated seasons.
- **GM directives are followed:** in test leagues with directive profiles, every automated move satisfies its hard rules, and conflicts are reported instead of violated.
- **Hall of Fame:** in Voter mode with a neutral user ballot, induction rates match Auto mode.

---

## 3. Milestones

### Phase 7: seeing and controlling the league

### M43. Team ratings and rank movement

**Build:** team and unit ratings from the team-strength model, the league table, team page and standings placement, weekly history (section 2.1.1), and rank movement arrows (section 2.1.4).

**Done when:**
- Ratings pass the predictiveness check (section 2.12).
- Ratings update after injuries and roster moves, and weekly history is stored.
- Arrows show the correct movement with a text alternative in every table that has them.

### M44. Settings presets and the slider lab

**Build:** settings presets with category selection, preview of changes, new-league defaults, and export and import (section 2.2.1). The slider lab with built-in presets, preview samples, comparison, difference view, and locks (section 2.2.2).

**Done when:**
- A preset with any combination of categories round-trips through export and import unchanged.
- Applying a preset mid-save skips start-only settings with a note and records the change in league history.
- The lab's preview runs in the background with progress, and its outputs move in the expected direction for each built-in preset.

### M45. Sim targets, restore points, and league preview

**Build:** every "sim to" target with pause-rule stops and the lineup check (section 2.1.3), restore points manual and automatic (section 2.1.3), and the league preview with reroll (section 2.1.2).

**Done when:**
- Each sim target stops at the right point, and a lineup hole stops the sim while roster automation is off.
- Restoring a restore point reproduces the saved league state exactly, and the current state is saved first by default.
- The preview matches the league actually created from the same seed.

### M46. Search, columns, and saved views

**Build:** global search including settings (section 2.1.5), the column chooser, filters, saved views, and stat display modes (sections 2.1.4 and 2.1.6).

**Done when:**
- Search finds players, teams, staff, games, seasons, and settings, fully by keyboard and on a phone.
- Saved views restore columns, filters, and sort exactly, and survive Back and reload.

### M47. Watchlist, notifications, and notes

**Build:** the watchlist and "treat my roster as followed" (section 2.4.1), every event type in section 2.4.2 with delivery settings and per-entity overrides (section 2.4.3), and notes and tags (section 2.4.4).

**Done when:**
- A test season fires each event type correctly for followed players, teams, and coaches, including benchings for non-injury reasons and returns from injury.
- Delivery settings route each event to off, inbox, or pause as set.
- Tags filter tables and appear in saved views.

### M48. Player pages and comparison

**Build:** the "at a glance" header (section 2.7.2), the career timeline (section 2.7.3), player type labels (section 2.7.4), and comparison across eras from any table (section 2.7.5).

**Done when:**
- Every position's labels are reviewed against how the sim uses ratings, and labels appear everywhere section 2.7.4 lists.
- Comparisons always show actual stats, with era-adjusted values only beside them when toggled on.
- Timelines link every entry to its source.

### Checkpoint H: seeing and controlling the league

Stop for the user with a demo save showing team ratings, a saved settings preset, restore points, search, saved views, notifications for followed players, and a cross-era comparison.

### Phase 8: the GM's office and the season

### M49. GM directives

**Build:** directives for strategy, cap and contracts, roster, re-signing, free agency, draft, trades, staff, and game day (sections 2.3.2 to 2.3.5), execution modes per domain and priority ordering (section 2.3.1), the rules builder (section 2.3.6), directive profiles and the directive log (section 2.3.7), and AI move explanations, off by default (section 2.3.8).

**Done when:**
- The directives check in section 2.12 passes.
- Every control in sections 2.3.2 to 2.3.5 changes the auto-GM's behavior in a test that measures it.
- The rules builder can express each example in section 2.3.6, and each works in a test league.
- Propose mode queues moves with reasons, and nothing executes without approval.

### M50. The GM's office

**Build:** the cap planner (section 2.5.1), positional spending (section 2.5.2), contract badges (section 2.5.3), and the free agency upgrade view (section 2.5.4).

**Done when:**
- A cap plan's combined totals match committing the same moves one by one, in golden tests.
- Positional spending comparisons match league data, and allocation targets reach GM directives.
- Every badge has a label and an explanation.

### M51. Game week

**Build:** the game preview (section 2.6.1), the coordinator's plan comparison (section 2.6.2), the injury reports and depth chart return weeks (section 2.6.3), and turning-point recaps with players of the game (section 2.6.4).

**Done when:**
- Previews show correct matchups, injuries, and projections for every game in a test week.
- Applying the coordinator's plan, whole or in part, produces exactly that plan.
- Recaps name the correct turning points in tested games.

### M52. Races, records, and the Hall of Fame

**Build:** the awards race (section 2.8.1), record watch (section 2.8.2), clinch markers and playoff odds with history (section 2.8.3), and Hall of Fame watch with Auto and Voter modes and nominations (section 2.8.4).

**Done when:**
- Clinch and elimination markers are correct in every week of a test season, checked against the tiebreaker rules.
- Playoff odds pass the calibration check (section 2.12).
- Voter mode's ballot, vote weight, and nominations work as described, and a neutral ballot reproduces Auto mode's induction rates.

### M53. Team pages and the home dashboard

**Build:** team season trends and ratings history (section 2.7.1), other teams' colors on part of their pages (section 2.7.1), and the franchise dashboard section on Home (section 2.9).

**Done when:**
- Team colors appear only in the header band and name plate, in every theme, with contrast checked.
- The dashboard's collapsed and expanded views pass the style guide's definition of done in all layouts.

### M54. Lower-priority views and final pass

**Build:** the head-to-head grid and extra standings views, and the visual drive chart (section 2.10). Then a final pass: calibration of all metrics, responsiveness, and accessibility across every screen changed in this phase.

**Done when:**
- All calibration metrics, old and new, are in band.
- Every changed screen passes the style guide's acceptance criteria.

### Checkpoint I: release

Hand the user the final `game.html`, the calibration report, and the milestone reports for M43 through M54.

---

## 4. Defaults for the user to review

- **Notification delivery defaults:**
  - Inbox and pause: your players injured (multiple weeks), traded, released, or claimed away; trade requests and holdouts.
  - Inbox only: everything else in section 2.4.2 for followed entries.
  - Off: nothing by default. Every event type is available.
- Your own roster is treated as followed.
- The large rating change threshold is 3 points.
- Automatic restore points are off; manual restore points are always available.
- AI move explanations are off.
- Other teams' colors on their pages are on.
- The Hall of Fame is Auto. In Voter mode, your ballot counts as one of 50 selectors, and nominations are on.
- Era-adjusted stats in comparisons are off, and actual stats always show.
- Built-in slider presets: Calibrated, High scoring, Defensive era, Run-heavy era, Pass-happy modern, More upsets, and Dynasty-friendly.
