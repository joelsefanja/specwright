import { _electron as electron, expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

test("shows a failed agent run without shifting the workflow page", async () => {
  test.setTimeout(60_000);
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
    },
    userDataDir: path.join(tmpdir(), `specwright-agent-run-${Date.now()}`),
  });

  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.setItem("specwright.language", "nl");
      window.sessionStorage.setItem("specwright.devFeedback.state", JSON.stringify({
        jobs: [{
          id: "agent-run-error-e2e",
          context: {
            tag: "section",
            text: "",
            ariaLabel: "",
            className: "operator-card",
            domPath: "body > section.operator-card",
            rect: "320x120 @ 40,80",
            captureRect: { x: 32, y: 72, width: 336, height: 136 },
          },
          comment: "Maak de agent-run rustiger",
          output: "git apply --3way failed",
          rawOutput: "[error] git apply --3way --whitespace=nowarn failed with code 1: patch does not apply",
          activity: "niet gelukt",
          logs: ["Agent wordt gestart", "niet gelukt"],
          status: "error",
          beforeImage: null,
          afterImage: null,
        }],
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText("UI-verbeteringen")).toBeVisible();
    await expect(page.getByText("Controle nodig").first()).toBeVisible();
    await expect(page.getByText("De verbetering is gemaakt")).toBeVisible();
    await expect(page.getByText("git apply --3way")).not.toBeVisible();

    const feedbackPanel = page.locator(".operator-feedback-jobs");
    await expect(feedbackPanel).toHaveCSS("position", "fixed");

    const workflowFrame = page.locator(".operator-workflow-frame");
    await expect(workflowFrame).toBeVisible();

    const frameBox = await workflowFrame.boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(frameBox).not.toBeNull();
    expect(frameBox!.x).toBeLessThan(80);
    expect(frameBox!.width).toBeGreaterThan(viewportWidth - 120);

    await page.getByRole("button", { name: "Geselecteerd onderdeel" }).click();
    await expect(page.locator(".operator-feedback-dialog")).toBeVisible();
    await expect(page.getByText("Voorgestelde verbetering", { exact: true })).toBeVisible();
    await expect(page.getByText("Wat OpenCode aanpaste")).toBeVisible();
    await expect(page.locator(".operator-agent-readable-output")).toBeVisible();
    await expect(page.locator(".operator-agent-readable-output").filter({ hasText: "De verbetering is gemaakt" })).toBeVisible();
    await expect(page.getByText("patch does not apply")).not.toBeVisible();

    await page.getByText("Technische details").click();
    await expect(page.getByText("patch does not apply")).toBeVisible();
  } finally {
    await app.close();
  }
});
