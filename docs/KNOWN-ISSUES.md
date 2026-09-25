# Known issues
## Bugs
## Spec questions
- Spec 2.3 lists the last opened league as a localStorage preference; it lives in IndexedDB instead (D-3).
## Deferred
- Game-day inactives (48 of 53) arrive with M7's weekly management; M4 sims every healthy active player.
- Kick catch interference and running into the kicker are defined in the rule set and sliders but not called by the sim yet.
- Snap limits for players returning from injury, development snaps, and situational substitutions (spec 12.3) arrive with the depth chart screen (M7).
- M1 check "overall formulas reproduce Madden's OVR within a small error": waits for data-raw/madden-roster.csv (formulas are hand-set; the fitter runs on the fixture only).
- M11 check "generated players match the fitted archetypes": waits for the CSV; src/data/archetypes.json is hand-written and provisional.
- Madden CSV headers in src/data/madden-mapping.ts are provisional until the real file arrives (docs/MAPPING.md).
