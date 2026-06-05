---
name: e2e-desktop-automate
description: Run the full E2E test automation pipeline from Claude Desktop via @specwright/mcp. Each pipeline tool spawns a client project subagent (planner, bdd-generator, code-generator, healer) via the Agent SDK. No browser tools or MCP servers are needed in claude_desktop_config — the spawned agents inherit the project's .mcp.json (playwright-test, markitdown, atlassian).
argument-hint: <page-url-or-feature>
---

# E2E Desktop Automation Pipeline

`@specwright/mcp` is a thin bridge — its `e2e_*` tools spawn the corresponding client project subagents (from `.claude/agents/`) via the Claude Agent SDK. Those agents have access to the project's full toolset via the project's `.mcp.json` (`playwright-test`, `markitdown`, `atlassian`).

You (Claude Desktop) are the orchestrator. The intelligence — exploration, BDD generation, healing — lives inside the subagents.

## 🔒 Credential privacy (applies to every phase)

Values in `e2e-tests/.env.testing` — `TEST_USER_PASSWORD`, `TEST_USER_EMAIL`, `TEST_2FA_CODE`, `OAUTH_STORAGE_KEY`, API tokens, session secrets — are **write-only**.

- ✅ Use them inside tool calls (`browser_type`, `browser_evaluate`) to authenticate
- ❌ NEVER echo, list, quote, or summarise the values in your chat messages
- ❌ NEVER write them into seed files, plan files, memory files, or any committed output
- ✅ OK: "auth configured ✓", "email: (set)", "2FA: configured"
- ❌ NOT OK: "Email: user@example.com", "Password: xyz", any literal value

When you summarise a phase, describe **actions** ("authenticated successfully") — never values.

## Pipeline Overview

```
Phase 1:  Initialization       — read/write instructions.js
Phase 2:  Detection & Routing  — e2e_automate reads input sources (jira/file/text)
Phase 3:  Input Processing     — fetch Jira / convert file / normalise text → parsed plan
Phase 4:  Exploration          — e2e_explore spawns @playwright-test-planner
Phase 5:  Validation (opt)     — e2e_execute mode=seed runs seed.spec.js
Phase 6:  ⛔ User Approval      — present plan; wait for explicit yes
Phase 7:  BDD Generation       — e2e_generate spawns @bdd-generator + @code-generator
Phase 8:  Test & Heal (opt)    — e2e_heal spawns @playwright-test-healer
Phase 9:  Cleanup              — remove intermediate files
Phase 10: Final Review         — quality score + summary
```

## Tools Used

All exposed by `@specwright/mcp` under `mcp__specwright__*`:

| Tool | What it does |
|------|-------------|
| `e2e_setup` | Native form OR fallback question list to collect config |
| `e2e_configure` | `set_project` / `add` / `read` / `list` / `init` actions |
| `e2e_automate` | Read `instructions.js` and return multi-source pipeline plan |
| `e2e_status` | Check pipeline state (config, seed, plans, results) |
| `e2e_explore` | **Spawns `@playwright-test-planner`** — auth → explore → seed → plan → memory |
| `e2e_plan` | Utility — write seed.spec.js + plan from structured input (rarely used directly) |
| `e2e_execute` | Run tests (mode=seed or mode=bdd) — pure shell, no agent |
| `e2e_generate` | **Spawns `@bdd-generator` + `@code-generator`** — `.feature` + `steps.js` |
| `e2e_heal` | **Spawns `@playwright-test-healer`** — run tests, fix failures, retry |

---

## Phase 0: Load all Specwright tools (MANDATORY FIRST STEP)

Claude Desktop uses deferred tool loading — tool definitions aren't available until you call `tool_search`. Before doing anything else, load the complete Specwright toolset in a single call:

```
tool_search({ query: "select:e2e_automate,e2e_setup,e2e_configure,e2e_explore,e2e_plan,e2e_execute,e2e_generate,e2e_heal,e2e_status" })
```

This returns schemas for all 9 pipeline tools so subsequent calls don't fail with `"has not been loaded yet"` errors. **Do not proceed to Phase 1 until this call returns successfully.**

---

## Phase 1: Initialization

`instructions.js` is the source of truth. Call `mcp__specwright__e2e_automate({})` FIRST, before anything else.

- **If it returns a pipeline plan** (headed "## E2E Automation Pipeline" and listing entries) → proceed DIRECTLY to Phase 2. ⛔ **Do NOT ask the user any setup questions. Do NOT call `e2e_setup`. The config is already there — use it as-is.**
- **Only if it returns `NEXT_ACTION: CALL_E2E_SETUP`** (meaning `instructions.js` is empty/missing) → call `mcp__specwright__e2e_setup({})` to collect config.

⛔ **Never call `e2e_setup` when `e2e_automate` already returned a plan.** The existing `instructions.js` entry has everything needed. Asking setup questions in that case wastes the user's time and overwrites their config.

### `e2e_setup` paths

**Native form (Claude Desktop)**: user fills all fields → tool returns a config object.

**Fallback (tool returns numbered questions)**: Ask ALL questions exactly as written — no skipping, no rewording. If **Question 0 (project path)** appears, ask it first and immediately call:
```
mcp__specwright__e2e_configure({ "action": "set_project", "projectPath": "<answer>" })
```
The `set_project` response includes the remaining Q1–Q8 inline — ask those exactly as listed.

### After collecting the config

Write it to `instructions.js`:
```
mcp__specwright__e2e_configure({
  "action": "add",
  "config": { /* full config including moduleName, pageURL, category, subModuleName, fileName, instructions, inputs, filePath, explore, runExploredCases, runGeneratedCases */ }
})
```

Then call `mcp__specwright__e2e_automate({})` — this time it reads `instructions.js` and returns the pipeline plan.

---

## Phase 2: Detection & Routing

For each config entry, `e2e_automate` surfaces which input sources are active:

| Field present | Role |
|---|---|
| `inputs.jira.url` | Primary — fetch Jira ticket |
| `filePath` | Primary — read/convert file |
| `instructions[]` | Supplementary (if a primary exists) or standalone |

Routing priority: Jira > File > Instructions-only. Supplementary `instructions[]` are appended as "Additional scenario guidance" in whichever primary mode is active.

---

## Phase 3: Input Processing

Produce `e2e-tests/plans/{moduleName}-parsed.md` — the input for Phase 4.

**Jira mode**: Use Atlassian MCP tools directly (configured in user's `claude_desktop_config.json` if Jira flow is desired — optional). Fetch the ticket, convert to markdown, append any supplementary `instructions[]`, write the parsed plan.

**File mode**: Use the markitdown MCP tool if needed (optional Claude Desktop config). Read/convert the file, append supplementary instructions, write the parsed plan.

**Text mode**: Use `instructions[]` directly as the test scenario list. Write a minimal parsed plan.

> **Note**: Atlassian and markitdown MCP servers are optional in Claude Desktop config. If they aren't configured, ask the user to add them, or skip these modes — the exploration phase doesn't require them for basic text input.

---

## Phase 4: Exploration

Call `mcp__specwright__e2e_explore`:

```
mcp__specwright__e2e_explore({
  "pageURL":    "<from config>",
  "moduleName": "<from config>",
  "category":   "<from config>",
  "fileName":   "<from config>",
  "instructions": <from parsed plan or config>
})
```

The tool returns a **rich prompt** containing:
- The `@playwright-test-planner` system prompt (selector hierarchy, budget rules, auth strategies)
- The target URL, scenarios, and required output paths
- The list of available MCP tools (`mcp__playwright-test__*`, etc.)

### ⛔ LIVE BROWSER EXPLORATION IS MANDATORY — NO SHORTCUTS

When the `e2e_explore` tool returns its prompt, you MUST perform real browser interactions before writing any output file. **Reading the planner prompt or consulting agent memory is NOT a substitute for live browser work.**

Required sequence (every run, even when memory has cached selectors):

1. Read `e2e-tests/.env.testing` for `AUTH_STRATEGY`; authenticate accordingly
2. **Call `mcp__playwright-test__planner_setup_page` once** (the canonical Microsoft Playwright primitive for starting a planner session)
3. **Call `mcp__playwright-test__browser_navigate`** with the target `pageURL`
4. **Call `mcp__playwright-test__browser_snapshot`** to capture the live accessibility tree
5. Perform targeted interactions (`browser_click`, `browser_type`, `browser_fill_form`, etc.) for each scenario — verify memory selectors still resolve; re-discover any that drifted
6. ONLY AFTER live exploration completes: write the seed file (`Write` → `e2e-tests/playwright/generated/seed.spec.js`), write the plan file (`Write` → `e2e-tests/plans/{module}-{file}-plan.md`), and update `.claude/agent-memory/playwright-test-planner/MEMORY.md`

### Budget

| Scenario | Minimum | Maximum |
|----------|---------|---------|
| Memory has selectors for this URL (verification) | 2 browser calls | 5 browser calls |
| Memory empty / no prior run (full exploration) | 5 browser calls | 20 browser calls |

⛔ **Forbidden shortcuts** (violations of user intent — the user pressed "run exploration" because they want live verification):
- Skipping `browser_navigate` + `browser_snapshot` because memory "already has" selectors
- Writing seed/plan/memory without taking at least one live snapshot of the target page
- Treating the planner system prompt as a static document — it describes the workflow, you must EXECUTE it via browser tools
- Using screenshots for exploration (use `browser_snapshot` instead — it provides the accessibility tree with refs)

⛔ **Do NOT spawn subprocesses or wait for callbacks — you ARE the agent.** The tool returned instructions; execute them with live browser tools.

---

## Phase 5: Validation (optional — if `runExploredCases: true`)

Call `mcp__specwright__e2e_execute({ "mode": "seed" })`.

Pure shell — runs `npx playwright test e2e-tests/playwright/generated/seed.spec.js`. Returns pass/fail.

If there are failures, call `mcp__specwright__e2e_heal` to fix them (loops up to 3 iterations).

---

## Phase 6: ⛔ User Approval (MANDATORY)

Present the plan file to the user. **Do NOT proceed without explicit approval.**

Format:
```
📋 Test Plan Ready

Module: @<Name>
Scenarios: N (happy-path, negative, edge-case)
Plan file: <absolute path>

Approve to generate BDD tests? (yes/no)
```

Wait for `yes` / `approved` / `proceed` before Phase 7. A `no` or requested changes means return to Phase 4 (re-explore) or refine the plan.

---

## Phase 7: BDD Generation

Call `mcp__specwright__e2e_generate`:

```
mcp__specwright__e2e_generate({
  "planFilePath": "<plan file from Phase 4>",
  "moduleName":   "<from config>",
  "category":     "<from config>",
  "fileName":     "<from config>"
})
```

The tool returns a prompt with:
- The plan content, seed content, and `stepHelpers.js` inlined
- The `@bdd-generator` system prompt (how to write Gherkin)
- The `@code-generator` system prompt (how to write steps.js)

**You execute both generators sequentially**:
1. Act as `@bdd-generator` → write the `.feature` file via the `Write` tool
2. Act as `@code-generator` → write `steps.js` via the `Write` tool

Confirm scenario count when done. Proceed to Phase 8.

---

## Phase 8: Test & Heal (only if `runGeneratedCases: true`)

Call `mcp__specwright__e2e_heal`:

```
mcp__specwright__e2e_heal({
  "moduleName":    "<from config>",
  "category":      "<from config>",
  "maxIterations": 3
})
```

The tool returns:
- The initial test command (`npx bddgen && npx playwright test --project ...`)
- The `@playwright-test-healer` system prompt
- Max iteration count

**You execute the healing loop**:
1. Run the test command via `Bash`; parse JSON results
2. For each failure: read steps.js, grep `src/` for the broken selector, apply fix via `Edit`
3. Re-run; repeat up to `maxIterations`
4. Update `.claude/agent-memory/playwright-test-healer/MEMORY.md`

---

## Phase 9: Cleanup

After the BDD `.feature` + `steps.js` files are generated (and optionally healed), the intermediate scratch artefacts in `e2e-tests/plans/` and the seed file are no longer the source of truth — the committed BDD files are. Clean them up so the next pipeline run starts from a blank slate:

**Files to remove:**
- All files under `e2e-tests/plans/` EXCEPT `.gitkeep` — this includes `-parsed.md` (intermediate Jira/file parsed output) AND `-plan.md` (approved plan). Both are now redundant since the `.feature` file is the committed artefact.

Use `Bash`:
```bash
find e2e-tests/plans/ -type f ! -name '.gitkeep' -delete
```

**Files to reset (truncate to empty):**
- `e2e-tests/playwright/generated/seed.spec.js` — clear it so a fresh exploration on the next run doesn't mix with stale selectors. Use `Write` with empty content, or `Bash`:

```bash
: > e2e-tests/playwright/generated/seed.spec.js
```

**What NOT to remove:**
- `.claude/agent-memory/**/MEMORY.md` — learned selector/healer patterns persist across runs by design
- `e2e-tests/features/playwright-bdd/**/*.feature` and `**/steps.js` — the committed BDD artefacts
- `e2e-tests/playwright/test-data/*.json` — scoped test data still in use

After cleanup, confirm the state in one line:
```
🧹 Cleanup: plans/ emptied, seed.spec.js reset. Committed: <featurePath>, <stepsPath>.
```

---

## Phase 10: Final Review

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

**Display format (use markdown sections):**

```markdown
# E2E AUTOMATION FINAL REVIEW
**{module name}** — {current date}

---

## 📊 Quality Score: {score}/100 {stars}
**{status}**

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
- `{path_to_feature_file}`
- `{path_to_steps_file}`

---

## 🧪 Test Execution
{if tests ran: **Passed:** X/Y (Z%)}
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
- Run tests: `pnpm test:bdd --grep "@{moduleName-lowercase}"`
- Fix failures: `/e2e-heal`
- View report: `pnpm test:report`

---

**STATUS: {overallStatus}**
```

---

## Error Handling

- **`set_project` returns "No .specwright.json found"**: Ask user to run `npx @specwright/plugin init` in their project first.
- **Agent errors**: The tool returns `❌ failed: <reason>` — surface this to the user with the suggested next step.
- **Browser auth fails**: The planner agent stops and reports the auth issue. Ask the user to check `e2e-tests/.env.testing` credentials.

## Key Rules

⛔ **Do NOT** ask setup questions in chat before calling `e2e_setup`.
⛔ **Do NOT** skip, reword, or combine fallback questions from `e2e_setup` / `set_project`.
⛔ **Do NOT** proceed past Phase 6 without explicit user approval.
⛔ **Do NOT** attempt to use browser tools directly — the `e2e_*` tools spawn agents that do it.
✅ **Always** write the config to `instructions.js` via `e2e_configure action=add` before running pipeline phases.
