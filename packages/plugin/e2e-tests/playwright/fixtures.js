import { test as base, createBdd } from 'playwright-bdd';
import { authenticationData } from '../data/authenticationData.js';
import { testConfig as fullTestConfig } from '../data/testConfig.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

// Raw V8 coverage accumulator — each scenario writes one JSON file here.
// globalTeardown reads all of them and runs monocart-coverage-reports
// to produce ONE merged report at reports/coverage/.
// Path anchored to the project root (two levels up from this file at
// e2e-tests/playwright/fixtures.js) so the directory location is identical
// regardless of which directory the test command was invoked from.
const RAW_COVERAGE_DIR = path.resolve(fileURLToPath(import.meta.url), '../../..', '.raw-coverage');
let _rawCoverageDirReady = false;
async function ensureCoverageDir() {
  if (_rawCoverageDirReady) return;
  const fsMod = await import('node:fs');
  if (!fsMod.existsSync(RAW_COVERAGE_DIR)) {
    fsMod.mkdirSync(RAW_COVERAGE_DIR, { recursive: true });
  }
  _rawCoverageDirReady = true;
}

// Drop noise at capture time. V8 coverage includes every script the page
// loaded — node_modules, react, polyfills, vendor chunks, browser internals —
// which inflates raw files ~10× and risks OOM-ing the merge step on large
// suites. Keep only app-source URLs. The regexes are intentionally permissive
// across bundlers (CRA `static/js/`, Vite `src/`, Next.js `_next/static/`).
const _COVERAGE_URL_KEEP =
  /\/(src|static\/js|_next\/static\/chunks|@(fs|id|vite))\//;
const _COVERAGE_URL_DROP =
  /(node_modules|webpack:\/\/|chrome-extension:|sockjs|hot-update|runtime-main|\.test\.|\.spec\.|\.stories\.)/;
function _filterCoverageEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(e => {
    const url = e?.url || '';
    if (!url) return false;
    if (_COVERAGE_URL_DROP.test(url)) return false;
    return _COVERAGE_URL_KEEP.test(url);
  });
}

// Capture env vars that should win over .env.testing values
// (e.g. ENABLE_COVERAGE set by run-coverage.js wrapper script — must not be overridden)
const _preservedEnv = {
  ENABLE_COVERAGE: process.env.ENABLE_COVERAGE,
};

// Load environment variables from e2e-tests/.env.testing (canonical source of truth)
dotenv.config({ path: 'e2e-tests/.env.testing', override: true });
dotenv.config({ override: false });

// Restore preserved env vars so wrapper-script values take precedence
for (const [key, value] of Object.entries(_preservedEnv)) {
  if (value !== undefined && value !== '') process.env[key] = value;
}

// Get current directory for resolving test data path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data directory
const testDataDir = path.join(__dirname, './test-data');

// ==================== SCOPED TEST DATA API ====================
// Replaces single globalTestData.json with one file per feature/scope.
// Shared scopes (@cross-feature-data) → flat file at root (e.g., test-data/eobs.json)
// Feature-specific scopes → hierarchical path (e.g., test-data/auth/login.json)

/**
 * Extract module name from feature URI based on directory structure.
 * Single source of truth — imported by global-hooks.js and step files.
 *
 * @param {string} featureUri - Feature file path
 * @returns {string|null} Module name (lowercase)
 *
 * Examples:
 *   "@Workflows/@Authentication/file.feature" → "authentication"
 *   "@Modules/@HomePage/file.feature" → "homepage"
 */
export function extractModuleName(featureUri) {
  if (!featureUri) return null;

  const parts = featureUri.split('/');
  const categoriesWithModules = ['@Workflows', '@Modules'];

  for (const category of categoriesWithModules) {
    const categoryIndex = parts.indexOf(category);
    if (categoryIndex !== -1 && parts[categoryIndex + 1]) {
      return parts[categoryIndex + 1].replace('@', '').toLowerCase();
    }
  }

  return null;
}

/**
 * Convert feature URI to a hierarchical scope path.
 * Strips @-prefixes and .feature extension, joins with "/".
 *
 * @param {string} featureUri - Feature file path
 * @returns {string} Hierarchical scope path
 */
export function featureUriToScopePath(featureUri) {
  const parts = featureUri.split('/');
  const catIdx = parts.findIndex((p) => p === '@Modules' || p === '@Workflows');
  if (catIdx === -1) return parts[parts.length - 1].replace(/\.feature.*$/, '');

  return parts
    .slice(catIdx + 1)
    .map((p) => p.replace(/^@/, '').replace(/\.feature.*$/, ''))
    .filter(Boolean)
    .map((p) => p.toLowerCase().replace(/[^a-z0-9_]+/g, '-'))
    .join('/');
}

/**
 * Derive the data scope for a feature.
 * - @cross-feature-data → flat module name (e.g., "auth")
 * - Otherwise → hierarchical path (e.g., "homepage/navigation")
 *
 * @param {string} featureUri - Feature file path
 * @param {string[]} tags - Test tags array
 * @returns {string} Scope string (used as file path relative to test-data/)
 */
export function deriveDataScope(featureUri, tags = []) {
  const isCrossFeature = tags.some((t) => t.includes('cross-feature-data'));
  if (isCrossFeature) {
    return extractModuleName(featureUri) || 'shared';
  }
  return featureUriToScopePath(featureUri);
}

/**
 * Resolve scope string to absolute file path.
 * @param {string} scope - Scope string (flat or hierarchical with "/")
 * @returns {string} Absolute path to JSON file
 */
function scopeToFilePath(scope) {
  return path.join(testDataDir, `${scope}.json`);
}

/**
 * Load test data for a specific scope.
 * @param {string} scope - Scope string (e.g., "auth" or "homepage/navigation")
 * @returns {Object} Parsed data or empty object
 */
export function loadScopedTestData(scope) {
  const filePath = scopeToFilePath(scope);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Save test data to a scoped file. Creates directories recursively.
 * @param {string} scope - Scope string
 * @param {Object} data - Data to save
 */
export function saveScopedTestData(scope, data) {
  const filePath = scopeToFilePath(scope);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Check if scoped test data file exists.
 * @param {string} scope - Scope string
 * @returns {boolean}
 */
export function scopedTestDataExists(scope) {
  return fs.existsSync(scopeToFilePath(scope));
}

// ==================== FEATURE-LEVEL BROWSER REUSE ====================
// For serial-execution projects, the browser page persists across scenarios
// within the same feature file. A new page is created only when the test
// file changes (i.e., next feature file starts).
//
// Benefits:
// - Page + context created once per feature file (not per scenario)
// - Client-side state (Zustand store, localStorage) persists across scenarios
// - Background steps can skip redundant navigation if already on target page
// - Authentication state persists via storageState on context creation

let _featurePage = null;
let _featureContext = null;
let _lastTestFile = null;
let _cdpBrowser = null;
let _cdpContext = null;
let _cdpPage = null;

const REUSABLE_PROJECTS = ['serial-execution'];

const isIntegratedBrowserMode = () => process.env.SPECWRIGHT_BROWSER_MODE === 'cdp' && !!process.env.SPECWRIGHT_CDP_ENDPOINT;

async function applyStorageStateToContext(context, storageState) {
  if (!storageState || typeof storageState !== 'string' || !fs.existsSync(storageState)) return;
  const raw = JSON.parse(fs.readFileSync(storageState, 'utf8'));
  const { cookies = [], origins = [] } = raw || {};

  if (Array.isArray(cookies) && cookies.length) {
    await context.addCookies(cookies).catch((err) => console.log('[CDP] addCookies failed:', err.message || err));
  }

  for (const origin of Array.isArray(origins) ? origins : []) {
    const storage = Array.isArray(origin.localStorage) ? origin.localStorage : [];
    if (!origin.origin || !storage.length) continue;
    await context.addInitScript(
      ({ targetOrigin, storage }) => {
        if (window.location.origin !== targetOrigin) return;
        for (const item of storage) localStorage.setItem(item.name, item.value);
      },
      { targetOrigin: origin.origin, storage },
    ).catch((err) => console.log('[CDP] addInitScript failed:', err.message || err));
  }
}

async function getIntegratedBrowserPage(contextOptions) {
  const endpoint = process.env.SPECWRIGHT_CDP_ENDPOINT;
  const targetUrl = process.env.SPECWRIGHT_CDP_TARGET_URL || process.env.BASE_URL || '';
  const deadline = Date.now() + 20000;

  if (!_cdpBrowser) {
    _cdpBrowser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
    _cdpContext = _cdpBrowser.contexts()[0];
    if (!_cdpContext) throw new Error(`[CDP] No browser context found at ${endpoint}`);
    await applyStorageStateToContext(_cdpContext, contextOptions.storageState);
    console.log(`[CDP] Connected to Desktop integrated browser: ${endpoint}`);
  }

  while (Date.now() < deadline) {
    const pages = _cdpContext.pages().filter((page) => !page.isClosed());
    _cdpPage = pages.find((page) => targetUrl && page.url().startsWith(targetUrl))
      ?? pages.find((page) => !page.url().startsWith('devtools://') && !page.url().startsWith('chrome://'))
      ?? null;
    if (_cdpPage) return _cdpPage;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const urls = _cdpContext.pages().map((page) => page.url()).join(', ');
  throw new Error(`[CDP] Could not find Desktop integrated browser target${targetUrl ? ` for ${targetUrl}` : ''}. Open targets: ${urls || '(none)'}`);
}

// Extend base test with custom fixtures
export const test = base.extend({
  authData: async ({}, use) => {
    await use(authenticationData);
  },

  testConfig: async ({}, use) => {
    await use({
      ...fullTestConfig,
      baseUrl: process.env.BASE_URL || fullTestConfig.baseUrl,
      timeout: {
        loadState: 60000,
        elementWait: 10000,
        networkIdle: 15000,
      },
    });
  },

  testData: async ({}, use) => {
    await use({});
  },

  scenarioContext: async ({}, use) => {
    await use({});
  },

  // Feature-level page reuse for serial-execution projects.
  // For these projects, the browser page persists across scenarios within the
  // same feature file. A fresh context + page is created only when testInfo.file changes.
  // All other projects retain standard per-scenario isolation.
  page: async ({ browser }, use, testInfo) => {
    const { viewport, baseURL, storageState, locale, timezoneId, ignoreHTTPSErrors, video } =
      testInfo.project.use || {};
    const contextOptions = {
      viewport,
      baseURL,
      storageState,
      locale,
      timezoneId,
      ignoreHTTPSErrors,
      ...(video && video !== 'off' ? { recordVideo: { dir: testInfo.outputDir } } : {}),
    };

    if (isIntegratedBrowserMode()) {
      const page = await getIntegratedBrowserPage(contextOptions);
      await use(page);
      return;
    }

    // Coverage collection — V8 native, Chromium only, build-tool agnostic.
    // Skipped for @serial-execution projects (browser reuse breaks per-scenario start/stop).
    const collectCoverage =
      process.env.ENABLE_COVERAGE === 'true' &&
      !REUSABLE_PROJECTS.includes(testInfo.project.name) &&
      testInfo.project.use?.browserName !== 'firefox' &&
      testInfo.project.use?.browserName !== 'webkit';

    if (REUSABLE_PROJECTS.includes(testInfo.project.name)) {
      const currentFile = testInfo.file;

      // New feature file → create fresh context + page
      if (currentFile !== _lastTestFile || !_featurePage || _featurePage.isClosed()) {
        if (_featureContext) {
          await _featureContext.close().catch(() => {});
        }
        _featureContext = await browser.newContext(contextOptions);
        _featurePage = await _featureContext.newPage();
        _lastTestFile = currentFile;
        console.log(`[BrowserReuse] New page for: ${currentFile.split('/').slice(-2).join('/')}`);
      } else {
        console.log(`[BrowserReuse] Reusing page for: ${currentFile.split('/').slice(-2).join('/')}`);
      }

      await use(_featurePage);

      // Video attachment for reusable projects: on failure, close the shared
      // context to finalize the video, attach it, then null out refs.
      const retainAll = process.env.RETAIN_VIDEO_ON_SUCCESS === 'true';
      const isFailed = testInfo.status !== testInfo.expectedStatus;
      if (video && video !== 'off' && (isFailed || retainAll)) {
        try {
          const videoObj = _featurePage?.video?.();
          if (videoObj && _featureContext) {
            await _featureContext.close();
            const savedPath = testInfo.outputPath('video.webm');
            await videoObj.saveAs(savedPath);
            await testInfo.attach('video', { path: savedPath, contentType: 'video/webm' });
          }
        } catch (err) {
          console.log(`[Video][BrowserReuse] Could not attach video: ${err.message}`);
        }
        _featurePage = null;
        _featureContext = null;
        _lastTestFile = null;
      }
    } else {
      // Default: fresh context + page per scenario (standard Playwright behavior)
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      if (collectCoverage) {
        await page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {});
      }

      await use(page);

      if (collectCoverage) {
        try {
          const coverage = await page.coverage.stopJSCoverage();
          const filtered = _filterCoverageEntries(coverage);
          if (filtered.length) {
            await ensureCoverageDir();
            const fsMod = await import('node:fs');
            const pathMod = await import('node:path');
            const safeName = testInfo.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
            const file = pathMod.join(RAW_COVERAGE_DIR, `${safeName}-${Date.now()}.json`);
            fsMod.writeFileSync(file, JSON.stringify(filtered));
          }
        } catch (err) {
          console.log(`[Coverage] Could not collect coverage: ${err.message}`);
        }
      }

      const videoObj = video && video !== 'off' ? page.video() : null;
      await context.close();

      const retainAll = process.env.RETAIN_VIDEO_ON_SUCCESS === 'true';
      const isFailed = testInfo.status !== testInfo.expectedStatus;
      if (videoObj && (isFailed || retainAll)) {
        try {
          const savedPath = testInfo.outputPath('video.webm');
          await videoObj.saveAs(savedPath);
          await testInfo.attach('video', { path: savedPath, contentType: 'video/webm' });
        } catch (err) {
          console.log(`[Video] Could not attach video: ${err.message}`);
        }
      }
    }
  },
});

// Create BDD functions with custom fixtures
export const { Given, When, Then, Before, After, BeforeAll, AfterAll } = createBdd(test);

// Export expect from Playwright
export { expect } from '@playwright/test';
