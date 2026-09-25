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
- Calibration replays use each head coach's auto depth chart and rotation and an AI game plan per game, but keep their own injury stand-in with no injured reserve or signings, so every game stays independent (D-17, D-20).
- Game plans v1 (spec 8.7) set one run and pass balance for every down, with no red zone or two-minute overrides and no formation shares; M14's coaching adds them.
- In-season signings are one-year minimum deals and releases leave no dead money until M8's contract model; the practice squad isn't refilled after a promotion until M8.
- The generated free agent pool (300 players) can run short at a position late in a season; M10's offseason and M12's free agency refill it.
- The dev menu has only the calibration runner; the AI decision log (M14), sim inspector, performance overlay, and fixed-seed toggle arrive later (spec 23.5).
- Games lost to injury is measured without a target: no public all-player count was found. Football Outsiders' adjusted games lost (starters and key reserves, camp injuries included) was 68.9 to 80.9 per team in 2021-2023.
- Pass volume barely falls as passing efficiency rises: team pass attempts against yards per attempt correlate about -0.05 in replays and -0.54 in the 2024 NFL, because good passing teams don't lead and run enough. The passing leader is held near the NFL mean by a league-wide pass rate shift (C-13); M7's opponent-tailored game plans and M14's coaching should carry more of it.
- Leader metrics move about 3% between seeds because a 100-season run draws only 10 leagues; seed 3 warns on the receiving yards leader and 4,000-yard passers (C-15).

