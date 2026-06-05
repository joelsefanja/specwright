# Workflow Patterns

Cross-phase patterns for `@Workflows` test suites that require data (localStorage, cookies, app state) to survive between precondition and consumer phases.

---

### Per-Phase Project Isolation for Workflows

**Context:** Running `@0-Precondition` and `@1-Consumer` phase files under a single Playwright project with `workers: 1` caused `bddTestData not found` errors at runtime.
**Decision/Finding:** When a single worker is reused across phase spec files, playwright-bdd's `$bddContext` worker fixture holds stale data from the previous file. The fix is to run each phase in its OWN Playwright project so each phase gets a fresh worker pool:

```bash
npx playwright test --project setup --project precondition --project workflow-consumers --grep "@MyWorkflow"
```

The project chain is:
- `setup` — creates auth session (runs once, all projects consume it via storageState)
- `precondition` — runs `@precondition @cross-feature-data` tests, `workers: 1`, fresh worker
- `workflow-consumers` — runs `@workflow-consumer` tests, `fullyParallel: true`, each file gets its own worker

**Reasoning:** Each Playwright project runs in its own worker pool. Moving across projects guarantees a clean process — no `$bddContext` leakage between `@0-*` and `@1-*` spec files.

**Do NOT use:** `--project run-workflow` for any workflow, including 3+ phase workflows with intermediate producers. `run-workflow` uses `workers: 1` which reuses the same OS process across all phase spec files — this causes playwright-bdd's `$bddContext` worker fixture to leak from Phase 0 into Phase 1, producing `bddTestData not found` errors. The `workflow-consumers` project avoids this because `fullyParallel: true` (without a workers cap) gives each spec file its own fresh process.

**3+ phase workflows with an intermediate producer** (e.g. `@0-Create → @1-Mutate → @2-Verify`): Phase 1 and Phase 2 both land in `workflow-consumers` and start concurrently. Handle the ordering with the **separate scope** pattern:

- Phase 1 writes its output to a DIFFERENT scope key (e.g. `listworkflow-complete`) instead of overwriting the Phase 0 scope (`listworkflow`)
- Phase 2 polls for `listworkflow-complete` via `Given I load predata from "listworkflow-complete"` — `workflow.steps.js` polls up to 60 s for the file to appear, so Phase 2 blocks until Phase 1 finishes writing it
- The Phase 0 scope file (`listworkflow.json`) already exists when Phase 2 starts; if Phase 2 loaded that file it would see Phase 0's stale data (before Phase 1's mutations)

**Scope naming convention:**
```
{workflowname}           ← Phase 0 writes here
{workflowname}-complete  ← Phase 1 (intermediate) writes here; Phase 2 loads from here
```

---

### Cross-Phase localStorage Persistence

**Context:** Precondition scenarios that mutate `localStorage` (e.g., user creates a custom list, saves a draft, toggles a setting) found their writes invisible in consumer scenarios. Tests expecting the created state in Phase 1 got empty state instead.
**Decision/Finding:** `storageState` is a snapshot taken at auth-setup time (typically only auth keys like `app-auth-token`). Data written to `localStorage` DURING test phases is NOT captured — each new browser context starts fresh from `storageState`. Phase 0's writes are discarded when Phase 1 spins up a new context.

**Fix:** Snapshot localStorage explicitly at end of precondition via the 3-layer file-backed persistence (`saveScopedTestData`), then restore it in the consumer's `Before` hook using `page.addInitScript()` BEFORE the page script runs.

**MANDATORY — snapshot localStorage when the phase creates client-side state:** If a phase creates objects in any localStorage-backed store (Zustand, Redux Persist, custom persistence, etc.), those objects only exist in that browser context. A consumer phase starts with a fresh browser — it will see an empty store unless you snapshot and restore the relevant localStorage keys. Always include them in `saveScopedTestData`.

---

#### Pattern: First-phase snapshot (`@0-Precondition/steps.js`, tagged `@precondition`)

Snapshot localStorage at the end of the precondition step (or in a dedicated save step). **Include all localStorage keys the app mutated** — consumer phases need the full store state restored, not just scalar IDs.

```javascript
import { After } from '<path>/fixtures.js';
import { saveScopedTestData } from '<path>/fixtures.js';

// After a successful precondition, snapshot the localStorage keys the app wrote.
// Saves into e2e-tests/playwright/test-data/{scope}.json (cross-worker safe).
After({ tags: '@precondition' }, async ({ page }, scenario) => {
  if (scenario.result?.status !== 'passed') return;
  // Capture every localStorage key the app mutated during this phase.
  // Without this, consumer phases start with an empty store and cannot see created objects.
  const snapshot = await page.evaluate(() => ({
    'app-store-key': JSON.parse(localStorage.getItem('app-store-key') || 'null'),
    // ...any other keys the precondition mutated
  }));
  saveScopedTestData('<workflow-scope>', {
    // Scalar predata (IDs, names) for use in steps
    createdId: /* captured from URL or UI */,
    // Full localStorage snapshot for consumer restore
    localStorage: snapshot,
  });
});
```

#### Pattern: Intermediate-phase snapshot (`@N-Phase/steps.js`, tagged `@workflow-consumer @cross-feature-data`)

Intermediate phases (load predata AND save for a successor) are NOT tagged `@precondition` — that would route them into the serial `precondition` project and cause `$bddContext` leaks. Instead the hook matches on `@workflow-consumer`; path-based scoping restricts it to this phase's scenarios.

**Write to a DIFFERENT scope key** than Phase 0 used. This lets Phase N+1 poll for the new scope file specifically — if Phase N overwrote Phase 0's scope, Phase N+1 would race to read the file before Phase N finishes.

```javascript
import { After } from '<path>/fixtures.js';
import { saveScopedTestData, loadScopedTestData } from '<path>/fixtures.js';

After({ tags: '@workflow-consumer' }, async ({ page }, scenario) => {
  if (scenario.result?.status !== 'passed') return;
  const snapshot = await page.evaluate(() => ({
    'app-store-key': JSON.parse(localStorage.getItem('app-store-key') || 'null'),
  }));
  // Merge with Phase 0 predata so successor sees both predecessor's and this phase's data.
  const existing = loadScopedTestData('<workflow-scope>') || {};
  // Write to a DIFFERENT scope key — successor polls for this file specifically.
  saveScopedTestData('<workflow-scope>-complete', {
    ...existing,
    localStorage: { ...(existing.localStorage || {}), ...snapshot },
  });
});
```

#### Pattern: Consumer restore (`shared/workflow.steps.js`)

The restore is handled automatically by `workflow.steps.js` `Given I load predata from "{scope}"`. It reads the scoped JSON and calls `page.addInitScript()` with a **one-time guard** so the restore only fires on the FIRST page navigation.

**Why the one-time guard matters for intermediate phases:** `addInitScript` fires on every `page.goto()` call. Without the guard, an intermediate phase that navigates multiple times (e.g. navigate to page A → mutate store → navigate to page B → mutate store again) would have its localStorage reset on each navigation back to the Phase 0 snapshot — wiping out mutations from the previous step. The guard (`__specwright_workflow_restored` marker in localStorage) prevents this: once set on the first navigation, subsequent navigations skip the restore and the store accumulates mutations correctly.

```javascript
// From workflow.steps.js (already implemented — shown for reference)
await page.addInitScript(({ snap, marker }) => {
  if (localStorage.getItem(marker)) return; // ← one-time guard
  try {
    for (const [key, value] of Object.entries(snap)) {
      if (value !== null && value !== undefined) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
    localStorage.setItem(marker, '1');
  } catch (err) {
    console.log('[workflow] addInitScript restore failed:', err);
  }
}, { snap: data.localStorage, marker: '__specwright_workflow_restored' });
```

#### When to apply

✅ Apply when:
- The precondition scenario writes to `localStorage` (creates/toggles/saves client-side state)
- A consumer scenario reads or asserts on that state

❌ Skip when:
- The precondition only affects server state (mutations via API calls) — the backend already persists it
- The precondition only asserts (read-only) — nothing to snapshot

#### Why `addInitScript` not `evaluate`

`page.evaluate()` runs AFTER the page's own scripts execute. By the time your restore fires, the app has already read `localStorage` (which is empty) and rendered its initial state. `page.addInitScript()` injects code BEFORE any page script runs on every navigation, so the app sees the restored state on its first read — no race condition.

**Reasoning:** Cross-phase app state that lives in the browser (not the server) needs an explicit snapshot/restore channel. The file-backed 3rd layer of our test-data persistence already handles cross-worker safety; the missing piece was the `addInitScript` injection timing.

---

### Workflow Feature-Flag / Cookie State

**Context:** Same failure mode as localStorage but for feature-flag cookies and session storage.
**Decision/Finding:** The same snapshot/restore pattern applies, just with different Playwright APIs:

- **Cookies:** `await context.cookies()` in the precondition's `After` → save to scoped test data → in the consumer's `Before`, call `await context.addCookies(...)`.
- **sessionStorage:** Read via `browser_evaluate` + `sessionStorage.getItem(...)` → save → restore via `addInitScript` (same as localStorage).

**When to apply:** Any time the precondition mutates client-only state that affects consumer behaviour.
