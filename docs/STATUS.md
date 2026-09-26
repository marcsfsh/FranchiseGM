# Status
- Milestone: Checkpoint B, waiting on the user before M13 (M12 done 2026-09-26, final commit dbbfd8e, CI
  green in run 98)
- Current slice: none. The Checkpoint B summary (calibration report, league summary, decisions) went to the
  user; M13 starts when the user says so
- Done in M12: morale, the locker room, mentors, and chemistry (D-51); the player decision model (D-52); free
  agency weeks and bidding (D-53); negotiation with every term (D-54); value-based re-signing and tags from
  five years of cap shares (D-38, D-39, D-55, D-56); holdouts and trade requests (D-57); compensatory picks
  (D-58); off-field events and suspensions (D-59); the economy retuned to spend to the cap (D-60, D-61); the
  10-season run's kickoff slips (D-62); and the user's additions: hidden floors behind the agent's ask and
  the front office's range (D-63), deal structure valued by the player (D-64), free agency as a market
  (D-65), and one negotiation for re-signings and extensions (D-66). Save format 34
- CI: green in run 98 (dbbfd8e).
- Open after M12 (docs/KNOWN-ISSUES.md): chained seasons drift toward parity (win sd 2.49 against 2.8 to 3.5,
  C-25), for M13's coaching and M14's team modes unless the user wants it sooner; the richest non-quarterback
  deal (11.2%) and net-loss compensatory picks (24.6) warn.
- Post-M23 build order registered: docs/design/franchise-gm-post-m23.md (`node tools/doc.mjs post <section>`).
  Its section 1.1 preparations apply at M13, M17, M18, M20, and any sim work; its section 2.18
  responsiveness rules apply now.
- Post-M42 build order registered: docs/design/franchise-gm-post-m42.md (`node tools/doc.mjs post42 <section>`).
  Its section 1.1 preparations apply at M14, M15, M17, M20, save format work, and any weekly processing
  (holdouts log as transactions with reasons).
- Final commits (full SHAs and CI runs in each report): M0 e46f12b, M1 099af55, M2 6757e33, M3 121a201,
  M4 ea5cf29, M5 b6c1a0f, M6 6181ac5, M7 fb00815, M8 6d7c1f6, M9 1ac12bc, M10 8288107, M11 ca49ad4,
  M12 dbbfd8e. CI was green on M0, M1, M7, M10, M11, and M12.
- Waiting on the user: Checkpoint B's go-ahead for M13; the Madden roster CSV (data-raw/madden-roster.csv),
  which is optional and not yet available
- Updated: 2026-09-26
