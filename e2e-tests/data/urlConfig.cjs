/**
 * URL resolution helpers — CommonJS module (intentional).
 *
 * Why .cjs instead of .mjs / .js?
 *   Playwright's TypeScript loader transforms ESM helpers imported by setup
 *   or test files into a broken CJS wrapper regardless of export shape
 *   (named exports → "does not provide an export named X"; default exports →
 *   "does not provide an export named 'default'"). The transformer leaves
 *   genuine CommonJS modules alone, so we ship this as .cjs with
 *   module.exports. ESM consumers do
 *     `import urlConfig from '../../data/urlConfig.cjs';`
 *   which Node handles via its built-in CJS-to-ESM interop layer.
 *
 * Single-origin auth (default): getAuthUrl() === getAppUrl().
 * Split-auth (AUTH_BASE_URL set and ≠ BASE_URL):
 *   - getAuthUrl() → hosted signin host
 *   - getAppUrl()  → local app host
 *   - isSplitAuth() → true
 *
 * No default URL fallback: if BASE_URL is unset, every call throws. A
 * silently-wrong URL is worse than a loud failure — tests would otherwise
 * hit an arbitrary placeholder and produce confusing connection-refused
 * or "wrong page" failures deep in the run.
 */

const stripTrailingSlash = (s) => (s || '').replace(/\/$/, '');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[urlConfig] ${name} is not set. Define it in e2e-tests/.env.testing ` +
      `(or override via the shell) before running tests.`,
    );
  }
  return v;
}

const getAuthUrl = () =>
  stripTrailingSlash(process.env.AUTH_BASE_URL || requireEnv('BASE_URL'));

const getAppUrl = () => stripTrailingSlash(requireEnv('BASE_URL'));

const isSplitAuth = () => getAuthUrl() !== getAppUrl();

module.exports = { getAuthUrl, getAppUrl, isSplitAuth };
