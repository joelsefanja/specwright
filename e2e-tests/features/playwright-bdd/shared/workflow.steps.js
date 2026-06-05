/**
 * Shared workflow steps — reusable across all @Workflows features.
 * Lives in shared/ (no @-prefix) so it is globally scoped.
 *
 * Provides the "I load predata from" step used by consumer phases to
 * hydrate page.testData from a file-backed scoped JSON written by the
 * precondition phase. Polls the scope file for up to 60 seconds to tolerate
 * a race with a just-finishing precondition phase.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Given } from '../../../playwright/fixtures.js';
import { loadScopedTestData, scopedTestDataExists } from '../../../playwright/fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// testDataDir resolves from e2e-tests/features/playwright-bdd/shared/ → e2e-tests/playwright/test-data/
const testDataDir = path.join(__dirname, '../../../playwright/test-data');

/**
 * Poll for the scope file to exist, with timeout.
 * Returns true when file exists, false if the timeout expires.
 */
async function waitForScopeFile(scope, timeoutMs = 60000, intervalMs = 1000) {
  const filePath = path.join(testDataDir, `${scope}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return fs.existsSync(filePath);
}

Given('I load predata from {string}', async ({ page, testData }, scope) => {
  if (!scopedTestDataExists(scope)) {
    const appeared = await waitForScopeFile(scope);
    if (!appeared) {
      console.log(
        `[workflow] predata scope "${scope}" not found after 60s — consumer will proceed with empty predata`,
      );
      return;
    }
  }

  const data = loadScopedTestData(scope);

  // Hydrate scenario-scoped testData
  Object.assign(testData, data);

  // Hydrate in-memory feature cache so downstream helpers can read <from_test_data>
  if (!globalThis.__rt_featureDataCache) {
    globalThis.__rt_featureDataCache = {};
  }
  globalThis.__rt_featureDataCache[scope] = {
    ...(globalThis.__rt_featureDataCache[scope] || {}),
    ...data,
  };

  // Track scope on the page for later saves (consumer-intermediate phases)
  page.__workflowScope = scope;

  // If the predata contains localStorage keys, restore them BEFORE any page script runs.
  // Uses page.addInitScript so app code sees the restored state on its first read.
  //
  // IMPORTANT — one-time guard: addInitScript fires on EVERY full page navigation (page.goto).
  // Without the guard, a second page.goto() in an intermediate phase would reset the Zustand
  // store back to Phase 0's state, wiping out mutations made after the first navigation
  // (e.g. shows added to a list in Phase 1 before navigating to add the second show).
  // The marker key persists in localStorage across reloads, so the restore only runs once.
  if (data && data.localStorage && Object.keys(data.localStorage).length > 0) {
    await page.addInitScript(({ snap, marker }) => {
      if (localStorage.getItem(marker)) return;
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
  }
});
