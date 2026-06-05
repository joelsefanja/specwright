# Architecture Decisions

---

### Path-Based Tag Scoping (playwright-bdd v8+)

**Context:** Investigated after "missing step definition" errors when features tried to use steps from other modules.
**Decision/Finding:** In playwright-bdd v8+, `@`-prefixed directory names in a step file's path are extracted as tags and applied as an AND expression. Steps in `@Modules/@Authentication/steps.js` are ONLY visible to features that match ALL tags: `@Modules AND @Authentication`.
**Reasoning:** Cross-module reusable steps MUST live in `shared/` (no `@` prefix = globally scoped). This is intentional playwright-bdd behaviour, not a bug.

---

### 3-Layer Test Data Persistence

**Context:** Need to share generated test data across scenarios and feature files without re-generating.
**Decision/Finding:** Three layers in priority order:

1. `page.testData` — scenario-scoped, cleared before each scenario via `Before` hook
2. `globalThis.__rt_featureDataCache` — in-memory, survives scenario boundaries within a feature file
3. `e2e-tests/playwright/test-data/{scope}.json` — file-backed, survives worker restarts and feature switches

Module name auto-extracted from directory path: `@Modules/@HomePage/` → key `homepage`
**Reasoning:** Parallel workers can't share in-memory state, so file-backed persistence is the only reliable cross-worker mechanism.

---

### Cache Key Auto-Derivation (`featureKey`)

**Context:** New workflows needed automatic cache key assignment.
**Decision/Finding:** `featureKey` is auto-derived from the module name at two points:

1. **Before hook**: calls `extractModuleName(featureUri)` and sets `page.featureKey` if not already set
2. **`I load predata from {string}` step**: uses `scopeName` as the cache key fallback

Existing hardcoded keys still work — they explicitly set `page.featureKey` before auto-derivation applies. New workflows don't need any manual cache key setup.
**Reasoning:** Eliminates a manual step. `extractModuleName()` already existed — just needed to use it as the default.

---

### Global Setup / Teardown Marker Strategy

**Context:** Need clean test data at the start of each full test run, but preserve data across feature files within the same run.
**Decision/Finding:** `global.setup.js` uses a `.cleanup-done` marker file. If no marker → new run → delete scoped data files and create marker. If marker exists → run in progress → preserve data. `global.teardown.js` deletes the marker at the end.
**Reasoning:** Purely deterministic — no time-based logic. Prevents stale data from previous runs while allowing data sharing within a run.

---

### Shared Step Files Are Globally Scoped

**Context:** Some steps (navigation, auth) are needed by multiple modules.
**Decision/Finding:** Place these in `e2e-tests/features/playwright-bdd/shared/`. Files there have no `@`-prefixed path segments, so playwright-bdd makes them globally available to all features.
Files: `auth.steps.js`, `navigation.steps.js`, `common.steps.js`, `global-hooks.js`
`global-hooks.js` is auto-loaded via config glob — do NOT import it manually.

---

### Default Parallel, Serial Opt-Out

**Context:** Most test scenarios should be independent and stateless. Serial execution is the exception.
**Decision/Finding:** `fullyParallel: true` is the global default — scenarios run in parallel. Only features tagged `@serial-execution` opt out (workers: 1, browser reused across scenarios). No `@parallel-scenarios-execution` tag — parallel is the default, not an opt-in.

---

### Feature-Level Browser Reuse

**Context:** When `@serial-execution` is used, scenarios depend on previous scenario state (Zustand store, form data). A fresh browser per scenario resets all client-side state.
**Decision/Finding:** For `serial-execution` project, the browser page persists across scenarios within the same feature file. A new page is created only when `testInfo.file` changes. Configured via `REUSABLE_PROJECTS` array in `fixtures.js`. All other projects get standard per-scenario isolation.

---

### Skills Own Orchestration, Agents Are Pure

**Context:** Making agents reusable as a general plugin across projects.
**Decision/Finding:** Skills (`.claude/skills/`) define the agent chain and control execution flow. Agents (`.claude/agents/`) are pure single-responsibility units — no agent invokes another agent via `@agent-xxx`. Anyone can create new skills with custom agent chains from the same building blocks.

---

### Agent Memory Persistence

**Context:** Healer, planner, and execution-manager agents need to remember past fixes and selector patterns.
**Decision/Finding:** Agents with `memory: project` frontmatter use `.claude/agent-memory/<agent-name>/MEMORY.md`. Agents read this at start and write to it after completing work. The main project `MEMORY.md` is separate — agents must NOT write to it.
Agents using memory: `playwright-test-healer`, `playwright-test-planner`, `execution-manager`

---

### Multi-Agent 10-Phase Pipeline

**Context:** The E2E test generation pipeline defined in `/e2e-automate` skill.
**Decision/Finding:** Pipeline flows through 10 phases:

1. Read `instructions.js`
2. Detect route (jira/file/text)
3. Process input (`input-processor` or `jira-processor`)
4. Explore app (`playwright-test-planner`)
5. Validate exploration (optional, `execution-manager` seed mode)
6. **User approval checkpoint** (mandatory pause)
7. Generate BDD (`bdd-generator` → `code-generator`)
8. Execute & heal (optional, `execution-manager` → `playwright-test-healer`)
9. Cleanup
10. Quality review (inline in skill)

Agent `.md` files in `.claude/agents/` are system prompts, not executable code.
