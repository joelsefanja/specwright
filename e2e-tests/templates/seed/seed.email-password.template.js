import { test, expect } from '@playwright/test';
import authData from '../../data/authenticationData.js';

// ---------------------------------------------------------------------------
// Seed template — Email/Password login
// Auth strategy: email-password
//
// This file is OVERWRITTEN on every /e2e-plan run. The pre-cleanup step
// selects this template based on AUTH_STRATEGY=email-password in .env.testing
// and copies it to e2e-tests/playwright/generated/seed.spec.js.
// Customize the authenticate() function for your sign-in page selectors.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

test.setTimeout(90000);

async function authenticate(page) {
  await page.goto(`${BASE_URL}/signin`);
  await page.getByTestId(authData.loginEmail).fill(TEST_USER_EMAIL);
  await page.getByTestId(authData.loginEmailSubmit).click();
  await page.getByTestId(authData.loginPassword).fill(TEST_USER_PASSWORD);
  await page.getByTestId(authData.loginSubmit).click();
  await page.waitForURL(`${BASE_URL}/**`);
}

// ---------------------------------------------------------------------------
// Test cases below are written from live browser exploration by /e2e-plan.
// Do not edit manually — this section is regenerated on every run.
// ---------------------------------------------------------------------------
