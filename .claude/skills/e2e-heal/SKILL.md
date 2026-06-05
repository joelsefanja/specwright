---
name: e2e-heal
description: Run tests, diagnose failures, investigate source code, apply direct fixes, and auto-heal remaining issues with up to 3 healing iterations. Generates review plan for unresolved failures.
argument-hint: <test-file-or-tag>
context: fork
---

# Test Healing

Run tests, triage failures, investigate source code, apply direct fixes, and auto-heal remaining issues.

## Agent Chain

```
@agent-execution-manager (run + triage + source-fix)
  ↕ loop (max 3 iterations)
@agent-playwright-test-healer (fix timing/visibility failures via MCP)
```

## Steps

### Step 1: Run Tests & Triage

**DO NOT output `### Phase 1:` or `### Phase 2:` headers.** The module and category are already known from $ARGUMENTS — no initialization or routing is needed. Begin output directly at `### Phase 8: Test Execution & Healing`.

Invoke `@agent-execution-manager` in **bdd mode** with any filters from $ARGUMENTS.

The agent:

- Runs `npx bddgen && npx playwright test`
- Categorizes failures (selector, timeout, assertion, network, data, server)
- Investigates source code for fixable failures
- **Directly edits step files** to fix clear selector mismatches
- Returns execution report with `recommendation`

### Step 2: Check Results

- If `recommendation` is `all_passed` → done, go to Step 6 (memory)
- If `recommendation` is `fixes_applied` → re-run to verify (go to Step 1)
- If `recommendation` is `needs_healing` → proceed to Step 3
- If `recommendation` is `needs_review` → generate review plan, go to Step 6

### Step 3: Heal Remaining Failures

Invoke `@agent-playwright-test-healer` with the `healableFailures` from Step 1.

The healer:

- Debugs each failure interactively using MCP browser tools
- Captures page snapshots to understand context
- Updates selectors, assertions, and timing
- Verifies fixes by re-running the test

### Step 4: Re-run (Loop)

Invoke `@agent-execution-manager` again to verify healer's fixes.

- If all pass → go to Step 6 (memory)
- If still failing and iterations < 3 → go to Step 3
- If iterations exhausted → generate review plan, go to Step 6

### Step 5: Generate Review Plan (if failures remain)

After exhausting iterations, generate:
`e2e-tests/reports/review-plan-{module}-{timestamp}.md`

### Step 6: Update Agent Memory (MANDATORY — always execute)

After ALL healing work is complete (whether tests pass or review plan generated), update memory files:

**Update `.claude/agent-memory/playwright-test-healer/MEMORY.md`** with:

- **Project Conventions**: Stable patterns discovered (e.g., "Card wrapper component doesn't forward data-testid to its child")
- **Selector Fixes**: Each fix applied (date, module, old selector, new selector, reason) — max 20 entries
- **Anti-Patterns**: Approaches that consistently fail and their alternatives

**Update `.claude/agent-memory/execution-manager/MEMORY.md`** with:

- **Module → Source Path Mappings**: Any new E2E module → src/ path discovered
- **Selector Patterns**: ARIA quirks, force-click requirements found during source investigation
- **Known Risks**: Timing issues, environment gotchas discovered

Read each memory file first, then use the Edit tool to add new entries in-place. Do not overwrite existing entries — append new rows to tables.

**This step is NOT optional.** Execute it even if all tests passed on the first run.

## Input: $ARGUMENTS

```
/e2e-heal                    # Heal all failing tests
/e2e-heal @ModuleName        # Heal tests matching tag
/e2e-heal path/to/feature    # Heal specific feature
```

## Output

- Fixed test files with updated selectors/assertions
- Execution report with pass/fail metrics
- Review plan file (if failures remain after 3 iterations)
- Updated agent memory files with discovered patterns
- Tests marked as `test.fixme()` if unfixable
