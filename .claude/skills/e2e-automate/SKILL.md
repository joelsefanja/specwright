---
name: e2e-automate
description: Run the full 10-phase test automation pipeline — chains /e2e-process, /e2e-plan, /e2e-validate, /e2e-generate, /e2e-heal skills sequentially.
---

# Test Automation Pipeline

Execute the complete test automation workflow by chaining skills sequentially.

## Pipeline Overview

```
Phase 1:   Initialization — read config, validate setup
Phase 2:   Detection & Routing — detect input type (jira/file/text)
Phase 3:   Input Processing — convert input to parsed test plan MD (/e2e-process)
Phase 4:   Exploration & Planning — explore app, discover selectors, write test plan (/e2e-plan)
Phase 5:   Exploration Validation — run seed.spec.js, auto-heal failures (optional, /e2e-validate)
Phase 6:   ⛔ User Approval — present plan, wait for explicit approval
Phase 7:   BDD Generation — create .feature + steps.js files (/e2e-generate)
Phase 8:   Test Execution & Healing — run tests, auto-heal failures (optional, /e2e-heal)
Phase 9:   Cleanup — aggregate results, remove intermediate files
Phase 10:  Final Review — quality score + formatted summary
```

## Execution Steps

### Phase 1: Initialization

Run the following command to record pipeline start time:
```bash
date +%s > .specwright/pipeline_start && cat .specwright/pipeline_start
```

Read `e2e-tests/instructions.js` and validate configuration.

### Phase 2: Detection & Routing

For each config entry, detect the input type:

- `inputs.jira.url` exists → Jira mode
- `filePath` exists → File mode
- `instructions[]` exists → Text mode
- Otherwise → log error and skip

### Phase 3: Input Processing (`/e2e-process`)

Invoke `/e2e-process` with the appropriate input for each config entry:

- Jira mode: pass the Jira URL
- File mode: pass the file path
- Text mode: pass as text instructions

**Output:** Parsed MD file at `e2e-tests/plans/{moduleName}-parsed.md`

### Phase 4: Exploration & Planning (`/e2e-plan`)

**If `explore: false`** — skip browser exploration entirely. Instead:
- If `pageURL` is localhost: grep `src/` for `data-testid` attributes and read relevant component files to infer selectors and UI structure. Use agent memory (`.claude/agent-memory/playwright-test-planner/MEMORY.md`) for any previously discovered selectors for this module — combine with source-code selectors for a richer set.
- If `pageURL` is an external URL: write test cases based on Playwright best practices, using the parsed plan from Phase 3 as the only input. Skip `seed.spec.js` generation.
- Proceed directly to Phase 6 (User Approval).

**If `explore: true`** — run the following pre-cleanup FIRST, then invoke `/e2e-plan`:

⛔ **Pre-cleanup (MANDATORY before exploration):** Restore templates so exploration starts clean — no stale selectors to shortcut from:

```bash
# Detect auth strategy and copy the matching seed template
AUTH=$(grep -E '^AUTH_STRATEGY=' e2e-tests/.env.testing | cut -d= -f2 | tr -d '[:space:]')
AUTH=${AUTH:-none}
cp "e2e-tests/templates/seed/seed.${AUTH}.template.js" e2e-tests/playwright/generated/seed.spec.js

# Restore agent memory template
cp e2e-tests/templates/memory/MEMORY.template.md .claude/agent-memory/playwright-test-planner/MEMORY.md
```

Templates live in `e2e-tests/templates/` — customizable per project, versioned alongside the project. The seed file is overwritten by live exploration — never modify `seed.spec.js` directly.

After cleanup, invoke `@explorer` agent with the `pageURL` from each config entry. `@explorer` is the CLI exploration wrapper and writes to `playwright-test-planner` memory.

⛔ **Do NOT read agent memory in this phase.** Memory was just reset to the template — it has no selector data. The live browser session is the only valid source.

- The `@explorer` agent explores the app via live browser, discovers selectors, writes `seed.spec.js`
- Saves test plan to `e2e-tests/plans/{moduleName}-{fileName}-plan.md`

### Phase 5: Exploration Validation (`/e2e-validate`, Optional)

**Skip if `runExploredCases` is false.**

Invoke `/e2e-validate` to run `e2e-tests/playwright/generated/seed.spec.js` and auto-heal any failures — ensuring the explored selectors are solid before BDD generation begins.

- Runs ONLY the seed file (`seed.spec.js`) — NOT BDD feature files (those are Phase 8)
- If failures occur, heals them (selector fixes, timing fixes) via `@agent-playwright-test-healer` — up to 3 iterations
- Goal: all seed tests passing before proceeding to Phase 6 approval

### Phase 6: User Approval

**Check `autoApprove` first:**

If every config entry being processed has `autoApprove: true` set, skip the blocking prompt entirely — output a single line and proceed directly to Phase 7:

```
✅ Auto-approved (autoApprove: true) — proceeding to BDD generation.
```

**Otherwise — ⛔ User Approval (MANDATORY) BLOCKING:** Do not proceed without explicit user approval.

Present the test plan summary including:

- Scenario count and names for each module
- **File paths to the full plan files** so the user can review detailed plans with selectors, steps, and data tables

Then ask:

1. Approve & Generate
2. View Full Plan
3. Modify & Retry

### Phase 7: BDD Generation (`/e2e-generate`)

Invoke `/e2e-generate` with the approved plan file path for each config entry.
Creates complete `.feature` + `steps.js` files.

**Performance:** Proceed DIRECTLY — do NOT read agent definition files, do NOT spawn Explore sub-agents.
The plan file and seed file already contain all context needed. `/e2e-generate` handles the full chain internally.

### Phase 8: Test Execution & Healing (`/e2e-heal`, Optional)

**Skip entirely if no config has `runGeneratedCases: true`.**

For each config entry where `runGeneratedCases` is true, invoke `/e2e-heal` with the module tag:

```
/e2e-heal @{moduleName}
```

This passes the module name as a grep filter so `execution-manager` targets the correct feature files and infers the right Playwright projects (e.g. `precondition + workflow-consumers` for `@Workflows`, `auth-tests` for `@Authentication`, `main-e2e` for all other `@Modules`). Run configs **sequentially** — each heal completes up to 3 iterations before moving to the next config.

### Phase 9: Cleanup & Aggregation

Aggregate all results: configs processed, files generated, tests passed/failed, healing stats.

**Clean up intermediate files:**

```bash
rm -f e2e-tests/plans/*.md
AUTH=$(grep -E '^AUTH_STRATEGY=' e2e-tests/.env.testing | cut -d= -f2 | tr -d '[:space:]')
AUTH=${AUTH:-none}
cp "e2e-tests/templates/seed/seed.${AUTH}.template.js" e2e-tests/playwright/generated/seed.spec.js
```

### Phase 10: Final Review

Calculate a quality score from aggregated pipeline data and display a formatted summary.

**Score calculation — start at 100 and subtract only for actual observed failures. Do NOT output the deduction breakdown unless score < 90:**

```
Start: 100

Deductions (only apply when a problem actually occurred — deliberate config flags like
runGeneratedCases: false are NOT deductions):

  Config processing failures:
    -15 per config entry that failed to process (parse error, missing Jira ticket, etc.)

  BDD generation failures:
    -20 if expected .feature or steps.js files were not created

  Test execution (only if runGeneratedCases: true):
    -5  if healing was required but all tests ended up passing (auto-resolved)
    -15 per test that is still failing after max healing iterations
    -10 if test run could not start (bddgen failed, project misconfigured, etc.)

  Phase errors (not config-driven skips):
    -10 if any phase aborted unexpectedly

Minimum score: 0. Cap deductions at -60 so the score is always meaningful.
```

**Scoring is deduction-only — a clean run with no failures always scores 100, regardless of which phases ran.**

**Rating:** 100 Perfect ⭐⭐⭐⭐⭐ | 90-99 Excellent ⭐⭐⭐⭐⭐ | 75-89 Good ⭐⭐⭐⭐ | 60-74 Fair ⭐⭐⭐ | 0-59 Poor ⭐⭐

**Status:**
- score = 100  → "PRODUCTION READY"
- score 90–99  → "PRODUCTION READY — issues detected and auto-resolved"
- score 75–89  → "READY — manual review recommended"
- score 60–74  → "REQUIRES ATTENTION"
- score < 60   → "SIGNIFICANT ISSUES"

Run the following command to compute the actual wall-clock duration:
```bash
START=$(cat .specwright/pipeline_start 2>/dev/null || echo 0); NOW=$(date +%s); ELAPSED=$((NOW - START)); echo "$((ELAPSED / 60))m $((ELAPSED % 60))s"
```
Use the output as the duration value.

**Display format (use markdown sections — NOT ASCII box art):**

```markdown
# E2E AUTOMATION FINAL REVIEW
**{module name}** — {current date}

---

## 📊 Quality Score: {score}/100 {stars}
**{status}** | ⏱ {Xm Ys} (Phase 1 → Phase 10)

{ONLY if score < 90 — list what caused deductions as a diagnosis:}
| Issue | Deduction |
|---|---|
| {description of what failed} | -{n} |

---

## 🎯 Generation Summary
- **Configs Processed:** {successful}/{total}
- **Feature Files:** {count} created
- **Step Definitions:** {count} files ({totalSteps} steps)
- **Scenarios:** {count} total

---

## 📁 Generated Files
- `{project_root}/{path_to_feature_file}`
- `{project_root}/{path_to_steps_file}`
- `{project_root}/{path_to_seed_file}`

---

## 🧪 Test Execution
{if tests ran: **Passed:** X/Y (Z%) | **Duration:** Ns}
{if skipped: Skipped — `runGeneratedCases: false`}

---

## 🔧 Healing
{if healing ran: **Attempts:** N | **Auto-fixed:** N | **Success Rate:** N%}
{if skipped: Skipped — no test failures or execution skipped}

---

## ⏭️ Skipped Phases
{list each: Phase N — reason (config flag)}

---

## 📋 Next Steps

Derive the exact run command from the generated module name and category:

- **`@Workflows`** category:
  ```
  pnpm test:bdd:workflows --grep "@{moduleName-lowercase}"
  ```
  Example for `@ListWorkflow`: `pnpm test:bdd:workflows --grep "@listworkflow"`

- **`@Modules`** category:
  ```
  pnpm test:bdd --grep "@{moduleName-lowercase}"
  ```
  Example for `@HomePage`: `pnpm test:bdd --grep "@homepage"`

Then show:
```
2. Fix failures: `/e2e-heal`
3. View report: `pnpm test:report`
```

---

**STATUS: {overallStatus}**
```

## Phase Transition Output (REQUIRED)

At the start of **every** phase, output a phase header as its own standalone line.
This header is used by the Specwright Desktop app to visually separate phases into distinct cards.

**Format** — the header MUST be preceded by a blank line and followed by a blank line:

```

### Phase N: <Phase Label>

```

Full sequence for every phase transition:
```

### Phase 1: Initialization

<phase 1 content here>

### Phase 2: Detection & Routing

<phase 2 content here>

### Phase 3: Input Processing

<phase 3 content here>

### Phase 4: Exploration & Planning

<phase 4 content here>

── Phase 4 Progress ──────────────────────────────────
  {log content if any}
──────────────────────────────────────────────────────
```

All 10 phase headers:
```
### Phase 1: Initialization
### Phase 2: Detection & Routing
### Phase 3: Input Processing
### Phase 4: Exploration & Planning
### Phase 5: Exploration Validation
### Phase 6: User Approval
### Phase 7: BDD Generation
### Phase 8: Test Execution & Healing
### Phase 9: Cleanup
### Phase 10: Final Review
```

Rules:
- **NEVER** append `### Phase N:` directly after other text on the same line (e.g. `...available.### Phase 1:` is wrong)
- Always put a blank line before and after the `### Phase N:` header
- Do NOT wrap it in a bullet list item (no leading `- `)
- The `N` must match the exact phase number
- When a phase completes, move directly to the next phase header — don't re-announce completed phases

## Progress Display

Show a todo list at start, update as each phase completes:

- □ Not started → 🔄 In progress → ✅ Complete / ⏭️ Skipped / ❌ Failed

## Error Handling

If any config fails: log error, continue with next config, mark as failed in summary.

## CRITICAL: Sequential Execution

Execute phases ONE BY ONE. Never run phases in parallel. Always wait for the current phase before starting the next.
