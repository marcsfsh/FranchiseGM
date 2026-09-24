---
paths:
  - "src/engine/**"
---

# Engine rules
- Pure TypeScript: no DOM, no `window`, no real-time timers.
- Take an RNG sub-stream as a parameter (spec 8.9). Never create streams inside helpers.
- A literal number describing football or economics belongs in the RuleSet or `tuning.ts`,
  with a comment citing the spec section.
- State changes go through engine functions returning new state or explicit patches.
- Every new behavior gets a unit test. Anything that shifts league-wide results also gets a
  calibration metric (spec 23.3) if one doesn't exist.
