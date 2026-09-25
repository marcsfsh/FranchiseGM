---
name: milestone
description: Start or continue a build-order milestone, such as M4.
disable-model-invocation: true
argument-hint: <milestone id like M4, or "continue"> [extra instructions]
---

Arguments: $ARGUMENTS
The first word is the milestone id; if it's missing or "continue", use the milestone in docs/STATUS.md.
Any text after the id is extra instructions from the user for this run: follow them.

1. Print the milestone and only the spec sections it cites: `node tools/doc.mjs build <id>` for M0 to
   M23 (checkpoints A to D), `node tools/doc.mjs post <id>` for M24 and later (checkpoints E, F, and G).
   For M10 to M23, also check `node tools/doc.mjs post 1.1` for preparations due at this milestone.
   Open docs/KNOWN-ISSUES.md only if STATUS.md lists open items for this milestone.
2. New milestone: write a Plan section in docs/milestones/<id>.md, at most 15 lines. List slices in
   order, each with the check that proves it.
3. Per slice: implement, add or update tests, run the narrowest relevant tests, then `npm run check`.
   Commit.
4. When the spec is silent, decide and continue. Use the decision skill only for choices a future
   session would need to know.
5. When every "done when" item is met:
   - Have the spec-reviewer subagent review the milestone (range: previous milestone tag to HEAD)
     against the "done when" list. Fix gaps that affect correctness or the criteria.
   - If the sim, AI, economy, or player development changed, run the calibrate skill.
   - Write the Report section of docs/milestones/<id>.md, at most 20 lines. Update docs/STATUS.md.
     Tag `<id>-<slug>`, then push the branch and the tag.
6. If the build order marks a checkpoint here, stop and summarize for the user. Otherwise continue
   with the next milestone.

Before a session ends mid-milestone, update docs/STATUS.md.
