---
paths:
  - "src/app/**"
  - "src/styles/**"
---

# UI rules
- Tokens and classes only. Literal hex colors are allowed only in `src/styles/tokens.css` and `src/app/theme/**`.
- Native semantics first: tables, links, buttons, labels, `<dialog>`.
- Render user-derived text with `textContent`, never HTML strings.
- One state model per screen; changing the shell never resets filters, selection, or scroll.
- Before committing UI work, run the ui-check skill.
