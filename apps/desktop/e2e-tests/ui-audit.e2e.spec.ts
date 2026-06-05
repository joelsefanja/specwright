import { _electron as electron, expect, test } from "@playwright/test";
import { auditPlaywrightPage } from "@specwright/ui-audit";
import path from "node:path";

test("desktop shell passes deterministic theme UI audit", async () => {
  test.skip(process.platform === "win32", "Playwright Electron launch fails on Windows with Electron 33.");

  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
    },
  });

  const page = await app.firstWindow();
  try {
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "paper";
      document.documentElement.dataset.motion = "calm";
    });

    const audit = await auditPlaywrightPage(page, {
      allowedFontFamilies: ["Segoe UI", "Inter", "system-ui", "JetBrains Mono", "Fira Code"],
      forbiddenVisibleText: ["raw opencode command", "undefined", "null", "lorem ipsum"],
      themeAttribute: "theme",
      motionAttribute: "motion",
    });
    const blockingIssues = audit.issues.filter((issue) => issue.severity === "error");

    expect(audit.theme).toBe("paper");
    expect(audit.motion).toBe("calm");
    expect(blockingIssues, JSON.stringify(blockingIssues, null, 2)).toEqual([]);
  } finally {
    await app.close();
  }
});
