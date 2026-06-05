/**
 * Auth Strategy: None
 *
 * For apps that don't require authentication.
 * Saves an empty storageState so Playwright config still works.
 */

export async function authenticate(page, authFile, _config = {}) {
  console.log('[auth:none] No authentication required — saving empty state');
  await page.context().storageState({ path: authFile });
}
