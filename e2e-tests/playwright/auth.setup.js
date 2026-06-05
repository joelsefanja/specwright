/**
 * Authentication Setup — Strategy Dispatcher
 *
 * Reads AUTH_STRATEGY from .env.testing (loaded via playwright.config.ts dotenv).
 *
 * Strategies:
 * - email-password  — two-step email → password → optional 2FA
 * - oauth           — localStorage injection or click-based OAuth button
 * - none            — skip auth, save empty storageState
 * - <custom>        — any .js file in auth-strategies/ added by an org overlay
 *
 * All auth config (credentials, OAuth keys, user identity) lives in .env.testing.
 * See the OAuth strategy vars: OAUTH_STORAGE_KEY, OAUTH_SIGNIN_PATH, etc.
 */
import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, './auth-storage/.auth/user.json');

const strategy = process.env.AUTH_STRATEGY || 'email-password';

setup('authenticate', async ({ page }) => {
  console.log(`[auth] Strategy: ${strategy}`);

  if (strategy === 'none') {
    console.log('[auth] No authentication required — saving empty state');
    await page.context().storageState({ path: authFile });
    return;
  }

  try {
    const { authenticate } = await import(`./auth-strategies/${strategy}.js`);
    await authenticate(page, authFile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
      throw new Error(
        `Auth strategy "${strategy}" not found. ` +
        `Expected file: e2e-tests/playwright/auth-strategies/${strategy}.js\n` +
        `Available strategies: email-password, oauth, none\n` +
        `Set AUTH_STRATEGY in e2e-tests/.env.testing.`
      );
    }
    throw err;
  }
});
