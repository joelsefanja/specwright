import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function createGitLabProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-gitlab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(projectPath, ".git"), { recursive: true });
  mkdirSync(path.join(projectPath, "e2e-tests", "playwright"), { recursive: true });
  mkdirSync(path.join(projectPath, "e2e-tests", "data", "migrations", "files", "gitlab-issues"), { recursive: true });
  writeFileSync(path.join(projectPath, ".git", "config"), [
    "[remote \"origin\"]",
    "\turl = https://gitlab.com/specwright/demo.git",
    "",
  ].join("\n"));
  writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({ scripts: {} }, null, 2));
  writeFileSync(path.join(projectPath, "playwright.config.ts"), "export default {};\n");
  writeFileSync(path.join(projectPath, "e2e-tests", "playwright", "fixtures.js"), "module.exports = {};\n");
  writeFileSync(path.join(projectPath, ".env.testing"), "BASE_URL=http://localhost:3000\nTEST_ENV=qat\n");
  writeFileSync(path.join(projectPath, "e2e-tests", "data", "migrations", "files", "gitlab-issues", "demo-issue-42.md"), [
    "# GitLab Issue #42: Checkout accepts saved cards",
    "",
    "- URL: https://gitlab.com/specwright/demo/-/issues/42",
    "- State: opened",
    "- Updated: 2026-05-28T12:00:00Z",
    "- Labels: e2e",
    "",
    "## Description",
    "",
    "Acceptance criteria:",
    "- Saved card can be selected.",
    "- Confirmation page shows the payment total.",
  ].join("\n"));
  return projectPath;
}

async function seedGitLabCache(page: Page, projectPath: string): Promise<void> {
  await page.evaluate((nextProjectPath) => {
    const items = {
      repo: "specwright/demo",
      username: "alex",
      errors: [],
      items: [
        { kind: "issue", iid: "42", title: "Checkout accepts saved cards", state: "opened", updatedAt: "2026-05-28T12:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/42", ref: "https://gitlab.com/specwright/demo/-/issues/42", assignedToMe: true },
        { kind: "issue", iid: "17", title: "Search filters unavailable items", state: "opened", updatedAt: "2026-05-21T10:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/17", ref: "https://gitlab.com/specwright/demo/-/issues/17", assignedToMe: false },
        { kind: "issue", iid: "9", title: "Profile page validates empty names", state: "opened", updatedAt: "2026-05-18T09:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/9", ref: "https://gitlab.com/specwright/demo/-/issues/9", assignedToMe: false },
        { kind: "issue", iid: "4", title: "Orders export includes totals", state: "opened", updatedAt: "2026-05-11T08:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/4", ref: "https://gitlab.com/specwright/demo/-/issues/4", assignedToMe: false },
      ],
    };
    window.localStorage.setItem(`specwright.gitlab.items.${nextProjectPath}`, JSON.stringify(items));
    window.localStorage.setItem("specwright.gitlab.issue.https://gitlab.com/specwright/demo/-/issues/42", JSON.stringify({
      filePath: "e2e-tests/data/migrations/files/gitlab-issues/demo-issue-42.md",
      title: "Checkout accepts saved cards",
      updatedAt: "2026-05-28T12:00:00Z",
      changed: false,
    }));
  }, projectPath);
}

function createFakeGlabBin(authenticated: boolean): string {
  const binPath = path.join(tmpdir(), `specwright-fake-glab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(binPath, { recursive: true });
  writeFileSync(path.join(binPath, "glab.cmd"), "@echo off\r\nnode \"%~dp0glab.js\" %*\r\n");
  writeFileSync(path.join(binPath, "glab.js"), `
const args = process.argv.slice(2);
const out = (value) => process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
if (args[0] === "--version") out("glab version 1.0.0\\n");
else if (args[0] === "auth" && args[1] === "status") {
  ${authenticated ? "out('Logged in to gitlab.com\\n');" : "process.stderr.write('not authenticated\\n'); process.exit(1);"}
} else if (args[0] === "api" && args[1] === "user") out({ username: "alex" });
else if (args[0] === "api" && args[1].includes("/issues?")) out([
  { iid: 42, title: "Checkout accepts saved cards", state: "opened", updated_at: "2026-05-28T12:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/42", assignees: [{ username: "alex" }] },
  { iid: 17, title: "Search filters unavailable items", state: "opened", updated_at: "2026-05-21T10:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/17", assignees: [] },
  { iid: 9, title: "Profile page validates empty names", state: "opened", updated_at: "2026-05-18T09:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/9", assignees: [] },
  { iid: 4, title: "Orders export includes totals", state: "opened", updated_at: "2026-05-11T08:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/4", assignees: [] }
]);
else if (args[0] === "api" && args[1].includes("/issues/")) out({ iid: 42, title: "Checkout accepts saved cards", state: "opened", updated_at: "2026-05-28T12:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/42", labels: ["e2e"], description: "Acceptance criteria:\\n- Saved card can be selected.\\n- Confirmation page shows the payment total." });
else if (args[0] === "api" && args[1].includes("/notes")) out([]);
else out({ fullPath: "specwright/demo" });
`);
  return binPath;
}

async function launchWithProject(projectPath: string, pathPrefix?: string, seedCache = false) {
  const nextPath = pathPrefix ? `${pathPrefix}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}` : process.env.PATH ?? process.env.Path;
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      PATH: nextPath,
      Path: nextPath,
    },
    userDataDir: path.join(tmpdir(), `specwright-electron-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());
  if (seedCache) await seedGitLabCache(page, projectPath);
  await page.evaluate(async (nextProjectPath) => {
    await window.specwright.project.setPath(nextProjectPath);
    window.location.reload();
  }, projectPath);
  const addInstruction = page.getByRole("button", { name: "Add instruction" }).first();
  await addInstruction.waitFor();
  await addInstruction.click();
  return { app, page, previousProjectPath };
}

test("captures GitLab integration states", async () => {
  test.setTimeout(90_000);
  const projectPath = createGitLabProject();
  const screenshotsDir = path.resolve("test-results", "gitlab-integration");
  mkdirSync(screenshotsDir, { recursive: true });

  const unauthenticatedBin = createFakeGlabBin(false);
  const unauth = await launchWithProject(projectPath, unauthenticatedBin);
  try {
    await expect(unauth.page.getByText("GitLab CLI needs authentication.")).toBeVisible();
    await unauth.page.screenshot({ path: path.join(screenshotsDir, "01-auth-required.png"), fullPage: true });
  } finally {
    await unauth.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), unauth.previousProjectPath);
    await unauth.app.close();
  }

  const authenticatedBin = createFakeGlabBin(true);
  const connected = await launchWithProject(projectPath, authenticatedBin, true);
  try {
    await expect(connected.page.getByText("4 open GitLab issues")).toBeVisible();
    await expect(connected.page.getByText("My issues · 1")).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "02-issue-picker.png"), fullPage: true });

    await connected.page.getByPlaceholder("Paste GitLab issue URL, project#123, or 123").fill("https://gitlab.com/specwright/demo/-/issues/42");
    await connected.page.getByRole("button", { name: "Fetch issue" }).click();
    await expect(connected.page.getByText("demo-issue-42.md")).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "03-selected-issue.png"), fullPage: true });

    await connected.page.getByRole("button", { name: "Preview" }).click();
    await expect(connected.page.getByText("Acceptance criteria:")).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "04-source-preview.png"), fullPage: true });
  } finally {
    await connected.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), connected.previousProjectPath);
    await connected.app.close();
  }
});
