---
name: e2e-validate
description: Validate explored seed file tests before BDD generation — runs seed tests with random data and auto-heals failures.
context: fork
---

# Seed File Validation

Validate explored test cases from the seed file before proceeding with BDD generation.

## Agent Chain

```
@agent-execution-manager (seed mode — run seed.spec.js)
  ↕ loop (max 3 iterations)
@agent-playwright-test-healer (fix selector/timing failures)
```

## Steps

### Step 1: Execute Seed File

Invoke `@agent-execution-manager` in **seed mode**.
It runs `e2e-tests/playwright/generated/seed.spec.js` with random test data.

### Step 2: Check Results

- `all_passed` → report "Ready for BDD generation"
- `needs_healing` → proceed to Step 3
- `needs_review` → report issues to user

### Step 3: Heal Failures

Invoke `@agent-playwright-test-healer` with the healable failures.
The healer fixes selectors in the seed file.

### Step 4: Re-run (Loop)

Invoke `@agent-execution-manager` seed mode again.

- All pass → done
- Still failing and iterations < 3 → go to Step 3
- Exhausted → report remaining failures

## Output

```
✅ READY FOR BDD GENERATION — all seed tests passing
⚠️ NEEDS REVIEW — {n} failures remain after 3 healing iterations
```
