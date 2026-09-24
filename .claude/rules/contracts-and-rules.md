---
paths:
  - "src/engine/contracts/**"
  - "src/engine/cap/**"
  - "src/engine/rules/**"
  - "src/engine/roster/**"
---

# Contracts, cap, and league rules
- Cap numbers are computed from contract structure (spec 11.2), never stored as truth.
- Each accounting behavior gets a golden test with hand-checked numbers.
- Rule values come from the RuleSet. Spec section 24 lists defaults to verify against the current CBA.
- Validate before applying any transaction, and return a reason the UI can show.
