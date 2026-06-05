# E2E Testing Framework

## Overview

**playwright-bdd** (v8+) BDD-style end-to-end testing with AI-powered test generation and self-healing.

- Gherkin `.feature` files compiled to Playwright specs via `bddgen`
- Path-based tag scoping for module isolation
- Default parallel execution, `@serial-execution` opt-out with browser reuse
- Workflow support: `precondition → workflow-consumers` pattern with 3-layer data persistence
- `processDataTable` / `validateExpectations` utilities for declarative form handling
- 8 AI agents + 7 Claude Code skills for automated test generation and healing
- Auth strategy: `email-password`, `oauth`, or `none` — configured via `.env.testing`

## Quick Start

```bash
# 1. Install dependencies + Playwright browsers
pnpm install && pnpx playwright install

# 2. Configure auth in e2e-tests/.env.testing
AUTH_STRATEGY=email-password
TEST_USER_EMAIL=your-email@example.com
TEST_USER_PASSWORD=your-password

# (or for OAuth)
AUTH_STRATEGY=oauth
TEST_USER_EMAIL=your-email@example.com
OAUTH_STORAGE_KEY=your-app-storage-key

# 3. Start dev server
pnpm dev

# 4. Run authentication tests (out-of-the-box)
pnpm test:bdd:auth

# 5. View report
pnpm report:playwright
```

**Never run `npx playwright test` directly** — it skips `bddgen` and uses stale specs.

## Project Configuration

| Project              | Purpose                    | Behavior                                                           |
| -------------------- | -------------------------- | ------------------------------------------------------------------ |
| `setup`              | Auth session creation       | Runs first, creates auth session                                   |
| `auth-tests`         | Login/logout tests          | Clean browser state, no storageState                               |
| `serial-execution`   | Stateful features           | `@serial-execution` tag, workers: 1, browser reused across scenarios |
| `precondition`       | Workflow setup              | `@precondition` tag, serial (workers: 1), runs before consumers    |
| `workflow-consumers` | Workflow verification       | `@workflow-consumer` tag, parallel, depends on `precondition`      |
| `run-workflow`       | Single workflow (targeted)  | All `@Workflows/**`, serial filesystem order — use with `--grep`   |
| `main-e2e`           | All other module tests      | `fullyParallel: true` (default), storageState from setup           |

## Directory Structure

```
e2e-tests/
├── features/playwright-bdd/
│   ├── @Modules/                   ← Single-module tests
│   │   └── @Authentication/        ← Out-of-the-box auth tests (7 scenarios)
│   ├── @Workflows/                 ← Cross-module workflow tests
│   │   └── @YourWorkflow/
│   │       ├── @0-Precondition/    ← Serial, creates shared data (@precondition)
│   │       ├── @1-Consumer/        ← Loads predata, runs parallel (@workflow-consumer)
│   │       └── @2-Consumer/
│   └── shared/                     ← Globally scoped steps (no @ prefix)
│       ├── auth.steps.js
│       ├── navigation.steps.js
│       ├── common.steps.js
│       └── global-hooks.js         ← Auto-loaded, NEVER import manually
├── playwright/
│   ├── fixtures.js                 ← Custom fixtures + browser reuse (import from HERE)
│   ├── auth.setup.js               ← Reads AUTH_STRATEGY from env, delegates to strategy
│   ├── auth-strategies/
│   │   ├── email-password.js       ← Email + password login
│   │   └── oauth.js                ← OAuth via localStorage injection
│   ├── auth-storage/.auth/         ← Saved auth state (gitignored)
│   ├── generated/                  ← Seed files from exploration
│   └── test-data/                  ← Scoped JSON files (auto-created)
├── utils/
│   ├── stepHelpers.js              ← processDataTable, validateExpectations, FIELD_TYPES
│   └── testDataGenerator.js        ← Faker-based value generation
├── data/
│   ├── authenticationData.js       ← Credentials from env vars (never hardcoded)
│   └── testConfig.js               ← Routes, timeouts, baseUrl
├── scripts/
│   └── generate-bdd-report.js      ← Generates HTML cucumber report
├── instructions.js                 ← Agent pipeline config (add your entries)
├── instructions.example.js         ← Example configs (text, Jira, CSV, workflow)
└── .env.testing                    ← Environment variable template
```

## Running Tests

```bash
## Predefined scripts
pnpm test:bdd               # Full suite: modules + workflows (recommended)
pnpm test:bdd:all           # Everything including auth tests
pnpm test:bdd:auth          # Authentication tests only
pnpm test:bdd:serial        # Serial execution features only
pnpm test:bdd:workflows     # All workflows only (precondition → consumers)
pnpm test:bdd:workflow      # Single targeted workflow (pair with --grep)
pnpm test:bdd:debug         # Debug mode (PWDEBUG)

## Run by tag
pnpm bddgen && npx playwright test --project setup --project main-e2e --grep @your-tag
pnpm bddgen && npx playwright test --project setup --project serial-execution --grep @your-serial-tag

## Run a specific workflow
pnpm bddgen && npx playwright test --project setup --project precondition --project workflow-consumers --grep @FavoritesWorkflow

## Run by file
pnpm bddgen && npx playwright test --project setup --project main-e2e \
  ".features-gen/e2e-tests/features/playwright-bdd/@Modules/@YourModule/feature.spec.js"

## Run headed
pnpm bddgen && npx playwright test --project setup --project main-e2e --grep @tag --headed

## Run single scenario by title
pnpm bddgen && npx playwright test --project setup --project main-e2e -g "Scenario title"

## Reports
pnpm report:playwright       # View HTML report
pnpm report:bdd              # Generate BDD cucumber HTML report
pnpm report:bdd:open         # Open BDD report in browser
pnpm test:clean              # Clean reports + .features-gen + test-data
```

**Project routing tip:**
- `@serial-execution` features → `--project serial-execution`
- `@Authentication` features → `--project auth-tests`
- `@precondition` features → `--project precondition`
- `@workflow-consumer` features → `--project workflow-consumers`
- Everything else → `--project main-e2e`

## Modules vs Workflows

Specwright organizes tests into two categories: **Modules** and **Workflows**. Choosing the right one determines how your tests are scoped, isolated, and executed.

### Modules (`@Modules/`)

A Module tests a **single page or feature area** of your application in isolation.

**When to use:**
- Testing one page's UI (e.g., HomePage, UserProfile, Settings)
- Testing a self-contained feature (e.g., Authentication, Search, Notifications)
- Scenarios are independent — each can run without the others
- No shared state between scenarios (or state shared only within the same feature file via `@serial-execution`)

**Examples:**
- `@Modules/@HomePage/` — year tabs, pagination, show cards, search
- `@Modules/@Authentication/` — sign in, sign out, protected routes
- `@Modules/@UserProfile/` — edit name, change avatar, delete account

**Structure:**
```
@Modules/
├── @HomePage/
│   ├── homepage.feature      ← Gherkin scenarios for the home page
│   └── steps.js              ← Step definitions (scoped to @HomePage only)
├── @Authentication/
│   ├── authentication.feature
│   └── steps.js
└── @Settings/
    ├── settings.feature
    └── steps.js
```

**Key rules:**
- Each module gets its own directory under `@Modules/`
- Steps in `@Modules/@HomePage/steps.js` are **only visible** to features inside `@HomePage/` (path-based tag scoping)
- If a step is needed by multiple modules, move it to `shared/`
- Modules run in **parallel by default** — add `@serial-execution` only if scenarios share state

### Workflows (`@Workflows/`)

A Workflow tests a **cross-module user journey** that spans multiple pages or features with shared data.

**When to use:**
- Testing an end-to-end user journey across multiple pages
- Scenario B depends on data created by Scenario A (e.g., "create a list" then "add items to that list")
- Data must survive across feature files (not just scenarios within one file)
- The flow mimics a real user session: sign in → do something → verify elsewhere

**Examples:**
- Sign in → add a show to favorites → verify on favorites page
- Create a custom list → add shows → verify list detail
- Register → set up profile → invite team member → verify invite received

**Structure:**
```
@Workflows/
└── @FavoritesWorkflow/
    ├── @0-Precondition/          ← Runs FIRST (serial), creates shared data
    │   ├── setup.feature         ← @precondition @cross-feature-data @serial-execution
    │   └── steps.js
    ├── @1-VerifyFavorites/       ← Runs AFTER precondition, loads shared data
    │   ├── verify.feature        ← @workflow-consumer
    │   └── steps.js
    └── @2-VerifyCount/
        ├── count.feature         ← @workflow-consumer
        └── steps.js
```

**Key rules:**
- Precondition directories start with `@0-` and use `@serial-execution` + `@precondition` + `@cross-feature-data` tags
- Consumer directories start with `@1-`, `@2-`, etc. and use `@workflow-consumer` tag
- Consumers load shared data with: `Given I load predata from "workflow-name"`
- Data flows via 3-layer persistence: `page.testData` → `featureDataCache` → scoped JSON files
- Steps that touch multiple modules **must** live in `shared/`, not inside `@`-prefixed directories

**Running workflows:**
```bash
pnpm test:bdd:workflows                             # All workflows
pnpm test:bdd:workflow --grep @FavoritesWorkflow    # Single workflow
```

### Quick Decision Guide

| Question | Module | Workflow |
|----------|--------|----------|
| Tests one page/feature? | Yes | No |
| Tests a multi-page user journey? | No | Yes |
| Scenarios are independent? | Yes | Not always |
| Needs data from another feature file? | No | Yes |
| Can run in any order? | Yes | No (precondition → consumers) |
| Default execution | Parallel | Precondition serial, consumers parallel |

### Configuring in `instructions.js`

```javascript
// Module — single page
{
  moduleName: '@HomePage',
  category: '@Modules',
  fileName: 'homepage',
  pageURL: '/home',
  // ...
}

// Workflow — cross-module journey
{
  moduleName: '@FavoritesWorkflow',
  category: '@Workflows',
  subModuleName: ['@0-Precondition', '@1-VerifyFavorites'],
  fileName: 'favorites_workflow',
  pageURL: '/home',
  // ...
}
```

The `category` field determines where generated files are placed: `@Modules/@HomePage/` or `@Workflows/@FavoritesWorkflow/`.

---

## Writing Tests

### Feature Files

```gherkin
@module-name
Feature: Module Description
  Background:
    Given I am logged in
    When I navigate to "PageName"

  Scenario: Happy path
    When I fill the form with:
      | Field Name | Value           | Type            |
      | Name       | <gen_test_data> | SharedGenerated |
      | Email      | <gen_test_data> | SharedGenerated |
    And I click the submit button
    Then I should see the success message
```

### Step Definitions (with processDataTable)

```javascript
import { When, Then, expect } from '../../../../playwright/fixtures.js';
import { FIELD_TYPES, processDataTable, validateExpectations } from '../../../../utils/stepHelpers.js';

const FIELD_CONFIG = {
  Name: { type: FIELD_TYPES.FILL, testID: 'user-name' },
  Email: { type: FIELD_TYPES.FILL, testID: 'user-email' },
};

const VALIDATION_CONFIG = {
  Name: { type: FIELD_TYPES.TEXT_VISIBLE, testID: 'display-name' },
  Email: { type: FIELD_TYPES.TEXT_VISIBLE, testID: 'display-email' },
};

const fieldMapping = { Name: 'name', Email: 'email' };

When('I fill the form with:', async ({ page }, dataTable) => {
  await processDataTable(page, dataTable, { mapping: fieldMapping, fieldConfig: FIELD_CONFIG });
});

Then('I should see the details:', async ({ page }, dataTable) => {
  await validateExpectations(page, dataTable, { mapping: fieldMapping, validationConfig: VALIDATION_CONFIG });
});
```

### Data Table Placeholders

| Placeholder        | Used in         | Meaning                        |
| ------------------ | --------------- | ------------------------------ |
| `<gen_test_data>`  | Form fill steps | Generate faker value, cache it |
| `<from_test_data>` | Assertion steps | Read cached value              |
| Static value       | Both            | Use as-is                      |

### When to Use `@serial-execution`

Add when:
- `<gen_test_data>` in Scenario A and `<from_test_data>` in Scenario B
- Scenarios rely on UI state from previous scenarios

No tag needed (parallel by default) when:
- Each scenario is self-contained
- Scenarios only READ predata independently

### Adding a New Module

1. Create: `e2e-tests/features/playwright-bdd/@Modules/@YourModule/`
2. Add: `your-feature.feature` + `steps.js`
3. Import: `import { When, Then } from '../../../../playwright/fixtures.js'`
4. For data tables: `import { FIELD_TYPES, processDataTable } from '../../../../utils/stepHelpers.js'`
5. Run: `pnpm test:bdd`

### Adding a Workflow

1. Create: `e2e-tests/features/playwright-bdd/@Workflows/@YourWorkflow/`
2. `@0-Precondition/` — serial, creates data (`@precondition @cross-feature-data @serial-execution`)
3. `@1-Consumer/` — loads predata via `Given I load predata from "workflow-name"` (`@workflow-consumer`)
4. Run: `pnpm test:bdd:workflows` or `pnpm test:bdd:workflow --grep @YourWorkflow`

## Auth Strategies

Auth strategy is set in `e2e-tests/.env.testing` via `AUTH_STRATEGY`. The `auth.setup.js` reads this and delegates to the appropriate strategy.

### `email-password` (default)

Standard username/password login flow.

```
AUTH_STRATEGY=email-password
TEST_USER_EMAIL=your-email@example.com
TEST_USER_PASSWORD=your-password
```

### `oauth`

Bypasses the OAuth popup by injecting a pre-built user object directly into `localStorage`. Requires a storage key the app uses to read the auth state.

```
AUTH_STRATEGY=oauth
TEST_USER_EMAIL=your-email@example.com
OAUTH_STORAGE_KEY=your-app-auth-key    # localStorage key the app reads auth from
TEST_USER_NAME=Display Name            # optional — derived from email if blank
TEST_USER_PICTURE=                     # optional — auto-generated SVG initials if blank
```

Optional OAuth overrides:
```
OAUTH_SIGNIN_PATH=/signin              # default: /signin
OAUTH_BUTTON_TEST_ID=google-signin-btn # fallback: click-based login
OAUTH_POST_LOGIN_URL=**/               # default: **/
```

### Split-auth (sign in remotely, test locally)

Set `AUTH_BASE_URL` when signin only works on a hosted host but you want tests + coverage to run against `localhost`. The auth strategy signs in at `AUTH_BASE_URL`, then rewrites the captured `storageState` so tokens land at `BASE_URL`. Cookies that don't match `BASE_URL` are stripped, and the `auth-tests` project automatically targets `AUTH_BASE_URL` (so its scenarios exercise the real signin UI, not the empty local shell).

```
BASE_URL=http://localhost:3000
AUTH_BASE_URL=https://auth.example.com
CHROME_ARGS="--no-sandbox,--disable-dev-shm-usage,--disable-web-security,--disable-features=IsolateOrigins"
```

`--disable-web-security` is required because Chromium treats `Origin` as a forbidden header — overriding it from JS won't work, so CORS must be relaxed at launch instead. See [`docs/SPLIT-AUTH.md`](../../docs/SPLIT-AUTH.md) for the full design, caveats, and what doesn't work and why.

### `none`

No authentication — tests run without any auth setup. The `setup` project is skipped entirely.

```
AUTH_STRATEGY=none
```

## Agent Pipeline

| Command                | What it does                                                                   |
| ---------------------- | ------------------------------------------------------------------------------ |
| `/e2e-automate`        | Full 10-phase pipeline: config → explore → plan → approve → generate → execute |
| `/e2e-plan <page>`     | Explore a page, discover selectors, generate test plan                         |
| `/e2e-generate <plan>` | Generate .feature + steps.js from a plan                                       |
| `/e2e-heal`            | Run tests, diagnose failures, auto-heal                                        |
| `/e2e-run`             | Quick test execution with optional filters                                     |
| `/e2e-validate`        | Validate seed file tests before BDD generation                                 |
| `/e2e-process <input>` | Process Jira/files into test plan markdown                                     |

Configure in `e2e-tests/instructions.js` (see `instructions.example.js` for examples).

**Key `instructions.js` fields:**

| Field                | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `moduleName`         | Target module directory (e.g. `"@HomePage"`)                                                   |
| `category`           | `"@Modules"` or `"@Workflows"`                                                                 |
| `fileName`           | Output filename stem (e.g. `"homepage"` → `homepage.feature`)                                  |
| `pageURL`            | Starting URL for browser exploration                                                           |
| `instructions`       | Free-text test scenario descriptions                                                           |
| `explore`            | Enable live browser exploration (Phase 4)                                                      |
| `autoApprove`        | `true` skips the Phase 6 user approval prompt and proceeds to BDD generation automatically. Default: `false` |
| `runExploredCases`   | Run seed tests before BDD generation (Phase 5)                                                 |
| `runGeneratedCases`  | Run generated BDD tests after creation (Phase 8)                                               |

**Tip:** Set `PIPELINE_TICKET_ID` in `.env.testing` to automatically prepend your org's ticket ID to all pipeline runs (useful when hooks require a Jira reference).

## Troubleshooting

| Problem                              | Fix                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------- |
| "Step not found" after editing steps | `rm -rf .features-gen/ && pnpm test:bdd`                                   |
| Auth failures                        | `rm -f e2e-tests/playwright/auth-storage/.auth/user.json && pnpm test:bdd` |
| Cross-module steps not visible       | Move from `@Module/steps.js` to `shared/`                                  |
| Duplicate hook errors                | Never import `global-hooks.js` manually                                    |
| Browser launch failures              | `pnpx playwright install`                                                  |
| Workflow consumers run before precondition | Ensure `@precondition` tag is present on setup feature              |

## Environment Variables

| Variable                 | Default                 | Description                                               |
| ------------------------ | ----------------------- | --------------------------------------------------------- |
| `BASE_URL`               | `http://localhost:5173` | Application URL                                           |
| `AUTH_STRATEGY`          | `email-password`        | Auth mode: `email-password`, `oauth`, or `none`           |
| `TEST_USER_EMAIL`        | —                       | Login email (email-password and oauth)                    |
| `TEST_USER_PASSWORD`     | —                       | Login password (email-password only)                      |
| `TEST_2FA_CODE`          | —                       | 2FA OTP code (email-password + 2FA only)                  |
| `OAUTH_STORAGE_KEY`      | —                       | localStorage key the app reads auth from (oauth only)     |
| `OAUTH_SIGNIN_PATH`      | `/signin`               | Sign-in page path (oauth fallback)                        |
| `OAUTH_BUTTON_TEST_ID`   | —                       | Sign-in button testId (oauth click-based fallback)        |
| `OAUTH_POST_LOGIN_URL`   | `**/`                   | URL pattern to wait for after login (oauth)               |
| `TEST_USER_NAME`         | derived from email      | Display name for oauth user object                        |
| `TEST_USER_PICTURE`      | auto SVG initials       | Avatar URL for oauth user object                          |
| `PIPELINE_TICKET_ID`     | —                       | Jira ticket ID prepended to all pipeline runs             |
| `HEADLESS`               | `true`                  | Headless browser mode                                     |
| `TEST_TIMEOUT`           | `90000`                 | Test timeout (ms)                                         |
| `ENABLE_SCREENSHOTS`     | `true`                  | Screenshot on failure                                     |
| `ENABLE_VIDEO_RECORDING` | `false`                 | Video on failure                                          |
| `ENABLE_TRACING`         | `false`                 | Playwright traces                                         |
