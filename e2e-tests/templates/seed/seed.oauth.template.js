import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Seed template — OAuth (localStorage injection)
// Auth strategy: oauth
//
// This file is OVERWRITTEN on every /e2e-plan run. The pre-cleanup step
// selects this template based on AUTH_STRATEGY=oauth in .env.testing and
// copies it to e2e-tests/playwright/generated/seed.spec.js.
// Customize the authenticate() function for your OAuth storage key / user shape.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const OAUTH_STORAGE_KEY = process.env.OAUTH_STORAGE_KEY; // NO fallback — fail loud if missing
const TEST_USER_NAME = process.env.TEST_USER_NAME || '';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PICTURE = process.env.TEST_USER_PICTURE || '';

test.setTimeout(90000);

async function authenticate(page) {
  await page.goto(BASE_URL);
  await page.evaluate(({ key, user }) => {
    localStorage.setItem(key, JSON.stringify(user));
  }, {
    key: OAUTH_STORAGE_KEY,
    user: { name: TEST_USER_NAME, email: TEST_USER_EMAIL, picture: TEST_USER_PICTURE }
  });
  await page.goto(BASE_URL);
}

// ---------------------------------------------------------------------------
// Test cases below are written from live browser exploration by /e2e-plan.
// Do not edit manually — this section is regenerated on every run.
// ---------------------------------------------------------------------------
