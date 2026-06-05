---
name: e2e-plan
description: Create a test plan for a web page or feature using browser exploration, selector discovery, and scenario design.
argument-hint: <page-url-or-feature>
---

# Test Planning Skill

Invoke the `@explorer` agent with the target from `$ARGUMENTS` (URL or feature description). `@explorer` is the CLI exploration wrapper and writes to `playwright-test-planner` memory.

The `@explorer` agent will:
1. Read auth strategy from `e2e-tests/.env.testing`
2. Authenticate if required
3. Open the browser and explore the target page
4. Discover UI elements and validated selectors
5. Write `seed.spec.js`, test plan, and update agent memory

## Usage

```
/e2e-plan /home                        # Plan tests for a page
/e2e-plan http://localhost:5173/users  # Plan tests for a URL
/e2e-plan "Login flow"                 # Plan tests for a feature
```

## Input: $ARGUMENTS

Pass the page URL or feature description to the `@explorer` agent as-is.
