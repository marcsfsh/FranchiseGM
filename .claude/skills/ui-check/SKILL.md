---
name: ui-check
description: Run layout tests and style guide checks before committing UI work.
---

1. Run layout tests only for the changed screens: `npm run layout -- <screen spec names>`.
   Run the full suite (`npm run layout`) at milestone end instead.
2. For each changed screen, check the style guide definition of done (print it with
   `node tools/doc.mjs style 14.5`).
3. For a brand-new screen, have the ui-reviewer subagent review it. Skip this for small changes.
4. Fix problems before committing. Report the result in one line.
