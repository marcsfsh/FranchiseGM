---
paths:
  - "tools/**"
  - "data-raw/**"
  - "src/data/**"
---

# Data and build tools
- Never modify `data-raw/`. Fix problems in `src/data/madden-mapping.ts`; the import writes `docs/MAPPING.md`.
- Build steps are deterministic: same inputs, byte-identical outputs.
- Record the public-domain source of every name or college list in its file header.
