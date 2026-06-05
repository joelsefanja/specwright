import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

interface RunRecord {
  id: string;
  kind: string;
  status: string;
  opencodeSessionId?: string;
}

function listRunRecords(projectPath: string): RunRecord[] {
  const runsRoot = path.join(projectPath, ".specwright", "runs");
  if (!existsSync(runsRoot)) return [];

  return readdirSync(runsRoot)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => JSON.parse(readFileSync(path.join(runsRoot, fileName), "utf-8")) as RunRecord);
}

interface ArtifactSnapshot {
  latestMtimeMs: number;
  files: string[];
}

function listGeneratedArtifacts(projectPath: string): string[] {
  const roots = [
    path.join(projectPath, "e2e-tests", "features", "playwright-bdd"),
    path.join(projectPath, "e2e-tests", "plans"),
    path.join(projectPath, "e2e-tests", "playwright", "generated"),
  ];
  const results: string[] = [];

  const walk = (directoryPath: string): void => {
    if (!existsSync(directoryPath)) return;
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "shared") walk(entryPath);
        continue;
      }
      if (entry.name === ".gitkeep") continue;
      if (entry.name.endsWith(".feature") || entry.name.endsWith(".steps.js") || entry.name === "steps.js" || entry.name.endsWith(".md") || entry.name.endsWith(".spec.js")) {
        results.push(entryPath);
      }
    }
  };

  roots.forEach(walk);
  return results;
}

function snapshotGeneratedArtifacts(projectPath: string): ArtifactSnapshot {
  const files = listGeneratedArtifacts(projectPath);
  const latestMtimeMs = files.reduce((latest, filePath) => Math.max(latest, statSync(filePath).mtimeMs), 0);
  return { files, latestMtimeMs };
}

function findUsefulTodoArtifact(projectPath: string, afterMtimeMs: number): string | null {
  return listGeneratedArtifacts(projectPath).find((filePath) => {
    if (statSync(filePath).mtimeMs <= afterMtimeMs) return false;
    const content = readFileSync(filePath, "utf-8");
    return /todo/i.test(content) && /high/i.test(content) && /completed|complete/i.test(content);
  }) ?? null;
}

async function waitForUrl(url: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the dev server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcessTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill();
}

test("uses a file source to generate useful Todo BDD tests with screenshots and video", async ({}, testInfo) => {
  test.setTimeout(900_000);

  const desktopRoot = path.resolve(".");
  const repoRoot = path.resolve(desktopRoot, "..", "..");
  const todoAppPath = path.join(repoRoot, "apps", "examples", "todo-app");
  const scenarioPath = path.join(repoRoot, "SPECWRIGHT_TODO_SCENARIO_FOR_TESTING.md");
  expect(existsSync(scenarioPath)).toBeTruthy();
  expect(existsSync(path.join(todoAppPath, "package.json"))).toBeTruthy();
  const existingRunIds = new Set(listRunRecords(todoAppPath).map((run) => run.id));
  const beforeArtifacts = snapshotGeneratedArtifacts(todoAppPath);

  const artifactsDir = path.resolve("test-results", "specwright-readme-file-flow");
  const videoDir = path.join(artifactsDir, "video-raw");
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });

  const screenshots: string[] = [];
  let screenshotIndex = 1;
  const capture = async (name: string, targetPage: Page): Promise<void> => {
    await targetPage.waitForTimeout(500);
    const filePath = path.join(artifactsDir, `${String(screenshotIndex).padStart(2, "0")}-${name}.png`);
    screenshotIndex += 1;
    await targetPage.screenshot({ path: filePath, fullPage: true });
    screenshots.push(filePath);
  };

  let todoDevServer: ChildProcess | null = null;
  try {
    await waitForUrl("http://localhost:5174", 3000);
  } catch {
    todoDevServer = spawn("pnpm", ["--filter", "todo-app", "dev", "--", "--host", "127.0.0.1"], {
      cwd: repoRoot,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "ignore",
    });
    await waitForUrl("http://localhost:5174");
  }

  const app = await electron.launch({
    args: [desktopRoot],
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      SPECWRIGHT_E2E: "1",
      SPECWRIGHT_LLM_PROVIDER: "opencode",
      SPECWRIGHT_MODEL: "gpt-5.5-fast",
    },
    recordVideo: {
      dir: videoDir,
      size: { width: 1920, height: 1080 },
    },
    userDataDir: path.join(tmpdir(), `specwright-readme-file-flow-userdata-${Date.now()}`),
  } as Parameters<typeof electron.launch>[0] & { recordVideo: { dir: string; size: { width: number; height: number } } });

  const page = await app.firstWindow();
  const video = page.video();
  let previousProjectPath = "";
  let savedVideoPath: string | null = null;

  await app.evaluate(({ dialog }, payload: { projectPath: string; filePath: string }) => {
    dialog.showOpenDialog = async (...args: unknown[]) => {
      const options = args.at(-1) as { properties?: string[] } | undefined;
      const properties = options?.properties ?? [];
      const filePaths = properties.includes("createDirectory") ? [payload.projectPath] : [payload.filePath];
      return { canceled: false, filePaths, bookmarks: [] };
    };
  }, { projectPath: todoAppPath, filePath: scenarioPath });

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
    previousProjectPath = await page.evaluate(async () => window.specwright.project.getPath());

    await page.evaluate(async () => {
      window.localStorage.setItem("specwright.language", "en");
      await window.specwright.project.setPath("");
      window.location.reload();
    });

    await openStep(/Choose project folder|Projectmap kiezen/);
    await page.getByRole("button", { name: "Choose project folder", exact: true }).click();
    await expect(page.getByText(todoAppPath).first()).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => page.evaluate((selectedProjectPath) => window.specwright.project.isBootstrapped(selectedProjectPath), todoAppPath), { timeout: 90_000 }).toBeTruthy();
    expect(existsSync(path.join(todoAppPath, "e2e-tests", "playwright", "fixtures.js"))).toBeTruthy();
    expect(existsSync(path.join(todoAppPath, ".specwright.json"))).toBeTruthy();
    await page.evaluate(async (selectedProjectPath) => {
      await window.specwright.project.writeEnv(selectedProjectPath, {
        SPECWRIGHT_LLM_PROVIDER: "opencode",
        SPECWRIGHT_MODEL: "gpt-5.5-fast",
      });
    }, todoAppPath);
    await capture("01-choose-project-folder", page);

    const continueToAccess = page.getByRole("button", { name: "Set app URL" }).first();
    if (await continueToAccess.count()) await continueToAccess.click();

    await openStep("App URL and login");
    await capture("02-app-access", page);

    const appLinkInput = page.getByPlaceholder("https://app.example.com");
    await appLinkInput.fill("http://localhost:5174");
    await appLinkInput.blur();
    const continueToScenarios = page.getByRole("button", { name: "Describe scenarios" });
    await expect(continueToScenarios).toBeEnabled({ timeout: 10_000 });
    await continueToScenarios.click();

    await expect(page.getByRole("heading", { name: "Describe scenarios" }).first()).toBeVisible();
    await capture("03-describe-scenarios-before-file", page);

    const fileSource = page.locator(".operator-source-option").nth(2);
    await expect(fileSource).toBeVisible({ timeout: 10_000 });
    await fileSource.click();
    await expect(page.getByText("SPECWRIGHT_TODO_SCENARIO_FOR_TESTING.md").first()).toBeVisible({ timeout: 10_000 });
    await capture("04-readme-file-source-selected", page);

    const previewSource = page.getByRole("button", { name: /preview source|show source|source/i }).first();
    if (await previewSource.isVisible().catch(() => false)) {
      await previewSource.click();
      await page.waitForTimeout(500);
      await capture("05-readme-source-preview", page);
    }

    const reviewSetup = page.getByRole("button", { name: "Review and start", exact: true });
    await expect(reviewSetup).toBeEnabled({ timeout: 10_000 });
    await reviewSetup.click();

    await expect(page.getByRole("heading", { name: "Review and start" }).first()).toBeVisible();
    await expect(page.getByText("SPECWRIGHT_TODO_SCENARIO_FOR_TESTING.md").first()).toBeVisible();
    const startButton = page.getByRole("button", { name: "Create and run test" }).first();
    await expect(startButton).toBeEnabled({ timeout: 10_000 });
    await capture("06-review-and-start", page);

    await startButton.click();
    await expect(page.getByText(/Specwright is working|OpenCode is working|OpenCode session/i).first()).toBeVisible({ timeout: 60_000 });
    await capture("07-run-started-feedback", page);

    const instructionsPath = path.join(todoAppPath, "e2e-tests", "instructions.js");
    await expect.poll(() => existsSync(instructionsPath)).toBeTruthy();
    const instructions = readFileSync(instructionsPath, "utf-8");
    expect(instructions).toContain("SPECWRIGHT_TODO_SCENARIO_FOR_TESTING.md");
    expect(instructions).toContain("e2e-tests/data/migrations/files");

    let startedRunId = "";
    await expect.poll(() => {
      const run = listRunRecords(todoAppPath).find((candidate) => {
        return !existingRunIds.has(candidate.id) && candidate.kind === "e2e-automate" && Boolean(candidate.opencodeSessionId);
      });
      startedRunId = run?.id ?? "";
      return run?.opencodeSessionId ?? "";
    }, { timeout: 180_000 }).not.toBe("");
    expect(startedRunId).not.toBe("");
    await capture("08-opencode-session-created", page);

    await expect.poll(() => findUsefulTodoArtifact(todoAppPath, beforeArtifacts.latestMtimeMs), { timeout: 600_000 }).not.toBeNull();
    const usefulArtifact = findUsefulTodoArtifact(todoAppPath, beforeArtifacts.latestMtimeMs);
    expect(usefulArtifact).toBeTruthy();
    await capture("09-generated-useful-todo-artifacts", page);

    const abortResult = await page.evaluate(async () => window.specwright.pipeline.abort());
    expect(abortResult.ok).toBeTruthy();
    await expect.poll(() => {
      return listRunRecords(todoAppPath).find((run) => run.id === startedRunId)?.status;
    }, { timeout: 60_000 }).toBe("aborted");
  } finally {
    try {
      await page.evaluate(async () => {
        if (!window.specwright?.pipeline) return;
        await window.specwright.pipeline.abort();
      });
      await page.evaluate(async (projectPathBeforeTest) => {
        if (!window.specwright?.project) return;
        await window.specwright.project.setPath(projectPathBeforeTest ?? "");
      }, previousProjectPath);
    } catch {
      // Ignore cleanup failures when the renderer is already closing.
    }
    await app.close();
    stopProcessTree(todoDevServer);
    if (video) {
      savedVideoPath = path.join(artifactsDir, "specwright-readme-file-flow.webm");
      await video.saveAs(savedVideoPath).catch(() => {
        savedVideoPath = null;
      });
    }
  }

  testInfo.annotations.push({ type: "specwright-readme-file-flow-screenshots", description: JSON.stringify(screenshots) });
  testInfo.annotations.push({ type: "specwright-readme-file-flow-video", description: savedVideoPath ?? "video-not-available" });
  console.log("specwright-readme-file-flow screenshots:", screenshots);
  console.log("specwright-readme-file-flow video:", savedVideoPath ?? "video-not-available");
});
