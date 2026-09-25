# Calibration

Tuning changes, newest last. Each entry names the constants in `src/engine/tuning.ts` (or the file named) and what the calibration runs showed. Baseline for M6: the M4 and M5 tuning replayed for 8 seasons.

## C-1: Team strength spread and cap parity (M6, 2026-09-25)
- Change: `league.teamSpread` 0.3 (normal) to 0.15 (uniform); new roster balance (`balanceFrom` 0.15, `balanceKeep` 0.3, `balanceQbWeight` 4): a roster far from typical keeps 30% of the excess (D-19).
- Effect: team rating sd 7.6 to 4.2 points, win sd 3.69 to 2.85, favorites 72% to 64%, perfect or winless teams 11 to under 2 per 100 seasons; the 15-win target moved to its 17-game equivalent (14 of 16).

## C-2: Injury frequency and carry-over (M6, 2026-09-25)
- Change: `sim.injuryRate` 0.0018 to 0.009 and `sim.injurySeverity` [0.55, 0.25, 0.12, 0.08] to [0.4, 0.33, 0.17, 0.1]; replays keep injured players out for their weeks (D-17).
- Effect: injuries costing a game 3.2 to 21.5 per team season (NFL 20 to 26), games lost 10 to 67.

## C-3: Target, carry, and sack concentration (M6, 2026-09-25)
- Change: `sim.calls.openness` 0.06 to 0.018, `creditSpread` 6 to 18, `situations.rb1Share` 0.7 to 0.6; new `backfieldSeparation` 18 and `checkdownFavor` 2.6.
- Effect: top target share 43% to 32%, receptions leader 181 to 134, sacks leader 32 to 22, 1,000-yard receivers 44 to 28, backs' target share 10.7% to 17.3%.

## C-4: Protecting a lead and the prevent defense (M6, 2026-09-25)
- Change: new lead protection (spec 8.6): `protectFrom` 6, `protectRamp` 12, `protectEarly` 0.6, `protectPassCut` 0.35, soft coverage (`softShortLogit` 1.2, `softDeepLogit` 0.3, `softYac` 0.1, `softPressureLogit` 1.5), prevent in the last `preventSeconds` 300 at `preventLate` 1; `sim.formSd` 0.8 to 1.75.
- Effect: one-score games 42% to 51%, games decided by 1 to 3 16% to 21%, blowouts 31% to 24%, overtime 4.1% to 6.1%, margin sd around the rating gap 14.5 to 13.2.

## C-5: Passing efficiency with backups playing (M6, 2026-09-25)
- Change: `sim.completion` +0.12 log-odds (0.771, 0.617, 0.391, 0.871), `sim.interception` (0.0125, 0.0213, 0.0385, 0.0029), `edge.interception` 0.04 to 0.025, `redZoneCompletion` -0.6 to -1.25, `sim.yac` -4%, fumbles (carry 0.016, catch 0.007, strip sack 0.15), `sackGivenPressure` 0.2.
- Effect: completions 59% to 64%, yards per attempt 6.45 to 7.1, interceptions 2.8% to 2.1%, turnovers 1.02 to 1.24 per team game, red zone touchdowns 63% to 55%.

## C-6: Fourth downs and throwing to the sticks (M6, 2026-09-25)
- Change: `sim.goRate` [0.82, 0.57, 0.31, 0.09] and `goRateOwnHalf` [0.31, 0.14, 0.045, 0.008]; `blitzThirdDown` 1.25 to 1.05; new throwing to the sticks (`sticksFrom` 5, `sticksRamp` 5, `sticksShift` 0.25).
- Effect: fourth-down tries 1.10 to 1.2 per team game and conversions 43% to 50%; third downs 37.3% to 39.8%.

## C-7: Weather (M6, 2026-09-25)
- Change: wind hurts every throw (`windPassLogitPerMph` -0.03, `windDepth` by depth), replacing the deep-throw-only `windDeepLogitPerMph` -0.02; `fgWindPerMph` -0.03 to -0.06, new `indoorPassLogit` 0.15, `turfSpeed` 0.5 to 1.5.
- Effect: wind 20+ mph completion change +1.0 to -3.5 points, field goals about -4 points, indoor scoring edge +0.5 to +1.6 per team.

## C-8: Kickoffs, punts, and returns (M6, 2026-09-25)
- Change: `kickoffReturnable` 0.66 to 0.78, `kickReturnMean` 23 to 24.5, `kickoffLanding` [1, 14] to [0, 10], `puntMean` 50 to 52.2, `puntReturnMean` 8 to 7.5, `returnTouchdown` 0.004 to 0.007; new turnover return breakaways (`returnBreakaway` 0.14, `returnBreakawayMean` 55) and `fumbleReturnMean` 3, `intReturnMean` 9 to 7.
- Effect: kickoffs returned 64% to 75%, average drive start 31.8 to 30.3, gross punts 45.3 to 46.9, return touchdowns 0.02 to 0.11 per team game.

## C-9: Home field, pace, penalties, and fit (M6, 2026-09-25)
- Change: `homeCrowd` 0.5 to 0.65; `runGainMean` 4.52, `breakaway` 0.06, `brokenTackle` 0.065; penalty rates (pass interference 0.021, roughing the passer 0.0145, unnecessary roughness 0.0095); `fitPoints` 0.5 to 0.7; Air Raid pass rates 0.01 to 0.04 lower (`src/engine/schemes/catalog.ts`).
- Effect: home field +1.3 to +1.7 points, penalty yards 44 to 47, fit effect 3.7% to 7.3%, passing yards leader 5,484 to about 5,300; 100-season run: every game-level and stat metric passes.

## C-10: Touchdowns near the goal line and kick returns (M6, 2026-09-25)
- Change: `goalLineStuff` 0.75 to 1.2, `kickReturnMean` 24.5 to 24, `redZoneCompletion` -1.25 to -1.3.
- Effect: points per team 23.4 to 23.1 and blowouts 25% to 24% in the same leagues, with completions and yards per carry unchanged; moves scoring off the band's ceiling.

## C-11: Tighter roster balance with a wider team offset (M6, 2026-09-25)
- Change: `league.balanceFrom` 0.15 to 0.1, `balanceKeep` 0.3 to 0.2, `teamSpread` 0.15 to 0.2: fewer runaway rosters, and a little more spread among the rest.
- Effect: in 48 seasons over 24 leagues, perfect or winless teams 6.3 to 2.1 per 100 seasons, win sd 2.79 to 2.92, favorites 65.4% to 66.2%, team rating sd 4.35 to 4.65; 100-season runs pass all 63 targets on seed 1 (5 perfect or winless per 100, down from 8) and seed 2 (3).

## C-12: Game script (M6 review, 2026-09-25)
- Change: new chasing a deficit (`chaseFrom` 3, `chaseRamp` 14, `chaseEarly` 0.3, `chaseShift` 0.25; D-18); `protectFrom` 6 to 5 and `protectPassCut` 0.35 to 0.4; `halftimeShift` 0.07 to 0.02 and `leanMax` 0.05 to 0.02, which tied pass volume to passing quality; `formSd` 1.75 to 2.0 to keep margins as uncertain.
- Effect: blowouts 25.6% to 24.3%, one-score games 48.7% to 50.7%, margin sd 13.1 kept. Pass volume still barely falls as passing efficiency rises (docs/KNOWN-ISSUES.md).

## C-13: Pass volume, completions, and target shares (M6 review, 2026-09-25)
- Change: new `passRateShift` -0.02; `sim.completion` +0.03 log-odds (0.7763, 0.6241, 0.3981, 0.8743); `sim.yac` about 9% lower (3.9, 2.55, 3.9, 5.2); `openness` 0.018 to 0.03, `minTargetShare` 0.02 to 0.005, `deepFavor` for X and Z 1.5 to 2; `runGainMean` 4.52 to 4.62.
- Effect: passing yards leader 5,273 to about 5,045 (NFL 2021-2025 mean 4,963), receiving yards leader 1,740 to 1,773-1,803 (1,811), receptions leader 133 to 138 (133), completions 63.5% to 64.9%, pass attempts 33.9 to 32.7 per team game, yards per carry 4.20 to 4.26.

## C-14: Sack and interception leaders (M6 review, 2026-09-25)
- Change: `creditSpread` 18 to 21, `edge.interception` 0.025 to 0.015, `playsBallLogit` 0.15 to 0.1, `sim.interception` 9% higher (0.0136, 0.0232, 0.042, 0.0032).
- Effect: sacks leader 22.0 to 19.3-19.7 (NFL mean 20.1), interceptions leader 10.4 to 8.8-9.0 (8.4), interception rate 2.2% kept.

## C-15: Field goals by distance and fourth downs (M6 review, 2026-09-25)
- Change: `fgPerYard` -0.12 to -0.155 out to the new `fgKnee` 45, then the new `fgPerYardLong` -0.04; `goRate` [0.82, 0.57, 0.31, 0.09] to [0.95, 0.75, 0.36, 0.08] and `goRateOwnHalf` [0.31, 0.14, 0.045, 0.008] to [0.42, 0.2, 0.055, 0.007].
- Effect: field goals from 40 to 49 yards 85.4% to 77.0-77.8% (NFL 2021-2024 78.6%), under 40 96.8% to 95.6-95.9% (95.5%), 50 or more 67.1% to 68.5-69.1% (68.3%); fourth-down tries 1.32 to 1.40-1.42 per team game (1.42) and conversions 49.8% to 51.9-52.2% (53.1%). 100-season runs pass all 62 targets on seeds 1 and 2; seed 3 warns on the receiving yards leader (1,697) and 4,000-yard passers (6.5).

## C-16: Blitz pressure and M7's weekly management (M7, 2026-09-25)
- Change: the pass rush is rated by its best four rushers, so blitzers add a man without watering down the rush; `blitzPressure` 0.45 to 0.3 and `pressureBase` 0.31 to 0.3. Replays now use each head coach's auto depth chart and rotation and an AI game plan per game (D-17, D-20), with plan effects (`featureTargets` 0.1, `doubleSeparation` 10, `chipRush` 4, `spyPressure` 0.12) and AI settings (`leanPerPoint` 0.005, `featureFrom` 12, a seven-step backfield split from 0.45 to 0.75 centered on `rb1Share` 0.6 at the median gap of 8 points, 0.005 per point) tuned against the leaders.
- Effect: a blitz on every down adds about 9 points of pressure (33.5% to 42.4% on the test matchup), where it had added 4, and the league sack rate stays in its band. In 100-season runs, the first plans pushed the rushing leader to 2,259 and receptions to 146; after tuning, seed 1 passes 61 of 62 targets (rushing leader 1,914 warns) and seed 2 passes 60 (passing leader 5,191 and receptions 140 warn). C-17 has the closing numbers.

## C-17: Backups dress for hurt players, and the passing game (M7 close, 2026-09-25)
- Change: replays set hurt players aside before teams dress and plan, so their backups dress and the depth chart fills around them (they had dressed and sat, leaving a team short at the position). `yac` 4% lower (short and deep 3.9 to 3.74, intermediate 2.55 to 2.45, screens 5.2 to 4.99), `checkdownFavor` 2.6 to 3.4, and `deepFavor` for the outside receivers 2 to 2.4. The AI's rotation also names a goal-line back and a dime linebacker (spec 12.3).
- Effect: in 100-season runs seed 1 passes 61 of 62 targets (perfect or winless teams 6.0 per 100 seasons warns, against 5 at most) and seed 2 passes 61 (receptions leader 139 warns, against 138); both sit within a run's sampling noise. Since C-16: rushing leader 1,914 to 1,730 (seed 1), passing leader 5,191 to 5,121 and receptions 140 to 139 (seed 2); completions 64.6-64.8%, 7.07-7.08 yards per attempt, 4.24-4.26 per carry, and 22.5-22.7 points per team game.

## C-18: Rosters and the cap (M8 close, 2026-09-25)
- Change: none to the sim or the replays. M8's contracts, cap, and roster moves happen in the season loop, and replays make no roster moves.
- Effect: the seed 1 100-season run matches C-17's report metric for metric: 61 of 62 targets pass, and perfect or winless teams (6.0 per 100 seasons) still warn.
