---
name: calibrate
description: Run the calibration harness and analyze results against calibration/targets.json. Use after changing the simulation, AI, economy, player development, or tuning constants.
argument-hint: [seasons, default 100] [scope: sim, ai, economy, all]
context: fork
agent: calibration-analyst
background: false
---

Calibration request: $ARGUMENTS (defaults: 100 seasons, all metrics).

1. Run `npm run calibrate -- --seasons <n>` with the requested scope.
2. Read the newest report in calibration/reports/ and the last 10 entries of docs/CALIBRATION.md.
3. Return at most 40 lines:
   - Pass, warn, and fail counts, then each warn or fail with value, band, and target source.
   - Likely causes, pointing to constants in src/engine/tuning.ts or model code.
   - Proposed changes as small diffs with expected effects. Don't apply them.
   - A three-line entry for docs/CALIBRATION.md.
