# Terminology

---

### Agent and Skill Names

Use these names consistently:

- **Skill** — user-facing command under `.claude/skills/`, for example `/e2e-automate`.
- **Agent** — single-responsibility prompt under `.claude/agents/`.
- **`explorer`** — CLI browser exploration wrapper used by `/e2e-plan` and `/e2e-automate`. It writes the seed file, plan, and planner memory.
- **`playwright-test-planner`** — planner agent/memory identity used for selector discovery patterns and Desktop/subagent planning flows.
- **`bdd-generator`** — creates `.feature` files and `steps.js` skeletons.
- **`code-generator`** — fills generated step skeletons with Playwright implementation code.
- **`execution-manager`** — runs tests, triages failures, and creates review plans.

Do not put project-specific notes under `.claude/agents/`; that directory is for actual agent definitions with YAML frontmatter.

---

### Reporting Terms

- **Allure report** — combined report opened with `pnpm test:report`; raw results live in `test-results/allure/results/` and generated report output lives in `test-results/allure/report/`.
- **Playwright report** — Playwright HTML report in `reports/playwright/`, opened with `pnpm report:playwright`.
- **BDD report** — Cucumber/BDD report generated from `reports/cucumber-bdd/report.json`, opened with `pnpm report:bdd:open` after `pnpm report:bdd`.
- **JSON report** — machine-readable Playwright JSON in `reports/json/results.json`.

Allure is the preferred human-facing combined report when available. Playwright and BDD reports remain useful for framework-specific debugging.

---

### Path Terms

Use project-relative paths in `.claude` guidance. Do not prefix project files with `/` unless explicitly documenting an absolute Unix path.

Canonical paths:

- `e2e-tests/instructions.js`
- `e2e-tests/plans/{module}-parsed.md`
- `e2e-tests/plans/{module}-{file}-plan.md`
- `e2e-tests/playwright/generated/seed.spec.js`
- `e2e-tests/features/playwright-bdd/{Category}/@{Module}/{FileName}.feature`
- `e2e-tests/playwright/test-data/{scope}.json`
- `e2e-tests/reports/review-plan-{module}-{timestamp}.md`
- `.specwright/runs/{runId}.json`
- `.specwright/runs/{runId}.log`

---

### Model and Provider Terms

Claude agent frontmatter may still use Claude-native model labels such as `sonnet` or `opus`. Desktop/OpenCode orchestration is a separate provider path and should default to `opencode` with `gpt-5.5-fast` unless the project explicitly overrides it.
