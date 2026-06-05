#!/usr/bin/env node
/**
 * E2E coverage runner — build-tool agnostic.
 *
 * Reads .env.testing to decide which Playwright projects to run.
 * Sets ENABLE_COVERAGE=true so the page fixture starts V8 coverage and
 * monocart-reporter writes a merged report to reports/coverage/.
 *
 * Usage:
 *   node e2e-tests/scripts/run-coverage.js              # main module tests only
 *   node e2e-tests/scripts/run-coverage.js --workflows  # include workflow phases
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Anchor all paths to the project root (two levels up from this script at
// e2e-tests/scripts/run-coverage.js) so the script works regardless of the
// directory it was invoked from (IDE, monorepo subapp, etc.).
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Capture CLI-provided env vars BEFORE dotenv.config() overrides them with .env.testing values.
// Lets ad-hoc `BASE_URL=... pnpm test:bdd:coverage` work without editing .env.testing.
const cliBaseUrl = process.env.BASE_URL;

// Reporters initialise BEFORE global.setup.js — ensure report dirs exist NOW
// so cucumber-reporter's createWriteStream doesn't crash with ENOENT.
for (const dir of ['reports/json', 'reports/cucumber-bdd', 'reports/playwright', 'reports/screenshots', 'reports/coverage']) {
  const full = path.join(PROJECT_ROOT, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
}

dotenv.config({ path: path.join(PROJECT_ROOT, 'e2e-tests/.env.testing'), override: true });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), override: false });

const authStrategy = process.env.AUTH_STRATEGY || 'email-password';
const hasAuth = authStrategy !== 'none';
const includeWorkflows = process.argv.includes('--workflows');

// Coverage requires source maps, which dev servers reliably provide.
// Deployed URLs usually strip source maps — coverage still runs but the
// report shows bundle chunks instead of real source files.
// Refuse to run unless BASE_URL is localhost (or user explicitly opts in).
// CLI-provided BASE_URL takes precedence; falls back to .env.testing value
const baseUrl = cliBaseUrl || process.env.BASE_URL || '';
const isLocalhost = baseUrl.startsWith('http://localhost') || baseUrl.startsWith('https://localhost') || baseUrl.startsWith('http://127.0.0.1');
const allowRemote = process.argv.includes('--allow-remote') || process.env.COVERAGE_ALLOW_REMOTE === 'true';

if (!isLocalhost && !allowRemote) {
  console.error(`
[coverage] ✗ BASE_URL is not localhost: ${baseUrl}

  Coverage requires source maps, which dev servers always serve but
  deployed builds usually strip. Running against a hosted URL will produce
  a report full of bundle-chunk filenames (e.g. "assets/index-abc.js")
  instead of real source files.

  To fix, point at your local dev server:

    1. In e2e-tests/.env.testing:    BASE_URL=http://localhost:5173
    2. Start your dev server:        pnpm dev
    3. Re-run:                       pnpm test:bdd:coverage

  Or, if you've enabled source maps in your hosted build and want to
  proceed anyway:

    COVERAGE_ALLOW_REMOTE=true pnpm test:bdd:coverage
`);
  process.exit(1);
}

// Build project list dynamically:
//   - "setup" only when auth is enabled
//   - "main-e2e" is the parallel default — primary coverage source
//   - "serial-execution" runs @serial-execution-tagged scenarios that main-e2e
//     explicitly excludes via grepInvert; without it those scenarios match no
//     project and silently never run (no warning, just zero coverage from them)
//   - "auth-tests" / "workflow-consumers" / "precondition" added when relevant
const projects = [];
if (hasAuth) projects.push('setup');
projects.push('main-e2e');
projects.push('serial-execution');
if (hasAuth) projects.push('auth-tests');
if (includeWorkflows && hasAuth) {
  projects.push('precondition');
  projects.push('workflow-consumers');
}

const projectArgs = projects.flatMap((p) => ['--project', p]);

console.log(`[coverage] auth=${authStrategy}, projects: ${projects.join(', ')}`);

// Always run sub-processes from PROJECT_ROOT so bddgen finds the config
// and Playwright uses the same cwd everyone else writes to.
const spawnOpts = {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  env: { ...process.env, ENABLE_COVERAGE: 'true' },
};

// Step 1: compile features → specs
const bddgen = spawnSync('npx', ['bddgen'], spawnOpts);
if (bddgen.status !== 0) process.exit(bddgen.status ?? 1);

// Step 2: run playwright with coverage on
const test = spawnSync('npx', ['playwright', 'test', ...projectArgs], spawnOpts);
process.exit(test.status ?? 1);
