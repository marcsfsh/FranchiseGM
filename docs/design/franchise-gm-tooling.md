# Franchise GM: Claude Code tooling guide

Companion to `franchise-gm-spec.md`, `franchise-gm-build-order.md`, and `franchise-gm-styleguide.md`. This guide sets up the repository so Claude Code can build the game reliably **without the tooling becoming the work**. Every file is written out in full: create them exactly as shown.

Written against Claude Code 2.1.28x (September 2026) and the official docs at code.claude.com.

---

## 1. Overhead budget

**The tooling and documentation must stay under 10% of Claude Code's token usage.** That's the hard ceiling this setup is designed around, well below the point where it would slow development. Everything in this guide exists either to prevent mistakes that would cost more tokens to fix, or to keep a record that saves re-work later. Anything that doesn't pay for itself gets removed.

### 1.1 What counts

| Overhead (must stay under 10%) | Not overhead (it's the actual work) |
|---|---|
| Always-loaded instructions: CLAUDE.md, STATUS.md, skill and subagent listings | Reading the spec sections a task needs |
| Path-scoped rules when they load | Writing code and tests |
| Writing STATUS.md, decision entries, milestone plans and reports | Running builds, tests, and the calibration harness |
| Spec-reviewer and ui-reviewer subagent runs | Fixing real failures that hooks or tests catch |
| Hook feedback that isn't a real error | Calibration analysis on sim milestones |

### 1.2 Estimated costs

These are planning estimates. `/usage` and `/context` give the real numbers (section 11).

| Item | Size | How often |
|---|---|---|
| CLAUDE.md with STATUS.md | About 1,200 tokens | Once per session, then cached |
| Skill and subagent listings | About 600 tokens | Once per session, then cached |
| One path-scoped rule | About 150 to 250 tokens | When Claude first opens a matching file |
| STATUS.md update | About 300 output tokens | End of each session |
| Decision entry | About 150 output tokens | Only for decisions a future session needs |
| Milestone plan and report | About 1,500 output tokens total | Once per milestone |
| Spec-reviewer run | Capped: diff summary plus changed files it needs; 30-line report | Once per milestone |

Against the size of a milestone's implementation work, that should land around 3 to 8 percent.

### 1.3 Design rules that keep it small

1. **Never read a whole design document.** The spec, build order, and style guide total over 40,000 tokens. `tools/doc.mjs` prints a single section (section 4). Reading only what a task cites is the single biggest saving in this setup.
2. **After M0, the code is the reference for implemented UI.** The style guide's reference CSS and JavaScript get copied into `src/` at M0. From then on, Claude reads the source, not the style guide's code blocks, and uses the style guide only for design intent.
3. **Terse command output.** Test, lint, and type-check scripts use quiet reporters (section 7.4), and hooks return at most 25 lines, only on failure.
4. **Silent unless something is wrong.** Hooks produce no output when checks pass. The Stop hook skips entirely when nothing changed.
5. **Short records, no duplicates.** Each fact lives in one place. There's no changelog (git tags plus milestone reports cover it) and no subagent memory files (the calibration history lives in `docs/CALIBRATION.md` only).
6. **Checks scale with risk.** Layout tests run before committing UI work, never after every edit. The spec reviewer runs once per milestone, not per slice. Calibration runs only when the sim, AI, economy, or development changed.
7. **Few moving parts.** Four skills, three subagents (a fourth at M14), three hooks. Add something only when a procedure has been repeated or corrected three times. Remove anything `/skill-doctor` shows as unused.

### 1.4 Other principles

- **Load knowledge only where it applies.** Facts needed everywhere go in CLAUDE.md. Guidance for one part of the code goes in path-scoped rules. Procedures go in skills, which load only when used.
- **Enforce with hooks and permissions, not instructions.** Anything that must always happen is a hook or permission rule, which also means CLAUDE.md doesn't need to repeat it.
- **Always give Claude a check it can run.** Tests, type checks, layout tests, and the harness close the loop without you.
- **Review in a fresh context.** A subagent that didn't write the work checks it against the written criteria.
- **The repo is the memory.** Project state lives in `docs/`, committed. Claude's auto memory is a convenience, not the record.

There's no AGENTS.md. Claude Code reads AGENTS.md only when a project has no CLAUDE.md, so it would be ignored here. If another coding agent is added later, move the shared content to AGENTS.md and have CLAUDE.md import it with `@AGENTS.md`.

---

## 2. File layout

```
/
  CLAUDE.md                         # always loaded; short
  CLAUDE.local.md                   # optional personal notes; gitignored
  .claude/
    settings.json                   # permissions and hooks (committed)
    settings.local.json             # personal overrides (gitignored)
    rules/
      engine.md                     # loads for src/engine/**
      contracts-and-rules.md        # loads for cap, contract, roster, and rule-set code
      ui.md                         # loads for src/app/** and src/styles/**
      data-and-tools.md             # loads for tools/**, data-raw/**, src/data/**
    skills/
      milestone/SKILL.md            # /milestone: the main build loop
      decision/SKILL.md             # record a decision (Claude invokes it)
      calibrate/SKILL.md            # run and analyze the harness in a subagent
      ui-check/SKILL.md             # layout tests and style checks before a UI commit
    agents/
      spec-reviewer.md              # milestone review against the "done when" list
      calibration-analyst.md        # calibration runs and tuning proposals
      ui-reviewer.md                # style guide and accessibility review for new screens
      ai-auditor.md                 # added at M14
    hooks/
      protect-paths.mjs             # PreToolUse: block edits to protected paths
      post-edit.mjs                 # PostToolUse: format, lint, token check
      stop-verify.mjs               # Stop: type check and related tests
  tools/
    doc.mjs                         # print one design-doc section
  docs/
    design/                         # the four design documents, including this one
    STATUS.md                       # current state; imported by CLAUDE.md
    DECISIONS.md                    # decision log
    KNOWN-ISSUES.md                 # bugs, spec questions, deferred items (read when relevant)
    CALIBRATION.md                  # tuning history
    MAPPING.md                      # generated by the CSV import build step
    milestones/mNN.md               # plan and report per milestone
```

Hook scripts are Node (`.mjs`), since Node is already required. They need no `jq` and behave the same on macOS, Linux, and Windows.

---

## 3. CLAUDE.md

About 60 lines. Every line should prevent a real mistake; if Claude already does something right without a line, delete the line.

```markdown
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

## Commands (all print terse output)
- `npm run dev` · `npm run build` · `npm run build:debug`
- `npm test` · `npm run layout` · `npm run typecheck` · `npm run lint`
- `npm run check`: typecheck, lint, and unit tests. Run before every commit.
- `npm run calibrate -- --seasons 100`
- If `node_modules/` is missing (a fresh clone), run `npm ci` first. The hooks skip their checks without it.

## Hard rules
- The shipped game makes zero network requests. Build tools may use the network.
- `src/engine` never touches the DOM and runs in Node for tests.
- All randomness goes through the seeded PRNG in `src/engine/rng`. Never call Math.random.
- League rules come from the rule set. Tunable numbers live in `src/engine/tuning.ts`.
- UI uses only style guide tokens and classes.
- Money is integer dollars. Ratings are integers 0 to 99.
- Build milestones in order. Don't build later milestones' features early.
- When the spec is silent, choose NFL-accurate behavior and keep going. Record the choice with the
  decision skill only if a future session would need it. Stop for the user only at build-order checkpoints.

## How to work
- Plan first for changes that touch more than 2 or 3 files. Just do small, clear fixes.
- Report checks as one line each: the command and its result.
- One logical change per commit, conventional commit messages. Tag milestones `mNN-slug`.
- Update `docs/STATUS.md` before ending a working session. Project facts go in `docs/`, not auto memory.

## When compacting
Keep the current milestone and slice, files changed this session, failing tests, and open decisions.
```

---

## 4. The section tool: `tools/doc.mjs`

The largest avoidable cost is reading full design documents to find one section. This prints exactly one section, or the table of contents.

```js
// tools/doc.mjs: print one section of a design document, or its table of contents.
// Usage: node tools/doc.mjs <spec|build|style|tooling> [section | --toc]
// Examples: node tools/doc.mjs spec 11.2   node tools/doc.mjs build M4   node tools/doc.mjs style --toc
import { readFileSync } from 'node:fs';

const FILES = {
  spec: 'franchise-gm-spec.md',
  build: 'franchise-gm-build-order.md',
  style: 'franchise-gm-styleguide.md',
  tooling: 'franchise-gm-tooling.md'
};
const [key, arg = '--toc'] = process.argv.slice(2);
if (!FILES[key]) {
  console.error(`Usage: node tools/doc.mjs <${Object.keys(FILES).join('|')}> [section | --toc]`);
  process.exit(1);
}
const lines = readFileSync(new URL(`../docs/design/${FILES[key]}`, import.meta.url), 'utf8').split('\n');

const headings = [];
let inFence = false;
lines.forEach((line, i) => {
  if (/^`{3}/.test(line)) inFence = !inFence;
  const m = !inFence && /^(#{2,4})\s+(.*)$/.exec(line);
  if (m) headings.push({ i, level: m[1].length, title: m[2] });
});

if (arg === '--toc') {
  for (const h of headings) console.log(`${'  '.repeat(h.level - 2)}${h.title}`);
  process.exit(0);
}

const q = arg.toLowerCase();
const t = h => h.title.toLowerCase();
const at = headings.findIndex(h => t(h).startsWith(`${q}.`) || t(h).startsWith(`${q} `) || t(h) === q);
const found = at >= 0 ? at : headings.findIndex(h => t(h).includes(q));
if (found < 0) {
  console.error(`No section matching "${arg}". Run with --toc to list sections.`);
  process.exit(1);
}
const start = headings[found];
const next = headings.slice(found + 1).find(h => h.level <= start.level);
console.log(lines.slice(start.i, next ? next.i : lines.length).join('\n').trimEnd());
```

---

## 5. Path-scoped rules

Rules with `paths:` load only when Claude opens a matching file, so they cost nothing elsewhere. Each is kept to what prevents real mistakes in that area.

### `.claude/rules/engine.md`

```markdown
---
paths:
  - "src/engine/**"
---

# Engine rules
- Pure TypeScript: no DOM, no `window`, no real-time timers.
- Take an RNG sub-stream as a parameter (spec 8.9). Never create streams inside helpers.
- A literal number describing football or economics belongs in the RuleSet or `tuning.ts`,
  with a comment citing the spec section.
- State changes go through engine functions returning new state or explicit patches.
- Every new behavior gets a unit test. Anything that shifts league-wide results also gets a
  calibration metric (spec 23.3) if one doesn't exist.
```

### `.claude/rules/contracts-and-rules.md`

```markdown
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
```

### `.claude/rules/ui.md`

```markdown
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
```

### `.claude/rules/data-and-tools.md`

```markdown
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
```

---

## 6. Skills

`milestone` is the only workflow you type. Claude invokes the other three when needed. Only the `description` of each skill sits in context until the skill is used.

### `.claude/skills/milestone/SKILL.md`

```markdown
---
name: milestone
description: Start or continue a build-order milestone, such as M4.
disable-model-invocation: true
argument-hint: <milestone id like M4, or "continue"> [extra instructions]
---

Arguments: $ARGUMENTS
The first word is the milestone id; if it's missing or "continue", use the milestone in docs/STATUS.md.
Any text after the id is extra instructions from the user for this run: follow them.

1. Print the milestone with `node tools/doc.mjs build <id>` and only the spec sections it cites.
   Open docs/KNOWN-ISSUES.md only if STATUS.md lists open items for this milestone.
2. New milestone: write a Plan section in docs/milestones/<id>.md, at most 15 lines. List slices in
   order, each with the check that proves it.
3. Per slice: implement, add or update tests, run the narrowest relevant tests, then `npm run check`.
   Commit.
4. When the spec is silent, decide and continue. Use the decision skill only for choices a future
   session would need to know.
5. When every "done when" item is met:
   - Have the spec-reviewer subagent review the milestone (range: previous milestone tag to HEAD)
     against the "done when" list. Fix gaps that affect correctness or the criteria.
   - If the sim, AI, economy, or player development changed, run the calibrate skill.
   - Write the Report section of docs/milestones/<id>.md, at most 20 lines. Update docs/STATUS.md.
     Tag `<id>-<slug>`, then push the branch and the tag.
6. If the build order marks a checkpoint here, stop and summarize for the user. Otherwise continue
   with the next milestone.

Before a session ends mid-milestone, update docs/STATUS.md.
```

### `.claude/skills/decision/SKILL.md`

```markdown
---
name: decision
description: Record a decision in docs/DECISIONS.md when the design documents are silent or you deviate from them, and a future session would need to know the choice. Skip routine implementation choices.
---

Append to docs/DECISIONS.md:

## D-<next number>: <short title>
- When: <YYYY-MM-DD>, <milestone id>
- Decision: <what you chose, and the question it answers>
- Why: <one sentence, citing the NFL rule or spec section>
- Revisit if: <condition, or "n/a">

If it changes what a design document says, add one line under "Spec questions" in docs/KNOWN-ISSUES.md.
```

### `.claude/skills/calibrate/SKILL.md`

Runs in the calibration-analyst subagent, so the long harness report never enters the main session's context. Only the summary comes back.

```markdown
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
```

### `.claude/skills/ui-check/SKILL.md`

```markdown
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
```

---

## 7. Subagents, settings, and hooks

### 7.1 Subagents

Subagents run in their own context and return a short summary. Their outputs are capped so they stay cheap to read.

#### `.claude/agents/spec-reviewer.md`

```markdown
---
name: spec-reviewer
description: Adversarial reviewer that checks a milestone's changes against its "done when" list and the design documents. Use once at the end of each milestone. Reports gaps and doesn't edit.
tools: Read, Grep, Glob, Bash
---

You review work you didn't write. You're given a git range and a "done when" list.

1. Start with `git diff --stat <range>` and the criteria. Print only the design-doc sections you need
   with `node tools/doc.mjs`.
2. For each criterion: met, partly met, or missing. Open only the files needed to decide. Run
   read-only checks if useful (npm test, npm run typecheck). Don't edit files.
3. Check the CLAUDE.md hard rules on the changed files only.
4. Report only gaps affecting correctness, the criteria, or the design documents. No style preferences.

Output at most 30 lines: a table of criteria with status and one-line evidence, then required fixes.
```

#### `.claude/agents/calibration-analyst.md`

```markdown
---
name: calibration-analyst
description: Runs the calibration harness, compares results to calibration/targets.json, and proposes tuning changes. Used by the calibrate skill.
tools: Read, Grep, Glob, Bash
---

You are the simulation's calibration analyst. The harness proves whether the sim behaves like the NFL
(spec section 23).

- Check docs/CALIBRATION.md for earlier attempts on the failing metrics. Don't repeat a failed change.
- Treat calibration/targets.json as the definition of realistic. If a target looks wrong, say so and
  cite its source.
- Prefer the smallest change that fixes the most failing metrics without breaking passing ones.
- Propose changes as diffs. Don't edit files.
```

#### `.claude/agents/ui-reviewer.md`

```markdown
---
name: ui-reviewer
description: Reviews a new screen against the style guide and accessibility requirements. Use for brand-new screens only.
tools: Read, Grep, Glob, Bash
---

Review the given screen against the style guide sections on layout (4), components (7),
accessibility (8), copy and numbers (9), and acceptance (14). Print sections with `node tools/doc.mjs style <n>`.

- Run layout tests for that screen and read the failures.
- Check semantics, keyboard paths, focus, token use, state handling, and number formatting.

Output at most 25 lines: each problem with file, line, style guide section, and a concrete fix. Skip taste.
```

#### `.claude/agents/ai-auditor.md` (add at M14)

```markdown
---
name: ai-auditor
description: Audits AI front office behavior using the AI health metrics and the AI decision log. Use during and after M14 and M15, or when AI teams behave strangely.
tools: Read, Grep, Glob, Bash
---

Run the harness's AI health metrics (spec 23.3) and read samples of the AI decision log (spec 14.10)
for the teams or decision types in question.

- Look for staleness, illegal or self-destructive moves, teams stuck in cap trouble, unfilled holes,
  and logged reasons that don't match the personality or pressures that should drive them.
- Trace each finding to the considerations and weights responsible, and propose specific changes.

Output at most 30 lines. Add a three-line entry to the AI section of docs/CALIBRATION.md in your report.
```

### 7.2 `.claude/settings.json`

Permissions pre-approve routine commands so sessions don't stall, and deny a few destructive ones. Branch and tag pushes are allowed; force pushes are denied. `npm install` is left out on purpose so dependency changes still ask first, while `npm ci` (reinstalling the locked dependencies) is allowed.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npm test)",
      "Bash(npm test *)",
      "Bash(npx vitest *)",
      "Bash(npx playwright *)",
      "Bash(npx tsc *)",
      "Bash(npx eslint *)",
      "Bash(npx prettier *)",
      "Bash(node tools/*)",
      "Bash(git status)",
      "Bash(git status *)",
      "Bash(git diff)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git show *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git tag *)",
      "Bash(git push)",
      "Bash(git push -u *)",
      "Bash(git push origin *)",
      "Bash(git checkout *)",
      "Bash(git switch *)",
      "Bash(git branch *)",
      "Bash(npm ci)"
    ],
    "deny": [
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)",
      "Bash(git clean *)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-paths.mjs\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit.mjs\"", "timeout": 60 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/stop-verify.mjs\"", "timeout": 300 }
        ]
      }
    ]
  }
}
```

### 7.3 Hooks

All three hooks are silent when things pass. They only produce output when something needs fixing.

#### `.claude/hooks/protect-paths.mjs`

Blocks edits to build output, the Madden CSV, the lockfile, and git internals. Exit code 2 blocks the edit and gives Claude the reason.

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const raw = input.tool_input?.file_path;
if (!raw) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = '/' + path.relative(root, path.resolve(root, raw)).split(path.sep).join('/');

const RULES = [
  [/^\/dist\//, 'dist/ is build output. Change the source and run npm run build.'],
  [/^\/data-raw\/madden-roster\.csv$/, 'The Madden roster CSV is user-supplied. Fix issues in the import mapping instead.'],
  [/^\/package-lock\.json$/, 'Change dependencies with npm install, not by editing the lockfile.'],
  [/^\/\.git\//, 'Never edit git internals.']
];

for (const [pattern, reason] of RULES) {
  if (pattern.test(rel)) {
    process.stderr.write(`Blocked edit to ${rel}: ${reason}\n`);
    process.exit(2);
  }
}
process.exit(0);
```

#### `.claude/hooks/post-edit.mjs`

Formats and lints only the changed file, then checks UI files for literal colors. Problems go back to Claude as a block decision, capped at 10 lint lines. It skips tools that aren't installed yet, so it's safe before M0 finishes.

```js
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const raw = input.tool_input?.file_path;
if (!raw) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const abs = path.resolve(root, raw);
const rel = '/' + path.relative(root, abs).split(path.sep).join('/');
if (!/^\/(src|tools|tests)\/.*\.(ts|tsx|js|mjs|css|html)$/.test(rel) || !existsSync(abs)) process.exit(0);

const bin = name => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const run = (name, args) => spawnSync(bin(name), args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const problems = [];

if (existsSync(bin('prettier'))) run('prettier', ['--write', '--log-level', 'warn', abs]);

if (/\.(ts|tsx|js|mjs)$/.test(rel) && existsSync(bin('eslint'))) {
  const lint = run('eslint', ['--fix', '--format', 'unix', abs]);
  if (lint.status !== 0) {
    const out = (lint.stdout || lint.stderr || '').trim().split('\n').slice(0, 10).join('\n');
    problems.push(`ESLint problems in ${rel}:\n${out}`);
  }
}

// Style guide: UI code uses tokens. Literal colors are allowed only in the token and theme files.
const UI = /^\/src\/(app|styles)\//;
const COLOR_ALLOWED = [/^\/src\/styles\/tokens\.css$/, /^\/src\/app\/theme\//];
if (UI.test(rel) && !COLOR_ALLOWED.some(p => p.test(rel))) {
  const text = readFileSync(abs, 'utf8');
  const hits = [...text.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g)].map(m => m[0]);
  if (hits.length) {
    problems.push(`Literal colors in ${rel}: ${[...new Set(hits)].slice(0, 5).join(', ')}. Use style guide tokens (style guide section 12).`);
  }
}

if (problems.length) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: problems.join('\n\n') }));
}
process.exit(0);
```

#### `.claude/hooks/stop-verify.mjs`

When Claude finishes a turn with changed code, runs the incremental type check and the unit tests related to changed files. It does nothing when:

- no source, test, or tool files have uncommitted changes;
- nothing changed since the last passing run (a content hash in `.claude/.last-verify`);
- it's already continuing after a block (`stop_hook_active`);
- `GM_SKIP_VERIFY=1` is set, for discussion-only sessions.

Failures return at most 25 lines.

```js
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input.stop_hook_active || process.env.GM_SKIP_VERIFY === '1') process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const bin = name => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
if (!existsSync(bin('tsc')) || !existsSync(path.join(root, 'tsconfig.json'))) process.exit(0);

const status = run('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'tests', 'tools']).stdout.trim();
if (!status) process.exit(0);

const files = status.split('\n').map(line => line.slice(3).split(' -> ').pop().trim());
const hash = createHash('sha1').update(status).update(run('git', ['diff', 'HEAD', '--', 'src', 'tests', 'tools']).stdout);
for (const f of files) {
  const p = path.join(root, f);
  if (existsSync(p) && statSync(p).isFile() && status.includes(`?? ${f}`)) hash.update(readFileSync(p));
}
const digest = hash.digest('hex');
const stamp = path.join(root, '.claude', '.last-verify');
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest) process.exit(0);

const tail = (text, n) => (text || '').trim().split('\n').slice(-n).join('\n');
const fail = (title, out) => {
  process.stderr.write(`${title}. Fix this before finishing:\n${tail(out, 25)}\n`);
  process.exit(2);
};

const tsc = run(bin('tsc'), ['--noEmit', '--incremental', '--pretty', 'false', '-p', '.']);
if (tsc.status !== 0) fail('Type check failed', tsc.stdout + tsc.stderr);

const code = files.filter(f => /\.(ts|tsx|js|mjs)$/.test(f) && existsSync(path.join(root, f)));
if (code.length && existsSync(bin('vitest'))) {
  const tests = run(bin('vitest'), ['related', '--run', '--passWithNoTests', '--reporter=dot', ...code]);
  if (tests.status !== 0) fail('Unit tests failed', tests.stdout + tests.stderr);
}

writeFileSync(stamp, digest);
process.exit(0);
```

### 7.4 Required `package.json` scripts

M0 creates these with quiet output, since every command's output lands in Claude's context:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build && node tools/embed-fonts.mjs dist/game.html",
    "build:debug": "vite build --mode debug && node tools/embed-fonts.mjs dist/game-debug.html",
    "test": "vitest run --reporter=dot",
    "typecheck": "tsc --noEmit --incremental --pretty false",
    "lint": "eslint . --quiet --format unix",
    "check": "npm run typecheck && npm run lint && npm test",
    "layout": "playwright test --reporter=line",
    "calibrate": "node tools/calibrate.mjs"
  }
}
```

The calibration runner prints only its summary (pass, warn, and fail counts plus the failing metrics) and writes the full report to `calibration/reports/`.

### 7.5 `.gitignore` additions

```
.claude/settings.local.json
.claude/.last-verify
CLAUDE.local.md
node_modules/
*.tsbuildinfo
```

`dist/` stays tracked but is committed only on tagged releases (spec 2.2).

---

## 8. Project memory: the `docs/` files

Each fact lives in exactly one place, and every record has a size limit.

| File | Written by | When | Size limit |
|---|---|---|---|
| `STATUS.md` | milestone skill | End of each working session and milestone | 15 lines. It's loaded every session. |
| `DECISIONS.md` | decision skill | Only for choices a future session needs | 5 lines per entry |
| `KNOWN-ISSUES.md` | Any session | When a bug, spec question, or deferral is found | One line per item; delete when resolved |
| `CALIBRATION.md` | Main session, from calibrate output | Runs that change tuning | 3 lines per entry |
| `milestones/mNN.md` | milestone skill | Plan at start, report at end | 15-line plan, 20-line report |
| `MAPPING.md` | CSV import build step | Every import build | Generated; never read unless the import changes |

There's no changelog: git tags and milestone reports already record what changed.

### `docs/STATUS.md` template

```markdown
# Status
- Milestone: M0, repository, tooling, and the single-file build
- Current slice: <what's in progress>
- Next slice: <what comes next>
- Open items for this milestone: none
- Waiting on the user: none
- Updated: <YYYY-MM-DD>
```

### `docs/KNOWN-ISSUES.md` template

```markdown
# Known issues
## Bugs
## Spec questions
## Deferred
```

### `docs/milestones/mNN.md` template

```markdown
# <id>: <name>

## Plan
1. <slice>: proven by <check>

## Report
- Built:
- Evidence: <one line per check>
- Calibration: <summary or "not applicable">
- Decisions: <D-numbers or "none">
- Known gaps:
```

### Auto memory and logs

- Claude's auto memory stays on for working preferences. Anything the project depends on goes in `docs/`.
- Claude Code's session transcripts in `~/.claude/projects/` are cleaned up after 30 days by default. They aren't the project record.
- The game's own logs (calibration reports, the AI decision log) are product features defined in the spec.

---

## 9. The working loop

**Each session**

1. Start `claude` in the repo. CLAUDE.md and STATUS.md load.
2. Run `/milestone continue`, or `/milestone M5` to start the next one.
3. Claude works slice by slice. The hooks handle formatting, linting, token checks, and the pre-finish test run without being asked, so none of that needs instructions or narration.
4. STATUS.md is updated before the session ends.

**Each milestone end**

1. The spec-reviewer subagent checks the milestone against its "done when" list.
2. `/calibrate` runs if the sim, AI, economy, or development changed. Full layout tests run if UI changed.
3. The milestone report and STATUS.md are written, and the milestone is tagged.
4. At checkpoints, the build stops for you.

**Context hygiene**

- Start fresh context between milestones and between unrelated tasks: `/clear` in the terminal, or a new session from the sidebar at claude.ai/code (cloud sessions don't have `/clear`). A new cloud session must start on the working branch, or after that branch is merged.
- After two failed corrections on the same problem, start fresh and restate the task with what you learned.
- Use `/compact` with a focus when a long session gets heavy.
- Use `/btw` for side questions that shouldn't stay in context.

**Parallel work (optional)**

Independent streams, such as UI screens and engine work in the same milestone, can run in separate git worktrees (`claude --worktree`) so edits don't collide.

---

## 10. Setup (Claude Code on the web)

This setup runs entirely at claude.ai/code. Cloud sessions clone the GitHub repo into a fresh VM, work on a branch, and push that branch back. Two things follow from that: each new session only sees what's on the branch it starts from, and CLAUDE.md, settings, and hooks load when a session starts. So setup takes two sessions with a merge in between.

### Before the first session

1. **Create the GitHub repo.** Tick "Add a README" when creating it, so the repo has a default branch the session can clone.
2. **Create a cloud environment** for the project (environment switcher, then "Add cloud environment"):
   - Network access: **Custom**. Tick "Also include default list of common package managers" so npm works, and add `nfl.com` and `www.nfl.com` so M1 can fetch the 2026 schedule.
   - Setup script: leave empty. CLAUDE.md tells each session to run `npm ci` when dependencies are missing.
   - If Claude later reports a blocked download, such as the Playwright browsers for layout tests, add the domain it names to the allowlist.
3. **Permission mode:** pick Auto from the mode dropdown if your plan has it, so long runs don't stall on approvals.

### Session 1: lay down the documents and tooling

Start a session on the repo's default branch in the project environment, attach the four design documents, and send:

```
This repo is for Franchise GM, an offline single-file NFL franchise simulation. The four attached documents define it: the spec, the build order, the style guide, and the tooling guide. In this session, only set up the repo. Don't start building the game.

1. Save the four documents to docs/design/ as franchise-gm-spec.md, franchise-gm-build-order.md, franchise-gm-styleguide.md, and franchise-gm-tooling.md. The attachments are files in this environment: find them and copy them with cp instead of retyping them. Keep their contents exactly as provided.
2. Create the Claude Code tooling exactly as written in the tooling guide, sections 2 through 8, copying each file's contents from its code block:
   - CLAUDE.md and tools/doc.mjs
   - .claude/settings.json, the four files in .claude/rules/, the four skills in .claude/skills/, and three subagents in .claude/agents/ (spec-reviewer, calibration-analyst, ui-reviewer; ai-auditor waits until M14)
   - the three hooks in .claude/hooks/, made executable
   - .gitignore
   - docs/STATUS.md, docs/KNOWN-ISSUES.md, and docs/milestones/TEMPLATE.md from the templates, plus docs/DECISIONS.md and docs/CALIBRATION.md with a title line only
3. Set docs/STATUS.md to milestone M0, not started, and note under "Waiting on the user" that the Madden roster CSV is optional and not yet available.
4. Create data-raw/README.md saying the Madden roster CSV goes at data-raw/madden-roster.csv and is optional.
5. Verify: .claude/settings.json parses as JSON, `node --check` passes for every .mjs file, and `node tools/doc.mjs build M0` prints the M0 section.
6. Commit everything with the message "Design documents and Claude Code tooling" and push the branch. Then stop and tell me to merge it and start a new session.
```

When it finishes, create the pull request from the session and merge it into the default branch.

### Session 2: build

Start a **new** session on the default branch (now containing the tooling), in the same environment. Optional check: `/context` shows CLAUDE.md and STATUS.md, and `/skills` shows the four skills. Then send:

```
/milestone M0 Build Franchise GM from the design documents in docs/design/. The Madden roster CSV isn't available yet, so follow the build order's "Starting without the Madden CSV" path and generate a full fictional league with filled rosters. Continue milestone by milestone until Checkpoint A, then stop and give me the checkpoint summary.
```

The session pushes its working branch as it goes. Closing the browser doesn't stop it.

- **To keep going after a pause,** reopen the same session from the sidebar and send `/milestone continue`. If its environment expired, reopening provisions a fresh VM with the conversation restored.
- **To start a fresh session instead** (for example, to clear context between milestones), either merge the working branch first or start the new session on that branch. Then send `/milestone continue`.
- **At Checkpoint A,** review the work, create the pull request, and merge it.

### When the Madden CSV arrives

Add it to the repo at `data-raw/madden-roster.csv` on the default branch (GitHub's "Add file" upload works), start a new session on that branch, and send:

```
/milestone continue The Madden roster CSV is now in data-raw/. Complete the build order's "When the CSV arrives" steps, then continue where you left off.
```

---

## 11. Measuring and trimming overhead

Check at every build-order checkpoint, and any time sessions feel slow:

1. **Startup context:** run `/context` at the start of a session. CLAUDE.md, STATUS.md, rules, and skill and subagent listings together should be under 3,000 tokens.
2. **Usage breakdown:** `/usage` shows which skills and subagents are driving usage. Reviewer subagents and documentation writing together should stay well under 10% of a milestone's usage.
3. **Skill listing:** `/skill-doctor` shows each skill's context cost and how often it's used.

If overhead creeps up, trim in this order:

1. Shorten STATUS.md and CLAUDE.md. Delete any CLAUDE.md line Claude follows without being told; `/doctor` suggests cuts.
2. Make sure design docs are read through `tools/doc.mjs`. Whole-document reads are the most likely leak.
3. Tighten the output caps on subagents and hooks.
4. Run the spec reviewer only on milestones with engine or rule changes.
5. Remove any skill or subagent that hasn't earned its cost.

The only planned addition is the ai-auditor subagent at M14.
