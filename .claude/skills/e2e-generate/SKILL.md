---
name: e2e-generate
description: Generate Playwright BDD tests from a test plan — chains bdd-generator (feature files + step skeletons) → code-generator (Playwright implementations).
argument-hint: <plan-file-or-feature>
context: fork
---

# Test Generation

Generate complete BDD test files from a test plan.

## Agent Chain

```
@agent-bdd-generator
  → Creates .feature file (Gherkin scenarios, data tables, tags)
  → Creates steps.js skeleton (imports, step patterns, processDataTable wiring)
  → Output: READY_FOR_CODE_GENERATION

@agent-code-generator
  → Reads seed file for validated selectors
  → Fills in Playwright implementation code
  → Applies code quality rules (no RegExp constructors, semantic locators, auto-retrying assertions)
  → Output: Complete runnable steps.js
```

## Steps

### Step 0: Pre-read all inputs (BEFORE invoking any agent)

**0a. Plan file (ALWAYS READ)**

Read from $ARGUMENTS or most recent file in `e2e-tests/plans/`. Required every run.

**0b. Framework context (ALWAYS READ)**

Check for `e2e-tests/.knowledge/generate-context.md`:

- **Found** → read it (~2.5KB). Contains FIELD_TYPES, API signatures, faker patterns, import depth table. Log: `📦 Using generate-context.md`
- **Not found** → fall back: read `e2e-tests/utils/stepHelpers.js` AND `e2e-tests/utils/testDataGenerator.js`. Log: `⚠️ generate-context.md missing — run: node e2e-tests/scripts/extract-generate-context.js`

**0c. Selectors (ALWAYS use seed.spec.js)**

Read `e2e-tests/playwright/generated/seed.spec.js` and pass inline.

- **seed.spec.js exists** → read it and pass inline. Log: `📄 Using seed.spec.js selectors`
- **seed.spec.js absent** → **HALT**. Do not proceed. Log: `🛑 No selectors available — run /e2e-plan first to explore the app and generate seed.spec.js`

Do NOT read planner memory for generation — memory is only used during exploration (/e2e-plan) and healing (/e2e-heal). The seed file written by Phase 4 is the authoritative selector source for BDD generation.

Pass all collected content inline when invoking agents. Agents MUST NOT re-read any of these files.

### Step 1: Generate BDD Files

Invoke `@agent-bdd-generator` with:

- Plan file content (from Step 0a)
- Module config (moduleName, category, subModuleName, fileName)

The agent creates both `.feature` and `steps.js` skeleton with correct imports, step patterns, and data table wiring.

### Step 2: Generate Playwright Code

Invoke `@agent-code-generator` with:

- The steps.js skeleton from Step 1
- Plan file content (from Step 0a)
- Framework context (from Step 0b — generate-context.md or utility file contents)
- Selector content (from Step 0c — planner memory table or seed.spec.js)

The agent uses the provided content to fill in Playwright implementations — no file reads needed.

### Step 3: Verify (Optional)

If the user requests verification, invoke `@agent-playwright-test-generator` to:

- Execute the generated steps in a real browser via MCP
- Confirm selectors work against the live app

## Input: $ARGUMENTS

Pass the plan file path or module name:

```
/e2e-generate e2e-tests/plans/feature-plan.md
/e2e-generate @ModuleName
```

## Output

Generated files in `e2e-tests/features/playwright-bdd/{category}/@{Module}/`:

- `{feature}.feature` — Gherkin scenarios with tags and 3-column data tables
- `steps.js` — Complete step definitions with Playwright code
