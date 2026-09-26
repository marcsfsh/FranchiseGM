# Status
- Milestone: M11 (M10 done 2026-09-26)
- Current slice: M11 slice 6, the UDFA scramble (plan in docs/milestones/m11.md)
- Done this milestone: slice 1, draft classes made a season ahead (D-41); slice 2, draft picks as records
  (D-42); slice 3, scouting, workouts and visits, media hype, mock drafts, and the need-and-value model
  (D-43 to D-45); slice 4, the Scouting screen and the draft class settings; the user's enforcement report
  (D-46: one cap calculation, the roster minimum and game-day rosters, the stop before advancing with its
  fixes, rule enforcement and League health); slice 5, positional draft value (D-47), the draft pick by
  pick with the Draft room, the Draft picks automation, and the media's grades (D-48)
- CI: the offseason walk-through fails on WebKit desktop only, at the preseason box score link from the
  inbox ("Game not found"), since the enforcement commits (runs 67 and 68). CI now prints failed tests'
  page snapshots; read them in the next failing run's log.
- Open items for M11: in docs/KNOWN-ISSUES.md, the archetype check waits for the Madden CSV.
- Carried into M12, before Checkpoint B: the value-based re-sign choice (D-38), tag pricing from five years
  of cap percentages (D-39), season records judged on chained seasons 3 to 20 (D-40), and free agency that
  spends near the cap, so teams meet the salary floor (D-33).
- Post-M23 build order registered: docs/design/franchise-gm-post-m23.md (`node tools/doc.mjs post <section>`).
  Its section 1.1 preparations apply at M10, M11, M13, M17, M18, M20, and any sim work; its section 2.18
  responsiveness rules apply now.
- Post-M42 build order registered: docs/design/franchise-gm-post-m42.md (`node tools/doc.mjs post42 <section>`).
  Its section 1.1 preparations apply at M14, M15, M17, M20, save format work, and any weekly processing.
- Final commits (full SHAs and CI runs in each report): M0 e46f12b, M1 099af55, M2 6757e33, M3 121a201,
  M4 ea5cf29, M5 b6c1a0f, M6 6181ac5, M7 fb00815, M8 6d7c1f6, M9 1ac12bc, M10 8288107. CI was green on M0,
  M1, M7, and M10.
- Waiting on the user: the Madden roster CSV (data-raw/madden-roster.csv), which is optional and not yet available
- Updated: 2026-09-26
