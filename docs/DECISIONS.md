# Decisions

## D-1: Weighted-seed nonce inputs
- When: 2026-09-24, M0
- Decision: Each advance seed chains from the previous one and, outside fixed mode, mixes a nonce of (league stream draw, digest of user actions since the last advance, app-supplied entropy from `crypto.getRandomValues`). Fixed mode drops the nonce.
- Why: Spec 8.9 wants the same choices to give similar, not identical, outcomes; a nonce built only from saved state would replay identically after a reload.
- Revisit if: the user wants reloads with identical choices to replay exactly outside fixed mode.

## D-2: 2026 salary cap and pay minimums
- When: 2026-09-25, M1
- Decision: The 2026 cap is $301,200,000 per club (NFL announcement, February 27, 2026). 2026 minimum salaries are $885K to $1.3M by credited seasons; practice squad pay is $13,750 a week, $18,350 to $22,850 for veterans.
- Why: The build order's no-CSV path says to look up the real 2026 cap; the CBA sets the minimums.
- Revisit if: the Madden CSV carries a different cap, or the user sets one at league creation.

## D-3: The last opened league lives in IndexedDB
- When: 2026-09-25, M2
- Decision: The pointer to the last opened league is a record in the saves database's `app` store, written in an awaited transaction and cleared in the same transaction that deletes that league. Layout, theme, and density preferences stay in `localStorage`.
- Why: Spec 2.3 lists the last opened league as a `localStorage` preference, but Chromium flushes `localStorage` to disk asynchronously, so a reload right after opening a league could forget it (the M2 reload test caught this).
- Revisit if: n/a
