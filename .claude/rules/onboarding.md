# Onboarding

Context for developers new to this project.

---

### Running E2E Tests for the First Time

**Context:** New developers often run `playwright test` directly and get failures.
**Decision/Finding:** The correct sequence is always:

```bash
# 1. Ensure you have valid test credentials in .env
#    TEST_USER_EMAIL=your-email@example.com
#    TEST_USER_PASSWORD=your-password

# 2. Run the full BDD suite (bddgen runs automatically)
pnpm test:bdd

# 3. View results
pnpm test:report
```

Never run `npx playwright test` directly — it skips `bddgen` and uses stale `.features-gen/` specs.

Use `pnpm test:report` for the combined Allure report when Allure results exist. Use `pnpm report:playwright` only when you specifically need the Playwright HTML report.

---

### Auth Credentials

**Context:** E2E tests require valid login credentials.
**Decision/Finding:** Set `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in your `.env` file at the project root. The `auth.setup.js` file reads from `authenticationData.js` which pulls from env vars. See `e2e-tests/.env.testing` for a template of all available env vars.

Never hardcode credentials in `authenticationData.js` or any committed file.

---

### How `bddgen` Works

**Context:** Developers are confused why test files in `.features-gen/` exist and whether to edit them.
**Decision/Finding:** `bddgen` (part of `playwright-bdd`) compiles Gherkin `.feature` files into Playwright `*.spec.js` files inside `.features-gen/`. This directory is gitignored and auto-regenerated. Never edit files in `.features-gen/` — changes are overwritten. Edit the source `.feature` and `steps.js` files instead.

---

### Adding a New E2E Module

**Context:** Step-by-step for creating tests for a new app feature.
**Decision/Finding:**

1. Create directory: `e2e-tests/features/playwright-bdd/@Modules/@YourModule/`
2. Create feature file: `@YourModule/your-feature.feature`
3. Create co-located steps: `@YourModule/steps.js`
4. Import fixtures: `import { Given, When, Then } from '../../../../playwright/fixtures.js'`
5. Tag the feature: `@your-module @your-feature` (lowercase module tag)
6. If steps are reused by other modules, move them to `shared/` instead
7. Run `pnpm test:bdd` — bddgen picks up new files automatically

---

### Adding a Cross-Module Workflow Test

**Context:** When features span multiple modules with shared data.
**Decision/Finding:** Workflow tests go in `e2e-tests/features/playwright-bdd/@Workflows/@YourWorkflow/`. Use numbered directories:

- `@0-Precondition/` — serial, creates shared data (`@precondition @cross-feature-data`)
- `@1-Consumer/` — loads predata via `Given I load predata from "workflow-name"` (`@workflow-consumer`)

Steps that touch multiple modules must be in `shared/` — never co-locate them inside an `@`-prefixed directory.

---

### Module-Specific Test Scripts

**Context:** Running tests for a single module without the full suite.
**Decision/Finding:**

```bash
pnpm test:bdd:counter    # Counter module only (serial)
pnpm test:bdd:users      # Users module only (parallel)
pnpm test:bdd:bookings   # Bookings workflow only (serial)
pnpm test:bdd:homepage   # HomePage module only (parallel)
pnpm test:bdd:auth       # Authentication tests only
pnpm test:bdd:workflows  # All @Workflows features
```

---

### Agent Pipeline — Quick Start

**Context:** Using the multi-agent test generation pipeline.
**Decision/Finding:**

1. Configure `instructions.js` in `e2e-tests/` (see `instructions.example.js`)
2. Ensure dev server is running: `pnpm dev`
3. Run `/e2e-automate` skill via Claude Code CLI
4. The skill handles 10 phases: config → process → explore → approve → generate → execute → review
5. Generated files appear in `e2e-tests/features/playwright-bdd/@Modules/` or `@Workflows/`

Available skills: `/e2e-automate`, `/e2e-plan`, `/e2e-generate`, `/e2e-heal`, `/e2e-validate`, `/e2e-process`, `/e2e-run`

---

### E2E Directory Map (Quick Reference)

```
e2e-tests/
├── features/playwright-bdd/   ← Gherkin feature files + co-located steps
│   ├── @Modules/              ← single-module tests
│   ├── @Workflows/            ← cross-module workflow tests
│   └── shared/                ← globally scoped step definitions
├── playwright/
│   ├── fixtures.js            ← custom fixtures (import from here, not playwright-bdd)
│   ├── auth.setup.js          ← two-step localStorage login
│   ├── auth-storage/          ← .auth/user.json (gitignored)
│   ├── generated/             ← seed.spec.js (exploration output)
│   └── test-data/             ← scoped JSON files (auto-created at runtime)
├── data/
│   ├── authenticationData.js  ← credentials from env vars
│   ├── testConfig.js          ← routes, timeouts, baseUrl
│   └── migrations/            ← instructions.js for agent pipeline
├── plans/                     ← generated test plans (intermediate, cleaned up)
└── reports/                   ← execution reports, review plans
```
