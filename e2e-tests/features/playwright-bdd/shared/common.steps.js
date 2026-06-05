/**
 * Shared common steps — generic assertions and utilities.
 * Lives in shared/ (no @-prefix) so it is globally scoped.
 */
import { Given, When, Then, Before, expect } from '../../../playwright/fixtures.js';

Then('I should see the heading {string}', async ({ page }, headingText) => {
  await expect(page.getByRole('heading', { name: headingText }).first()).toBeVisible();
});

Then('I should see a tab {string} that is active', async ({ page }, tabName) => {
  const tab = page.getByRole('tab', { name: tabName });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});

When('I click the tab {string}', async ({ page }, tabName) => {
  const tab = page.getByRole('tab', { name: tabName });
  await tab.click();
});

When('I click the tab with test ID {string}', async ({ page }, testId) => {
  await page.getByTestId(testId).click();
});

Then('the tab with test ID {string} should be active', async ({ page }, testId) => {
  const tab = page.getByTestId(testId);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});

Given('I clear browser storage', async ({ page, testConfig }) => {
  // Navigate to the app origin first so localStorage/sessionStorage are accessible.
  // On about:blank or cross-origin pages, browsers throw SecurityError when
  // accessing storage APIs.
  const currentUrl = page.url();
  if (!currentUrl || currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
    const baseUrl = testConfig?.baseUrl || process.env.BASE_URL || 'http://localhost:5173';
    await page.goto(baseUrl, { waitUntil: 'commit' });
  }

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  // Clear cookies
  const context = page.context();
  await context.clearCookies();
});

Then('the page should have title containing {string}', async ({ page }, titlePart) => {
  await expect(page).toHaveTitle(new RegExp(titlePart));
});
