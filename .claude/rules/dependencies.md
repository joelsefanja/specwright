# Dependencies

---

### `playwright-bdd` v8+

**Context:** Core E2E test framework.
**Decision/Finding:** Sits on top of `@playwright/test`. Provides Gherkin `.feature` file support, `bddgen` CLI to compile features to Playwright specs, and path-based tag scoping. Key behaviours:

- `@`-prefixed directory names in step file paths become scoping tags
- `bddgen` must run before `playwright test` to compile `.features-gen/`
- Import `createBdd` from `'playwright-bdd'` in `fixtures.js` only; step files import from fixtures
- `cucumberReporter` available for BDD JSON output

---

### `@faker-js/faker` v10

**Context:** Test data generation for E2E tests.
**Decision/Finding:** ESM exports — import as `import { faker } from '@faker-js/faker'`. Used for generating realistic test data (names, emails, IDs) in step definitions and seed files.

---

### Zustand + TanStack Query

**Context:** State management.
**Decision/Finding:** Zustand for lightweight client state (e.g., Counter store), TanStack React Query for server state and data fetching (e.g., Users page). No Redux in this template. E2E tests interact with the UI, not stores directly.

---

### Vite 7

**Context:** Build tool and dev server.
**Decision/Finding:** Dev server runs on port 5173. Module Federation enabled via `@module-federation/vite`. The `playwright.config.ts` webServer config starts `pnpm dev` automatically when `BASE_URL` is localhost.

---

### MCP Servers (Agent Pipeline)

**Context:** External tools used by the agent pipeline.
**Decision/Finding:**

- `playwright-mcp` — Browser automation for exploration and test generation (planner, generator, healer)
- `markitdown` — File format conversion (Excel, CSV, PDF → markdown) for input-processor
- `atlassian` — Jira ticket fetching for jira-processor

These are configured in agent frontmatter (`mcp_servers` field) and activated when the agent runs.
