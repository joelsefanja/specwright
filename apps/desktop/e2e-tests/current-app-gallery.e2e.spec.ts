import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const screenshotsDir = path.resolve("test-results", "current-app-gallery");

function getBackofficeProjectPath(): string | null {
  const candidates = [
    process.env.SPECWRIGHT_GALLERY_PROJECT,
    "C:/Users/Joel/dev/filters-online-issue-413/backoffice",
    "C:/Users/Joel/dev/merge-requests-oplossen/backoffice",
    "C:/Users/Joel/dev/backoffice",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(path.join(candidate, "e2e-tests", "playwright", "auth-strategies", "backoffice.js"))) ?? null;
}

function createWorkflowProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-current-gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

function createGitLabProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-current-gallery-gitlab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    "- Labels: e2e, checkout",
    "",
    "## Description",
    "",
    "Acceptance criteria:",
    "- Saved card can be selected.",
    "- Confirmation page shows the payment total.",
  ].join("\n"));
  return projectPath;
}

function createFakeGlabBin(authenticated: boolean): string {
  const binPath = path.join(tmpdir(), `specwright-current-gallery-glab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
else if (args[0] === "api" && args[1].includes("/issues/")) out({ iid: 42, title: "Checkout accepts saved cards", state: "opened", updated_at: "2026-05-28T12:00:00Z", web_url: "https://gitlab.com/specwright/demo/-/issues/42", labels: ["e2e", "checkout"], description: "Acceptance criteria:\\n- Saved card can be selected.\\n- Confirmation page shows the payment total." });
else if (args[0] === "api" && args[1].includes("/notes")) out([]);
else out({ fullPath: "specwright/demo" });
`);
  return binPath;
}

async function launchApp(options: { projectPath?: string; pathPrefix?: string; seedFeedback?: boolean } = {}) {
  const nextPath = options.pathPrefix ? `${options.pathPrefix}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}` : process.env.PATH ?? process.env.Path;
  const app = await electron.launch({
    args: [path.resolve(".")],
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
      SPECWRIGHT_E2E_SHOW: "1",
      PATH: nextPath,
      Path: nextPath,
    },
    userDataDir: path.join(tmpdir(), `specwright-current-gallery-user-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
    await page.evaluate(({ seedFeedback }) => {
      window.localStorage.setItem("specwright.language", "en");
      window.localStorage.setItem("specwright.theme", "paper");
      window.localStorage.setItem("specwright.uiScale.v2", "1");
      window.localStorage.setItem("specwright.motion", "operator");
    if (seedFeedback) {
      window.sessionStorage.setItem("specwright.devFeedback.state", JSON.stringify({
        jobs: [{
          id: "current-gallery-feedback-job",
          context: {
            tag: "section",
            text: "Run preferences Browser, video, AI, and approvals",
            ariaLabel: "",
            className: "operator-access-preferences-card",
            domPath: "body > main .operator-access-preferences-card",
            rect: "300x96 @ 1290,640",
            captureRect: { x: 1260, y: 620, width: 340, height: 120 },
          },
          comment: "Make this settings entry feel less technical and more reassuring.",
          contextScope: "page",
          output: "Proposed update: simplify the label, make the status calmer, and reduce the amount of secondary copy.",
          rawOutput: "OpenCode draft output: inspected ConfigureAccessStep and proposed a smaller settings card treatment.",
          activity: "Needs review",
          logs: ["Starting the agent", "Workspace prepared", "Needs review"],
          status: "done",
          beforeImage: null,
          afterImage: null,
          worktreePath: "C:/tmp/specwright-feedback-worktree",
        }],
      }));
    }
  }, { seedFeedback: Boolean(options.seedFeedback) });
  const previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());
  if (options.projectPath) {
    await page.evaluate(async (nextProjectPath) => {
      await window.specwright.project.setPath(nextProjectPath);
      window.location.reload();
    }, options.projectPath);
    await page.waitForLoadState("domcontentloaded");
  } else {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await setScaleTo100(page);
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 5_000 }).toBe("paper");
  return { app, page, previousProjectPath };
}

async function setScaleTo100(page: Page): Promise<void> {
  await page.keyboard.down("Control");
  await page.keyboard.press("0");
  await page.keyboard.up("Control");
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sw-ui-scale").trim()), { timeout: 5_000 }).toBe("1.25");
}

async function capture(page: Page, name: string, createdFiles: string[]): Promise<void> {
  await page.waitForTimeout(450);
  const filePath = path.join(screenshotsDir, `${String(createdFiles.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false, timeout: 60_000 });
  createdFiles.push(filePath);
}

async function openStep(page: Page, stepId: string): Promise<void> {
  const heading = page.getByTestId("step-heading").first();
  const step = page.getByTestId(`step-${stepId}`).first();
  if (await heading.isVisible().catch(() => false)) return;
  await step.getByRole("button").first().click();
  await expect(heading).toBeVisible({ timeout: 15_000 });
}

function writeDesignerPrompt(createdFiles: string[]): void {
  writeFileSync(path.join(screenshotsDir, "designer-inspiration-prompt.md"), [
    "# Specwright Desktop UI Inspiration Prompt",
    "",
    "You are reviewing the current Specwright desktop app UI at 100% scale. Use the screenshots in this folder as the source of truth.",
    "",
    "## Product Context",
    "Specwright is an AI-powered E2E test maker. The desktop app guides users through: choose project, configure app access, describe a test goal, then create/run the test. It also supports GitLab issue import and an OpenCode-powered design-feedback workflow.",
    "",
    "## Design Direction To Explore",
    "- Keep the current premium, calm, light professional theme, but make hierarchy sharper and less gray where primary intent matters.",
    "- Preserve compact operator-tool density, but make each step feel more guided and less form-like.",
    "- Treat GitLab import as a confident source picker, not an integration error panel. Make auth, repo, assigned items, selected issue, and preview states feel like one coherent flow.",
    "- Make modals feel like one system: same header rhythm, close affordance, body scroll behavior, footer/action placement, and responsive constraints.",
    "- The feedback/OpenCode UI should feel like a small design copilot: friendly, inspectable, and clearly background-capable. Right-bottom jobs should be useful but not visually heavy.",
    "",
    "## Specific Areas To Reconsider",
    "- Stepper: selected state and completion state could be more distinctive without adding visual noise.",
    "- Step 2 access: make app link/login/readiness feel more like a setup checklist with a single clear next action.",
    "- Step 3 describe test: source options, GitLab state, and test-goal entry should have a clearer visual priority order.",
    "- Step 4 run tests: readiness and run affordances should feel more action-oriented once prerequisites are done.",
    "- Command palette: explore a more product-specific look than a generic command menu while keeping keyboard utility.",
    "- Feedback modal: clarify what will happen when the user starts an improvement, where it runs, and how review/apply works.",
    "",
    "## Constraints",
    "- Do not make it flashy, neon, or gamer-like.",
    "- Keep desktop productivity density and good mobile fallback.",
    "- Primary actions must remain blue with white text.",
    "- Inputs can stay fully rounded; textareas should keep a softer rectangular radius.",
    "- Avoid generic SaaS cards everywhere; use structure, spacing, and copy to make the workflow memorable.",
    "",
    "## Screenshot Set",
    ...createdFiles.map((filePath) => `- ${path.basename(filePath)}`),
    "",
  ].join("\n"));
}

test("captures current app gallery at 100 percent scale", async () => {
  test.setTimeout(180_000);
  rmSync(screenshotsDir, { recursive: true, force: true });
  mkdirSync(screenshotsDir, { recursive: true });
  const createdFiles: string[] = [];

  const backofficeProject = getBackofficeProjectPath();
  const workflowProject = backofficeProject ?? createWorkflowProject();
  const workflow = await launchApp({ projectPath: workflowProject });
  try {
    await openStep(workflow.page, "connect-project");
    await capture(workflow.page, "workflow-01-choose-project-folder", createdFiles);

    await workflow.page.getByText(/set app url/i).first().click().catch(() => undefined);
    await openStep(workflow.page, "configure-access");
    await capture(workflow.page, "workflow-02-app-url-and-login", createdFiles);

    await workflow.page.getByTestId("run-preferences").click().catch(() => undefined) ?? await workflow.page.getByRole("button", { name: "Run preferences" }).click();
    const prefsDialog = workflow.page.getByTestId("run-preferences-dialog");
    if (await prefsDialog.isVisible().catch(() => false)) {
      await capture(workflow.page, "popup-01-run-preferences", createdFiles);
      await workflow.page.keyboard.press("Escape");
    }

    const addLoginDetails = workflow.page.getByRole("button", { name: /add login details/i }).first();
    const loginSwitchOff = workflow.page.locator('button[role="switch"][aria-checked="false"]').first();
    if (await addLoginDetails.isVisible().catch(() => false)) {
      await addLoginDetails.click();
      await expect(workflow.page.getByTestId("test-login-dialog")).toBeVisible();
      await capture(workflow.page, "popup-02-test-login", createdFiles);
      await workflow.page.keyboard.press("Escape");
    } else if (await loginSwitchOff.isVisible().catch(() => false)) {
      await loginSwitchOff.click();
      const authDialog = workflow.page.getByTestId("test-login-dialog");
      if (await authDialog.isVisible().catch(() => false)) {
        await capture(workflow.page, "popup-02-test-login", createdFiles);
        await workflow.page.keyboard.press("Escape");
      } else {
        await capture(workflow.page, "popup-02-backoffice-login-strategy", createdFiles);
      }
    } else {
      await capture(workflow.page, "popup-02-backoffice-login-state", createdFiles);
    }

    await workflow.page.getByPlaceholder("https://app.example.com").fill("https://example.test");
    await workflow.page.getByPlaceholder("https://app.example.com").blur();
    await workflow.page.getByTestId("step-describe-test").getByRole("button").click();
    await expect(workflow.page.getByTestId("step-heading")).toBeVisible();
    await capture(workflow.page, "workflow-03-describe-scenarios", createdFiles);
  } finally {
    await workflow.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), workflow.previousProjectPath).catch(() => undefined);
    await workflow.app.close();
  }

  const gitlabProject = backofficeProject ?? createGitLabProject();
  const unauthGitlab = await launchApp({ projectPath: gitlabProject, pathPrefix: createFakeGlabBin(false) });
  try {
    await workflow.page.getByTestId("step-configure-access").getByRole("button").click();
    await expect(workflow.page.getByTestId("step-heading")).toBeVisible();
    const unauthChooseIssue = unauthGitlab.page.getByRole("button", { name: /Choose GitLab issues?/ }).first();
    if (await unauthChooseIssue.isEnabled().catch(() => false)) await unauthChooseIssue.click();
    await unauthGitlab.page.getByText(/GitLab|glab|Sign in|Login missing|auth/i).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    await unauthGitlab.page.getByText(/Choose GitLab source|Connect GitLab|glab/i).first().scrollIntoViewIfNeeded().catch(() => undefined);
    await capture(unauthGitlab.page, "gitlab-01-auth-required", createdFiles);
  } finally {
    await unauthGitlab.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), unauthGitlab.previousProjectPath).catch(() => undefined);
    await unauthGitlab.app.close();
  }

  const authGitlab = await launchApp({ projectPath: gitlabProject, pathPrefix: createFakeGlabBin(true) });
  try {
    await authGitlab.page.evaluate(() => {
      window.localStorage.setItem("specwright.gitlab.items.assigned.C%3A%5CUsers%5CJoel%5Cdev%5Cspecwright%5Capps%5Cdesktop%5Ce2e-tests%5Cdata%5Cmigrations%5Cfiles%5Cgitlab-issues", JSON.stringify({
        repo: "specwright/demo",
        username: "alex",
        errors: [],
        items: [
          { kind: "issue", iid: "42", title: "Checkout accepts saved cards", state: "opened", updatedAt: "2026-05-28T12:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/42", ref: "https://gitlab.com/specwright/demo/-/issues/42", assignedToMe: true },
          { kind: "issue", iid: "17", title: "Search filters unavailable items", state: "opened", updatedAt: "2026-05-21T10:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/17", ref: "https://gitlab.com/specwright/demo/-/issues/17", assignedToMe: false },
          { kind: "issue", iid: "9", title: "Profile page validates empty names", state: "opened", updatedAt: "2026-05-18T09:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/9", ref: "https://gitlab.com/specwright/demo/-/issues/9", assignedToMe: false },
          { kind: "issue", iid: "4", title: "Orders export includes totals", state: "opened", updatedAt: "2026-05-11T08:00:00Z", webUrl: "https://gitlab.com/specwright/demo/-/issues/4", ref: "https://gitlab.com/specwright/demo/-/issues/4", assignedToMe: false },
        ],
      }));
    });
    await authGitlab.page.reload({ waitUntil: "domcontentloaded" });
    await authGitlab.page.getByTestId("step-describe-test").getByRole("button").click();
    await expect(authGitlab.page.getByTestId("step-heading")).toBeVisible();
    const targetIssue = authGitlab.page.getByRole("button", { name: /Checkout accepts saved cards/ }).first();
    if (!(await targetIssue.isVisible().catch(() => false))) {
      await authGitlab.page.getByRole("button", { name: /Choose GitLab issues?/ }).first().click();
    }
    await expect(authGitlab.page.getByText(/4 issues from/)).toBeVisible();
    await authGitlab.page.getByText("Choose GitLab source").first().scrollIntoViewIfNeeded().catch(() => undefined);
    await capture(authGitlab.page, "gitlab-02-issue-picker", createdFiles);
    await authGitlab.page.getByRole("button", { name: /Checkout accepts saved cards/ }).click();
    await expect(authGitlab.page.getByText("demo-issue-42.md")).toBeVisible();
    await authGitlab.page.getByText("Issue #42 is selected").first().scrollIntoViewIfNeeded().catch(() => undefined);
    await capture(authGitlab.page, "gitlab-03-selected-issue", createdFiles);
    const sourcePreviewText = authGitlab.page.getByText(/Acceptance criteria|Checkout accepts saved cards|GitLab Issue/i).first();
    if (!(await sourcePreviewText.isVisible().catch(() => false))) {
      const previewSource = authGitlab.page.locator(".operator-selected-action-primary", { hasText: "Preview source" }).first();
      await previewSource.scrollIntoViewIfNeeded().catch(() => undefined);
      await previewSource.click({ force: true });
    }
    await sourcePreviewText.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    await sourcePreviewText.scrollIntoViewIfNeeded().catch(() => undefined);
    await capture(authGitlab.page, "gitlab-04-source-preview-open", createdFiles);
  } finally {
    await authGitlab.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), authGitlab.previousProjectPath).catch(() => undefined);
    await authGitlab.app.close();
  }

  const feedback = await launchApp({ projectPath: workflowProject, seedFeedback: true });
  try {
    await expect(feedback.page.getByTestId("feedback-jobs-panel")).toBeVisible();
    await capture(feedback.page, "feedback-01-jobs-popup-expanded", createdFiles);
    await feedback.page.getByTestId("jobs-toggle").first().click();
    await capture(feedback.page, "feedback-02-jobs-popup-collapsed", createdFiles);
    await feedback.page.getByTestId("jobs-toggle").first().click();
    await feedback.page.getByTestId("agent-run-card").first().getByTestId("job-title").click();
    await expect(feedback.page.getByTestId("feedback-dialog")).toBeVisible();
    await capture(feedback.page, "feedback-03-opencode-review-modal", createdFiles);
    await feedback.page.getByTestId("dialog-close").first().click();
    await expect(feedback.page.getByTestId("feedback-dialog")).toBeHidden({ timeout: 10_000 });

    await feedback.page.getByTestId("step-configure-access").getByRole("button").click();
    await expect(feedback.page.getByTestId("step-heading")).toBeVisible();
    const target = feedback.page.getByTestId("run-preferences");
    await target.click({ button: "right" });
    await expect(feedback.page.getByTestId("feedback-context-menu")).toBeVisible();
    await capture(feedback.page, "feedback-04-context-menu", createdFiles);
    await feedback.page.getByTestId("magic-wright-page-copy").click();
    await expect(feedback.page.getByTestId("feedback-dialog")).toBeVisible();
    await capture(feedback.page, "feedback-05-magic-wright-request-modal", createdFiles);
    await feedback.page.getByTestId("dialog-close").first().click();
    await expect(feedback.page.getByTestId("feedback-dialog")).toBeHidden({ timeout: 10_000 });
    await target.click({ button: "right" });
    await expect(feedback.page.getByTestId("feedback-context-menu")).toBeVisible();
    await feedback.page.getByTestId("design-feedback-button").click();
    await expect(feedback.page.getByTestId("feedback-dialog")).toBeVisible();
    await capture(feedback.page, "feedback-06-opencode-request-modal", createdFiles);
  } finally {
    await feedback.page.evaluate(async (projectPathBeforeTest) => window.specwright.project.setPath(projectPathBeforeTest ?? ""), feedback.previousProjectPath).catch(() => undefined);
    await feedback.app.close();
  }

  writeDesignerPrompt(createdFiles);
  console.log("current-app-gallery created files:", createdFiles);
  console.log("current-app-gallery designer prompt:", path.join(screenshotsDir, "designer-inspiration-prompt.md"));
});
