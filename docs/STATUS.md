# Status
- Milestone: M11 closing (report in docs/milestones/m11.md); M12 next
- Current slice: M11's final commit, waiting on green CI before its SHA is recorded here and in the report
- Done this milestone: slice 1, draft classes made a season ahead (D-41); slice 2, draft picks as records
  (D-42); slice 3, scouting, workouts and visits, media hype, mock drafts, and the need-and-value model
  (D-43 to D-45); slice 4, the Scouting screen and the draft class settings; the user's enforcement report
  (D-46); slice 5, positional draft value (D-47), the draft pick by pick with the Draft room, and the media's
  grades (D-48); slice 6, the UDFA scramble (D-49); the close: draft hit rates over 20-season chains (D-50,
  C-24), development variance by position group, national scouts, and rule set values for pick years,
  visits, and the UDFA pool (save format 23)
- CI: the offseason walk-through's WebKit failures (runs 67, 68, 70, 71, 73) came from a click on a link
  half past the view's edge: WebKit scrolls the link it focuses into view, so the release lands beside it.
  The test now centers the link first (74135c7).
- Carried into M12, before Checkpoint B: the value-based re-sign choice (D-38), tag pricing from five years
  of cap percentages (D-39), season records judged on chained seasons 3 to 20 (D-40), free agency that
  spends near the cap, so teams meet the salary floor (D-33), compensatory pick awards, and average
  experience, which warns at 4.90 in 20-season chains (C-24).
- Post-M23 build order registered: docs/design/franchise-gm-post-m23.md (`node tools/doc.mjs post <section>`).
  Its section 1.1 preparations apply at M13, M17, M18, M20, and any sim work; its section 2.18
  responsiveness rules apply now.
- Post-M42 build order registered: docs/design/franchise-gm-post-m42.md (`node tools/doc.mjs post42 <section>`).
  Its section 1.1 preparations apply at M14, M15, M17, M20, save format work, and any weekly processing.
- Final commits (full SHAs and CI runs in each report): M0 e46f12b, M1 099af55, M2 6757e33, M3 121a201,
  M4 ea5cf29, M5 b6c1a0f, M6 6181ac5, M7 fb00815, M8 6d7c1f6, M9 1ac12bc, M10 8288107. CI was green on M0,
  M1, M7, and M10.
- Waiting on the user: the Madden roster CSV (data-raw/madden-roster.csv), which is optional and not yet available
- Updated: 2026-09-26
