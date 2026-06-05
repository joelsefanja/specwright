import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-tests",
  testMatch: "**/*.e2e.spec.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  workers: 1,
  use: {
    headless: process.env.SPECWRIGHT_E2E_SHOW !== "1",
  },
  reporter: [
    ["list"],
    ["allure-playwright", { resultsDir: "test-results/allure/results", suiteTitle: false }],
  ],
});
