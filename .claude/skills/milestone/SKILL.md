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
   M23 (checkpoints A to D), `node tools/doc.mjs post <id>` for M24 to M42 (checkpoints E, F, and G), and
   `node tools/doc.mjs post42 <id>` for M43 and later (checkpoints H and I). Before M24, also check
   `node tools/doc.mjs post 1.1`, and before M43 `node tools/doc.mjs post42 1.1`, for preparations due at
   this milestone or in this kind of work.
   Open docs/KNOWN-ISSUES.md only if STATUS.md lists open items for this milestone.
2. New milestone: write a Plan section in docs/milestones/<id>.md, at most 15 lines. List slices in
   order, each with the check that proves it.
3. Per slice: implement, add or update tests, run the narrowest relevant tests, then `npm run check`.
   Commit.
4. When the spec is silent, decide and continue. Use the decision skill only for choices a future
   session would need to know.
5. When every "done when" item is met:
   - Have the spec-reviewer subagent review the milestone (range: the previous milestone's final commit,
     listed in docs/STATUS.md, to HEAD) against the "done when" list. Fix gaps that affect correctness or
     the criteria.
   - If the sim, AI, economy, or player development changed, run the calibrate skill.
   - Write the Report section of docs/milestones/<id>.md, at most 20 lines, including the sizes and times
     `npm run measure` prints (post-M23 section 2.18: measured, never enforced). Update docs/STATUS.md.
     Commit and push the branch. Don't tag: this environment can't push tags (HTTP 403).
   - A milestone isn't done until the latest CI run on its final commit is green. Find the run with
     `mcp__github__actions_list` (list_workflow_runs, filtered to the branch) and read a failure with
     `mcp__github__get_job_logs`. The next milestone's plan can start while it runs. If CI is red, fix it
     and push; the fix is the new final commit, so check its run the same way.
   - Record the final commit's full SHA in the report ("Final commit: <sha>, CI green") and in
     docs/STATUS.md's milestone list, in a docs-only commit, and push.
6. If the build order marks a checkpoint here, stop and summarize for the user. Otherwise continue
   with the next milestone.

Before a session ends mid-milestone, update docs/STATUS.md.
