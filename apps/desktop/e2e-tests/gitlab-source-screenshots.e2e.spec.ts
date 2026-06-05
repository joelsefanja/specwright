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
    window.localStorage.setItem(`specwright.gitlab.items.assigned.${nextProjectPath}`, JSON.stringify(items));
    window.localStorage.setItem(`specwright.gitlab.items.project.${nextProjectPath}`, JSON.stringify(items));
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
      SPECWRIGHT_E2E: "1",
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
    window.localStorage.setItem("specwright.language", "en");
    await window.specwright.project.setPath(nextProjectPath);
    window.location.reload();
  }, projectPath);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "App URL and login" }).click();
  const appUrlInput = page.getByPlaceholder("https://app.example.com");
  await appUrlInput.fill("http://localhost:3000");
  await appUrlInput.blur();
  await page.getByRole("button", { name: "Describe scenarios" }).click();
  await expect(page.getByText("Starting point for this test")).toBeVisible();
  return { app, page, previousProjectPath };
}

async function openGitLabSource(page: Page, expectIssues = false): Promise<void> {
  const gitlabSource = page.getByRole("button", { name: /Choose GitLab issues/ }).first();
  if (await gitlabSource.isVisible().catch(() => false)) await gitlabSource.click();

  const targetIssue = page.getByRole("button", { name: /Checkout accepts saved cards/ }).first();
  if (expectIssues && await targetIssue.isVisible().catch(() => false)) return;

  const chooseIssue = page.locator(".operator-gitlab-actions").getByRole("button", { name: /Choose GitLab issue/ }).first();
  await chooseIssue.scrollIntoViewIfNeeded().catch(() => undefined);
  if (expectIssues && !(await chooseIssue.isEnabled().catch(() => false))) {
    const refresh = page.getByRole("button", { name: "Refresh" }).first();
    if (await refresh.isEnabled().catch(() => false)) await refresh.click();
    await expect(chooseIssue).toBeEnabled({ timeout: 30_000 }).catch(async () => {
      const allProjectIssues = page.getByRole("button", { name: "All project issues" }).first();
      if (await allProjectIssues.isEnabled().catch(() => false)) await allProjectIssues.click();
      if (!(await targetIssue.isVisible().catch(() => false))) await expect(chooseIssue).toBeEnabled({ timeout: 30_000 });
    });
  }
  if (await chooseIssue.isEnabled().catch(() => false)) {
    await chooseIssue.click();
  }
  if (expectIssues) {
    await expect(targetIssue).toBeVisible({ timeout: 30_000 });
  }
}

test("captures GitLab integration states", async () => {
  test.setTimeout(240_000);
  const projectPath = createGitLabProject();
  const screenshotsDir = path.resolve("test-results", "gitlab-integration");
  mkdirSync(screenshotsDir, { recursive: true });

  const unauthenticatedBin = createFakeGlabBin(false);
  const unauth = await launchWithProject(projectPath, unauthenticatedBin);
  try {
    await openGitLabSource(unauth.page);
    await expect(unauth.page.getByText("Sign in with glab so Specwright sees the same issues you do.")).toBeVisible();
    await expect(unauth.page.getByText("Connect GitLab to load issues from this project folder.").first()).toBeVisible();
    await unauth.page.screenshot({ path: path.join(screenshotsDir, "01-auth-required.png"), fullPage: true, timeout: 60_000 });
  } finally {
    await unauth.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), unauth.previousProjectPath);
    await unauth.app.close();
  }

  const authenticatedBin = createFakeGlabBin(true);
  const connected = await launchWithProject(projectPath, authenticatedBin, true);
  try {
    await openGitLabSource(connected.page, true);
    await expect(connected.page.getByText(/4 issues from/)).toBeVisible();
    await expect(connected.page.getByText(/My GitLab issues|MY GITLAB ISSUES/)).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "02-issue-picker.png"), fullPage: true, timeout: 60_000 });

    await connected.page.getByRole("button", { name: /Checkout accepts saved cards/ }).click();
    await expect(connected.page.getByText("demo-issue-42.md")).toBeVisible();
    await connected.page.getByText("Issue #42 is selected").first().scrollIntoViewIfNeeded().catch(() => undefined);
    await connected.page.screenshot({ path: path.join(screenshotsDir, "03-selected-issue.png"), fullPage: true, timeout: 60_000 });

    const sourcePreviewText = connected.page.getByText(/Acceptance criteria:|Checkout accepts saved cards/).first();
    if (!(await sourcePreviewText.isVisible().catch(() => false))) {
      const previewSource = connected.page.locator(".operator-selected-action-primary", { hasText: "Preview source" }).first();
      await previewSource.scrollIntoViewIfNeeded().catch(() => undefined);
      await previewSource.click({ force: true });
    }
    await expect(sourcePreviewText).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "04-source-preview.png"), fullPage: true, timeout: 60_000 });

    await connected.page.getByRole("button", { name: "Review and start", exact: true }).click();
    await expect(connected.page.getByRole("heading", { name: "Review and start" }).first()).toBeVisible();
    await expect(connected.page.getByText("GitLab #42: Checkout accepts saved cards")).toBeVisible();
    await connected.page.screenshot({ path: path.join(screenshotsDir, "05-run-tests-source-context.png"), fullPage: true, timeout: 60_000 });
  } finally {
    await connected.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), connected.previousProjectPath);
    await connected.app.close();
  }
});
