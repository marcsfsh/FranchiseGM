# Decisions

## D-1: Weighted-seed nonce inputs
- When: 2026-09-24, M0
- Decision: Each advance seed chains from the previous one and, outside fixed mode, mixes a nonce of (league stream draw, digest of user actions since the last advance, app-supplied entropy from `crypto.getRandomValues`). Fixed mode drops the nonce.
- Why: Spec 8.9 wants the same choices to give similar, not identical, outcomes; a nonce built only from saved state would replay identically after a reload.
- Revisit if: the user wants reloads with identical choices to replay exactly outside fixed mode.

## D-2: 2026 salary cap and pay minimums
- When: 2026-09-25, M1
- Decision: The 2026 cap is $301,200,000 per club (NFL announcement, February 27, 2026). 2026 minimum salaries are $885K to $1.3M by credited seasons; practice squad pay is $13,750 a week, $18,350 to $22,850 for veterans.
- Why: The build order's no-CSV path says to look up the real 2026 cap; the CBA sets the minimums.
- Revisit if: the Madden CSV carries a different cap, or the user sets one at league creation.

## D-3: The last opened league lives in IndexedDB
- When: 2026-09-25, M2
- Decision: The pointer to the last opened league is a record in the saves database's `app` store, written in an awaited transaction and cleared in the same transaction that deletes that league. Layout, theme, and density preferences stay in `localStorage`.
- Why: Spec 2.3 lists the last opened league as a `localStorage` preference, but Chromium flushes `localStorage` to disk asynchronously, so a reload right after opening a league could forget it (the M2 reload test caught this).
- Revisit if: n/a

## D-4: Role ratings are measured from the typical player at the role's position
- When: 2026-09-25, M3
- Decision: A role's base rating is the typical player's overall at the role's primary position plus the position's overall-formula stretch times the role's weighted rating differences from that typical player (archetype template averages at age 27). The typical player therefore rates his own overall in every role of his position, and fit (role rating minus overall) shows how a player's strengths match the role. Return and coverage duties (KR, PR, gunner) show role ratings without fit, since a returner's rating isn't comparable to his position overall.
- Why: Spec 7.3 defines the base as the recipe's weighted average, but the overall formulas stretch their averages (spec 7.1, M1), so a raw weighted average would put almost every player several points off his overall and fit would measure the stretch, not the match.
- Revisit if: the Madden CSV replaces the formulas and archetypes; the typical player then comes from the fitted archetypes.

## D-5: The M3 scheme definitions
- When: 2026-09-25, M3
- Decision: Four offenses (West Coast, Shanahan outside zone, Air Raid, Power run) and four defenses (4-3 over, 3-4 one-gap, Cover 3 single-high, Man blitz), each a set of tendency sliders and a role per depth chart slot, drawn from 2020s NFL tendencies of teams known for each scheme. Defensive slots cover both fronts (FLEX is the 4-3 Sam or the second 3-4 end). Blends average two schemes slot by slot, and the heavier scheme's front wins. The tables below are generated from src/engine/schemes.
- Why: Spec 7.2 names the schemes and sliders but not their values.
- Revisit if: calibration (M6) or the measured situation profiles (M4) show a scheme's numbers are off.

## D-6: The starter ability catalogs
- When: 2026-09-25, M3
- Decision: 24 player abilities and 10 coach abilities with original names. An ability's effect boosts named ratings while the sim resolves a play in one of its triggers (M4). Its fit value is its tier in points (1 to 3) times how often the scheme triggers it relative to the named schemes' average for the slot, capped at double. Generated players get 1 ability as a Star with an overall of 80 or more, 2 as a Superstar, and 3 as an X-Factor, chosen from the ones their ratings qualify for; coaches get 1 at an overall of 72 and 2 at 84.
- Why: Spec 7.4 describes abilities and asks for about 20 in M3 without naming them or setting their values.
- Revisit if: the Madden CSV brings ability names to map (docs/MAPPING.md), or calibration shows ability effects are too strong or weak.

## D-7: Situation profiles are estimated from tendencies until M4
- When: 2026-09-25, M3
- Decision: Each slot's share of snaps in each trigger situation is estimated from the scheme's tendencies and league averages (src/engine/schemes/situations.ts, constants in tuning.ts). Game contexts (red zone, third down, two-minute, late and close, bad weather) are the same share for every role.
- Why: Spec 7.5 measures profiles by running the sim, which arrives in M4; the build order says to use estimates until then.
- Revisit if: M4 measures the profiles; the estimates then go away.

## D-8: The sim centers every matchup on the typical starter
- When: 2026-09-25, M4
- Decision: Each resolution works with action composites (weighted ratings) minus the typical starter's composite at the positions that do the action, where the typical starter is the archetype average lifted by the generator's starter quality. Base rates are 2021-2025 NFL averages, and rating edges move them on the log-odds scale, so an average starter plays at league rates. Fit adds half a rating point per fit point; team form and home field add rating points for the day.
- Why: Spec 8 describes the play loop but not its math; centering on starters keeps one-sided terms (quarterback accuracy, the kicker) from inflating league output.
- Revisit if: M6 calibration shows a stat can't reach its target through the tuning constants.

## D-9: Situation profiles are measured by the sim and cached as generated data
- When: 2026-09-25, M4
- Decision: tools/measure-profiles.ts runs 48 fixed-mode games per named scheme with every team using it and writes each slot's share of snaps in each trigger situation to src/data/situation-profiles.json. Named schemes use their measured profile, blends mix their two schemes' profiles, and the estimate from tendencies (D-7) remains only as a fallback for unmeasured schemes. Rerun the tool after changing the sim or a named scheme.
- Why: Spec 7.5 wants measured profiles, recomputed when a scheme changes and cached; measuring at build time keeps the game file small and startup instant.
- Revisit if: custom schemes arrive (M21); they will be measured in the worker when saved.

## D-10: Coaching tendencies of spec 8.6 map onto the M1 head coach model
- When: 2026-09-25, M4
- Decision: Fourth-down and two-point aggressiveness both come from the head coach's aggressiveness tendency; clock management from his clock management tendency; halftime adjustment skill from his game management rating; conservatism with a lead is the same aggressiveness scaled down late in games. Challenge skill (flavor) isn't modeled yet.
- Why: Spec 8.6 lists more coaching fields than spec 13.1's ratings and M1's tendencies hold; deriving them avoids a second, overlapping set.
- Revisit if: the staff screens (M9) or coaching carousel need these as separate visible ratings.

## D-11: Overtime periods and possessions
- When: 2026-09-25, M4
- Decision: A regular-season overtime that can end tied is one period of the rule set's length. Playoff overtime, and regular-season overtime when a rule set turns ties off, plays periods that pair up like quarters: the drive carries over after the first of a pair, and after the second comes a coin toss, fresh timeouts (three per pair in the playoffs, two for a regular-season period), and a kickoff. The two-minute warning applies in the second period of each pair. Both teams must finish a possession before sudden death, and a possession cut off by the end of a pair counts; a defensive score ends the game at once. With the both-teams rule off, the 2012-2021 modified sudden death applies: an opening touchdown wins, a field goal doesn't.
- Why: The NFL's 2022 playoff overtime rules, extended to the regular season in 2025; the rule set holds only lengths, timeouts, and the two flags.
- Revisit if: the rules committee (M19) needs more overtime options.

## D-12: Home field sources the spec leaves open
- When: 2026-09-25, M4
- Decision: Division familiarity goes to the visitors (0.3 rating points), trimming the home edge. A team that travels east loses 0.4 when kickoff falls before 11 a.m. on its body clock (a Pacific team at 1 p.m. Eastern). Dome and retractable-roof teams lose 0.5 outdoors below 40 degrees, scaled by the weather slider. Crowd noise isn't scaled by team hype until fans arrive (M16).
- Why: Spec 17.3 lists familiarity as "a small bonus in division games" without saying for whom; NFL home teams win less often in division games, so the bonus goes to the visitors.
- Revisit if: M6 calibration of home win rates by game type disagrees.

## D-13: Clock rules the sim simplifies
- When: 2026-09-25, M4
- Decision: After an accepted penalty or a pre-snap foul the clock restarts on the ready signal, except in the last two minutes of the first half and the last five of the second, when it waits for the snap; the 10-second runoff isn't modeled. A period can't end on an accepted defensive foul, so an untimed down follows. A leading team kneels when its remaining kneels (2 seconds each) plus the gaps between them that the defense can't stop with timeouts or the two-minute warning (the play clock less a second each) cover the time left. An offense playing for a last field goal spikes the ball inside 25 seconds when it has no timeouts, then kicks.
- Why: NFL Rule 4 timing, reduced to what changes game outcomes.
- Revisit if: the live game view (spec 8.7) needs the runoff or play-by-play clock detail.

## D-14: How history is stored
- When: 2026-09-25, M5
- Decision: Each league's history lives in five IndexedDB stores keyed by league ID: stat tables (one record per season per category, typed-array columns of 16-bit per-game values with player and game dictionaries), game records (everything in a game result but player lines), player histories (season lines by team, regular season and playoffs apart; careers are summed on read), season summaries (team seasons, results, and league leaders), and the records book (top 10 per stat for single games, seasons, and careers, plus team records and streaks). Recording a batch of games writes all of it in one transaction. Penalty rows record each accepted foul by type; a line's penalty count, penalty yards, and total tackles are derived. Exports carry history, with tables as base64 text.
- Why: Spec 9.3 fixes the columnar layout but not the aggregate records; per-player histories keep career pages to one read, and season summaries keep leaders current without scanning every player.
- Revisit if: the export-and-clear-history tool (spec 21) or M22's storage pass needs another layout.

## D-15: Franchise totals and records wait for M17
- When: 2026-09-25, M5
- Decision: The M5 records book keeps league-wide lists only. Franchise totals (spec 9.3) and franchise records (spec 18.5) arrive with M17's franchise history and complete records book, rebuilt then from the stored team seasons, player season lines by team, and stat tables.
- Why: The M5 build list names season, career, team, and leader aggregates, and M17 builds "the complete records book" and franchise history; everything franchise records need is already stored.
- Revisit if: a screen before M17 needs franchise records.

## D-16: Playoff games are numbered after the regular season's weeks
- When: 2026-09-25, M5
- Decision: A playoff game's week continues from the regular season (week 19 is the first round after an 18-week season), and round names count back from the Super Bowl by the bracket size in the rule set (`playoffRoundName`).
- Why: Stat rows and game logs sort by week, and the rule set can change the season length and the number of playoff teams (spec 16, 5.3).
- Revisit if: a bracket needs rounds that don't map to one week each. M7: the Super Bowl is still one week number after the conference championships, and the off week between them heals injuries a second week.

## D-17: How calibration replays work before the season loop
- When: 2026-09-25, M6
- Decision: A run generates fictional leagues from its seed and replays each league's 2026 regular season 10 times; each game draws its own stream, so any worker can run any replay. Players hurt for some weeks sit out their team's games in those weeks, and since M7 their backups dress in their place, standing in for the weekly injury updates. Favorites are judged by team ratings fitted to each league's margins across its replays (a simple rating system with a home edge), the sim's stand-in for closing lines. The fit effect comes from extra replays in which each measured starter (quarterback, lead back, receivers and the top tight end, offensive line, edge rushers and interior linemen, and defensive backs; linebackers have no clean per-player stat) plays each game at his best or worst fit across the named schemes, chosen at random, while his team keeps its scheme.
- Why: Spec 23.1 has calibration replay the season until the offseason exists (M6 build order), and spec 23.3's favorite and fit metrics need a rating gap and a same-player comparison.
- Revisit if: M10's offseason lets replays run multi-season leagues. M7 (D-20) added each head coach's auto depth chart, set once per league, and an AI game plan for every game; injured reserve and signings stay out of replays so each game remains independent.

## D-18: Conservatism when leading, and chasing a deficit
- When: 2026-09-25, M6
- Decision: A coach protects a second-half lead of more than 5 points, more as the lead and the clock grow: the offense passes less and lets the play clock run, and the defense plays soft coverage (short passes come easier, deep ones harder, fewer blitzes and a lighter rush). In the last five minutes any lead is protected (the prevent defense). Until M13 gives head coaches this tendency (spec 8.6), it is 100 minus the coach's fourth-down aggressiveness. The mirror image: from the second quarter, an offense behind by more than a field goal passes more, more as the deficit and the clock grow (C-12).
- Why: Spec 8.6 lists conservatism when leading; without it the sim produced too few one-score games and too many blowouts (NFL: 50.7% and 21.6%).
- Revisit if: M13 adds the tendency to coaches.

## D-19: Cap parity in generated rosters
- When: 2026-09-25, M6
- Decision: The fictional league generator draws every roster slot's quality, measures the starters against a typical starting lineup (the quarterback counting four times), and moves the whole roster so a team more than 0.1 quality units from typical keeps only 20% of the excess; the team strength offset is uniform with sd 0.2 (C-1, C-11).
- Why: Spec 10.2 item 4 fits generated rosters under the cap, which keeps any team from stacking talent everywhere; normal-tailed rosters produced about 11 perfect or winless teams per 100 seasons against spec 23.2's "a handful at most".
- Revisit if: M8's cap and M12's free agency shape rosters from real contracts.

## D-20: AI weekly management in M7
- When: 2026-09-25, M7
- Decision: Before each week's games, AI teams move players out 4 or more games to injured reserve, bring healed ones back while designations last (releasing the weakest healthy player in the group), and sign free agents to one-year minimum deals where the roster is thinnest against the standard 53; a team with no healthy quarterback, kicker, punter, or long snapper signs one even for a short injury. Head coaches decide questionable players and set depth charts; coordinators build a game plan per opponent from the scouting report (five dials and five player-focus choices). The user's team gets the lineup decisions while its depth chart is on auto and a plan while its plan is on auto, and never gets roster moves (M8 brings the screens). Depth chart choices draw from a stream fixed for the season, so a coach's misjudgments persist until his options change. The head coach's depth chart style is a profile: analytics lean makes a meritocrat, youth lean splits veteran from developer, loyalty and rigidity make a loyalist, low personnel power makes him play the players the team pays.
- Why: Spec 12.2 and 14.11 need AI teams legal and competitive every week on the 14.1 framework; the spec is silent on how personality maps to the five coach types and on weekly noise. Fresh draws each week reshuffled about three lineup slots per team per week with no roster change.
- Revisit if: M8 adds contracts, cap previews, and waivers to signings, or M14 replaces these decisions with the full AI.

## D-21: When contract money counts against the cap
- When: 2026-09-25, M8
- Decision: Base salary counts for the regular-season weeks a deal is in force, out of 18 weekly paychecks (a move dated in a week comes before its game). Roster bonuses fall due when the league year opens, so a release on its first day avoids them; workout bonuses are earned by June 1; per-game roster bonuses count each game in force less the games he was inactive. Likely incentives drop when a deal ends before the season does; incentives settle on regular-season totals after the last week, charging unlikely ones earned and crediting likely ones missed the next league year. A released vested veteran (4 or more accrued seasons) on the week 1 roster is owed the rest of his season's base. A release from June 2 on splits its dead money across two league years; one with a June 1 designation keeps his whole cap hit on the books until June 2, then splits. Void-year proration accelerates into the first void year; a declined option ends the deal as the option year opens. A restructure converts only salary still to be paid, lowering the paychecks still to come, fixes the signing bonus's proration years so added void years spread only the converted money, and can't touch a drafted rookie's deal until after his third season. The rule of 51 applies from the league year's opening to the regular season, and to later league years' projections. Contracts that end stay in the league with how and when they ended, so dead money is always computed. The cap sheet lists, apart from the roster, dead money, pay earned by players who left, a promoted player's practice squad pay, and elevated players' game pay above their practice squad pay (the active minimum's weekly share).
- Why: Spec 11.2 lists what counts but not when; these follow the CBA's paycheck, bonus, termination pay, and top-51 rules.
- Revisit if: M10's league year turnover or M12's negotiations need offsets for guaranteed money a player earns elsewhere, or a real schedule of bonus dates.

## D-22: Transactions, waivers, and AI roster moves under the cap
- When: 2026-09-25, M8
- Decision: Every roster move (signing to the roster or practice squad, release, reserve lists, promotion, elevation, waiver claim, restructure) is checked and previewed in one module the user's screens and the AI share. Released players go on waivers unless they're vested veterans released before the trade deadline or practice squad players; waivers clear when the league next advances, before teams set their rosters, and a claimant takes over the deal's remaining years while the old team keeps the accelerated proration and the bonuses the deal already earned. A move that uses cap space must leave the team under the cap (moves that free space are always allowed), and every preview computes the team's cap sheet after the move. Until the draft order exists (M11), waiver priority through week 3 follows a seeded order for the league and season, then the standings, worst first, a team without games counting as .500. Free agents ask for a share of market value that falls from 60% at week 1 to 30% by week 18 (100% in the offseason), never under the minimum. AI teams sign at the asking price when the cap allows, elevate a practice squad player before signing someone for a short injury, refill the practice squad with free agents 25 or younger by potential, claim only players 5 points better than their weakest at the position (cutting that player), and never cut a player who joined the roster that week.
- Why: Spec 12.1 and 19.4 list the moves and waivers without claim timing, a first-season waiver order, or AI rules; one checked path keeps AI teams legal and under the cap every week, and a looser claim rule churned hundreds of players a season.
- Revisit if: M11 adds the draft order, M12 replaces the acceptance model, or M14's AI takes over roster decisions.

## D-23: Situational game plans, the depth chart advisor, and league stat leaders
- When: 2026-09-25, M9
- Decision: A game plan's run and pass balance has an overall lean plus a lean for each down and distance (first down; second, third, and fourth down at 3 yards or less or more); inside the opponent's 20 the red zone lean replaces the down's, and in the last two minutes of either half the two-minute lean does, the red zone winning when both apply. The sim's own late-game rules (trailing late, protecting a lead, the end of the first half) still apply on top. AI coordinators keep every situation neutral until M14. The depth chart's advisor is the head coach's own depth chart decision, drawn from a stream fixed for the team and week so the advice holds still, compared starter by starter with the user's chart. Leaderboard rate stats need the NFL's minimums per team game (a career needs fixed totals), in TUNING.leaders; ties share a rank.
- Why: Spec 8.7 asks for balance by down and distance with red zone and two-minute overrides but not how they combine; spec 19.3 names advisor suggestions and leaderboards without rules for them.
- Revisit if: M14's AI plans situations for its coordinators, or M13's staff screens give the advice a voice.

## D-24: Calibrating through the weekly loop, and strength tiers in generated leagues
- When: 2026-09-25, after the Checkpoint A review
- Decision: A calibration run has two modes. Replays stay as D-17 describes; weekly-loop seasons each play a generated league's regular season through advanceWeek with every club run by the AI, the user's through a new roster-management auto setting (spec 22.7, engine only until the settings screen gains its automation toggles). Season records (win spread, best and worst records, 15-win and 2-win teams, perfect and winless teams) are judged on the weekly loop, everything else on the replays, and reports show both values side by side. A full run plays 100 of each; CI plays 20 replays and 8 weekly-loop seasons. Generated leagues get strength tiers in place of an independent uniform offset: 10 contenders centered 0.33 (latent standard deviations) above average, 12 middle teams at average, and 10 rebuilding teams 0.33 below, each tier's teams evenly spaced across 0.2 in a random order (C-20). The weekly loop also surfaced three AI fixes: teams sign or promote only players who can play that week, a healed player comes back from injured reserve when nobody at his position is healthy (and only while the team has returns left), and development snaps reach a young backup wherever he stands behind the starter.
- Why: Spec 23.1 calibrates the league the player sees, and replays skip weekly roster management; on the same seed the loop's win spread was 2.87 against the replays' 2.98. The NFL's win spread of about 3.1 comes with fewer runaway teams than a wide single spread produces, and tiers give that shape.
- Revisit if: M10's offseason lets weekly-loop seasons chain in one league, M14's team modes want the creation tier, or real-roster leagues (the Madden CSV) get their own calibration.

## D-25: Rating changes with causes, and roster and depth chart changes with reasons
- When: 2026-09-25, M10
- Decision: Every rating change goes through `changeRatings` (src/engine/progression/change.ts): ratings move by whole points within 0 to 99, the overall is recomputed, and it returns a record of the ratings that moved, the date, the cause (weekly, offseason, camp, or injury), and its three largest drivers. Career-altering injuries already use it; M10's progression will. Each week's outcome carries its rating changes and its depth chart changes (who took a starting spot from whom, because of an injury, rest, a roster move, a return from injury, or the coach's decision). Roster moves take an optional reason that the transaction log keeps; AI moves always give one ("a knee injury, out 6 weeks", "needed at receiver"), and the user's moves give none. Nothing stores the rating and depth records yet: post-M23 section 2.14's progression history and post-M42 section 2.4's notifications decide how to keep them.
- Why: Post-M23 section 1.1 asks M10 and M11 to route every rating change through one function that knows its cause, and post-M42 section 1.1 asks weekly processing to emit roster and depth chart changes as events with reasons.
- Revisit if: post-M23 M31 (progression history) or post-M42's notifications need more fields.

## D-26: Rotation order and sites for generated schedules
- When: 2026-09-25, M10
- Decision: Generated schedules (spec 5.2) match their rotations in the league's first-season schedule. The 3-year cycle plays each conference's remaining division splits with the first division's later-named partner first, and the 4-year cycle puts the seed year's 17th-game pairings two years on, with the first open pairing in name order next and the leftover pairs last; together these give the NFL's published order (2027: AFC East against the AFC South and the NFC East; 2028: the AFC North and the NFC West). The 17th game's division is the one the 4-year cycle brings two years later, and its host conference alternates from the seed year's. Rotating games and same-place games flip their sites each time the cycle returns; pairings the seed year didn't have start from a balanced pattern (each team two home and two away against the other division, and each division hosting one same-place game). Each week keeps the seed year's layout: its number of games and byes, and its Thursday, Sunday night, Monday, Saturday, holiday, and international slots, moved to the new year's calendar (week 1 follows Labor Day, the Thanksgiving layout moves to Thanksgiving's week, Christmas games go to Christmas Day when it falls on a Thursday, Friday, Saturday, or Monday). The champion opens at home, Detroit and Dallas host on Thanksgiving, the best matchups by last season's records get prime time, and Pacific and Mountain hosts play Sunday afternoons in the late window. Weeks come from one depth-first search with no more than 3 road games in a row (a bye doesn't end the run), division rematches at least 3 weeks apart, all division games in week 18, and at least 4 days between a team's games.
- Why: Spec 5.2 derives the rotations from the 2026 schedule but can't order the two unplayed splits from one year; the NFL's published cycle settles it, and the seed layout keeps generated seasons shaped like the real one.
- Revisit if: realignment or expansion changes the divisions, or the base data gains a later published schedule.

## D-27: The offseason's stand-ins until the draft (M11) and free agency (M12)
- When: 2026-09-25, M10
- Decision: The offseason runs every phase of spec 4.1 a step at a time (free agency four weeks, the preseason three), with stand-ins where later milestones build the real systems. At the end of Super Bowl week, undrafted rookies nobody signed leave the game and every player on a roster (not the practice squad) earns a credited season. Retirements (spec 10.7) are decided as the awards phase ends; a retiring player's deal ends as retired, which accelerates its proration and owes nothing more. When free agency opens, unused space carries over, the cap grows by the spec 11.1 blend with league revenue growth drawn from N(7%, 2.5%) until M16 models revenue, and the minimums, practice squad pay, and rookie scale grow with it; deals that ran out end, an option year nobody exercised ends its deal as declined, and the reserve lists clear. Each free agency week the AI teams take turns in draft order signing free agents at their asking price where a position group is short of the standard 53, keeping cap room for their draft class and for every other open spot at the minimum, with one player taking at most three spots' share; deals run 3 years through age 26, 2 through 29, then 1. At the draft a 450-prospect class (spec 22.4's default size) with the standard roster's position mix is generated, and teams take 7 rounds in reverse order of finish (playoff teams by the round they went out, the champion last, the weaker schedule first on ties), each the best prospect by 0.6 potential and 0.4 overall plus noise, on rookie scale deals; the user's picks are made the same way until M11's draft room. After it each AI team signs its 8 best undrafted rookies on minimum deals. The next season's schedule comes out with the OTAs. At the cutdown the AI teams release the least valuable healthy players (overall, plus half the gap to potential through age 25) from their deepest groups, then release more if they'd be over the cap once every roster charge counts; the user must reach 53 and get under the cap before the season starts, or turn on auto roster management. Offseason waiver claims need roster room, since no weekly cut follows. The new league year's transactions carry into the next season's log.
- Why: M10's 10-season run needs rosters to refill each year, and the build order leaves the draft to M11 and bidding to M12; these stand-ins keep every team legal and competitive until then, through the same checked moves the user makes.
- Revisit if: M11 replaces the class, the draft, and the UDFA signings; M12 replaces the free agency signings; M16 supplies league revenue.

## D-28: The progression model, its settings, and training focus
- When: 2026-09-25, M10
- Decision: Every rating belongs to a class with its own age curve, counted in years from the position group's peak age (the generator's): speed (speed, acceleration, agility, change of direction, jumping, returns) fades first, the body (strength, stamina, toughness, injury, throw power) later, skills later still, the mind (awareness, play recognition) last, and kicking has its own. Each curve is growth that fades and decline that builds, through logistics (TUNING.progression). A player develops the ratings his overall weighs plus the athletic and mental ones everyone has. Three quarters of a year's change comes at training camp and the rest in 18 weekly steps during the regular season, rounded to whole points at random so small steps add up. Growth is scaled by the room left to potential, the development trait, playing time (last season's snaps at camp, the week's in season; rookies aren't judged), training focus or the program, the position coach's and coordinator's development ratings and their development abilities (camp), scheme fit (camp), an injury, and work ethic; decline by the development trait, work ethic, and the program. Free agents grow half as fast on their own. The settings (spec 22.4) are four tables by age bracket (22 and under, then two-year brackets, 35 and over) and by position group, and four speeds: progression and regression, each split into an age speed and a position speed that scale their tables as a whole. All are percentages of normal (100%), 0% to 200%, like the sim sliders. Training is a weekly focus for each unit (offense, defense, special teams), a player's own focus in place of his unit's, and an offseason program; a focus puts extra growth into its ratings (double in season, 30% more at camp) and a little less into the rest, and a program also slows its ratings' decline. With auto on (always for AI teams) the coaches pick each unit's focus by its starters' weakest weighted ratings, give players through 24 with room to grow their own, and pick technique for young rosters, strength for old ones, and film otherwise. Mentors join in M12 and facilities in M16. Every change goes through changeRatings with its drivers attributed in overall points.
- Why: Spec 10.5 lists the drivers, the four curve settings, and "speed and agility decline earliest, awareness and route running keep improving later"; the split speeds follow spec 22.4's wording, and the training screen lives with the game plan since the spec's navigation has no training section.
- Revisit if: the 10-season aging calibration (M10's close) needs different curves, or spec 10.6's dev trait changes and abilities arrive.

## D-29: The re-sign window: tags, tenders, options, extensions, and the AI's stand-in
- When: 2026-09-25, M10
- Decision: A deal runs out when the league year after its last running year opens (void years don't count; an option year counts once exercised). At that point a player with more than 3 credited seasons is an unrestricted free agent, one with exactly 3 restricted, and one with fewer an exclusive-rights free agent. Tag positions follow the NFL's (the offensive line is one; defensive ends, defensive tackles, linebackers, cornerbacks, and safeties separate; kickers, punters, and long snappers one). A franchise tag pays the average of the top 5 current cap hits at his tag position or 120% of his cap hit this league year, whichever is more, and a transition tag the top 10 average; a second straight tag at least 120% of his last salary and a third at least 144% of it or the quarterback tag. Tenders pay their level's amount (the 2025 first-round, second-round, and original-round tenders grown with the 2026 cap, then with the cap each league year) or 110% of his base, whichever is more; the original-round amount also buys the right of first refusal, and exclusive rights cost the minimum. Tags, tenders, and extensions are deals for the next league year, signed now and held as the player's pending deal; they count on next year's cap from the day they're signed and take over when the league year opens. If he leaves first, a tag or tender is rescinded at no cost and an extension ends the way his current deal did. One tag a team a year. A first-round pick's fifth-year option is decided in the window after his third season; until M17's honors, rank by overall at his tag position stands in for Pro Bowls: the best 3 get the franchise tag amount, the next 5 the transition amount, and the rest the average of the 3rd to 20th cap hits at the position with 75% of snaps, otherwise the 3rd to 25th. Extensions are open until free agency, at his asking price (his market value, as for free agents) until M12's negotiation; tags, tenders, and options only in the window. The user gets a message when the window opens (an expiring deadline, so a sim pauses there) and decides on the Contracts screen; the AI teams decide as it closes (and the user's staff with contracts on auto): an option is exercised when his asking price reaches 90% of it; a player the team would miss (he'd rank within the standard count at his position group) and who's 32 or younger gets the highest tender his asking price covers if restricted, the exclusive-rights tender if exclusive, the non-exclusive franchise tag if he's 80 or better and asks more than it costs, and otherwise an extension at his asking price, while next year's cap keeps room for the draft class and 4% of the cap for free agency. Offer sheets, matching, and compensation for tagged and tendered players come with M12's free agency.
- Why: Spec 11.4 and 11.5 set the amounts and the one-tag rule but leave the pending deal, the tag positions, the option tiers without Pro Bowls, and the AI's choices open; these follow the 2020 CBA where the spec is silent.
- Revisit if: M12's negotiation and offer sheets arrive, M14's AI brain replaces the stand-in, or M17's Pro Bowls can price the option.

## D-30: OTAs, training camp, the preseason, and the cutdown's claims
- When: 2026-09-25, M10
- Decision: At the OTAs every auto training plan and depth chart is set for the new rosters (the depth charts with the coming season's streams, as its first week would set them), and the user gets a message about the program. Training camp brings the offseason's development (D-28), then camp injuries, the depth charts for the healthy rosters, the position battles on them, and the preseason schedule. A battle is at each offensive and defensive depth chart slot where the starter is no more than 2 role rating points ahead of the best player not starting anywhere: the challenger wins 50% of the time, less 12 percentage points for each point he trails by, and takes the slot on every auto chart (the weekly charts then keep him as the incumbent); the user's manual chart is left for the user, with a message naming the winners. The winner's first-team snaps add a point to his position's two most important ratings, and each job the challenger won comes back as a depth chart change with the camp as its reason. Camp injuries hit each healthy active player at 5% times the in-game proneness terms and the injury frequency slider, with the in-game severities past minor, about 1.7 a team, a fifth of them for the season. The preseason is three weeks: each team plays once a week, never the same team twice, and hosts once or twice (the one with fewer home games so far hosts, a coin flip on ties), at the home stadium on the week's date at 7 p.m. Eastern. Each team's starters, as its depth chart would field them, rest when a healthy player at the same position can take the snaps; the games' injuries count, their lines go to history as preseason games (not in career totals), and the user gets each result with a box score link. After the cutdown the waiver wire clears with the in-season claim rule, at most 2 claims a team, and each AI team cuts back to 53 and fills its practice squad with the young free agents with the most upside.
- Why: Spec 4.1 names position battles, camp injuries, and development bumps for camp, games tagged as preseason, and practice squad signings and waiver claims at the cutdown, without their mechanics; NFL teams play three preseason games and rest most starters, and post-cutdown claims are a few a team.
- Revisit if: M13's staff personalities should shape battles (developer coaches favoring youth), or M18's news wants camp storylines.

## D-31: Spent contracts leave the league
- When: 2026-09-25, M10
- Decision: When a new league year opens, contracts that no player holds or is due to take over, that aren't on waivers, and whose last year and any end are more than two league years back are removed from the league. They charge no cap, and they count toward no tag, tender, or June 1 limit (a third straight tag looks back two years). Everything current, pending, or recent stays.
- Why: Spec 6.5 computes cap figures from contracts, and these compute to nothing; without this, every cap sheet scanned every contract ever signed, so each season simmed slower than the last and saves grew without bound.
- Revisit if: M17's player histories want contract details; they can keep a summary of each deal before it goes.

## D-32: The aging calibration and the stand-ins it leans on
- When: 2026-09-25, M10
- Decision: Progression's age curves count from their own peak age per position group (QB 27, RB 25, WR 26, TE 26, OL 27, DL 27, LB 26, DB 26, specialists 30), apart from the ages the generator builds players by. Growth scales with the room left to potential, full at 12 points, and stops at potential (a player past it only moves with the camp's noise). Usual retirement ages are half a year sooner (QB 37, RB 30.5, WR, TE, and DL 32.5, OL 33.5, LB and DB 31.5, specialists 38), and the AI keeps its expiring players only through age 30. In the cutdown a draft pick in his first two seasons is worth 16, 14, 12, 10, 9, 8, or 7 more points to keep by round, and an undrafted rookie 6. The stand-in draft classes (D-27) move prospects' latent quality by position group (QB -0.8, TE -0.3, RB +0.6, OL and DB +0.2 standard deviations) so each group's league average holds.
- Why: Spec 23.3 checks peak ages, the rosters' age mix, and flat ratings by position; with growth past potential and the generator's peak ages, a 10-season chain inflated quarterbacks by 10 points and kept too few rookies, and these settings pass every aging target (C-21).
- Revisit if: M11's draft classes replace the stand-in's quality offsets, M13's staff changes development, or M17's honors and M18's history add the career-length and dev trait metrics.

## D-33: The salary floor's windows and the cash it counts
- When: 2026-09-26, M10
- Decision: The salary floor (spec 11.1) checks consecutive windows of 4 league years counted from the league's first (2026 to 2029, then 2030 to 2033, and on). Each league year's cap is kept from the league's first. A team's cash in a league year is what its deals paid in it: salary for the weeks in force, bonuses and incentives as they're earned, signing and option bonuses and restructure conversions when paid, and after a release the guaranteed salary still owed, on its usual schedule. When a window closes, as the next league year opens, a team whose cash over it is under 89% of those years' caps pays the shortfall to its players, reported in the news and the user's inbox. The payment doesn't count against the cap, and until M16's finances it's only on record. The share and the window are rule set settings (salaryFloorShare, salaryFloorYears); a share of 0 turns the floor off.
- Why: Spec 11.1 asks for the CBA's floor; the CBA sets club minimum cash spending at 89% of the cap over fixed four-year periods, with any shortfall paid to the club's players.
- Revisit if: M12's free agency spends like NFL teams (under D-27's stand-ins a 10-season league's teams pay about 75% of the cap in cash by its third season, so most fall short of the first window), or M16's finances track team cash, so the shortfall comes out of the owner's money.

## D-34: Settings shows the roster and contract automation now
- When: 2026-09-26, M10
- Decision: Settings has an Automation card with the two jobs the user can hand to the staff so far: roster moves (signings, cuts, injured reserve, practice squad moves, waiver claims) and contracts (the re-sign window's extensions, tags, tenders, and options). This replaces D-24's engine-only setting; M20 adds the rest of spec 22.7's toggles to the same card.
- Why: M10's final cutdown holds the user until the roster is legal and the re-sign window stops for the user's decisions, and both messages point to the switch that lets the staff handle them.
- Revisit if: M20 builds the full automation settings.

## D-35: Deals leave a record in the player's history
- When: 2026-09-26, M10 (the user's review of D-31)
- Decision: Before a spent deal leaves the league (D-31), a compact record of it goes into its player's history: the team, the deal type, the league year it was signed, its first and last real league years and how many there were, its total value (salaries, bonuses, the signing bonus, and salary a restructure converted), the average a year, the money guaranteed at signing, that average as a share of the cap in the league year it was signed, and how and in which league year it ended (ran its course, released, claimed, traded, declined, retired, or replaced). Deals signed before the league's first league year are priced against that year's cap, as the generator priced them. The league keeps each league year's cap for this and for the salary floor (D-33). The records sit with the player's season lines in the history store, travel in exports, and are added once each.
- Why: Career timelines, comparisons across eras, and a league's own history need each player's contracts after the deals themselves are gone.
- Revisit if: M17's player pages show contract timelines, or M22's storage pass trims history.

## D-36: Stat columns keep their signs, and decimals wait for the analytics
- When: 2026-09-26, M10 (the user's review of D-14)
- Decision: Every stat column in the history tables is a signed 16-bit integer (-32,768 to 32,767), so stats that go below zero (rushing, receiving, and return yards, and a longest gain that lost yards) keep their signs through storage, exports, and totals; only the player, game, team, and kind columns are unsigned, since they hold positions. Values are rounded to whole numbers as they're stored, which fits every stat through M23. The per-game analytics after M23 (EPA, WPA, CPOE, and the other rates in post-M23 section 2.3.4) need decimals: each will get a scale in its field definition (tenths or hundredths in the same signed columns) or a 32-bit float column, chosen when that section is built.
- Why: Spec 9.3 fixes the columnar layout; an unsigned column would wrap a negative into a large positive number, and whole numbers would drop the analytics' fractions.
- Revisit if: the analytics (post-M23 section 2.3) are built, or M22's storage pass changes the layout.

## D-37: Accrued seasons decide free agency; credited seasons set pay
- When: 2026-09-26, M10 (the user's review of D-27 and D-29)
- Decision: Each regular-season week counts a game for every player on full pay status with a team that played: the active roster (dressed or not), injured reserve, PUP, and practice squad players elevated for the game. The non-football injury list, suspensions, and the practice squad don't count. When the season ends, 3 or more such games earn a credited season (the player's experience, which sets his minimum salary) and 6 or more an accrued season. Accrued seasons decide free agency (more than 3 unrestricted, exactly 3 restricted, fewer exclusive rights), vested veterans (4 or more, for termination pay and skipping waivers, as D-21 says), and the practice squad's veteran limit and veteran pay (more than 2). Generated veterans start with as many accrued seasons as credited ones. The two thresholds are rule set settings. This replaces D-27's credited season for everyone on a roster when the season ends, and D-29's free agency status by credited seasons.
- Why: The CBA grants an accrued season for 6 or more regular-season games on full pay status and bases free agency and veteran status on it, while the minimum salary scale counts credited seasons, which take 3.
- Revisit if: player pages show both counts (M17), or the editor (M20) edits them.

## D-38: M12 makes the AI's re-sign choice value-based
- When: 2026-09-26, M10 (the user's review of D-32)
- Decision: D-32's stand-in, where AI teams keep expiring players only through age 30, stays until M12, which replaces it before Checkpoint B with one valuation shared with free agency bids: a player's expected value over the new deal's years (his projected overall each year from the age curves, priced by the market) against the deal's cost. Age lowers the value through the projected decline, with no cutoff. M12's plan carries it as its own slice, with an aging calibration run after it.
- Why: A hard cutoff lets a 31-year-old star walk while a 29-year-old backup is kept; one valuation for re-signing and free agency keeps the AI's choices consistent.
- Revisit if: M14's AI brain adds team modes, so a contender pays more for the present.

## D-39: M12 prices tags from five years of cap percentages
- When: 2026-09-26, M10 (the user's review of D-29)
- Decision: When M12 reworks contracts, the non-exclusive franchise tag and the transition tag follow the CBA's method: for each of the previous five league years, the average of the top 5 (franchise) or top 10 (transition) cap numbers at the tag position as a share of that year's cap; the five years' average share, times the new league year's cap. The league keeps each league year's shares by tag position from its first (its caps are kept already, D-35); before five years exist, the years before the league's first count at its first year's shares. The exclusive franchise tag keeps the current top 5 average, and the 120% floor and the second and third tag rules stay. Until then, D-29's current-year averages stand.
- Why: The CBA prices these tags from five years of cap shares so one year's outlier deals don't swing them.
- Revisit if: n/a.

## D-40: Season records follow NFL history, with softer parity and tiers that vary
- When: 2026-09-26, M10 (the user's review of D-19 and D-24)
- Decision: The perfect-or-winless band comes from NFL history: 3 such teams in the 44 full seasons from 1981 to 2025 (the 1982 strike season aside), about 6.8 per 100 seasons, so 100 seasons pass from 3 to 11 and warn from 1 to 14. D-19's pull toward a typical roster is half as strong (a roster keeps 40% of its excess past 0.1 quality units, up from 20%), and each generated league draws its own tier sizes, 8 to 12 contenders and 8 to 12 rebuilding teams with the middle tier taking the rest, in place of D-24's fixed 10, 12, and 10; the tiers sit 0.31 from average (was 0.33) so the league's overall spread holds (C-22). Once M12's free agency lands, season records (win spread, best and worst records, 15-win, 2-win, and perfect or winless teams) are judged on chained seasons 3 to 20 of each chained league, since creation settings shape only the first few seasons; until then they stay on the weekly loop's first seasons.
- Why: Spec 23.1 asks for sourced targets, and the NFL's record is the source; a league's shape should come from its rosters and its own draw, not the same three tiers everywhere.
- Revisit if: M12's chained seasons show the spread drifting from the first seasons', or real rosters (the Madden CSV) get their own calibration.

## D-41: Draft classes made a season ahead
- When: 2026-09-26, M11
- Decision: Each draft class is made as the season before its draft starts (the league's first with the league itself) and held until the draft, when its prospects join the league. A class has the settings' size (450) and draws positions by a standard roster's mix, since it holds the undrafted rookies who fill out rosters as well as the picks; each position's share is a setting. Each class draws a strength shift (sd 0.12 quality units) and each position group another (sd 0.2); the settings move their means (up to 0.4 either way) and scale their spreads. A prospect's draft value blends 60% of his ceiling with 40% of his overall now. The consensus misjudges it by a small error (sd 3 points), and 12% of prospects are busts, overrated by a further 5 to 12 points, and 6% are gems, underrated as much; each rate is a setting by position group. Development variance is the other half of busts and gems: a player's hidden ceiling drifts at each of his first 4 training camps after his draft, by draws that add up to sd 3 points, scaled by a setting by position group, so some rookies outgrow their grades and others stall. Generated names don't repeat among active players, players retired within 20 years, or the class. A prospect can be made for any class year, whatever the season now. Until the draft room arrives, D-27's stand-in draft takes each class by the consensus view.
- Why: Spec 10.3 asks for classes made before the season that precedes their draft, with strength, position mix, and bust and gem controls, and post-M23 section 1.1 asks that the generator can make a prospect years before his class.
- Revisit if: the college pipeline (post-M23 section 2.5) grows prospects over several seasons, or M11's calibration of draft hit rates by round calls for different bust and gem rates.

## D-42: Draft picks as records, numbered when the season ends
- When: 2026-09-26, M11
- Decision: Every team holds its picks in the next three drafts (the rule set's draftPickYears), seven rounds each. A pick is a record of its draft year, round, the team it was issued to, the team that holds it (M15's trades move it), whether it's compensatory (M12 awards those, spec 11.8), and its number once set. When a season ends, the next draft is numbered: each round's regular picks in the order of the finish (D-27's draft order), then its compensatory picks in the order they were awarded; the previous draft's records leave the league, since its players carry their draft details. After each draft, teams get their picks three drafts on. The waiver order all offseason and through a season's early weeks is the latest numbered draft's, so D-22's seeded stand-in only covers a league's first season. A team's rookie cap reserve counts the picks it holds.
- Why: Spec 10.4 has picks traded before and during the draft, with compensatory picks; NFL teams trade picks up to three drafts out, and the NFL's waiver priority follows the draft order until the season's third week ends.
- Revisit if: M12 awards compensatory picks, or M15 trades picks.

## D-43: Scouting grades, points, and auto scouting
- When: 2026-09-26, M11
- Decision: A team's grade on a prospect is his draft value, misjudged as the consensus misjudges it (D-41), plus the team's own error: a normal draw fixed for the team and prospect, with sd 6 points before any scouting. Points spent on a prospect scout him toward a full workup at 60 points, which cuts the team's error by 75% and sees through half the consensus misjudgment; 30 points reveal his traits and 60 his abilities. A director of scouting rated 99 on accuracy shrinks every error by 30% (one rated 1 grows it as much), and the scouting accuracy setting divides it. Each week of the season and each offseason step before the draft, a scout earns 6 to 18 points by his points rating in his region, and the director 4 to 10 that go anywhere; a scout assigned nationally earns 60% of his points, and they go anywhere too. A prospect's scouting draws on his college's region first. Teams on auto (every AI team, and the user's while the Automation setting for scouting is on, which it is by default as the director's job) place their scouts in the regions holding most of their 150 best-graded prospects and spend 15 points at a time on their best-graded prospects not yet fully scouted.
- Why: Spec 10.4 sets grades as true value plus noise that shrinks with investment and the director's skill, scouts by region with weekly points, and auto scouting, without the amounts.
- Revisit if: M13's staff market changes scouts' ratings, or M11's draft hit rates call for sharper or blunter scouting.

## D-44: The combine, pro days, and top-30 visits
- When: 2026-09-26, M11
- Decision: As the offseason reaches the combine, the class's 330 best prospects by the consensus view work out there; at the pro days, the next 150 do. Specialists don't run the drills. Each drill is a straight line in the rating it tests, with noise: the 40 from speed and acceleration, set so a typical wide receiver runs about 4.45 and a typical lineman about 5.25; bench reps at 225 pounds from strength; the vertical and broad jumps from jumping; the 3-cone from agility and change of direction; and the shuttle from change of direction and acceleration. Working out narrows the consensus misjudgment of a prospect by 30% at the combine and 15% at a pro day, so underrated prospects rise and overrated ones fall; the three biggest risers and fallers make the news, without player links until prospects have pages. From the combine to the draft each team can bring in 30 prospects (the rule set's draftVisits) for top-30 visits, which hold the interviews and show it their personalities; teams scouting on their own visit their 30 best-graded prospects after the pro days.
- Why: Spec 10.4 lists the drills, derived from ratings with noise, risers and fallers in the headlines, and visits that reveal personality, without the formulas or counts; the NFL invites about 330 prospects to the combine.
- Revisit if: the Madden CSV gives real measurables to fit the drills against, or M18's media gives prospects pages and storylines.

## D-45: The draft's media, mock drafts, and the AI's need-and-value model
- When: 2026-09-26, M11
- Decision: The media's big board ranks a class by the consensus view (D-41) plus hype. From week 4 of the season through the draft, one prospect a week from the media's top 60 makes a headline and moves 1 to 4 points on its board: up, or down 40% of the time (an off-field incident for a volatile one). Hype moves only the media's board; AI teams' grades will follow the headlines once M18's news-effects setting exists. From week 9 through the draft, a mock draft of the first round comes out each week, with a headline when its first pick changes: the first round's order as it stands (the finish so far, each pick with the team holding it, then the numbered order once the season ends), each team taking the prospect worth most to it. Until M14's AI brain, a prospect's worth to a team is its grade on him plus 4 points times its need at his position, which grows as its starters' average overall falls below 78 (fully at 58, a missing starter counting as 40) and by 0.2 when it has fewer players there than a standard roster.
- Why: Spec 10.4 asks for media hype that moves media big boards, AI rankings only with the news-effects setting, weekly mock drafts from midseason, and a simple need-and-value draft model until M14.
- Revisit if: M14's AI brain replaces the need-and-value model, or M18 adds the news-effects setting and prospect storylines.

## D-46: Enforcing the cap and the roster rules for every team, the user's included
- When: 2026-09-26, between M11 slices 4 and 5 (the user's report from play)
- Decision: One cap calculation, the team's cap sheet, backs the screens, every move's check, and every advance's check. The rule of 51 runs from the league year's opening until the final cutdown (D-21 had it run to the regular season): from the cutdown on every charge counts, so the cutdown's check reads the sheet the season will. A move that adds to the cap (a signing to the roster or the practice squad, a promotion, an elevation, a claim, or a deal for next league year) must leave the team under it whatever its space before, since under the rule of 51 a cheap signing left an over-the-cap sheet unchanged; a team over the cap by a legal path (the league year's raises, incentives settling, a draft class) may only make moves that free space or leave the cap alone until it's under. The rule set gains a minimum active roster (activeMin, 53, from the final cutdown through the Super Bowl, none in the offseason) and a game-day line (gameDayLine, 5 offensive linemen). Before any advance the user's team must be under the cap, within the active roster's minimum and limit, and, in a week it plays, able to dress a legal game-day roster: a quarterback, kicker, punter, long snapper, and 5 offensive linemen, healthy and not resting (the count it dresses, 48 with 8 offensive linemen and otherwise 47, has no minimum, as in the NFL, since injuries can leave fewer). Otherwise the advance stops with the reasons, and the hub offers fixes, each previewed before it's made: restructures and releases with what they free, practice squad elevations and promotions, free agents at the minimum, injured reserve to open a spot, restructures to make room when a signing can't fit, and the staff's own fix listed move by move. That holds at free agency's first week, so a team over the cap when the league year opens gets under before the league moves on. The AI keeps every team it runs legal the same way (the user's with roster management on auto): at every offseason step and each week after its roster moves, it cuts down to the limit, restructures the deals that save the most, then releases the least valuable players whose release saves, then fills with promotions and minimum signings, restructuring for room when needed; a coach never rests a questionable player when his group would fall short of a lineup's worth. Each week's outcome lists any team that took the field illegally. The league's rule enforcement setting (post-M23 2.10.1, on by default, in Settings) turns off the cap and roster-size checks on the user's moves and the stop before advancing; the AI still follows every rule, and the League health list in Settings names every team that breaks one.
- Why: Spec 11.1 and 12.1 and the CBA keep every club under the cap at all times, including the league year's opening, and at its roster sizes, but the user's team went over the cap at free agency's first week, stayed over into week 17 of the next season while signing players, and played with 36 active players.
- Revisit if: M12's negotiation offers pay cuts or new ways to get under, M14's AI plans cap space ahead instead of fixing it, or post-M23's commissioner mode adds the rest of its tools.

## D-47: Draft value counts the position
- When: 2026-09-26, M11
- Decision: A prospect's draft value (D-41) adds his position's worth: 10 points times the natural log of the market's top pay at his position as a share of the cap, over 0.08. A quarterback gains 9 points, an edge rusher or a wide receiver about 5, a right tackle none; a halfback loses 3, a kicker 14, and a long snapper 27. Teams' grades, the media's board, mock drafts, and the draft all see it.
- Why: NFL teams draft positions as they pay them: first rounds from 2015 to 2024 held about 3.5 quarterbacks each and no specialist, while by ratings alone kickers, punters, and fullbacks reached the first round.
- Revisit if: M14's AI brain values positions by scheme, or M11's draft hit rates call for another weight.

## D-48: The draft, pick by pick, and the media's grades
- When: 2026-09-26, M11
- Decision: The draft opens as the offseason reaches its draft step: the class moves into the draft room, the order is numbered if the season's end didn't number it, and the media's big board is final, which ends scouting and the media's coverage. Teams pick one at a time on the numbered pick records. An AI team takes the prospect worth most to it by its own grades and needs (D-45), and its needs change as it drafts. The user's team takes the user's choice in the Draft room, the staff's choice for that pick, or the staff's for every pick left. A new Automation setting, Draft picks (off by default), has the staff make the user's picks as the league advances; with it off, the league can't leave the draft step while the user is on the clock, so a longer advance stops there. A drafted player joins the team holding the pick at once, on the rookie scale deal for its number, whatever the team's cap space or roster count; the team gets legal before the league moves on (D-46). If the class runs out, the picks left go unused. After the last pick, the prospects nobody took become free agents, and teams get their picks three drafts on. The media grade every class by the chart value of its players' places on their final board over the chart value of the picks it used, where the chart halves every 24 picks. Letters run from A (1.6 or more) down through A-, B+, B (0.88 to 1.12), B-, C+, and C to D (under 0.32), set so a draft's 32 grades spread about as the media's do, most of them B's. Each grade comes with a line on the class's best value and its biggest reach.
- Why: Spec 10.4 asks for a phase-based clock where the user makes each pick or sets auto, the AI's need-and-value model until M14, rookie contracts by pick, and a letter grade with a short blurb for each team after the draft.
- Revisit if: M15 trades picks during the draft, M14's AI brain replaces the need-and-value model, or M12's rookie negotiations sign picks after the draft.

## D-49: The UDFA scramble
- When: 2026-09-26, M11
- Decision: From the draft's last pick through the undrafted free agents step, teams offer the rookies nobody drafted the undrafted deal, three years at the minimum, with a signing bonus from $0 to $100,000 in steps of $5,000. Each team's bonuses come out of a $200,000 pool (the rule set's udfaBonusPool, which grows with the cap), and an offer can be changed or taken back until the step ends; while it's open, those rookies can't be signed any other way. As the undrafted free agents step opens, each AI team (and the user's, with roster management on auto) offers to as many of the rookies worth most to it as its roster has room for, up to 12: his draft value plus 4 points times its need at his position (D-45), with a little noise. The first gets a quarter of its pool and each next one 80% of the one before. As the step ends the rookies choose, the most valuable first. Each takes the offer that scores best to him: the bonus against the $100,000 most, weighed from 0.2 to 0.6 by his greed, plus his chance to make the roster, weighed 1. That chance is the spots a standard roster has at his position against the players the team has there who are as good as he is. A team at its roster limit, or without the cap room for the deal, signs nobody, and the rookie takes his next offer. A rookie with no deal stays a free agent anyone can sign, until D-27's removal at the end of Super Bowl week. This replaces D-27's stand-in, where each AI team signed its eight best undrafted rookies.
- Why: Spec 10.4 has undrafted players get offers after the draft and choose by the free agent decision model (spec 11.7), weighting roster opportunity heavily.
- Revisit if: M12's decision model and negotiations replace this scoring, or M14's AI plans its offers by scheme.

## D-50: Draft hit rates as multi-year starters, over 20-season chains
- When: 2026-09-26, M11
- Decision: Calibration judges each round's picks by the share who become multi-year starters: a base starter (the 22 base-lineup slots, specialists apart) on his team's week 1 depth chart among its active roster in 4 or more of his first 8 seasons. Only the chained leagues' own drafts with 8 seasons left to follow count, so full runs chain 3 leagues through 20 seasons, which follow 12 drafts each. A first-round bust is a first-rounder who never becomes a multi-year starter and a day-3 gem is a pick from rounds 4 to 7 who does, so the round rates carry both. The chains also count the quarterbacks each first round takes.
- Why: Spec 23.3 asks for hit rates by round against published draft studies, and M11's done-when asks for them over a 20-season run; The Hog Sty's study of the 2000 to 2019 drafts counts full-time starters for 4 or more seasons, and the week 1 depth chart is the league's record of who starts until games started are kept by player.
- Revisit if: M17's honors add Pro Bowls for the Pro Bowl rate, M15's trades add quarterback trade-ups, or M14's AI brain gives reaches a meaning to measure.

## D-51: Morale, the locker room, mentors, and chemistry
- When: 2026-09-26, M12
- Decision: Morale runs 0 to 100. Each game week it moves 10% of the way to a baseline of 70, then 1.5 points up for a win or down for a loss, weighted 0.5 to 1.5 by competitiveness; 0.3 up for a starter, or 2 down, weighted by ego, for a healthy player whose rating is 3 or more over his group's weakest starter and who doesn't start; and up to 1 down, weighted by greed, for a player past his rookie deal paid under 75% of his market value. The three loudest leaders (leadership 75 or more with 4 credited seasons) lift each teammate 0.3, and the three loudest disruptive players (morale under 40, ego and volatility averaging 65 or more) cost each 0.4. Releasing a leader with 3 league years on the team costs his teammates 3 at once, and the release preview warns first. Each new league year moves morale halfway back to 70. A player with 2 credited seasons or fewer grows up to 15% faster under his team's best mentor at his position group, a veteran of 6 seasons with leadership over 50. In games, a roster averaging 15 points of morale over or under 70 is worth 1.2 points of cohesion on both sides of the ball, and a unit's chemistry, its starters' average league years with the team against a typical 2.5, up to 0.8 more: the offensive line's on offense and the secondary's on defense. The best locker room is worth about 2 points a game over the worst. Players record the league year they joined their team. The user learns a player's character from a top-30 visit, or from 9 game weeks on the user's team, and keeps it.
- Why: Spec 10.9 names what moves morale, the leaders, mentors, disruptive players, and the chemistry of the line and the secondary without amounts, and spec 23.3 asks for the locker room's effect size, which no public study gives, so it stays near the size of home field.
- Revisit if: M12's negotiations add lowball offers and holdouts, M13's coaches bring conflicts, or M15's trades move popular players.

## D-52: The player decision model
- When: 2026-09-26, M12
- Decision: A player counts an offer's worth in his market value. Its money is the yearly value (salary plus the signing bonus spread over the years) over his market value, plus 0.03 for each year past the first, weighted by his need for security (none at 26, all by 32), plus 0.1 times the share of the deal paid as a signing bonus. On top: up to 0.12 for the strongest contender and as much off for the weakest (a team's last record and its best 22 players' average overall, each ranked across the league, weighted 0.5 to 1.5 by competitiveness and more past 28); 0.1 for a starting job and as much off for a backup's, weighted by ego (his rank among the team's active players at his position group against its starters; specialists by position); 0.05 for a team in his home state; 0.1 times loyalty for his own team, or the team he last played for; and up to 0.05 for his best role's scheme fit. His demand runs from 0.9 of his market value at greed 0 to 1.1 at greed 100, falls 5% each week of free agency, and follows the season's share after it. He takes the offer worth most once one is worth his demand and waits otherwise. A team's asking price is the salary that makes its offer worth his demand, so contenders where he'd start pay less. Relationships with coaches and climate preferences wait for M13's staff.
- Why: Spec 11.7 lists money, contention, role, location, loyalty, coaches, and fit, weighted by personality, with waiting and discounts to stay home or chase a ring, without amounts.
- Revisit if: M12's free agency weeks show top players waiting too long or signing too cheaply, M13 adds coach relationships, or M14's AI brain values players differently.

## D-53: Free agency weeks and bidding
- When: 2026-09-26, M12
- Decision: Through free agency's four weeks, a team's offer to a free agent stands until he answers or the team takes it back; a team's standing offers must fit, all together, under its cap and its offseason roster limit. As each week opens, every AI team offers up to 12 free agents who'd fill an open spot of the standard roster at their group (6 points of want a spot) or play over its weakest player there by more than 2 points, most wanted first, each at what he asks of that team plus up to 10% for the ones it wants most (in full at 12 points of want), for 3 years through age 26, 2 through 29, and 1 after, while its offers fit its cap room less its draft class's reserve and 2% of the cap. As each week ends the players with offers decide, the most valuable first: each takes the offer worth most to him once one is worth his demand (D-52), if the team can still sign him, or waits a week, when his demand has softened. After the fourth week the offers left lapse, and a free agent signs at once when an offer is good enough. The UDFA scramble scores its offers by the same model, with the chance to make the roster in place of the starting role (D-49). The inbox tells the user who signed, who chose other teams, and who is still weighing; the news covers signings of players rated 78 or more. D-27's stand-in goes.
- Why: Spec 11.8 has teams submit offers during each week and players choose among them at its end or wait, top players signing early and the market softening for those who wait, then open signing through the season.
- Revisit if: M12's close finds spending short of the salary floor or the economy's targets, M14's AI brain plans cap space and targets, or M15's trades change how teams fill holes.

## D-54: Negotiation, and every term of an offer
- When: 2026-09-26, M12
- Decision: An offer has a length (1 to 5 years), a salary each year, a signing bonus, years of fully guaranteed salary from the first, a per-game roster bonus each season (a player counts on 80% of it), void years that spread the bonus up to 5 years, and a take-it-or-leave-it mark. Outside free agency's bidding weeks the user negotiates in talks: the preview shows only the cap and roster effect, and the player answers when the offer is sent. His agent opens 8% above his demand (D-52) and comes down evenly with each offer he turns down; after 2 to 5 of them in a calendar step (fewer for the volatile) he breaks off talks until the calendar advances. A turned-down offer gets a counter: the salary he'd sign for on the rest of the offer's terms, which he takes if offered, and what matters most to him (guaranteed money or a longer deal when more of it could add 2% of his market value to the offer's worth, older players valuing years, else money each year). An offer worth less than 85% of his demand is a lowball: it lowers his interest in the team by 3% of his market value for the league year and his morale by 5, in talks or as a standing bid at a week's end. A take-it-or-leave-it offer gets a yes or a no: he takes it at his demand plus his greed's share of the rest of his ask, and a no ends the talks until the calendar advances; a standing bid so marked falls away if he waits. Auto negotiation is the dialog's "Have your GM negotiate" choice: the GM settles at once, as far under the agent's opening as his negotiation rating reaches, with the AI's contract length by age and no bonus; the AI's extensions and in-season signings use the same price, and its bids stay at his demand plus its premium (D-53). An offer at his position's market ceiling always meets his demand. Extensions are judged by the same model from his own team, at the offseason's demand whenever they're offered, and the user's cap strategy settings wait for M14's team modes.
- Why: Spec 11.6 has the user offer every term, the agent answer with accept, reject, or a counter that names what matters most, limited patience with lowballs costing interest and morale, take it or leave it with no counter, and auto negotiation through the AI's contract logic.
- Revisit if: M14 adds cap strategy settings and team modes, M15's trades need negotiated terms, or playtesting finds the opening margin or patience too generous or too harsh.

## D-55: The value-based re-sign choice as built
- When: 2026-09-26, M12
- Decision: D-38's valuation projects a player's overall a season at a time: each rating his overall weighs follows its class's age curve from his group's peak age, growth scaled by his room to potential, his development trait, and his work ethic, decline by his trait and work ethic, both by the development settings; playing time, coaching, and chance are left out. Each projected season is priced by the market at that overall at his position's prime age, since the projection carries the decline the market's age discount stands for. An AI team re-signs a player it would miss (he'd rank within the standard count at his group, with no age cutoff) when that value over the new deal covers its cost (salary and per-game bonuses each year, and the signing bonus) at its GM's settled price (D-54); it tags him when he asks more than the tag and a year of him is worth the tag. Its free agency bids pay at most his value a year over the deal, and it passes on a free agent who asks more.
- Why: D-38 asks for one valuation shared by re-signing and free agency bids, with age working through the projected decline rather than a cutoff.
- Revisit if: M14's team modes weigh the present against the future, or the aging calibration finds careers too short or too long.

## D-56: Tag prices use next league year's cap as expected
- When: 2026-09-26, M12
- Decision: D-39's five-year tag price multiplies the average share by next league year's cap as expected when the tag is priced: this year's cap grown by the cap formula at league revenue's mean growth (7% by default), since the league draws next year's cap only when the new league year opens. Each league year's shares are kept, rounded to six decimals, as it closes.
- Why: The CBA prices tags against the new league year's cap, which NFL teams know in advance; the league doesn't know it until the league year opens.
- Revisit if: the cap for the next league year is drawn earlier, as with M16's revenue.

## D-57: Holdouts and trade requests
- When: 2026-09-26, M12
- Decision: As training camp opens, a player in the last year of his deal, rated 78 or more with 3 credited seasons and paid under 70% of his market value, holds out when a draw falls under 0.35 x the frequency setting x his greed weight x (1 - 0.6 x loyalty / 100) x how far under that line he's paid. A holdout goes on the list for players who didn't report (the CBA's Reserve/Did Not Report: off the active roster, still on the cap), fined $50,000 a day of camp ($40,000 on a rookie deal) and a week's pay for each preseason game while the fines setting is on, and losing each game's pay after that; what he loses is kept on his record, not taken off the cap or counted as team cash until M16's finances. At each later step he reports with chance 0.3 x (1.5 - greed / 100), plus 0.1 with fines on, and loses 8 morale; a leader's holdout costs his teammates 2. A player whose morale is 60 or less (the bottom 1% to 2% of starters, since morale runs 54 to 94 among them), rated 70 or more with 2 credited seasons, asks for a trade at camp with chance 0.15 x the frequency x his ego weight, and in a game week at a tenth of that; the request lapses once his morale is back to 70. An extension ends either demand, with 10 more morale. AI teams, and the user's staff with contracts on auto, extend a player making a demand when he's worth it at the GM's price (D-55) and next year's cap has room, and otherwise wait. Demands end with the league year. Settings sets the frequency (never, rarely, normal, often, or very often: 0 to 2) and the fines. The user hears of his players' demands in the inbox (the contract demands pause event); the news covers players rated 78 or more; the Contracts screen, the roster, and the player page show them. Probes of chained seasons found 4 to 10 holdouts a camp at a rate of 0.5, most ended by extensions at once, so the rate is 0.35; trade requests run 1 or 2 a season.
- Why: Spec 11.9 has unhappy players hold out (fined per the CBA, as a setting), ask for trades, or demand new deals, resolved by an extension, a trade, or waiting it out, at a frequency the settings set; the CBA's Article 42 sets the fines.
- Revisit if: M15's trades open (a request lowers his trade value, and a trade resolves it), M16's finances count fines as cash, or M18's media adds public complaints.

## D-58: Compensatory picks
- When: 2026-09-26, M12
- Decision: As a league year opens, the league keeps the unrestricted free agents whose deals ran out and the teams they left. At the annual meeting a year later, each who signed with another team from free agency's first week through the draft, is still on that team, and whose new deal's yearly value ranks in the top 35% of the league's deals (practice squad deals left out) qualifies, worth round 3 in the top 5%, 4 in the top 10%, 5 in the top 15%, 6 in the top 25%, and 7 in the top 35%, a round better with 75% of his new team's snaps last season (to round 3 at best) and a round worse under 25% (out past round 7). A team's qualifying signings cancel its losses, each the best loss of the same round, else the best loss of a later round, else the worst loss left; a team that lost more than it signed gets a pick for each loss left, its best 4, and the league awards its best 32. A team that lost as many as it signed gets a seventh-round net value pick when its losses are worth 2 or more rounds more (a third-round loss is worth 5, a seventh-round one 1), the largest margins first, and supplemental seventh-round picks go to teams in draft order, one each, until the league has awarded exactly 32. Each is numbered after its round's regular picks: net loss picks best first, then net value picks, then supplemental ones. The limits (32 a draft, rounds 3 to 7, 4 a team) are rule set values. Postseason honors join the value with M17's awards. The user hears of his picks in the inbox, and the news covers the award and any round 3 pick.
- Why: Spec 11.8 awards up to 32 picks in rounds 3 to 7, at most 4 a team, to teams that lost more (or better) qualifying unrestricted free agents than they signed, valued by contract, playing time, and honors, announced at the annual meeting; Over the Cap's account of the formula gives the top 35% and the round tiers, the cancellation order, and the net value and supplemental picks that make the NFL's total exactly 32.
- Revisit if: M15's trades let compensatory picks move, or M17's honors add to a free agent's value.

## D-59: Off-field events and suspensions
- When: 2026-09-26, M12
- Decision: While the setting is on (Settings > Player drama), each regular-season week every player on an active roster draws a suspension under the drug policy (0.025% a week, the rule set's 6 games for a first violation) and under the conduct policy (0.013% a week times his volatility weight, 2 to 6 games), and every player on a roster or practice squad a legal matter in the news (0.02% a week times his volatility weight, flavor with no discipline) and charity work (0.1% a week times his leadership and social activity weights), counted on his record for M17's Man of the Year. A suspended player goes on the suspended list, off the active roster; each game his team plays counts down his suspension, and he returns to the active roster when it's served, or serves it with a new team if he moves. The pay he loses isn't taken off the cap. Teams run by the AI, and the user's with roster moves on auto, sign or cut at once to stay at 53; the user's own roster waits for the stop before the next advance (D-46). The user hears of his players' suspensions and legal matters in the inbox, and the news covers players rated 75 or more. A probe season had 10 suspensions (8 under the drug policy) and 27 charity events. The AI's depth charts now fill a slot their choices left empty by moving a starter over, as when a questionable center rested and a line was left without a right tackle.
- Why: Spec 10.9 asks for conduct and PED suspensions, legal issues as flavor, and positive events that feed the Man of the Year, with a setting to turn them off (spec 22.6); the 2020 CBA's drug policy suspends a first violation 6 games.
- Revisit if: M16's finances count lost pay and cap credits, M17's awards pick a Man of the Year, or offseason suspensions (served from week 1) are needed.

<!-- catalog:start (generated by tools/catalog-doc.ts; do not edit by hand) -->

### Scheme definitions (D-5)

#### Offensive tendencies

| Slider | West Coast | Shanahan outside zone | Air Raid | Power run |
| --- | --- | --- | --- | --- |
| Pass rate, 1st down | 55% | 45% | 62% | 40% |
| Pass rate, 2nd and short | 48% | 35% | 56% | 30% |
| Pass rate, 2nd and long | 66% | 58% | 73% | 55% |
| Pass rate, 3rd and short | 60% | 50% | 68% | 40% |
| Pass rate, 3rd and long | 92% | 88% | 94% | 86% |
| Average depth of target (yards) | 6.8 | 7.8 | 8.4 | 8.6 |
| Play action (of dropbacks) | 20% | 32% | 10% | 28% |
| RPO (of plays) | 6% | 2% | 12% | 4% |
| Screens (of passes) | 12% | 8% | 10% | 6% |
| Designed QB runs (of runs) | 5% | 3% | 6% | 6% |
| Scramble tolerance | 0.4 | 0.3 | 0.5 | 0.35 |
| Tempo | 0.5 | 0.35 | 0.8 | 0.25 |
| Personnel 10 | 3% | 1% | 30% | 2% |
| Personnel 11 | 62% | 50% | 62% | 40% |
| Personnel 12 | 20% | 18% | 8% | 25% |
| Personnel 13 | 3% | 2% | 0% | 8% |
| Personnel 21 | 10% | 25% | 0% | 15% |
| Personnel 22 | 2% | 4% | 0% | 10% |
| Run concept: insideZone | 35% | 25% | 45% | 20% |
| Run concept: outsideZone | 20% | 50% | 10% | 5% |
| Run concept: power | 15% | 5% | 10% | 40% |
| Run concept: counter | 10% | 8% | 10% | 20% |
| Run concept: draw | 20% | 12% | 25% | 15% |
| Target share: X | 20% | 22% | 25% | 24% |
| Target share: Z | 17% | 20% | 23% | 20% |
| Target share: SLOT | 18% | 14% | 27% | 12% |
| Target share: TE1 | 20% | 18% | 10% | 20% |
| Target share: TE2 | 3% | 3% | 1% | 6% |
| Target share: RB1 | 14% | 12% | 10% | 8% |
| Target share: RB2 | 4% | 4% | 4% | 3% |
| Target share: FB | 4% | 7% | 0% | 7% |
| Deep shots (of passes) | 8% | 11% | 15% | 14% |
| Fourth-down aggressiveness | 0.5 | 0.45 | 0.7 | 0.55 |

#### Offensive roles by slot

| Slot | West Coast | Shanahan outside zone | Air Raid | Power run |
| --- | --- | --- | --- | --- |
| QB | Timing passer | Play-action passer | Spread passer | Play-action deep passer |
| RB1 | Receiving back | Zone runner | Spread back | Power runner |
| RB2 | Change-of-pace back | Change-of-pace back | Change-of-pace back | Change-of-pace back |
| FB | H-back | Lead blocker | H-back | Lead blocker |
| X | Possession receiver | Yards-after-catch receiver | Vertical receiver | Vertical receiver |
| Z | Timing receiver | Play-action deep threat | Route runner | Play-action deep threat |
| SLOT | Slot receiver | Slot receiver | Quick slot | Slot receiver |
| TE1 | Move tight end | Y tight end | Move tight end | In-line tight end |
| TE2 | In-line tight end | In-line tight end | In-line tight end | In-line tight end |
| LT | Balanced tackle | Zone tackle | Pass-protecting tackle | Gap tackle |
| LG | Balanced guard | Zone guard | Pass-protecting guard | Gap guard |
| C | Balanced center | Zone center | Pass-protecting center | Gap center |
| RG | Balanced guard | Zone guard | Pass-protecting guard | Gap guard |
| RT | Balanced tackle | Zone tackle | Pass-protecting tackle | Gap tackle |

#### Defensive tendencies

| Slider | 4-3 over | 3-4 one-gap | Cover 3 single-high | Man blitz |
| --- | --- | --- | --- | --- |
| Front | 4-man | 3-man | 4-man | 3-man |
| Base package | 35% | 30% | 40% | 25% |
| Nickel | 55% | 60% | 52% | 55% |
| Dime | 10% | 10% | 8% | 20% |
| Blitz (of passes) | 25% | 32% | 20% | 42% |
| Simulated pressure | 8% | 12% | 6% | 15% |
| Man coverage | 35% | 40% | 25% | 72% |
| Shell: cover1 | 25% | 30% | 25% | 60% |
| Shell: cover2 | 20% | 15% | 5% | 10% |
| Shell: cover3 | 35% | 30% | 60% | 15% |
| Shell: cover4 | 15% | 20% | 7% | 10% |
| Shell: cover6 | 5% | 5% | 3% | 5% |
| Press rate | 35% | 40% | 30% | 65% |
| Run fits (0 gap control, 1 penetration) | 0.4 | 0.65 | 0.45 | 0.6 |
| Stunts and twists | 18% | 20% | 15% | 25% |

#### Defensive roles by slot

| Slot | 4-3 over | 3-4 one-gap | Cover 3 single-high | Man blitz |
| --- | --- | --- | --- | --- |
| LEDGE | 4-3 end | 3-4 outside linebacker | Leo end | 3-4 outside linebacker |
| REDGE | 4-3 end | 3-4 outside linebacker | 4-3 end | 3-4 outside linebacker |
| DT1 | 3-technique tackle | 5-technique end | 3-technique tackle | 5-technique end |
| DT2 | 1-technique nose | One-gap nose | 1-technique nose | One-gap nose |
| FLEX | Sam linebacker | 5-technique end | Sam linebacker | 5-technique end |
| MIKE | 4-3 Mike | 3-4 Mike | 4-3 Mike | Blitzing linebacker |
| WILL | Will linebacker | 3-4 Will | Will linebacker | Cover linebacker |
| CB1 | Balanced corner | Balanced corner | Zone corner | Press corner |
| CB2 | Balanced corner | Balanced corner | Zone corner | Press corner |
| NCB | Slot corner | Slot corner | Slot corner | Man slot corner |
| DIME | Dime back | Dime back | Dime back | Dime back |
| FS | Two-high free safety | Two-high free safety | Center fielder | Center fielder |
| SS | Box safety | Hybrid safety | Box safety | Man safety |

#### Role recipes

Weights are percentages of the role's weighted average; trait points add to the role rating. Special teams roles are the same in every scheme: K kicker, P punter, LS long snapper, KR kick returner, PR punt returner, GUNNER gunner.

| Role | Primary | Rating weights | Trait adjustments |
| --- | --- | --- | --- |
| Timing passer | QB | short accuracy 22, awareness 22, medium accuracy 14., throw under pressure 10, throw on the run 8, throw power 8, play action 6, deep accuracy 4, break sack 3, speed 3 | forces passes -2, protects the ball +1, pocket passer +1, senses pressure +1, throws it away +1 |
| Play-action passer | QB | play action 16, medium accuracy 16, awareness 16, short accuracy 14., throw on the run 12, throw power 8, deep accuracy 8, throw under pressure 6, speed 4 | throws on the move +1, statue in the pocket -1, forces passes -1, throws it away +1 |
| Spread passer | QB | awareness 20, short accuracy 18, medium accuracy 18, deep accuracy 12, throw power 10, throw under pressure 10, throw on the run 5, break sack 4, play action 3 | pocket passer +1, senses pressure +1, bails early -1, tight spiral +1, checks down too often -1 |
| Play-action deep passer | QB | awareness 18, throw power 16, deep accuracy 14., play action 14., medium accuracy 12, short accuracy 10, throw under pressure 8, break sack 5, speed 3 | tight spiral +1, takes shots +1, checks down too often -1 |
| Receiving back | HB | catching 18, ball carrier vision 15, short route running 12, agility 10, acceleration 10, speed 10, carrying 10, pass block 10, juke move 5 | YAC catch +1, possession catch +1, drops open passes -2, fumble prone -1 |
| Zone runner | HB | ball carrier vision 25, acceleration 15, agility 10, change of direction 10, speed 10, carrying 10, juke move 7.5, spin move 7.5, trucking 2.5, break tackle 2.5 | YAC catch +1, fumble prone -1 |
| Spread back | HB | pass block 15, catching 15, ball carrier vision 15, short route running 10, acceleration 10, agility 10, speed 10, carrying 10, juke move 5 | YAC catch +1, drops open passes -2, fumble prone -1 |
| Power runner | HB | trucking 17.5, break tackle 17.5, carrying 15, strength 10, stiff arm 10, ball carrier vision 10, acceleration 10, agility 5, speed 5 | fights for yards +1, fumble prone -2, secures the ball +1 |
| Change-of-pace back | HB | speed 20, acceleration 15, agility 15, change of direction 10, juke move 10, catching 10, ball carrier vision 10, carrying 10 | YAC catch +1, fumble prone -1 |
| Lead blocker | FB | lead block 30, impact blocking 15, run block 15, strength 15, awareness 10, trucking 5, carrying 5, catching 5 | fights for yards +1, undisciplined -1 |
| H-back | FB | lead block 20, catching 20, run block 10, short route running 10, awareness 10, strength 10, impact blocking 10, carrying 10 | possession catch +1, drops open passes -1 |
| Possession receiver | WR | catching 18, short route running 16, medium route running 14., catch in traffic 14., release 10, awareness 10, speed 8, strength 5, deep route running 5 | possession catch +2, feet in bounds +1, aggressive catch +1, drops open passes -2 |
| Timing receiver | WR | short route running 16, medium route running 16, catching 16, speed 12, acceleration 10, agility 8, deep route running 8, awareness 8, catch in traffic 6 | feet in bounds +1, possession catch +1, drops open passes -2 |
| Slot receiver | WR | short route running 20, catching 16, agility 12, change of direction 12, acceleration 10, catch in traffic 10, medium route running 10, speed 5, awareness 5 | YAC catch +1, possession catch +1, drops open passes -2 |
| Yards-after-catch receiver | WR | catching 14., medium route running 14., speed 12, short route running 10, run block 10, acceleration 8, break tackle 8, catch in traffic 8, ball carrier vision 6, strength 5, deep route running 5 | YAC catch +2, fights for yards +1, drops open passes -2 |
| Play-action deep threat | WR | deep route running 20, speed 20, medium route running 14., catching 12, release 10, spectacular catch 8, acceleration 8, awareness 4, jumping 4 | aggressive catch +1, drops open passes -2 |
| Vertical receiver | WR | speed 22, deep route running 20, release 14., catching 12, spectacular catch 10, jumping 8, acceleration 8, medium route running 6 | aggressive catch +2, drops open passes -2 |
| Route runner | WR | medium route running 18, short route running 16, deep route running 14., catching 14., speed 12, acceleration 8, release 8, change of direction 6, awareness 4 | feet in bounds +1, possession catch +1, drops open passes -2 |
| Quick slot | WR | short route running 20, agility 15, change of direction 15, catching 14., acceleration 12, speed 10, medium route running 8, ball carrier vision 6 | YAC catch +2, drops open passes -2 |
| Move tight end | TE | catching 18, short route running 14., medium route running 14., speed 12, catch in traffic 12, release 8, run block 8, awareness 8, acceleration 6 | YAC catch +1, possession catch +1, drops open passes -2 |
| Y tight end | TE | run block 20, catching 14., medium route running 12, catch in traffic 10, strength 10, run block finesse 8, short route running 8, awareness 8, speed 6, pass block 4 | possession catch +1, drops open passes -1, undisciplined -1 |
| In-line tight end | TE | run block 24, strength 14., pass block 12, run block power 10, catching 10, awareness 10, catch in traffic 8, impact blocking 6, run block finesse 6 | undisciplined -1, drops open passes -1 |
| Zone tackle | LT | run block finesse 16, pass block 16, run block 14., pass block finesse 10, agility 10, awareness 10, pass block power 8, acceleration 8, strength 8 | undisciplined -2, disciplined +1, high motor +1 |
| Gap tackle | LT | run block power 16, run block 16, pass block 16, strength 14., pass block power 10, awareness 10, impact blocking 6, pass block finesse 6, acceleration 6 | undisciplined -2, disciplined +1 |
| Pass-protecting tackle | LT | pass block 24, pass block finesse 16, pass block power 16, strength 10, awareness 10, run block 8, acceleration 8, agility 8 | undisciplined -2, disciplined +1 |
| Balanced tackle | LT | pass block 20, run block 14., pass block finesse 12, pass block power 12, strength 10, awareness 10, run block finesse 8, run block power 6, acceleration 4, agility 4 | undisciplined -2, disciplined +1 |
| Zone guard | LG | run block finesse 16, run block 16, pass block 14., strength 10, awareness 10, agility 8, acceleration 8, pass block power 8, pass block finesse 6, impact blocking 4 | undisciplined -2, disciplined +1, high motor +1 |
| Gap guard | LG | run block power 18, run block 16, strength 16, pass block 12, pass block power 10, awareness 10, impact blocking 8, acceleration 6, pass block finesse 4 | undisciplined -2, disciplined +1 |
| Pass-protecting guard | LG | pass block 22, pass block power 16, pass block finesse 12, strength 12, awareness 12, run block 10, acceleration 8, run block power 8 | undisciplined -2, disciplined +1 |
| Balanced guard | LG | run block 16, pass block 16, strength 12, awareness 12, run block power 10, pass block power 10, run block finesse 8, pass block finesse 8, acceleration 4, impact blocking 4 | undisciplined -2, disciplined +1 |
| Zone center | C | run block 16, awareness 16, run block finesse 14., pass block 14., strength 12, pass block power 8, agility 8, pass block finesse 6, acceleration 6 | undisciplined -2, disciplined +1, high motor +1 |
| Gap center | C | run block power 16, run block 16, strength 16, awareness 14., pass block 12, pass block power 10, impact blocking 6, acceleration 6, pass block finesse 4 | undisciplined -2, disciplined +1 |
| Pass-protecting center | C | pass block 20, awareness 18, pass block power 14., pass block finesse 12, strength 12, run block 12, acceleration 6, agility 6 | undisciplined -2, disciplined +1 |
| Balanced center | C | run block 16, pass block 16, awareness 16, strength 12, run block power 10, pass block power 10, run block finesse 8, pass block finesse 8, acceleration 4 | undisciplined -2, disciplined +1 |
| 4-3 end | LE | finesse moves 16, power moves 16, block shedding 14., acceleration 10, strength 10, speed 8, pursuit 8, tackle 8, play recognition 6, awareness 4 | high motor +1, bull rush +1, swim move +1, undisciplined -1 |
| Leo end | LE | finesse moves 22, speed 14., acceleration 14., power moves 10, block shedding 10, pursuit 10, tackle 8, agility 6, play recognition 6 | swim move +1, spin move +1, high motor +1 |
| 3-technique tackle | DT | power moves 16, block shedding 16, finesse moves 14., acceleration 14., strength 14., tackle 10, pursuit 6, play recognition 6, awareness 4 | swim move +1, spin move +1, high motor +1 |
| 1-technique nose | DT | strength 24, block shedding 22, tackle 14., power moves 10, play recognition 10, awareness 8, acceleration 8, pursuit 4 | bull rush +1, high motor +1 |
| One-gap nose | DT | strength 20, block shedding 18, acceleration 12, power moves 12, tackle 12, play recognition 10, finesse moves 6, awareness 6, pursuit 4 | bull rush +1, swim move +1 |
| 5-technique end | LE | strength 18, block shedding 18, power moves 16, tackle 12, play recognition 10, pursuit 8, finesse moves 6, awareness 6, acceleration 6 | bull rush +1, high motor +1 |
| 3-4 outside linebacker | LOLB | finesse moves 16, power moves 12, speed 12, acceleration 12, block shedding 10, pursuit 10, tackle 8, play recognition 8, zone coverage 6, awareness 6 | pass rusher +2, coverage linebacker -1, swim move +1, spin move +1, high motor +1 |
| Sam linebacker | LOLB | tackle 16, block shedding 14., pursuit 12, play recognition 12, strength 10, awareness 10, zone coverage 10, man coverage 6, speed 6, hit power 4 | balanced linebacker +1, big hitter +1 |
| 4-3 Mike | MLB | tackle 18, play recognition 16, awareness 16, pursuit 12, block shedding 12, zone coverage 10, speed 6, hit power 6, strength 4 | balanced linebacker +1, big hitter +1 |
| Will linebacker | LOLB | pursuit 16, speed 14., tackle 14., zone coverage 14., play recognition 12, awareness 10, man coverage 8, acceleration 8, agility 4 | coverage linebacker +1, pass-rush linebacker -1 |
| 3-4 Mike | MLB | tackle 18, block shedding 16, play recognition 14., awareness 14., hit power 10, pursuit 10, strength 8, zone coverage 6, speed 4 | big hitter +1, balanced linebacker +1 |
| 3-4 Will | MLB | zone coverage 16, pursuit 14., tackle 14., speed 12, play recognition 12, awareness 12, man coverage 8, acceleration 8, agility 4 | coverage linebacker +2, pass-rush linebacker -1 |
| Blitzing linebacker | MLB | pursuit 14., tackle 14., speed 12, acceleration 12, finesse moves 10, play recognition 10, power moves 8, awareness 8, man coverage 6, block shedding 6 | pass rusher +2, coverage linebacker -1, high motor +1 |
| Cover linebacker | MLB | man coverage 16, speed 14., pursuit 12, tackle 12, play recognition 10, awareness 10, acceleration 10, zone coverage 8, agility 8 | coverage linebacker +2 |
| Press corner | CB | man coverage 24, press 18, speed 16, acceleration 10, agility 8, change of direction 8, play recognition 6, jumping 6, awareness 4 | plays the ball +1, plays the man -1, undisciplined -2, disciplined +1 |
| Zone corner | CB | zone coverage 24, speed 16, play recognition 14., awareness 10, jumping 8, catching 8, acceleration 8, press 6, tackle 6 | plays the ball +2, plays the man -1, undisciplined -1 |
| Balanced corner | CB | man coverage 18, zone coverage 18, speed 16, press 10, acceleration 8, play recognition 8, agility 6, change of direction 6, awareness 6, jumping 4 | plays the ball +1, undisciplined -1 |
| Slot corner | CB | zone coverage 14., man coverage 14., agility 14., change of direction 12, acceleration 12, play recognition 10, tackle 10, speed 8, awareness 6 | undisciplined -1, big hitter +1 |
| Man slot corner | CB | man coverage 22, agility 14., change of direction 14., acceleration 12, speed 10, press 8, play recognition 8, tackle 6, awareness 6 | undisciplined -2, plays the ball +1 |
| Dime back | SS | zone coverage 16, man coverage 14., speed 14., play recognition 12, awareness 10, tackle 10, acceleration 8, agility 8, pursuit 8 | plays the ball +1 |
| Two-high free safety | FS | zone coverage 22, speed 14., play recognition 14., awareness 12, man coverage 8, acceleration 8, tackle 8, pursuit 6, catching 4, jumping 4 | plays the ball +1, plays the man -1 |
| Center fielder | FS | speed 20, zone coverage 20, play recognition 14., acceleration 10, awareness 10, pursuit 8, catching 6, jumping 6, tackle 6 | plays the ball +2, plays the man -1 |
| Box safety | SS | tackle 18, play recognition 14., pursuit 12, zone coverage 12, hit power 10, speed 10, awareness 10, block shedding 8, strength 6 | big hitter +1, strips the ball +1 |
| Hybrid safety | SS | zone coverage 18, tackle 14., play recognition 14., speed 12, awareness 12, pursuit 10, man coverage 10, hit power 6, acceleration 4 | plays the ball +1 |
| Man safety | SS | man coverage 20, tackle 14., speed 14., pursuit 10, play recognition 10, awareness 10, zone coverage 8, acceleration 8, strength 6 | undisciplined -1 |
| Kicker | K | kick power 45, kick accuracy 45, awareness 10 | clutch +1 |
| Punter | P | kick power 45, kick accuracy 45, awareness 10 | none |
| Long snapper | LS | long snap 70, awareness 15, strength 5, run block 5, pass block 5 | none |
| Kick returner | HB | kick return 30, speed 20, acceleration 14., ball carrier vision 12, agility 8, break tackle 8, carrying 8 | fumble prone -2, fights for yards +1 |
| Punt returner | WR | kick return 30, agility 14., change of direction 12, catching 12, ball carrier vision 12, acceleration 10, speed 10 | fumble prone -2 |
| Gunner | CB | speed 26, acceleration 16, tackle 16, pursuit 16, release 10, strength 8, awareness 8 | high motor +1 |

### Ability catalog (D-6)

| Ability | Positions | Tier | Triggers | Effect | Generated players need |
| --- | --- | --- | --- | --- | --- |
| Poised Pocket | QB | 2 | against the blitz | throw under pressure +10, awareness +4 | throw under pressure 80, awareness 80 |
| Deep Ball Artist | QB | 2 | deep passes | deep accuracy +8, throw power +3 | deep accuracy 82, throw power 85 |
| Off-Script | QB | 2 | outside the pocket | throw on the run +10, break sack +5 | throw on the run 80, speed 72 |
| Red Zone Surgeon | QB | 1 | dropbacks, in the red zone | short accuracy +6, medium accuracy +6 | short accuracy 82, awareness 78 |
| Two-Minute Maestro | QB | 3 | dropbacks, in the two-minute drill or late in close games | awareness +8, short accuracy +5, medium accuracy +5, deep accuracy +5 | awareness 88, medium accuracy 84 |
| Slippery | HB, WR | 2 | in the open field | juke move +10, spin move +10, agility +4 | agility 85, juke move 78 |
| Battering Ram | HB, FB | 2 | contact at the line | trucking +10, break tackle +8 | trucking 82, strength 70 |
| Chain Mover | HB, TE, WR | 1 | carries or targets, on third down | break tackle +6, catch in traffic +6 | awareness 75, catching 70 |
| Route Technician | WR, TE | 2 | man coverage | short route running +8, medium route running +8, deep route running +8, release +6 | medium route running 84, short route running 80 |
| Zone Finder | WR, TE, HB | 1 | zone coverage | awareness +8, short route running +4 | awareness 80, short route running 78 |
| High Point | WR, TE | 2 | contested catches or deep passes | spectacular catch +10, catch in traffic +8 | spectacular catch 82, jumping 80 |
| Afterburner | WR, HB, TE | 2 | short passes | ball carrier vision +8, acceleration +5, break tackle +5 | acceleration 88, ball carrier vision 75 |
| Anchor | LT, LG, C, RG, RT | 2 | pass rush snaps | pass block power +10, pass block +6 | pass block 84, strength 85 |
| Road Grader | LT, LG, C, RG, RT, TE, FB | 2 | inside runs | run block power +10, impact blocking +8 | run block power 84, strength 85 |
| Reach Master | LT, LG, C, RG, RT | 1 | outside runs | run block finesse +10, agility +4 | run block finesse 82, agility 65 |
| Edge Burst | LE, RE, LOLB, ROLB | 2 | pass rush snaps | finesse moves +10, acceleration +4 | finesse moves 84, acceleration 80 |
| Gap Wrecker | DT, LE, RE | 2 | contact at the line | block shedding +10, power moves +6 | block shedding 84, strength 85 |
| Closer | LE, RE, LOLB, ROLB, DT | 1 | pass rush snaps, on third down or late in close games | power moves +8, finesse moves +8 | power moves 78, finesse moves 78 |
| Sideline to Sideline | LOLB, MLB, ROLB, FS, SS | 1 | outside runs or in the open field | pursuit +10, tackle +4 | pursuit 85, speed 80 |
| Lockdown | CB | 3 | man coverage | man coverage +10, press +8 | man coverage 88, press 80 |
| Ball Hawk | CB, FS, SS, MLB | 2 | zone coverage or deep passes | zone coverage +8, catching +10 | zone coverage 84, catching 65 |
| Enforcer | FS, SS, MLB | 1 | contested catches | hit power +10, tackle +4 | hit power 84, tackle 80 |
| Ice Water | K | 2 | kicks, late in close games | kick accuracy +10 | kick accuracy 85 |
| All Weather | K, P, QB | 1 | kicks or dropbacks, in bad weather | kick accuracy +8, kick power +5, short accuracy +5, medium accuracy +5 | awareness 75 |

### Coach abilities (D-6)

| Coach ability | Held by | Effect |
| --- | --- | --- |
| QB Whisperer | Head coach, Offensive coordinator, Quarterbacks coach | QB progression +2 (M10) |
| Vertical Architect | Head coach, Offensive coordinator | offense deep passes x1.25; offense play action x1.15 |
| Run Game Guru | Head coach, Offensive coordinator, Offensive line coach, Running backs coach | offense inside runs x1.15; offense outside runs x1.15 |
| Screen Designer | Offensive coordinator, Running backs coach, Wide receivers coach | offense in the open field x1.2 |
| Pressure Designer | Head coach, Defensive coordinator, Linebackers coach, Defensive line coach | defense pass rush snaps x1.15 |
| Coverage Professor | Defensive coordinator, Defensive backs coach | defense zone coverage x1.15; defense deep passes x1.1 |
| Island Builder | Defensive coordinator, Defensive backs coach | defense man coverage x1.2 |
| Disciplinarian | Head coach | penalties coached out +1 |
| Ball Security | Head coach, Running backs coach | ball security coaching +1 |
| Pass Rush Technician | Defensive coordinator, Defensive line coach | rush move coaching +1; rush move coaching +1; rush move coaching +1 |

<!-- catalog:end -->
