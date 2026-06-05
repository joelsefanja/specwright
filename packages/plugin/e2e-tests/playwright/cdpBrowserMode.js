import fs from 'fs';
import { chromium } from '@playwright/test';

let cdpBrowser = null;
let cdpContext = null;
let cdpPage = null;

export function isIntegratedBrowserMode() {
  return process.env.SPECWRIGHT_BROWSER_MODE === 'cdp' && !!process.env.SPECWRIGHT_CDP_ENDPOINT;
}

async function applyStorageStateToContext(context, storageState) {
  if (!storageState || typeof storageState !== 'string' || !fs.existsSync(storageState)) {
    return;
  }

  const raw = JSON.parse(fs.readFileSync(storageState, 'utf8'));
  const { cookies = [], origins = [] } = raw || {};

  if (Array.isArray(cookies) && cookies.length) {
    await context.addCookies(cookies).catch((err) => console.log('[CDP] addCookies failed:', err.message || err));
  }

  for (const origin of Array.isArray(origins) ? origins : []) {
    const storage = Array.isArray(origin.localStorage) ? origin.localStorage : [];

    if (!origin.origin || !storage.length) {
      continue;
    }

    await context.addInitScript(
      ({ targetOrigin, storage }) => {
        if (window.location.origin !== targetOrigin) {
          return;
        }

        for (const item of storage) {
          localStorage.setItem(item.name, item.value);
        }
      },
      { targetOrigin: origin.origin, storage },
    ).catch((err) => console.log('[CDP] addInitScript failed:', err.message || err));
  }
}

export async function getIntegratedBrowserPage(contextOptions) {
  const endpoint = process.env.SPECWRIGHT_CDP_ENDPOINT;
  const targetUrl = process.env.SPECWRIGHT_CDP_TARGET_URL || process.env.BASE_URL || '';
  const deadline = Date.now() + 20000;

  if (!cdpBrowser) {
    cdpBrowser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
    cdpContext = cdpBrowser.contexts()[0];

    if (!cdpContext) {
      throw new Error(`[CDP] No browser context found at ${endpoint}`);
    }

    await applyStorageStateToContext(cdpContext, contextOptions.storageState);
    console.log(`[CDP] Connected to Desktop integrated browser: ${endpoint}`);
  }

  while (Date.now() < deadline) {
    const pages = cdpContext.pages().filter((page) => !page.isClosed());
    cdpPage = pages.find((page) => targetUrl && page.url().startsWith(targetUrl))
      ?? pages.find((page) => !page.url().startsWith('devtools://') && !page.url().startsWith('chrome://'))
      ?? null;

    if (cdpPage) {
      return cdpPage;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const urls = cdpContext.pages().map((page) => page.url()).join(', ');
  throw new Error(`[CDP] Could not find Desktop integrated browser target${targetUrl ? ` for ${targetUrl}` : ''}. Open targets: ${urls || '(none)'}`);
}
