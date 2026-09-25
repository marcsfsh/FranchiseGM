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
