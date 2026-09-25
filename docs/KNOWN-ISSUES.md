# Known issues
## Bugs
## Spec questions
- Spec 2.3 lists the last opened league as a localStorage preference; it lives in IndexedDB instead (D-3).
- Spec 17.3's division familiarity bonus doesn't say which team gets it; the sim gives it to the visitors (D-12).
## Deferred
- Crowd noise isn't scaled by team hype until fans arrive (M16, D-12).
- Muffed punts, blocked field goals, roughing the kicker, and the 10-second runoff aren't simulated (D-13).
- M1 check "overall formulas reproduce Madden's OVR within a small error": waits for data-raw/madden-roster.csv (formulas are hand-set; the fitter runs on the fixture only).
- M11 check "generated players match the fitted archetypes": waits for the CSV; src/data/archetypes.json is hand-written and provisional.
- Madden CSV headers in src/data/madden-mapping.ts are provisional until the real file arrives (docs/MAPPING.md).
- Franchise totals and franchise records (spec 9.3, 18.5) arrive with M17's franchise history (D-15).
- Records lists keep a total that drops but stays positive (a negative play) even if a player outside the top 10 now has more; rebuild on read if this ever shows.
- Calibration metrics that need several seasons (repeat rates, droughts, dynasties, title spread) wait for the offseason (M10); cohesion and coaching (M13), facilities (M16), and locker room (M12) effects show as not measured yet.
- The red zone touchdown band is wide until a sourced league average is found (calibration/targets.json).
- Calibration replays use each head coach's auto depth chart and rotation and an AI game plan per game, and hurt players sit out while their backups dress, but nobody goes on injured reserve or gets signed, so every game stays independent (D-17, D-20).
- Game plans (spec 8.7) set the run and pass balance overall and by down and distance, with red zone and two-minute overrides, but formation shares aren't modeled (the sim knows personnel groupings, not formations). AI coordinators plan one balance for every situation until M14.
- The generated free agent pool (300 players) can run short at a position late in a season; M10's offseason and M12's free agency refill it.
- The news feed v1 covers results, upsets, big games, season milestones, injuries, signings, and weekly awards; rumors, power rankings, the injury report roundup, records and streaks in headlines, and the news effects setting arrive with M18 (spec 18.1).
- Weekly awards are the players of the week and the rookie of the week; players of the month and the season awards with their voting arrive with M17 (spec 18.4).
- The practice squad's international pathway exemption isn't modeled (no player carries the designation), so squads hold 16; the PUP, NFI, and suspended lists have their rules but nothing places players on them until M10's preseason and M12's suspensions.
- Cap growth, rollover of unused space, and the salary floor (spec 11.1) take effect at the league year turnover, which M10 builds; option deadlines and settling bonuses for past years come with it. Extensions (spec 19.3's contract tools) arrive with M12's negotiations.
- Waiver priority before week 4 of a season follows a seeded order until M11's draft order exists (D-22). Guaranteed money a released player earns from a new team doesn't offset what his old team owes.
- Pause rules list only the event types this build raises (injuries to starters); the others appear with the milestones that create them (spec 19.6).
- The user's team makes only the roster moves the user makes (spec 22.7's roster management auto toggle is M20's); left alone it plays short-handed through injuries, while AI teams use injured reserve, elevations, and signings.
- The dev menu has only the calibration runner; the AI decision log (M14), sim inspector, performance overlay, and fixed-seed toggle arrive later (spec 23.5).
- Games lost to injury is measured without a target: no public all-player count was found. Football Outsiders' adjusted games lost (starters and key reserves, camp injuries included) was 68.9 to 80.9 per team in 2021-2023.
- Pass volume barely falls as passing efficiency rises: team pass attempts against yards per attempt correlate about -0.05 in replays and -0.54 in the 2024 NFL, because good passing teams don't lead and run enough. The passing leader is held near the NFL mean by a league-wide pass rate shift (C-13); M7's opponent-tailored game plans and M14's coaching should carry more of it.
- Leader metrics move about 3% between seeds because a 100-season run draws only 10 leagues. At the M7 close seed 1 warns on perfect or winless teams (6 per 100 seasons, against 5) and seed 2 on the receptions leader (139, against 138), both within sampling noise (C-17).

