import { _electron as electron, expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function createRunnableProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-run-tests-${Date.now()}`);
  const workflowPath = path.join(projectPath, "e2e-tests", "features", "playwright-bdd", "@Workflows", "@CheckoutFlow");
  const fixturesPath = path.join(projectPath, "e2e-tests", "playwright");
  const binPath = path.join(projectPath, "node_modules", ".bin");

  mkdirSync(workflowPath, { recursive: true });
  mkdirSync(fixturesPath, { recursive: true });
  mkdirSync(binPath, { recursive: true });
  writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({
    scripts: {
      "test:e2e": "node -e \"console.log('all tests ok')\"",
      "test:e2e:workflows": "node -e \"console.log('workflow tests ok')\"",
    },
  }, null, 2));
  writeFileSync(path.join(projectPath, "playwright.config.ts"), "export default {};\n");
  writeFileSync(path.join(binPath, "bddgen.cmd"), "@echo off\r\necho bddgen ok\r\nexit /b 0\r\n");
  writeFileSync(path.join(fixturesPath, "fixtures.js"), "module.exports = {};\n");
  writeFileSync(path.join(workflowPath, "checkout-flow.feature"), "@checkout-flow\nFeature: Checkout flow\n  Scenario: opens\n    Given a page\n");
  writeFileSync(path.join(workflowPath, "steps.js"), "module.exports = {};\n");

  return projectPath;
}

test("clicking a Run Tests workflow opens the run screen without renderer recovery", async () => {
  const projectPath = createRunnableProject();
  const userDataDir = path.join(tmpdir(), `specwright-electron-${Date.now()}`);
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    userDataDir,
  });

  const page = await app.firstWindow();
  let previousProjectPath = "";

  try {
    await page.waitForLoadState("domcontentloaded");
    previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());

    try {
      await page.evaluate(async (nextProjectPath) => {
        await window.specwright.project.setPath(nextProjectPath);
        window.location.reload();
      }, projectPath);

      await page.getByRole("button", { name: "Run Tests" }).waitFor();
      await page.getByRole("button", { name: "Run Tests" }).click();
      await page.getByRole("button", { name: "CheckoutFlow" }).click();

      await expect(page.getByText("Interface recovered")).toHaveCount(0);
      await expect(page.getByText("Cannot access 'activeTool' before initialization")).toHaveCount(0);
      await expect(page.getByText("Starting direct test run: test:e2e:workflows --grep @CheckoutFlow")).toBeVisible();
      await expect(page.getByText("Run in progress").or(page.getByText("Run complete"))).toBeVisible();
    } finally {
      await page.evaluate(async (projectPathBeforeTest) => {
        await window.specwright.project.setPath(projectPathBeforeTest ?? "");
      }, previousProjectPath);
    }
  } finally {
    await app.close();
  }
});
