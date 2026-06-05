import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function createWorkflowProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-workflow-redesign-${Date.now()}`);
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

test("captures workflow step and modal screenshots", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const screenshotsDir = path.resolve("test-results", "workflow-redesign");
  mkdirSync(screenshotsDir, { recursive: true });

  const modalStatus: Record<string, string> = {
    advancedSettings: "not-captured",
    authSettings: "not-captured",
    runTestsPalette: "not-captured",
  };

  const createdFiles: string[] = [];
  let screenshotIndex = 1;
  const capture = async (name: string, targetPage: Page): Promise<void> => {
    await targetPage.waitForTimeout(650);
    const fileName = `${String(screenshotIndex).padStart(2, "0")}-${name}.png`;
    const filePath = path.join(screenshotsDir, fileName);
    screenshotIndex += 1;
    await targetPage.screenshot({ path: filePath, fullPage: true });
    createdFiles.push(filePath);
  };

  const closeOpenBackdrops = async (): Promise<void> => {
    const backdrop = page.locator(".operator-settings-modal-backdrop");
    const devFeedbackDialog = page.locator(".operator-feedback-dialog").first();
    if (await devFeedbackDialog.isVisible().catch(() => false)) {
      const closeDevFeedback = devFeedbackDialog.locator("button[aria-label='Sluiten'], button[aria-label='Close']").first();
      if (await closeDevFeedback.count()) await closeDevFeedback.click({ force: true });
      else await page.mouse.click(8, 8);
      await expect(devFeedbackDialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const count = await backdrop.count();
      if (count === 0) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(80);
    }
    await expect(backdrop).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
  };

  const projectPath = createWorkflowProject();
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
    },
    userDataDir: path.join(tmpdir(), `specwright-workflow-redesign-${Date.now()}`),
  });

  const page = await app.firstWindow();
  let previousProjectPath = "";

  const openStep = async (stepTitle: string | RegExp): Promise<void> => {
    const heading = page.getByRole("heading", { name: stepTitle }).first();
    if (await heading.count()) {
      await expect(heading).toBeVisible();
      return;
    }

    const button = page.getByRole("button", { name: stepTitle }).first();
    if (await button.count()) {
      await button.click();
      await expect(page.getByRole("heading", { name: stepTitle }).first()).toBeVisible();
      return;
    }

    const textNode = page.getByText(stepTitle).first();
    if (await textNode.count()) {
      await textNode.click({ force: true });
      await expect(page.getByRole("heading", { name: stepTitle }).first()).toBeVisible();
    }
  };

  try {
    await page.waitForLoadState("domcontentloaded");
    await closeOpenBackdrops();
    previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());

    await page.evaluate(async (nextProjectPath) => {
      window.localStorage.setItem("specwright.language", "en");
      await window.specwright.project.setPath(nextProjectPath);
      window.location.reload();
    }, projectPath);

    const continueToAppLink = page.getByRole("button", { name: "Set app URL" });
    if (await continueToAppLink.count()) {
      await continueToAppLink.click();
    }

    await openStep(/Choose project folder|Projectmap kiezen/);
    await expect(page.getByRole("heading", { name: /Choose project folder|Projectmap kiezen/ }).first()).toBeVisible();
    await capture("connect-project-step", page);

    const continueToAccess = page.getByRole("button", { name: "Set app URL" });
    if (await continueToAccess.count()) {
      await continueToAccess.first().click();
    }

    await openStep("App URL and login");
    await expect(page.locator(".operator-access-step-label", { hasText: "Add your app URL" })).toBeVisible();
    await capture("configure-access-step", page);

    const advancedSettingsButton = page.getByRole("button", { name: "Run preferences" });
    if (await advancedSettingsButton.count()) {
      await advancedSettingsButton.click();
      const advancedHeading = page.getByRole("heading", { name: "Advanced settings" });
      const advancedModal = page.locator(".operator-settings-modal[role='dialog']").first();
      if (await advancedHeading.count()) {
        await expect(advancedHeading).toBeVisible();
        await capture("configure-access-modal-advanced-settings", page);
        modalStatus.advancedSettings = "captured";
      }
      const closeAdvanced = page.locator(".operator-settings-modal [aria-label='Close']").first();
      if (await closeAdvanced.count()) {
        await closeAdvanced.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(advancedModal).toBeHidden({ timeout: 10_000 }).catch(() => undefined);
      await closeOpenBackdrops();
    }

    const loginSwitch = page.locator('button[role="switch"][aria-checked="false"]').first();
    if (await loginSwitch.count()) {
      await loginSwitch.click();
    }
    const authModal = page.getByRole("dialog", { name: "Set test login" }).first();
    if (!(await authModal.isVisible().catch(() => false))) {
      const authSettingsButton = page.getByRole("button", { name: /add login details/i }).first();
      if (await authSettingsButton.count()) {
        await authSettingsButton.click();
      }
    }
    if (await authModal.count()) {
      await expect(authModal).toBeVisible();
      await capture("configure-access-modal-auth-settings", page);
      modalStatus.authSettings = "captured";
      await page.keyboard.press("Escape");
      await expect(authModal).toBeHidden({ timeout: 10_000 }).catch(() => undefined);
      await closeOpenBackdrops();
    }

    const loginSwitchEnabled = page.locator('button[role="switch"][aria-checked="true"]').first();
    if (await loginSwitchEnabled.count()) {
      await loginSwitchEnabled.click({ force: true });
      await expect(loginSwitchEnabled).toHaveAttribute("aria-checked", "false", { timeout: 5_000 }).catch(async () => {
        await page.evaluate(() => {
          document.querySelector<HTMLButtonElement>('button[role="switch"][aria-checked="true"]')?.click();
        });
      });
    }

    const appLinkInput = page.getByPlaceholder("https://app.example.com");
    await appLinkInput.fill("https://example.test");
    await appLinkInput.blur();
    const continueToScenarios = page.getByRole("button", { name: "Describe scenarios" });
    await expect(continueToScenarios).toBeEnabled({ timeout: 10_000 });
    await continueToScenarios.click();

    await expect(page.getByRole("heading", { name: "Describe scenarios" }).first()).toBeVisible();
    await capture("describe-test-step", page);

    const useTemplateButton = page.getByRole("button", { name: "Check a page" }).first();
    if (await useTemplateButton.count()) {
      await useTemplateButton.click();
    }
    const reviewSetup = page.getByRole("button", { name: "Review and start", exact: true });
    await expect(reviewSetup).toBeEnabled({ timeout: 10_000 });
    await reviewSetup.click();

    await expect(page.getByRole("heading", { name: "Review and start" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create and run test" }).first()).toBeVisible();
    await capture("run-tests-step", page);

    const runPalette = page.locator(".operator-panel.operator-command").first();
    if (!(await runPalette.isVisible().catch(() => false))) {
      const runTestsToolbarButton = page.getByRole("button", { name: /run tests/i }).first();
      await runTestsToolbarButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
      if (await runTestsToolbarButton.isVisible().catch(() => false)) {
        await runTestsToolbarButton.click();
      } else {
        modalStatus.runTestsPalette = "not-available";
      }
    }
    if (await runPalette.count()) {
      await expect(runPalette).toBeVisible({ timeout: 10_000 });
      await capture("run-tests-modal-palette", page);
      modalStatus.runTestsPalette = "captured";
      await page.keyboard.press("Escape");
    }
  } finally {
    try {
      await page.evaluate(async (projectPathBeforeTest) => {
        if (!window.specwright?.project) return;
        await window.specwright.project.setPath(projectPathBeforeTest ?? "");
      }, previousProjectPath);
    } catch {
      // ignore cleanup failures when the renderer is already reloading/closed
    }
    await app.close();
  }

  testInfo.annotations.push({ type: "workflow-redesign-created-files", description: JSON.stringify(createdFiles) });
  testInfo.annotations.push({ type: "workflow-redesign-modal-status", description: JSON.stringify(modalStatus) });
  console.log("workflow-redesign created files:", createdFiles);
  console.log("workflow-redesign modal status:", modalStatus);
});
