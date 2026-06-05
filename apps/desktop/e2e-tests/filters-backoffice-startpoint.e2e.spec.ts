import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BACKOFFICE_PROJECT = "C:/Users/Joel/dev/filters-online-issue-413/backoffice";

test("filled backoffice start point unlocks the run step", async () => {
  test.skip(!existsSync(BACKOFFICE_PROJECT), "filters-online backoffice project is not available on this machine");
  test.setTimeout(90_000);

  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
    },
    userDataDir: path.join(tmpdir(), `specwright-filters-startpoint-${Date.now()}`),
  });
  const page = await app.firstWindow();
  let previousProjectPath = "";

  try {
    await page.waitForLoadState("domcontentloaded");
    previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());
    await page.evaluate(async (projectPath) => {
      window.localStorage.setItem("specwright.language", "en");
      await window.specwright.project.setPath(projectPath);
      window.location.reload();
    }, BACKOFFICE_PROJECT);
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: "App URL and login" }).click();
    const appLinkInput = page.getByPlaceholder("https://app.example.com");
    await appLinkInput.fill("https://dev.mpluskassa.online/backoffice");
    await appLinkInput.blur();
    const goToScenarios = page.getByRole("button", { name: "Describe scenarios" });
    await expect(goToScenarios).toBeEnabled({ timeout: 10_000 });
    await goToScenarios.click();

    await expect(page.getByRole("heading", { name: "Describe scenarios" }).first()).toBeVisible();
    await page.getByLabel("Step 1").fill("Open the product edit screen and verify that filters remain available.");
    await page.getByText("Where will this test live?").click();
    await page.locator('input[aria-label="App area"]:visible').fill("Products");
    await page.locator('input[aria-label="Starting point in the app"]:visible').fill("data-management/products/overview/2/edit");

    const reviewSetup = page.getByRole("button", { name: "Review and start", exact: true });
    await expect(reviewSetup).toBeEnabled({ timeout: 10_000 });
    await reviewSetup.click();

    await expect(page.getByRole("heading", { name: "Review and start" }).first()).toBeVisible();
    await expect(page.getByText("Complete 'Starting point' before running the test.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create and run test" })).toBeEnabled({ timeout: 10_000 });
  } finally {
    await page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), previousProjectPath).catch(() => undefined);
    await app.close();
  }
});
