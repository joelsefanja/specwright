/**
 * Auth Strategy: Email + Password
 *
 * Two-step login flow:
 * 1. Navigate to /signin
 * 2. Fill email → click submit
 * 3. Fill password → click login
 * 4. Handle 2FA if present
 * 5. Wait for redirect to /home
 * 6. Save storageState
 *
 * Reads locators and credentials from authenticationData.js
 */
import fs from 'fs';
import { authenticationData } from '../../data/authenticationData.js';
// Default-import + destructure — see urlConfig.cjs header for why.
import urlConfig from '../../data/urlConfig.cjs';
const { getAuthUrl, getAppUrl, isSplitAuth } = urlConfig;

export async function authenticate(page, authFile, _config = {}) {
  console.log('[auth:email-password] Starting authentication...');

  const { validCredentials, locators, timeouts, twoFactor } = authenticationData;

  // URL resolution — see e2e-tests/data/urlConfig.cjs for the full
  // contract. In split-auth mode (AUTH_BASE_URL set and ≠ BASE_URL), signin
  // runs at the hosted host and the captured storageState is later rewritten
  // so tokens land on the local app host.
  const APP_BASE_URL = getAppUrl();
  const AUTH_BASE_URL = getAuthUrl();
  const splitAuth = isSplitAuth();
  if (splitAuth) {
    console.log(`[auth:email-password] Split-auth: signin@${AUTH_BASE_URL} → app@${APP_BASE_URL}`);
  }

  // Step 1: Navigate to sign-in page
  await page.goto(`${AUTH_BASE_URL}/signin`);
  await page.waitForLoadState('networkidle', { timeout: timeouts.loadState });
  console.log('[auth:email-password] Navigated to /signin');

  // Step 2: Fill email and submit
  const emailInput = page.getByTestId(locators.emailInput.testId);
  await emailInput.waitFor({ state: 'visible', timeout: timeouts.elementWait });
  await emailInput.fill(validCredentials.email);
  console.log(`[auth:email-password] Filled email: ${validCredentials.email}`);

  const emailSubmit = page.getByTestId(locators.emailSubmitButton.testId);
  await emailSubmit.click();
  console.log('[auth:email-password] Clicked email submit');

  // Step 3: Wait for password field, fill, and submit
  const passwordInput = page.getByTestId(locators.passwordInput.testId);
  await passwordInput.waitFor({ state: 'visible', timeout: timeouts.elementWait });
  await passwordInput.fill(validCredentials.password);
  console.log('[auth:email-password] Filled password');

  const loginSubmit = page.getByTestId(locators.loginSubmitButton.testId);
  await loginSubmit.click();
  console.log('[auth:email-password] Clicked login submit');

  // Step 4: Handle 2FA if it appears
  try {
    const twoFactorInput = page.getByTestId(twoFactor.locators.codeInput.testId);
    await twoFactorInput.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[auth:email-password] 2FA detected, entering code...');
    await twoFactorInput.fill(twoFactor.code);
    const proceedButton = page.getByTestId(twoFactor.locators.proceedButton.testId);
    await proceedButton.click();
    console.log('[auth:email-password] 2FA code submitted');
  } catch {
    console.log('[auth:email-password] No 2FA prompt detected, continuing...');
  }

  // Step 5: Wait for redirect to /home
  await page.waitForURL('**/home**', { timeout: timeouts.login });
  await page.waitForLoadState('networkidle', { timeout: timeouts.loadState });
  console.log('[auth:email-password] Login successful');

  // Step 6: Save authentication state
  await page.context().storageState({ path: authFile });

  // Split-auth rewrite: move localStorage entries from AUTH_BASE_URL to
  // APP_BASE_URL so the local dev server sees the same tokens. Cookies that
  // don't match the app origin are stripped (they'd be useless on localhost
  // anyway — browser refuses to send them across domains).
  if (splitAuth) {
    const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    const authOriginHost = new URL(AUTH_BASE_URL).host;
    const appOriginNorm = new URL(APP_BASE_URL).origin;
    const appOriginHost = new URL(APP_BASE_URL).host;

    const beforeOrigins = state.origins?.length || 0;
    const beforeCookies = state.cookies?.length || 0;

    state.origins = (state.origins || []).map((o) => {
      try {
        if (new URL(o.origin).host === authOriginHost) {
          return { ...o, origin: appOriginNorm };
        }
      } catch { /* ignore unparseable origins */ }
      return o;
    });

    state.cookies = (state.cookies || []).filter((c) => {
      const dom = (c.domain || '').replace(/^\./, '');
      return appOriginHost === dom || appOriginHost.endsWith(`.${dom}`);
    });

    fs.writeFileSync(authFile, JSON.stringify(state, null, 2));
    console.log(`[auth:email-password] Split-auth rewrite: origins ${beforeOrigins} → ${state.origins.length} (at ${appOriginNorm}), cookies ${beforeCookies} → ${state.cookies.length}`);
  }

  console.log(`[auth:email-password] State saved to: ${authFile}`);
}
