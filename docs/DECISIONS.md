# Decisions

## D-1: Weighted-seed nonce inputs
- When: 2026-09-24, M0
- Decision: Each advance seed chains from the previous one and, outside fixed mode, mixes a nonce of (league stream draw, digest of user actions since the last advance, app-supplied entropy from `crypto.getRandomValues`). Fixed mode drops the nonce.
- Why: Spec 8.9 wants the same choices to give similar, not identical, outcomes; a nonce built only from saved state would replay identically after a reload.
- Revisit if: the user wants reloads with identical choices to replay exactly outside fixed mode.
