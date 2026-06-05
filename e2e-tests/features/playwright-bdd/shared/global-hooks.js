/**
 * Global BDD Hooks — auto-loaded via playwright config glob.
 * DO NOT import this file manually — it causes duplicate hooks.
 */
import { Before, After } from '../../../playwright/fixtures.js';
import { extractModuleName, loadScopedTestData, deriveDataScope } from '../../../playwright/fixtures.js';

/**
 * Before each scenario:
 * - Reset page.testData to empty object (scenario-scoped)
 * - Derive featureKey from directory path
 * - Hydrate in-memory cache if needed
 */
Before(async function ({ page, testData, $tags, $testInfo }) {
  // Reset scenario-scoped test data
  Object.keys(testData).forEach((key) => delete testData[key]);

  // Extract module name from feature URI for cache key
  const featureUri = $testInfo?.titlePath?.[1] || '';
  const featureKey = extractModuleName(featureUri);

  if (featureKey) {
    // Initialize in-memory feature data cache if not present
    if (!globalThis.__rt_featureDataCache) {
      globalThis.__rt_featureDataCache = {};
    }
    if (!globalThis.__rt_featureDataCache[featureKey]) {
      // Try to load from file-backed storage
      const scope = deriveDataScope(featureUri, $tags || []);
      globalThis.__rt_featureDataCache[featureKey] = loadScopedTestData(scope);
    }
  }
});

/**
 * After each scenario:
 * - Capture screenshot on failure (if enabled via env)
 */
After(async function ({ page, $testInfo }) {
  if ($testInfo?.status === 'failed' && process.env.ENABLE_SCREENSHOTS === 'true') {
    const screenshotName = `failure-${$testInfo.title.replace(/[^a-z0-9]/gi, '-')}`;
    await page.screenshot({ path: `reports/screenshots/${screenshotName}.png` });
  }
});
