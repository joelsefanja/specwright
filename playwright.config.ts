import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';
import dotenv from 'dotenv';
// Default-import + destructure — see urlConfig.cjs header for why this
// shape is required for Playwright loader compatibility.
import urlConfig from './e2e-tests/data/urlConfig.cjs';
const { getAuthUrl } = urlConfig;

// Resolve all framework paths relative to THIS config file, not the current
// working directory. Without this, running the test command from a different
// folder (e.g. an IDE invocation, or a developer who installed the plugin
// inside a subapp like `myrepo/app/`) causes bddgen to write `.features-gen/`
// at one location while Playwright reads `testDir` at another — resulting in
// "0 tests found" or "step file not visible" errors.
//
// Playwright loads .ts config files via tsx in CommonJS mode by default, so
// `__dirname` is defined. If a project forces ESM loading (rare — would need
// "type": "module" + a custom tsx invocation), `__dirname` is undefined and
// we fall back to cwd (same behaviour as before this fix).
const PROJECT_ROOT: string = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
const fromRoot = (p: string): string => path.resolve(PROJECT_ROOT, p);

// Capture env vars that wrapper scripts (e.g. run-coverage.js) set on the
// command line so they survive the dotenv reload that follows. Without this
// step, ENABLE_COVERAGE=true from the wrapper would be overridden by the
// default false in .env.testing, and coverage would silently never run.
const _preservedEnv = {
  ENABLE_COVERAGE: process.env.ENABLE_COVERAGE,
};

// Load environment variables from e2e-tests/.env.testing (canonical source of truth)
// Falls back to root .env for any vars not set above (e.g. CI overrides)
dotenv.config({ path: fromRoot('e2e-tests/.env.testing'), override: true });
dotenv.config({ path: fromRoot('.env'), override: false });

// Restore preserved env vars so wrapper-script values take precedence
for (const [key, value] of Object.entries(_preservedEnv)) {
  if (value !== undefined && value !== '') process.env[key] = value;
}

// Auth strategy: determines whether to run auth setup and use storageState
const authStrategy = process.env.AUTH_STRATEGY || 'email-password';
const hasAuth = authStrategy !== 'none';

// Chrome arguments: use CHROME_ARGS env var (comma-separated) or sensible defaults
const chromeArgs = process.env.CHROME_ARGS
  ? process.env.CHROME_ARGS.split(',')
      .map((a) => a.trim())
      .filter(Boolean)
  : ['--no-sandbox', '--disable-dev-shm-usage'];

// Shared launch options
const defaultLaunchOptions = {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: chromeArgs,
};

// Define BDD configuration. All paths are absolute (via fromRoot) so bddgen
// and Playwright agree regardless of where the test command was invoked from.
// outputDir is pinned to the project root's .features-gen/ for the same reason.
const testDir = defineBddConfig({
  features: fromRoot('e2e-tests/features/playwright-bdd/**/*.feature'),
  steps: [
    fromRoot('e2e-tests/features/playwright-bdd/**/*.{js,ts}'),
    fromRoot('e2e-tests/features/playwright-bdd/shared/*.{js,ts}'),
    fromRoot('e2e-tests/playwright/fixtures.js'),
  ],
  // Output inside e2e-tests/ so generated .spec.js files inherit
  // "type":"module" from e2e-tests/package.json. Without this, on Node ≥22
  // the generated specs are treated as CJS but use ESM `import` for
  // fixtures.js — triggering "Cannot require() ES Module ... in a cycle".
  outputDir: fromRoot('e2e-tests/.features-gen'),
});

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir,
  /* Global setup - runs once before all test projects */
  globalSetup: fromRoot('e2e-tests/playwright/global.setup.js'),
  /* Global teardown - runs once after all test projects complete */
  globalTeardown: fromRoot('e2e-tests/playwright/global.teardown.js'),
  /* Default: run scenarios in parallel. Use @serial-execution tag to opt out. */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  timeout: parseInt(process.env.TEST_TIMEOUT || '90000'),
  /* Workers */
  workers: process.env.CI ? 4 : 5,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['json', { outputFile: fromRoot('reports/json/results.json') }] as const,
    cucumberReporter('json', { outputFile: fromRoot('reports/cucumber-bdd/report.json') }),
    // Console output: "line" on CI, "list" locally
    ...(process.env.CI ? [['line'] as const] : [['list'] as const]),
    // HTML reporter: always locally, on CI only when GENERATE_REPORTS is set
    ...(!process.env.CI || process.env.GENERATE_REPORTS
      ? [['html', { outputFolder: process.env.PLAYWRIGHT_REPORT_DIR || fromRoot('reports/playwright') }] as const]
      : []),
  ],
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    /* Configure headless mode based on environment variable */
    headless: process.env.HEADLESS !== 'false',

    /* Collect trace when retrying the failed test. */
    trace: process.env.ENABLE_TRACING === 'true' ? 'on-first-retry' : 'off',

    /* Take screenshot on failure */
    screenshot: process.env.ENABLE_SCREENSHOTS === 'true' ? 'only-on-failure' : 'off',

    /* Record video on failure */
    video: process.env.ENABLE_VIDEO_RECORDING === 'true' ? 'retain-on-failure' : 'off',
  },

  /* Configure projects */
  projects: [
    // Setup project - creates authentication state (skipped when AUTH_STRATEGY=none)
    ...(hasAuth
      ? [
          {
            name: 'setup',
            testDir: './e2e-tests/playwright',
            testMatch: '**/auth.setup.js',
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: defaultLaunchOptions,
            },
          },
        ]
      : []),

    // Authentication tests - run with clean state (no dependencies, no storageState).
    // These tests exercise the real signin UI, so when AUTH_BASE_URL is set
    // (split-auth mode), target it instead of BASE_URL — otherwise they'd hit
    // the local dev shell at BASE_URL/signin which has no real auth backend.
    ...(hasAuth
      ? [
          {
            name: 'auth-tests',
            testMatch: '**/@Authentication/*.spec.js',
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: defaultLaunchOptions,
              baseURL: getAuthUrl(),
              // Clean state for testing login/logout functionality
            },
          },
        ]
      : []),

    // Serial execution — features tagged @serial-execution (non-workflow) run with 1 worker.
    // Browser page is reused across scenarios within the same feature file.
    // grepInvert excludes workflow tags so they run in their dedicated lanes below.
    {
      name: 'serial-execution',
      testMatch: '**/*.spec.js',
      testIgnore: '**/@Authentication/*.spec.js',
      grep: /@serial-execution/,
      grepInvert: /@precondition|@workflow-consumer/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
        ...(hasAuth
          ? { storageState: fromRoot('e2e-tests/playwright/auth-storage/.auth/user.json') }
          : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    },

    // Precondition — workflow setup features tagged @precondition.
    // fullyParallel: false ensures scenarios within each Phase 0 spec file run sequentially
    // (correct intra-workflow ordering). No workers cap — each workflow's Phase 0 spec runs
    // in its own worker. workers:1 is NOT needed here: fullyParallel:false already enforces
    // within-file sequencing, and capping workers forces multiple workflows' Phase 0 specs
    // into one OS process, causing playwright-bdd's $bddContext worker fixture to leak its
    // line cursor across files ("bddTestData not found"). Inter-workflow ordering is enforced
    // by workflow-consumers.dependencies: ['precondition'].
    {
      name: 'precondition',
      testMatch: '**/*.spec.js',
      testIgnore: '**/@Authentication/*.spec.js',
      grep: /@precondition/,
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
        ...(hasAuth
          ? { storageState: fromRoot('e2e-tests/playwright/auth-storage/.auth/user.json') }
          : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    },

    // Workflow consumers — features tagged @workflow-consumer.
    // Runs parallel AFTER all preconditions complete, consuming shared test data
    // written by precondition to e2e-tests/playwright/test-data/{scope}.json.
    {
      name: 'workflow-consumers',
      testMatch: '**/*.spec.js',
      testIgnore: '**/@Authentication/*.spec.js',
      grep: /@workflow-consumer/,
      fullyParallel: true,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
        ...(hasAuth
          ? { storageState: fromRoot('e2e-tests/playwright/auth-storage/.auth/user.json') }
          : {}),
      },
      ...(hasAuth ? { dependencies: ['precondition'] } : {}),
    },

    // Run single workflow — serial (1 worker), filesystem ordering via @0-/@1- prefixes.
    // ONLY used via explicit targeted scripts (e.g. pnpm test:bdd:bookings).
    // NOT included in pnpm test:bdd — the full run uses precondition → workflow-consumers instead.
    // fullyParallel: true prevents cross-file $bddFileData fixture contamination (bddTestData not found).
    // Workers: 1 keeps execution sequential, preserving @0-/@1- filesystem ordering.
    {
      name: 'run-workflow',
      testMatch: '**/@Workflows/**/*.spec.js',
      fullyParallel: true,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
        ...(hasAuth
          ? { storageState: fromRoot('e2e-tests/playwright/auth-storage/.auth/user.json') }
          : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    },

    // Chromium project — Playwright Test MCP compatibility alias.
    // Runs generated seed.spec.js from e2e-tests/playwright/generated/ directly — no bddgen needed.
    // Seed files inject their own auth via localStorage; no storageState dependency required.
    {
      name: 'chromium',
      testDir: './e2e-tests/playwright/generated',
      testMatch: '**/*.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
      },
    },

    // Main BDD tests — everything not serial, precondition, consumer, or auth. Runs parallel.
    {
      name: 'main-e2e',
      testMatch: '**/*.spec.js',
      testIgnore: '**/@Authentication/*.spec.js',
      grepInvert: /@serial-execution|@precondition|@workflow-consumer/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: defaultLaunchOptions,
        ...(hasAuth
          ? { storageState: fromRoot('e2e-tests/playwright/auth-storage/.auth/user.json') }
          : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.BASE_URL?.startsWith('http://localhost')
    ? {
        command: 'pnpm dev',
        cwd: PROJECT_ROOT,
        url: process.env.BASE_URL || 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      }
    : undefined,
});
