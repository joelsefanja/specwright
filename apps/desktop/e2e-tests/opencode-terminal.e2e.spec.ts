import { _electron as electron, expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function createProjectWithOpenCodeRun(): { projectPath: string; runId: string; sessionId: string } {
  const projectPath = path.join(tmpdir(), `specwright-opencode-terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runId = "run_opencode_terminal_e2e";
  const sessionId = "ses_opencode_terminal_e2e";
  const workflowPath = path.join(projectPath, "e2e-tests", "features", "playwright-bdd", "@Workflows", "@CheckoutFlow");
  const fixturesPath = path.join(projectPath, "e2e-tests", "playwright");
  const runPath = path.join(projectPath, ".specwright", "runs");
  const now = new Date().toISOString();

  mkdirSync(workflowPath, { recursive: true });
  mkdirSync(fixturesPath, { recursive: true });
  mkdirSync(runPath, { recursive: true });

  writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({ scripts: { "test:e2e": "node -e \"console.log('ok')\"" } }, null, 2));
  writeFileSync(path.join(projectPath, "playwright.config.ts"), "export default {};\n");
  writeFileSync(path.join(projectPath, "e2e-tests", "instructions.js"), [
    "export default [",
    "  {",
    "    moduleName: '@CheckoutFlow',",
    "    category: '@Workflows',",
    "    subModuleName: [],",
    "    fileName: 'checkout-flow',",
    "    inputs: {},",
    "    instructions: ['Open the checkout page', 'Confirm the order summary is visible'],",
    "    explore: true,",
    "    runExploredCases: false,",
    "    runGeneratedCases: true,",
    "    autoApprove: false,",
    "  }",
    "];\n",
  ].join("\n"));
  writeFileSync(path.join(projectPath, "e2e-tests", ".env.testing"), "BASE_URL=https://example.test\nHEADLESS=true\nAUTH_STRATEGY=none\n");
  writeFileSync(path.join(fixturesPath, "fixtures.js"), "module.exports = {};\n");
  writeFileSync(path.join(workflowPath, "checkout-flow.feature"), "Feature: Checkout flow\n  Scenario: opens\n    Given a page\n");
  writeFileSync(path.join(workflowPath, "steps.js"), "module.exports = {};\n");
  writeFileSync(path.join(runPath, `${runId}.json`), JSON.stringify({
    id: runId,
    kind: "e2e-automate",
    status: "running",
    projectPath,
    title: "Specwright OpenCode terminal E2E",
    opencodeBaseUrl: "http://127.0.0.1:18789",
    opencodeSessionId: sessionId,
    processIds: [],
    childSessionIds: [],
    pendingPermissions: [],
    permissionHistory: [],
    startedAt: now,
    updatedAt: now,
  }, null, 2));
  writeFileSync(path.join(runPath, `${runId}.log`), `${now} [orchestrator] Continue in CLI: opencode attach http://127.0.0.1:18789 --session ${sessionId}\n`);

  return { projectPath, runId, sessionId };
}

function createFakeOpenCodeBin(): string {
  const binPath = path.join(tmpdir(), `specwright-fake-opencode-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(binPath, { recursive: true });
  writeFileSync(path.join(binPath, "opencode.cmd"), "@echo off\r\nnode \"%~dp0opencode.js\" %*\r\n");
  writeFileSync(path.join(binPath, "opencode.js"), `
const args = process.argv.slice(2);
if (args[0] !== 'attach') {
  console.log('fake opencode only supports attach');
  process.exit(0);
}
console.log('OpenCode attached to test session');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk.split(String.fromCharCode(13)).join(String.fromCharCode(10));
  const parts = buffer.split(String.fromCharCode(10));
  buffer = parts.pop() || '';
  for (const part of parts) {
    if (part.trim()) process.stdout.write('received:' + part.trim() + String.fromCharCode(10));
  }
});
setInterval(() => {}, 1000);
`);
  return binPath;
}

test("shows an integrated OpenCode attach terminal while keeping external terminal control", async () => {
  test.setTimeout(60_000);
  const { projectPath, sessionId } = createProjectWithOpenCodeRun();
  const fakeOpenCodeBin = createFakeOpenCodeBin();
  const nextPath = `${fakeOpenCodeBin}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}`;
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      PATH: nextPath,
      Path: nextPath,
      SPECWRIGHT_E2E: "1",
    },
    userDataDir: path.join(tmpdir(), `specwright-opencode-terminal-user-${Date.now()}`),
  });

  const page = await app.firstWindow();

  try {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: 1500, height: 980 });
    });
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(async (nextProjectPath) => {
      window.localStorage.setItem("specwright.language", "en");
      window.localStorage.setItem("specwright.theme", "paper");
      await window.specwright.project.setPath(nextProjectPath);
      window.location.reload();
    }, projectPath);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => document.readyState === "complete");
    await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme).catch(() => undefined), { timeout: 5_000 }).toBe("paper");
    await page.waitForTimeout(500);

    await page.locator('[data-step-id="describe-test"]').click();
    await expect(page.getByRole("heading", { name: "Describe scenarios" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Check a page" }).first().click();
    await page.getByRole("button", { name: "Review and start", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review and start" })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Progress", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("OpenCode terminal")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show terminal here" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open separate", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Show terminal here" }).evaluate((button: HTMLElement) => button.click());
    await expect(page.getByRole("button", { name: "Hide output" })).toBeVisible();
    await expect(page.locator(".operator-activity-attach-output-mirror")).toContainText("OpenCode attached to test session", { timeout: 10_000 });
    await expect(page.locator(".operator-activity-attach-output-mirror")).toContainText(`--session ${sessionId}`);

    await page.locator(".operator-activity-attach-terminal").evaluate((terminal: HTMLElement) => {
      terminal.click();
      terminal.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    await page.keyboard.type("help");
    await page.keyboard.press("Enter");
    await expect(page.locator(".operator-activity-attach-output-mirror")).toContainText("received:help", { timeout: 10_000 });

    await expect(page.getByRole("button", { name: "Open separate", exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
