/**
 * Shared authentication steps — reusable across all modules.
 * Lives in shared/ (no @-prefix) so it is globally scoped.
 */
import { Given, When, Then, expect } from '../../../playwright/fixtures.js';

Given('I am logged in', async ({ page, authData }) => {
  // When using storageState from auth.setup, the user is already authenticated.
  // In serial-execution mode, skip navigation if the page is already on an
  // authenticated route to preserve cross-scenario state (e.g., submitted forms).
  const currentUrl = page.url();
  if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.includes('/signin')) {
    // Already on an authenticated page — no need to navigate away
    return;
  }
  await page.goto('/home');
  await page.waitForLoadState('networkidle', { timeout: authData.timeouts.loadState });
});

Given('I am on the sign-in page', async ({ page, authData }) => {
  await page.goto('/signin');
  await page.waitForLoadState('networkidle', { timeout: authData.timeouts.loadState });
});

When('I enter email {string}', async ({ page, authData }, email) => {
  const emailInput = page.getByTestId(authData.locators.emailInput.testId);
  await emailInput.waitFor({ state: 'visible', timeout: authData.timeouts.elementWait });
  await emailInput.fill(email);
});

When('I enter valid email', async ({ page, authData }) => {
  const emailInput = page.getByTestId(authData.locators.emailInput.testId);
  await emailInput.waitFor({ state: 'visible', timeout: authData.timeouts.elementWait });
  await emailInput.fill(authData.validCredentials.email);
});

When('I click the email submit button', async ({ page, authData }) => {
  const emailSubmit = page.getByTestId(authData.locators.emailSubmitButton.testId);
  await emailSubmit.click();
});

When('I enter password {string}', async ({ page, authData }, password) => {
  const passwordInput = page.getByTestId(authData.locators.passwordInput.testId);
  await passwordInput.waitFor({ state: 'visible', timeout: authData.timeouts.elementWait });
  await passwordInput.fill(password);
});

When('I enter valid password', async ({ page, authData }) => {
  const passwordInput = page.getByTestId(authData.locators.passwordInput.testId);
  await passwordInput.waitFor({ state: 'visible', timeout: authData.timeouts.elementWait });
  await passwordInput.fill(authData.validCredentials.password);
});

When('I click the login submit button', async ({ page, authData }) => {
  const loginSubmit = page.getByTestId(authData.locators.loginSubmitButton.testId);
  await loginSubmit.click();
});

When('I handle 2FA if prompted', async ({ page, authData }) => {
  try {
    const twoFactorInput = page.getByTestId(authData.twoFactor.locators.codeInput.testId);
    await twoFactorInput.waitFor({ state: 'visible', timeout: 5000 });
    await twoFactorInput.fill(authData.twoFactor.code);
    const proceedButton = page.getByTestId(authData.twoFactor.locators.proceedButton.testId);
    await proceedButton.click();
  } catch {
    // No 2FA prompt — expected for most test accounts
  }
});

Then('I should be redirected to {string}', async ({ page, authData }, urlPath) => {
  await page.waitForURL(`**${urlPath}**`, { timeout: authData.timeouts.login });
  await page.waitForLoadState('networkidle', { timeout: authData.timeouts.loadState });
});
