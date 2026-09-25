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
- Change: wind hurts every throw (`windPassLogitPerMph` -0.03, `windDepth` by depth), `fgWindPerMph` -0.03 to -0.06, new `indoorPassLogit` 0.15, `turfSpeed` 0.5 to 1.5.
- Effect: wind 20+ mph completion change +1.0 to -3.5 points, field goals about -4 points, indoor scoring edge +0.5 to +1.6 per team.

## C-8: Kickoffs, punts, and returns (M6, 2026-09-25)
- Change: `kickoffReturnable` 0.66 to 0.78, `kickReturnMean` 23 to 24.5, `kickoffLanding` [1, 14] to [0, 10], `puntMean` 50 to 52.2, `puntReturnMean` 8 to 7.5, `returnTouchdown` 0.004 to 0.007; new turnover returns (`returnBreakaway` 0.14, `returnBreakawayMean` 55, `fumbleReturnMean` 3, `intReturnMean` 7).
- Effect: kickoffs returned 64% to 75%, average drive start 31.8 to 30.3, gross punts 45.3 to 46.9, return touchdowns 0.02 to 0.11 per team game.

## C-9: Home field, pace, penalties, and fit (M6, 2026-09-25)
- Change: `homeCrowd` 0.5 to 0.65; `runGainMean` 4.52, `breakaway` 0.06, `brokenTackle` 0.065; penalty rates (pass interference 0.021, roughing the passer 0.0145, unnecessary roughness 0.0095); `fitPoints` 0.5 to 0.7; Air Raid pass rates 0.02 to 0.04 lower (`src/engine/schemes/catalog.ts`).
- Effect: home field +1.3 to +1.7 points, penalty yards 44 to 47, fit effect 3.7% to 7.3%, passing yards leader 5,484 to about 5,300; 100-season run: every game-level and stat metric passes.

## C-10: Touchdowns near the goal line and kick returns (M6, 2026-09-25)
- Change: `goalLineStuff` 0.75 to 1.2, `kickReturnMean` 24.5 to 24, `redZoneCompletion` -1.25 to -1.3.
- Effect: points per team 23.4 to 23.1 and blowouts 25% to 24% in the same leagues, with completions and yards per carry unchanged; moves scoring off the band's ceiling.

## C-11: Tighter roster balance with a wider team offset (M6, 2026-09-25)
- Change: `league.balanceFrom` 0.15 to 0.1, `balanceKeep` 0.3 to 0.2, `teamSpread` 0.15 to 0.2: fewer runaway rosters, and a little more spread among the rest.
- Effect: in 48 seasons over 24 leagues, perfect or winless teams 6.3 to 2.1 per 100 seasons, win sd 2.79 to 2.92, favorites 65.4% to 66.2%, team rating sd 4.35 to 4.65; 100-season runs pass all 63 targets on seed 1 (5 perfect or winless per 100, down from 8) and seed 2 (3).
