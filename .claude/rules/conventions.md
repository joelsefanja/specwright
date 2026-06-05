# Conventions

---

### BDD Feature File — Behavior Only

**Context:** Feature files are specifications — they must remain readable independently of project management.
**Decision/Finding:** Feature files describe behavior only. No project management tags (Jira refs, sprint numbers, ticket IDs). These belong in CLI args or config files, not in `.feature` files.

---

### BDD Tagging Convention

| Tag Type  | Purpose            | Example                                                      | Required in        |
| --------- | ------------------ | ------------------------------------------------------------ | ------------------ |
| Module    | Which app page     | `@homepage`, `@authentication`, `@counter`                   | All features       |
| Feature   | Specific behaviour | `@login`, `@navigation`, `@filter`                           | All features       |
| Scope     | Cross-cutting      | `@workflow`                                                  | `@Workflows/` only |
| Execution | Run group          | `@serial-execution`, `@smoke`                                | As needed          |
| Auth      | Auth handling      | `@login-logout`                                              | Auth tests only    |
| Data      | Data sharing       | `@cross-feature-data`, `@prerequisite`, `@workflow-consumer` | Workflows only     |

**Execution defaults:**

- Parallel is the default (`fullyParallel: true` globally). No tag needed for parallel.
- `@serial-execution` opts out — forces 1 worker with browser reuse across scenarios.
- Only use `@serial-execution` when scenarios share state (data or UI) with each other.

**Data Table Placeholders:**

- `<gen_test_data>` — used in form fill steps (generates new faker value, caches it)
- `<from_test_data>` — used in assertion steps (reads previously generated value from cache)

---

### Step Definition Placement Rule

**Context:** playwright-bdd v8+ path-based tag scoping means placement determines visibility.
**Decision/Finding:**

- Steps needed by ONE module → co-locate as `steps.js` next to the `.feature` file
- Steps needed by MULTIPLE modules → place in `e2e-tests/features/playwright-bdd/shared/`
- Never place reusable steps inside an `@`-prefixed directory

---

### Import from Fixtures, Not playwright-bdd Directly

**Context:** Custom fixtures extend playwright-bdd's `test` object with project-specific data.
**Decision/Finding:** Always import `Given`, `When`, `Then`, `Before`, `After`, `expect` from the fixtures file:

```javascript
import { Given, When, Then, Before, After, expect } from '../../../../playwright/fixtures.js';
```

Never import directly from `'playwright-bdd'` or `'@cucumber/cucumber'` in step files.
**Reasoning:** The fixtures file wraps playwright-bdd and injects `authData`, `testConfig`, `testData`, `scenarioContext`.

---

### Feature Directory Naming

**Context:** playwright-bdd extracts `@`-prefixed directory names as tags.
**Decision/Finding:** Module directories use `@` prefix (`@Modules/`, `@Workflows/`, `@Authentication/`). The `shared/` directory intentionally has no `@` prefix to remain globally scoped.

- New module directories → inside `@Modules/`
- Cross-module flows → inside `@Workflows/`
- Reusable steps → inside `shared/`

---

### Agent `.md` File Format

**Context:** All agent definitions live in `.claude/agents/`.
**Decision/Finding:** Agent files are markdown — they contain the system prompt and optional YAML frontmatter. Frontmatter keys: `name`, `description`, `model` (sonnet/opus), `color`, `memory` (`project` for persistent memory), `mcp_servers`. Agents are pure — no `@agent-xxx` invocations inside agent files. Skills own orchestration.

---

### 3-Column Data Table Format

**Context:** Standardized data table format for all BDD scenarios.
**Decision/Finding:** All Gherkin data tables use 3 columns: `Field Name | Value | Type`. Type values: `Static` (known value), `SharedGenerated` (generated, reused across scenarios), `Dynamic` (generated, used once).
