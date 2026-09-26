# Status
- Milestone: M12 (M11 done 2026-09-26, final commit ca49ad4, CI green in run 75)
- Current slice: M12 slice 7, the close (plan in docs/milestones/m12.md): season records and the economy judged
  on chained seasons, the economy retuned (D-60, D-61), the spec review's gaps fixed (morale from a
  starter's own game and lowballs of popular leaders, contract values against the market, deferrals), and
  the 10-season run's kickoff slips fixed (D-62, save format 32). Left: the final league run and full
  calibration on this code (C-25), the full layout run, the report, then Checkpoint B
- Done this milestone: slice 1, morale, the locker room, mentors, and chemistry (D-51, save format 24); slice 2,
  the player decision model (D-52, format 25); slice 3, free agency weeks with bidding, the UDFA scramble on
  the same model (D-53, format 26); slice 4, negotiation with every term of an offer (D-54, format 27);
  slice 5, value-based re-signing and bids (D-38, D-55), tag prices from five years of cap shares (D-39,
  D-56, format 28), holdouts and trade requests (D-57, format 29); slice 6, compensatory picks filled to 32
  as the NFL does (D-58, format 30) and off-field events and suspensions (D-59, format 31)
- CI: green in run 87 (11d8535). Runs 88 to 90 failed in layout tests that the new market's rosters broke
  (comp picks in a first draft, the Free agency screen's waiver table, League health listing an AI team
  between games); each is fixed, and runs 91 and 92 were going when this was written.
- Carried into M12's close, before Checkpoint B: season records judged on chained seasons 3 to 20 (D-40),
  free agency that spends near the cap, so teams meet the salary floor (D-33), the economy metrics, an
  aging calibration after D-38, and average experience, which warns at 4.90 in 20-season chains (C-24).
- Post-M23 build order registered: docs/design/franchise-gm-post-m23.md (`node tools/doc.mjs post <section>`).
  Its section 1.1 preparations apply at M13, M17, M18, M20, and any sim work; its section 2.18
  responsiveness rules apply now.
- Post-M42 build order registered: docs/design/franchise-gm-post-m42.md (`node tools/doc.mjs post42 <section>`).
  Its section 1.1 preparations apply at M14, M15, M17, M20, save format work, and any weekly processing
  (holdouts log as transactions with reasons).
- Final commits (full SHAs and CI runs in each report): M0 e46f12b, M1 099af55, M2 6757e33, M3 121a201,
  M4 ea5cf29, M5 b6c1a0f, M6 6181ac5, M7 fb00815, M8 6d7c1f6, M9 1ac12bc, M10 8288107, M11 ca49ad4. CI was
  green on M0, M1, M7, M10, and M11.
- Waiting on the user: the Madden roster CSV (data-raw/madden-roster.csv), which is optional and not yet available
- Updated: 2026-09-26
