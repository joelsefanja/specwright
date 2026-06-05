/**
 * Shared navigation steps — reusable across all modules.
 * Lives in shared/ (no @-prefix) so it is globally scoped.
 */
import { Given, When, Then, expect } from '../../../playwright/fixtures.js';

Given('I am on the {string} page', async ({ page, testConfig }, pageName) => {
  const route = testConfig.routes[pageName];
  if (!route) {
    throw new Error(`Unknown page name: "${pageName}". Available: ${Object.keys(testConfig.routes).join(', ')}`);
  }
  await page.goto(route);
  await page.waitForLoadState('networkidle', { timeout: testConfig.timeout.loadState });
});

When('I navigate to {string}', async ({ page, testConfig }, urlPath) => {
  await page.goto(urlPath);
  await page.waitForLoadState('networkidle', { timeout: testConfig.timeout.loadState });
});

When('I click the link {string}', async ({ page }, linkText) => {
  await page.getByRole('link', { name: linkText }).click();
});

When('I click the button {string}', async ({ page }, buttonText) => {
  await page.getByRole('button', { name: buttonText }).click();
});

Then('the URL should contain {string}', async ({ page }, urlPart) => {
  await expect(page).toHaveURL(new RegExp(urlPart));
});

Then('I should see the text {string}', async ({ page }, text) => {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
});

Then('the element with test ID {string} should be visible', async ({ page }, testId) => {
  // 15s timeout — API-dependent UI (e.g. auth checks) can take longer than Playwright's 5s default.
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15000 });
});

Then('the element with test ID {string} should be disabled', async ({ page }, testId) => {
  await expect(page.getByTestId(testId)).toBeDisabled();
});

Then('the element with test ID {string} should be enabled', async ({ page }, testId) => {
  await expect(page.getByTestId(testId)).toBeEnabled();
});
