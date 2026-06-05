# E2E Test Automation — Agentic Architecture

## Design Principle

**Skills own orchestration. Agents are pure building blocks.**

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                 │
│                    /e2e-automate                              │
│                    /e2e-plan                                  │
│                    /e2e-heal                                  │
│                    /e2e-generate                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                    SKILLS LAYER
              (defines agent chains)
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Agent A │    │ Agent B │    │ Agent C │
    │ (pure)  │    │ (pure)  │    │ (pure)  │
    └─────────┘    └─────────┘    └─────────┘
         │               │               │
    AGENT MEMORY    AGENT MEMORY    AGENT MEMORY
   (persists across sessions)
```

- **Skills** (`.claude/skills/`) — user-facing commands that define WHICH agents to invoke and in WHAT order. Skills own the workflow logic.
- **Agents** (`.claude/agents/`) — single-responsibility units. Each agent does ONE thing well. No agent invokes another agent — only skills do that.
- **Agent Memory** (`.claude/agent-memory/`) — persistent knowledge per agent. Selectors, patterns, and fixes survive across sessions.
- **Rules** (`.claude/rules/`) — project conventions, architecture decisions, debugging gotchas. Loaded as context for all agents.

This architecture makes agents **reusable as a plugin** — anyone can create new skills with custom agent chains from the same building blocks.

## The 10-Phase Pipeline

When you run `/e2e-automate`, the skill orchestrates this flow:

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: Read e2e-tests/instructions.js                     │
│  Phase 2: Detect route (Jira URL / file path / text)         │
│                                                              │
│  Phase 3: /e2e-process                                       │
│    ├─ Jira → @agent-jira-processor → @agent-input-processor  │
│    └─ File/Text → @agent-input-processor                     │
│    Output: e2e-tests/plans/{module}-parsed.md                │
│                                                              │
│  Phase 4: /e2e-plan                                          │
│    └─ @agent-explorer → planner memory                       │
│    Output: plan.md + seed.spec.js + agent memory update      │
│                                                              │
│  Phase 5: /e2e-validate (optional)                           │
│    └─ @agent-execution-manager (seed mode)                   │
│                                                              │
│  Phase 6: ⛔ USER APPROVAL CHECKPOINT                        │
│    └─ Review plan summary, approve or modify                 │
│                                                              │
│  Phase 7: /e2e-generate                                      │
│    ├─ @agent-bdd-generator → .feature + steps.js skeleton    │
│    └─ @agent-code-generator → Playwright implementations     │
│    Output: e2e-tests/features/playwright-bdd/@Modules/...    │
│                                                              │
│  Phase 8: /e2e-heal (optional)                               │
│    ├─ @agent-execution-manager → run + triage + source-fix   │
│    └─ @agent-playwright-test-healer → MCP-based healing      │
│    (loop max 3 iterations)                                   │
│                                                              │
│  Phase 9: Cleanup intermediate plan files                    │
│  Phase 10: Quality score + formatted review summary          │
└──────────────────────────────────────────────────────────────┘
```

## How Skills Chain Agents

Each skill defines its agent chain in the SKILL.md body. Example from `/e2e-heal`:

```
Step 1: @agent-execution-manager  → run tests, triage, source-fix
Step 2: @agent-playwright-test-healer → fix remaining via MCP
Step 3: Re-run (loop max 3)
Step 4: Update agent memory with findings
```

The agents don't know about each other — the skill passes context between them.

## Data Flow: `<gen_test_data>` → `<from_test_data>`

The framework uses a **3-column data table** pattern for form filling and assertion:

```gherkin
# Form fill — generates faker values, caches them
When I fill the form with:
  | Field Name | Value           | Type            |
  | Name       | <gen_test_data> | SharedGenerated |
  | Email      | <gen_test_data> | SharedGenerated |

# Assertion — reads cached values, asserts against UI
Then the card should display:
  | Field Name | Expected Value   | Type            |
  | Name       | <from_test_data> | SharedGenerated |
  | Email      | <from_test_data> | SharedGenerated |
```

Powered by `e2e-tests/utils/stepHelpers.js` (`processDataTable` / `validateExpectations`) which handles value generation, caching, and field interaction declaratively via `FIELD_CONFIG` with `FIELD_TYPES`.

## Execution Modes

```
fullyParallel: true (global default)
│
├─ No tag needed → parallel (main-e2e project)
│   Each scenario gets a fresh browser
│
└─ @serial-execution → serial (serial-execution project, workers: 1)
    Browser page REUSED across scenarios within same feature file
    Required when: <gen_test_data> in Scenario A, <from_test_data> in Scenario B
    Required when: scenarios depend on UI state from previous scenarios
```

## Usage

### Generate tests from instructions

1. Configure `e2e-tests/instructions.js` (see `instructions.example.js` for text, Jira, CSV, workflow examples)
2. Start dev server: `pnpm dev`
3. Run: `/e2e-automate`
4. Review the plan summary at Phase 6 approval checkpoint
5. Type `1` to approve and generate BDD files
6. Run generated tests: `pnpm test:bdd`

### Plan tests for a page

```
/e2e-plan /users/add        # Explore page, discover selectors, generate plan
/e2e-plan "Login flow"       # Plan by feature description
```

### Generate tests from a plan

```
/e2e-generate e2e-tests/plans/add_user-plan.md
```

### Fix failing tests

```
/e2e-heal                    # Fix all failing tests
/e2e-heal @counter           # Fix specific module
```

### Quick test run

```
/e2e-run                     # Run all BDD tests
/e2e-run --grep @add-user    # Run specific tag
```

### Process Jira or files into test plans

```
/e2e-process https://org.atlassian.net/browse/PROJ-123
/e2e-process /path/to/test-cases.xlsx
```

## Skills (8)

| Skill            | Command                | Chain                                                        |
| ---------------- | ---------------------- | ------------------------------------------------------------ |
| **e2e-automate** | `/e2e-automate`        | Full 10-phase pipeline (all agents)                          |
| **e2e-desktop-automate** | `/e2e-desktop-automate` | Desktop MCP pipeline with spawned client-project subagents |
| **e2e-plan**     | `/e2e-plan <page>`     | `explorer` → `playwright-test-planner` memory                |
| **e2e-generate** | `/e2e-generate <plan>` | `bdd-generator` → `code-generator`                           |
| **e2e-heal**     | `/e2e-heal [target]`   | `execution-manager` ↔ `playwright-test-healer` (loop max 3) |
| **e2e-validate** | `/e2e-validate`        | `execution-manager` ↔ `playwright-test-healer` (seed mode)  |
| **e2e-process**  | `/e2e-process <input>` | `jira-processor` → `input-processor`                         |
| **e2e-run**      | `/e2e-run [filters]`   | Direct `npx bddgen && npx playwright test`                   |

## Agents (9)

| Agent                       | Model  | Purpose                                                                       |
| --------------------------- | ------ | ----------------------------------------------------------------------------- |
| `explorer`                  | sonnet | CLI browser exploration wrapper; writes seed, plan, and planner memory        |
| `playwright-test-planner`   | sonnet | Browser exploration via MCP, selector discovery, test plan + seed file        |
| `playwright-test-generator` | sonnet | MCP-based Playwright code generation from plans                               |
| `playwright-test-healer`    | sonnet | Debug and fix failing tests interactively via MCP                             |
| `bdd-generator`             | opus   | Create .feature files + steps.js skeletons (Gherkin, tags, data tables)       |
| `code-generator`            | opus   | Fill in Playwright implementations using seed file selectors + stepHelpers.js |
| `execution-manager`         | sonnet | Run tests (BDD or seed), triage, source-aware fixing, review plans            |
| `input-processor`           | sonnet | Convert files (Excel/CSV/PDF/JSON) to test plan MD via Markitdown MCP         |
| `jira-processor`            | sonnet | Fetch Jira requirements via Atlassian MCP, analyze gaps, clarify with user    |

## MCP Servers

| Server         | Agent                                         | Purpose                                          |
| -------------- | --------------------------------------------- | ------------------------------------------------ |
| playwright-mcp | planner, generator, healer, execution-manager | Browser automation                               |
| markitdown     | input-processor                               | File format conversion (Excel, CSV, PDF, etc.)   |
| atlassian      | jira-processor                                | Jira ticket fetching and requirements extraction |

## Key Utilities

| File                                   | Purpose                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `e2e-tests/utils/stepHelpers.js`       | `processDataTable`, `validateExpectations`, `FIELD_TYPES` — declarative form handling |
| `e2e-tests/utils/testDataGenerator.js` | `generateValueForField(fieldName)` — faker-based data generation                      |
| `e2e-tests/playwright/fixtures.js`     | Custom fixtures, browser reuse for serial-execution, scoped data API                  |
| `test-results/allure/results/`         | Combined Allure raw results for Playwright and optional Vitest reporting              |

## Agent Memory System

Three agents persist knowledge across sessions:

| Agent                       | What it remembers                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------- |
| **playwright-test-planner** | Navigation paths, discovered selectors per page, reusable patterns, known limitations |
| **playwright-test-healer**  | Project conventions, module selector patterns, anti-patterns, last 20 selector fixes  |
| **execution-manager**       | Module → src/ path mappings, ARIA quirks, data flow, environment risks                |

Memory files live in `.claude/agent-memory/{agent}/MEMORY.md`. Skills update memory as a mandatory final step.

## Creating Custom Skills

Any skill can chain agents in any order. Example:

```markdown
---
name: my-custom-workflow
description: My custom E2E workflow
context: fork
---

## Steps

1. Invoke `@agent-input-processor` with the file path
2. Invoke `@agent-bdd-generator` with the parsed plan
3. Invoke `@agent-code-generator` with the step skeleton
4. Invoke `@agent-execution-manager` in bdd mode
5. Report results
```

## Directory Layout

```
.claude/
├── README.md                    ← This file (architecture + usage)
├── agents/
│   ├── playwright/
│   │   ├── playwright-test-planner.md
│   │   ├── playwright-test-generator.md
│   │   └── playwright-test-healer.md
│   ├── explorer.md
│   ├── bdd-generator.md
│   ├── code-generator.md
│   ├── execution-manager.md
│   ├── input-processor.md
│   └── jira-processor.md
├── agent-memory/
│   ├── playwright-test-planner/MEMORY.md
│   ├── playwright-test-healer/MEMORY.md
│   ├── execution-manager/MEMORY.md
│   └── code-generator/MEMORY.md       ← optional project-specific implementation notes
├── skills/
│   ├── e2e-automate/SKILL.md
│   ├── e2e-desktop-automate/SKILL.md
│   ├── e2e-plan/SKILL.md
│   ├── e2e-generate/SKILL.md
│   ├── e2e-heal/SKILL.md
│   ├── e2e-validate/SKILL.md
│   ├── e2e-process/SKILL.md
│   └── e2e-run/SKILL.md
├── rules/
│   ├── architecture.md
│   ├── conventions.md
│   ├── debugging.md
│   ├── dependencies.md
│   ├── terminology.md
│   ├── workflow-patterns.md
│   └── onboarding.md
└── memory/
    └── MEMORY.md
```
