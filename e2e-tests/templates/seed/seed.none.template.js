import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Seed template — No authentication
// Auth strategy: none
//
// This file is OVERWRITTEN on every /e2e-plan run. The pre-cleanup step
// selects this template based on AUTH_STRATEGY=none in .env.testing and
// copies it to e2e-tests/playwright/generated/seed.spec.js.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.setTimeout(90000);

// ---------------------------------------------------------------------------
// Test cases below are written from live browser exploration by /e2e-plan.
// Do not edit manually — this section is regenerated on every run.
// ---------------------------------------------------------------------------
