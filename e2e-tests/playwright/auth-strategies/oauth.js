/**
 * Auth Strategy: OAuth
 *
 * All config comes from environment variables (loaded via playwright.config.ts dotenv):
 *
 *   OAUTH_STORAGE_KEY     — localStorage key to inject auth state (bypasses OAuth popup)
 *   TEST_USER_EMAIL       — user email (also used to derive name if TEST_USER_NAME is blank)
 *   TEST_USER_NAME        — display name (optional — derived from email if blank)
 *   TEST_USER_PICTURE     — avatar URL or data URI (optional — SVG initials auto-generated if blank)
 *   OAUTH_SIGNIN_PATH     — path to sign-in page (default: /signin)
 *   OAUTH_BUTTON_TEST_ID  — data-testid of sign-in button (default: google-signin-button)
 *   OAUTH_POST_LOGIN_URL  — URL pattern after login (default: **\/)
 *
 * Preferred: OAUTH_STORAGE_KEY → inject directly into localStorage (no popup)
 * Fallback:  OAUTH_BUTTON_TEST_ID → click the button (works for mock/same-page sign-in)
 */
import fs from 'fs';
// Default-import + destructure — see urlConfig.cjs header for why.
import urlConfig from '../../data/urlConfig.cjs';
const { getAuthUrl, getAppUrl, isSplitAuth } = urlConfig;

/**
 * Generate an initials-based SVG avatar as a data URL.
 * Works offline — no external service required.
 * "San Itsnew" → "SI" on a blue circle.
 */
function generateInitialsAvatar(name) {
  const initials = name
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Pick a consistent color from the name's first character
  const palette = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const bg = palette[(name.charCodeAt(0) || 0) % palette.length];

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">',
    `<circle cx="20" cy="20" r="20" fill="${bg}"/>`,
    `<text x="20" y="26" text-anchor="middle" font-family="Arial,sans-serif"`,
    ` font-size="16" font-weight="bold" fill="#ffffff">${initials}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function authenticate(page, authFile) {
  const baseUrl = getAppUrl();
  const timeout = parseInt(process.env.TEST_TIMEOUT || '30000');

  console.log('[auth:oauth] Starting authentication...');

  // Preferred: inject auth state directly into localStorage (bypasses OAuth popup)
  const storageKey = process.env.OAUTH_STORAGE_KEY;
  if (storageKey) {
    const email = process.env.TEST_USER_EMAIL || '';
    const defaultName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const name = process.env.TEST_USER_NAME || defaultName;
    const picture = process.env.TEST_USER_PICTURE || generateInitialsAvatar(name);
    const user = { name, email, picture };

    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle', { timeout });

    await page.evaluate(({ key, userData }) => {
      localStorage.setItem(key, JSON.stringify(userData));
    }, { key: storageKey, userData: user });
    console.log(`[auth:oauth] Injected auth as ${user.email} into localStorage key: ${storageKey}`);

    // Reload so the app bootstraps with the injected auth state
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle', { timeout });

    // Verify the key is still present after reload (app may clear it if it validates remotely)
    const stored = await page.evaluate((key) => localStorage.getItem(key), storageKey);
    if (!stored) {
      throw new Error(
        `[auth:oauth] localStorage key "${storageKey}" was cleared after reload.\n` +
        `The app may be validating the token server-side and rejecting it.\n` +
        `Check that the injected user object matches the shape the app expects.`
      );
    }
    console.log('[auth:oauth] Auth state verified — key persisted after reload');

    await page.context().storageState({ path: authFile });
    console.log(`[auth:oauth] State saved to: ${authFile}`);
    return;
  }

  // Fallback: click-based sign-in (mock button or same-page OAuth).
  // Supports split-auth (AUTH_BASE_URL ≠ BASE_URL): sign in on the hosted env,
  // then rewrite the captured storageState so tokens land on BASE_URL.
  const signinPath = process.env.OAUTH_SIGNIN_PATH || '/signin';
  const buttonTestId = process.env.OAUTH_BUTTON_TEST_ID || 'google-signin-button';
  const postLoginUrl = process.env.OAUTH_POST_LOGIN_URL || '**/';

  const authBaseUrl = getAuthUrl();
  const splitAuth = isSplitAuth();
  if (splitAuth) {
    console.log(`[auth:oauth] Split-auth: signin@${authBaseUrl} → app@${baseUrl}`);
  }

  await page.goto(`${authBaseUrl}${signinPath}`);
  await page.waitForLoadState('networkidle', { timeout });
  console.log(`[auth:oauth] Navigated to ${signinPath}`);

  const signInButton = page.getByTestId(buttonTestId);
  await signInButton.waitFor({ state: 'visible', timeout: 10000 });
  await signInButton.click();
  console.log(`[auth:oauth] Clicked ${buttonTestId}`);

  await page.waitForURL(postLoginUrl, { timeout });
  await page.waitForLoadState('networkidle', { timeout });
  console.log('[auth:oauth] Login successful');

  await page.context().storageState({ path: authFile });

  if (splitAuth) {
    const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    const authOriginHost = new URL(authBaseUrl).host;
    const appOriginNorm = new URL(baseUrl).origin;
    const appOriginHost = new URL(baseUrl).host;

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
    console.log(`[auth:oauth] Split-auth rewrite: origins ${beforeOrigins} → ${state.origins.length} (at ${appOriginNorm}), cookies ${beforeCookies} → ${state.cookies.length}`);
  }

  console.log(`[auth:oauth] State saved to: ${authFile}`);
}
