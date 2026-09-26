# Known issues
## Bugs
## Spec questions
- Spec 2.3 lists the last opened league as a localStorage preference; it lives in IndexedDB instead (D-3).
- Spec 17.3's division familiarity bonus doesn't say which team gets it; the sim gives it to the visitors (D-12).
- Spec 11.1 calls the salary floor's window rolling; it checks the CBA's consecutive four-year periods from the league's first league year (D-33).
- Spec 23.2 allows a handful of perfect or winless teams per 100 seasons at most; the band follows the NFL's rate, about 6.8 per 100 (D-40).
## Deferred
- Crowd noise isn't scaled by team hype until fans arrive (M16, D-12).
- Muffed punts, blocked field goals, roughing the kicker, and the 10-second runoff aren't simulated (D-13).
- M1 check "overall formulas reproduce Madden's OVR within a small error": waits for data-raw/madden-roster.csv (formulas are hand-set; the fitter runs on the fixture only).
- M11 check "generated players match the fitted archetypes": waits for the CSV; src/data/archetypes.json is hand-written and provisional.
- Draft calibration (spec 23.3) measures multi-year starters by round, which carry first-round busts and day-3 gems, and the quarterbacks each first round takes (D-50). The Pro Bowl rate waits for M17's honors, quarterback trade-ups for M15's trades, and reaches for M14's AI brain.
- First rounds take 2.4 quarterbacks against the NFL's 3.5 (a calibration warning, C-24): AI teams draft by grade and need alone until M14's AI brain, and nobody trades up for one until M15. Average experience runs 4.90 seasons in 20-season chains against a band ending at 4.8, until M12's free agency and re-signing by value.
- Madden CSV headers in src/data/madden-mapping.ts are provisional until the real file arrives (docs/MAPPING.md).
- Franchise totals and franchise records (spec 9.3, 18.5) arrive with M17's franchise history (D-15).
- Records lists keep a total that drops but stays positive (a negative play) even if a player outside the top 10 now has more; rebuild on read if this ever shows.
- Calibration metrics that need several seasons (repeat rates, droughts, dynasties, title spread) wait for M12, when chained leagues with real free agency can judge them (D-40); cohesion and coaching (M13), facilities (M16), and locker room (M12) effects show as not measured yet.
- The red zone touchdown band is wide until a sourced league average is found (calibration/targets.json).
- Calibration replays use each head coach's auto depth chart and rotation and an AI game plan per game, and hurt players sit out while their backups dress, but nobody goes on injured reserve or gets signed, so every game stays independent (D-17, D-20). Season records are judged on weekly-loop seasons instead, which play through the weekly advance (D-24); each is the first season of a fresh league until M12 moves them to chained seasons 3 to 20 (D-40).
- Game plans (spec 8.7) set the run and pass balance overall and by down and distance, with red zone and two-minute overrides, but formation shares aren't modeled (the sim knows personnel groupings, not formations). AI coordinators plan one balance for every situation until M14.
- The free agent pool can run short at a position late in a season; each offseason's undrafted rookies refill it.
- The news feed v1 covers results, upsets, big games, season milestones, injuries, signings, and weekly awards; rumors, power rankings, the injury report roundup, records and streaks in headlines, and the news effects setting arrive with M18 (spec 18.1).
- Weekly awards are the players of the week and the rookie of the week; players of the month and the season awards with their voting arrive with M17 (spec 18.4).
- The practice squad's international pathway exemption isn't modeled (no player carries the designation), so squads hold 16. The PUP, NFI, and suspended lists have their rules, but nothing places players on them yet: players hurt at camp stay on the active roster, and suspensions arrive with M12.
- Free agency's bidding (D-53) leaves teams a median of about 17% of the cap after its four weeks in a league's first offseason; M12's close judges spending against the salary floor (D-33) and the economy's targets. Extensions and free agents' deals are negotiated in talks or settled by a GM (D-54).
- The player decision model (D-52) leaves out relationships with coaches and climate preferences until M13's staff.
- Waiver priority before week 4 of a league's first season follows a seeded order, since no draft has been ordered yet (D-22, D-42). Guaranteed money a released player earns from a new team doesn't offset what his old team owes.
- Pause rules list only the event types this build raises (injuries to starters); the others appear with the milestones that create them (spec 19.6).
- The user's team makes only the roster moves the user makes unless Settings > Automation hands roster moves or contracts to the staff (D-34); the rest of spec 22.7's toggles arrive with M20.
- The dev menu has only the calibration runner; the AI decision log (M14), sim inspector, performance overlay, and fixed-seed toggle arrive later (spec 23.5).
- Retirement age and credited seasons at retirement (`aging.retireAge`, `aging.retireExperience`) are measured without targets, though spec 23.3 checks retirement ages and career lengths by position: no public source counts retirements the way the game does, since most players who leave the NFL go unsigned and never file papers. M17's career histories may give a sourced comparison.
- Games lost to injury is measured without a target: no public all-player count was found. Football Outsiders' adjusted games lost (starters and key reserves, camp injuries included) was 68.9 to 80.9 per team in 2021-2023.
- Pass volume barely falls as passing efficiency rises: team pass attempts against yards per attempt correlate about -0.05 in replays and -0.54 in the 2024 NFL, because good passing teams don't lead and run enough. The passing leader is held near the NFL mean by a league-wide pass rate shift (C-13); M7's opponent-tailored game plans and M14's coaching should carry more of it.
- Leader metrics move about 3% between seeds because a 100-season run draws only 10 leagues. Perfect and winless teams are rare enough that even 100 weekly-loop seasons count only a few, so that metric can warn on one seed and pass on the next (C-20, D-40).
- Staff (M13) and Trades (M15) show placeholders.
- The playoff picture shows the seeds, the Wild Card matchups, and the clubs chasing them, without clinched or eliminated markers, which need every remaining result's scenarios.
- A game from an earlier season opens from history without its venue, since past schedules aren't kept (spec 8.8 doesn't ask for them).
- Dragging depth chart rows works with a mouse or trackpad; on touch screens players move with Up, Down, and the starter menu (style guide 7.4 makes dragging a supplement).
- The featured player on the hub rotates weekly among the club's five best players; spec 19.2 doesn't say how to choose him.

