# Franchise GM

A single-file, offline NFL franchise simulation. Code lives in this repo as normal source files;
the build bundles everything into `dist/game.html`, which is the game.

@docs/STATUS.md

## Design documents
Spec, build order, style guide, and tooling guide live in `docs/design/`. They're the source of truth.
- Never read a whole design document. Print only the section you need:
  `node tools/doc.mjs spec 11.2`, `node tools/doc.mjs build M4`, `node tools/doc.mjs style --toc`.
- After M0, the code in `src/` is the reference for implemented UI and theming; use the style guide
  for design intent, not its code blocks.
- Edit design documents only when the user asks.
- Post-M23 build order (M24 onward): `docs/design/franchise-gm-post-m23.md`. Read it with
  `node tools/doc.mjs post <section>`. Until M24, make the preparations its section 1.1 lists at each
  main milestone, and don't build its features early (section 1.2's sortable tables are the exception).

## Commands (all print terse output)
- `npm run dev` · `npm run build` · `npm run build:debug`
- `npm test` · `npm run layout` · `npm run typecheck` · `npm run lint`
- `npm run check`: typecheck, lint, the format check CI runs, and unit tests. Run before every commit.
- `npm run calibrate -- --seasons 100`
- If `node_modules/` is missing (a fresh clone), run `npm ci` first. The hooks skip their checks without it.

## Hard rules
- The shipped game makes zero network requests. Build tools may use the network.
- `src/engine` never touches the DOM and runs in Node for tests.
- All randomness goes through the seeded PRNG in `src/engine/rng`. Never call Math.random.
- League rules come from the rule set. Tunable numbers live in `src/engine/tuning.ts`.
- UI uses only style guide tokens and classes.
- Money is integer dollars. Ratings are integers 0 to 99.
- No fixed size or time budgets (post-M23 section 2.18). The UI never freezes, every wait over about half a
  second shows an indicator, and sizes and times are measured for milestone reports without blocking them.
- Build milestones in order. Don't build later milestones' features early.
- When the spec is silent, choose NFL-accurate behavior and keep going. Record the choice with the
  decision skill only if a future session would need it. Stop for the user only at build-order checkpoints.

## How to work
- Plan first for changes that touch more than 2 or 3 files. Just do small, clear fixes.
- Report checks as one line each: the command and its result.
- One logical change per commit, conventional commit messages. Don't tag milestones (tags can't be pushed
  from here): a milestone ends when CI is green on its final commit, whose SHA goes in its report and in
  `docs/STATUS.md`.
- Update `docs/STATUS.md` before ending a working session. Project facts go in `docs/`, not auto memory.

## When compacting
Keep the current milestone and slice, files changed this session, failing tests, and open decisions.
