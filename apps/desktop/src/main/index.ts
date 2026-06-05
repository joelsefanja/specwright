import { app, BrowserWindow, nativeImage, shell, Menu, MenuItem, ipcMain } from "electron";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { cp, lstat, mkdir, symlink } from "fs/promises";
import { autoUpdater } from "electron-updater";
import { ConfigService } from "./services/ConfigService";
import { OpenCodeService } from "./services/OpenCodeService";
import { ProjectService } from "./services/ProjectService";
import { RequirementsService } from "./services/RequirementsService";
import { registerConfigIpc } from "./ipc/config.ipc";
import { registerProjectIpc } from "./ipc/project.ipc";
import { registerPipelineIpc } from "./ipc/pipeline.ipc";
import { registerRequirementsIpc } from "./ipc/requirements.ipc";
import { registerAtlassianIpc } from "./ipc/atlassian.ipc";
import { registerNetworkIpc } from "./ipc/network.ipc";
import { registerOpenCodeBridgeHandlers } from "./ipc/opencode.ipc";
import { registerReportIpc } from "./ipc/report.ipc";
import { registerRunRegistryBridgeHandlers } from "./ipc/runs.ipc";
import { initLogger, closeLogger, log, getLogFilePath, isLoggingEnabled, setLoggingEnabled, clearLocalLogs } from "./logger";

// Suppress EPIPE errors from aborted pipeline processes — these are expected
// when the user clicks Abort and the SDK process is killed mid-write.
process.on("uncaughtException", (err) => {
  if (err.message?.includes("EPIPE") || err.message?.includes("write EPIPE")) {
    console.warn("[main] Suppressed EPIPE error (pipeline aborted)");
    log("[main] Suppressed EPIPE error (pipeline aborted)");
    return;
  }
  // Re-throw non-EPIPE errors
  console.error("[main] Uncaught exception:", err);
  log(`[main] Uncaught exception: ${err.message}\n${err.stack ?? ""}`);
});

let mainWindow: BrowserWindow | null = null;
const activeDevFeedbackProcesses = new Map<string, { kill: () => void }>();

const configService = new ConfigService();
const openCodeService = new OpenCodeService();
const projectService = new ProjectService();
const requirementsService = new RequirementsService(projectService);
const APP_USER_MODEL_ID = "com.specwright.desktop";
const CDP_PORT = process.env.SPECWRIGHT_DESKTOP_CDP_PORT || "9333";
const appIconPath = join(app.getAppPath(), "build", process.platform === "win32" ? "icon.ico" : "icon.png");

if (!isPlaywrightElectronLaunch()) {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT);
}

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}
app.setName("Specwright");

function isPlaywrightElectronLaunch(): boolean {
  return process.env.SPECWRIGHT_E2E === "1"
    || hasCommandLineSwitch("remote-debugging-port")
    || process.argv.some((arg) => arg.includes("playwright-core") && arg.includes("electron"));
}

function shouldShowMainWindow(): boolean {
  return process.env.SPECWRIGHT_E2E !== "1" || process.env.SPECWRIGHT_E2E_SHOW === "1";
}

function hasCommandLineSwitch(name: string): boolean {
  const prefixedName = `--${name}`;
  return app.commandLine.hasSwitch(name) || process.argv.some((arg) => arg === prefixedName || arg.startsWith(`${prefixedName}=`));
}

function registerWindowIpc(): void {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-fullscreen", () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

function registerDevFeedbackIpc(): void {
  ipcMain.handle("dev-feedback:capture-screenshot", async (_event, rect?: { x: number; y: number; width: number; height: number }) => {
    const win = mainWindow;
    if (app.isPackaged || !win) {
      return { ok: false, error: "Dev feedback is only available in local development." };
    }
    try {
      const captureRect = rect ? {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height)),
      } : undefined;
      const image = await win.webContents.capturePage(captureRect);
      const size = image.getSize();
      const resized = size.width > 720 ? image.resize({ width: 720 }) : image;
      return { ok: true, dataUrl: resized.toDataURL() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("dev-feedback:run", async (_event, payload: { id?: string; prompt: string }) => {
    const win = mainWindow;
    if (app.isPackaged || !win) {
      return { ok: false, error: "Dev feedback is only available in local development." };
    }

    try {
      const jobId = payload.id || randomUUID();
      const worktree = await createDevFeedbackWorktree(jobId);
      win.webContents.send("dev-feedback:log", { id: jobId, line: `Worktree: ${worktree.path}` });
      await runDevFeedbackWithOpenCodeAcp({
        id: jobId,
        cwd: worktree.path,
        model: process.env.SPECWRIGHT_MODEL || "gpt-5.5-fast",
        providerId: process.env.SPECWRIGHT_OPENCODE_PROVIDER_ID || "openai",
        prompt: payload.prompt,
        onToken: (token) => win.webContents.send("dev-feedback:token", { id: jobId, token }),
        onLog: (line) => win.webContents.send("dev-feedback:log", { id: jobId, line }),
        onDone: (fullText) => win.webContents.send("dev-feedback:done", { id: jobId, fullText, worktreePath: worktree.path }),
      });
      return { ok: true, id: jobId, worktreePath: worktree.path };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      win.webContents.send("dev-feedback:error", { id: payload.id, error: message });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("dev-feedback:cancel", (_event, payload: { id: string }) => {
    if (app.isPackaged) return { ok: false, error: "Dev feedback is only available in local development." };
    const active = activeDevFeedbackProcesses.get(payload.id);
    if (!active) return { ok: true, cancelled: false };
    active.kill();
    activeDevFeedbackProcesses.delete(payload.id);
    return { ok: true, cancelled: true };
  });

  ipcMain.handle("dev-feedback:apply-worktree", async (_event, payload: { worktreePath: string }) => {
    if (app.isPackaged) return { ok: false, error: "Dev feedback is only available in local development." };
    try {
      const result = await applyDevFeedbackWorktree(payload.worktreePath);
      return { ok: true, applied: result.applied };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, errorCode: isPatchApplyConflict(message) ? "patch-conflict" : "apply-failed" };
    }
  });
}

async function createDevFeedbackWorktree(jobId: string): Promise<{ path: string }> {
  const root = (await runCommand("git", ["rev-parse", "--show-toplevel"], process.cwd())).stdout.trim();
  if (!root) throw new Error("Could not resolve git root for dev feedback worktree.");
  const parent = join(app.getPath("temp"), "specwright-dev-feedback-worktrees");
  await mkdir(parent, { recursive: true });
  const worktreePath = join(parent, jobId);
  await runCommand("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], root);
  await linkDevDependencies(root, worktreePath);
  await mirrorWorkingChanges(root, worktreePath);
  return { path: worktreePath };
}

async function mirrorWorkingChanges(root: string, worktreePath: string): Promise<void> {
  const diff = await runCommand("git", ["diff", "--binary", "HEAD"], root);
  if (diff.stdout.trim()) {
    await runCommand("git", ["apply", "--3way", "--whitespace=nowarn"], worktreePath, diff.stdout);
  }
  await copyUntrackedFiles(root, worktreePath);
  await runCommand("git", ["add", "-A"], worktreePath);
  const staged = await runCommand("git", ["diff", "--cached", "--quiet"], worktreePath).then(() => false).catch(() => true);
  if (staged) {
    await runCommand("git", ["-c", "user.name=Specwright Dev Feedback", "-c", "user.email=dev-feedback@specwright.local", "commit", "-m", "dev-feedback baseline"], worktreePath);
  }
}

async function copyUntrackedFiles(root: string, worktreePath: string): Promise<void> {
  const result = await runCommand("git", ["ls-files", "--others", "--exclude-standard", "-z"], root);
  const files = result.stdout.split("\0").filter(Boolean).filter((file) => !file.includes("node_modules/"));
  for (const file of files) {
    await mkdir(dirname(join(worktreePath, file)), { recursive: true });
    await cp(join(root, file), join(worktreePath, file), { recursive: true, force: true, verbatimSymlinks: true });
  }
}

async function linkDevDependencies(root: string, worktreePath: string): Promise<void> {
  for (const relativePath of ["node_modules", join("apps", "desktop", "node_modules")]) {
    const source = join(root, relativePath);
    const target = join(worktreePath, relativePath);
    try {
      await lstat(source);
      await mkdir(dirname(target), { recursive: true });
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
    } catch {
      // Dependencies are optional for dev-feedback; the agent can still edit files.
    }
  }
}

async function applyDevFeedbackWorktree(worktreePath: string): Promise<{ applied: boolean }> {
  const root = (await runCommand("git", ["rev-parse", "--show-toplevel"], process.cwd())).stdout.trim();
  await runCommand("git", ["add", "-A"], worktreePath);
  const diff = await runCommand("git", ["diff", "--cached", "--binary", "HEAD"], worktreePath);
  if (!diff.stdout.trim()) return { applied: false };
  try {
    await runCommand("git", ["apply", "--3way", "--whitespace=nowarn"], root, diff.stdout);
  } catch (error) {
    if (!isPatchApplyConflict(error instanceof Error ? error.message : String(error))) throw error;
    await runCommand("git", ["apply", "--whitespace=nowarn"], root, diff.stdout);
  }
  return { applied: true };
}

function isPatchApplyConflict(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("patch does not apply")
    || normalized.includes("patch failed")
    || normalized.includes("does not match index")
    || normalized.includes("does not exist in index")
    || normalized.includes("repository lacks the necessary blob")
    || normalized.includes("cannot fall back to three-way merge");
}

async function runCommand(command: string, args: string[], cwd: string, stdin?: string): Promise<{ stdout: string; stderr: string }> {
  const { spawn } = await import("child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}: ${stderr.trim()}`));
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function runDevFeedbackWithOpenCodeAcp(options: {
  id: string;
  cwd: string;
  model: string;
  providerId: string;
  prompt: string;
  onToken: (token: string) => void;
  onLog: (line: string) => void;
  onDone: (fullText: string) => void;
}): Promise<void> {
  const { spawn } = await import("child_process");
  const systemPrompt = [
    "You are editing the Specwright desktop app source code.",
    "Apply the user's UI feedback directly in the repository.",
    "Keep changes small, preserve existing style, and run targeted checks if needed.",
    "You must verify the change with the most relevant check, preferably pnpm --filter @specwright/desktop build for renderer/main changes.",
    "Answer in the same language as the user's feedback.",
    "Do not narrate your plan or tool usage. After editing, reply with at most 3 short bullets: changed, checked, note. The checked bullet must say what passed or what could not be checked.",
    "Do not touch auth files or secrets.",
  ].join("\n");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("opencode", ["acp", "--cwd", options.cwd], {
      cwd: options.cwd,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeDevFeedbackProcesses.set(options.id, { kill: () => child.kill() });

    let nextId = 1;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let sessionId: string | null = null;
    let fullText = "";
    let settled = false;
    const pendingMethods = new Map<number, string>();

    const sendRequest = (method: string, params: Record<string, unknown>): void => {
      const id = nextId++;
      pendingMethods.set(id, method);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    };

    const sendResponse = (id: number, result: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
    };

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      activeDevFeedbackProcesses.delete(options.id);
      if (!child.killed) child.kill();
      if (error) reject(error);
      else {
        options.onDone(fullText);
        resolve();
      }
    };

    const handleUpdate = (update: Record<string, unknown>): void => {
      const updateType = update.sessionUpdate as string | undefined;
      const content = update.content as { type?: string; text?: string } | undefined;
      if (updateType === "agent_message_chunk" && content?.type === "text" && content.text) {
        fullText += content.text;
        options.onToken(content.text);
      } else if (updateType && updateType !== "tool_call" && updateType !== "agent_thought_chunk" && updateType !== "available_commands_update" && updateType !== "tool_call_update") {
        options.onLog(`[opencode] ${updateType}`);
      }
    };

    const firstPermissionOption = (message: Record<string, unknown>): string => {
      const params = message.params as Record<string, unknown> | undefined;
      const optionsList = (params?.options ?? []) as Array<{ optionId?: string }>;
      return optionsList[0]?.optionId ?? "allow_once";
    };

    const handleMessage = (message: Record<string, unknown>): void => {
      const id = message.id as number | undefined;
      const method = message.method as string | undefined;
      if (id !== undefined && method) {
        sendResponse(id, method === "session/request_permission" ? { outcome: { outcome: "selected", optionId: firstPermissionOption(message) } } : {});
        return;
      }
      if (method === "session/update") {
        const params = message.params as { update?: Record<string, unknown> } | undefined;
        if (params?.update) handleUpdate(params.update);
        return;
      }
      if (id === undefined) return;
      const pendingMethod = pendingMethods.get(id);
      pendingMethods.delete(id);
      if (message.error) {
        const error = message.error as { message?: string };
        finish(new Error(error.message ?? `OpenCode ACP ${pendingMethod ?? "request"} failed`));
        return;
      }
      const result = message.result as Record<string, unknown> | undefined;
      if (pendingMethod === "initialize") {
        sendRequest("session/new", { cwd: options.cwd, mcpServers: [] });
      } else if (pendingMethod === "session/new") {
        sessionId = result?.sessionId as string | null;
        if (!sessionId) {
          finish(new Error("OpenCode ACP did not return a sessionId"));
          return;
        }
        sendRequest("session/set_config_option", { sessionId, configId: "model", value: `${options.providerId}/${options.model}` });
      } else if (pendingMethod === "session/set_config_option") {
        if (sessionId) sendRequest("session/prompt", { sessionId, prompt: [{ type: "text", text: `${systemPrompt}\n\n${options.prompt}` }] });
      } else if (pendingMethod === "session/prompt") {
        finish();
      }
    };

    const handleLine = (line: string): void => {
      if (!line.trim()) return;
      try {
        handleMessage(JSON.parse(line) as Record<string, unknown>);
      } catch {
        options.onLog(`[opencode] ${line}`);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrBuffer += text;
      for (const line of text.split(/\r?\n/)) if (line.trim()) options.onLog(`[opencode] ${line}`);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
      finish(new Error(`opencode acp exited with code ${code}: ${stderrBuffer.trim()}`));
    });

    sendRequest("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "specwright-desktop-dev-feedback", version: "0.2.0" },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
  });
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Specwright",
    icon: appIconPath,
    backgroundColor: "#f1f3f7",
    autoHideMenuBar: process.platform !== "darwin",
    fullscreen: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
  });

  if (process.platform !== "darwin") {
    mainWindow.setMenuBarVisibility(false);
  }

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (shouldShowMainWindow()) mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return mainWindow;
}

/**
 * Build the native macOS menu bar.
 * Includes a "Specwright" app menu and standard Edit/View/Window/Help menus.
 * The Help menu includes log-related actions (enable/disable, open, reveal).
 */
function buildMenu(): void {
  const refreshLogToggle = (): void => {
    // Rebuild menu to reflect updated checked state
    buildMenu();
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu (first item always gets the app name automatically)
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "Enable Logging",
          type: "checkbox",
          checked: isLoggingEnabled(),
          click(item: MenuItem): void {
            setLoggingEnabled(item.checked);
            log(`[main] Logging ${item.checked ? "enabled" : "disabled"} via menu`);
            refreshLogToggle();
          },
        },
        { type: "separator" },
        {
          label: "Open Log File",
          accelerator: "CmdOrCtrl+Shift+L",
          enabled: !!getLogFilePath(),
          click(): void {
            const p = getLogFilePath();
            if (p) shell.openPath(p);
          },
        },
        {
          label: "Show Log in Finder",
          enabled: !!getLogFilePath(),
          click(): void {
            const p = getLogFilePath();
            if (p) shell.showItemInFolder(p); // reveals the specific launch file
          },
        },
        {
          label: "Copy Log Path",
          enabled: !!getLogFilePath(),
          click(): void {
            const p = getLogFilePath();
            if (p) {
              const { clipboard } = require("electron");
              clipboard.writeText(p);
            }
          },
        },
        {
          label: "Clear Old Logs",
          enabled: !!getLogFilePath(),
          click(): void {
            clearLocalLogs();
          },
        },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  // Initialise file logger first so all subsequent events are captured
  initLogger();
  log("[main] App ready");

  // In a packaged .app Electron inherits a minimal PATH (/usr/bin:/bin).
  // Fix it once here so ALL child processes (MCP servers, npx, uvx, node)
  // get the user's full PATH — same technique used by VS Code and Cursor.
  if (app.isPackaged) {
    try {
      const { execSync } = require("child_process");
      const shell = require("fs").existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
      const fullPath = execSync(`${shell} -l -c 'echo $PATH'`, {
        timeout: 5000, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (fullPath) {
        process.env.PATH = fullPath;
        log(`[main] PATH set from login shell: ${fullPath}`);
      }
    } catch (err) {
      log(`[main] WARNING: could not resolve login shell PATH: ${String(err)}`);
    }
  }

  // Init store (dynamic import required for ESM-only electron-store v10)
  await configService.init();

  // Set dock icon on macOS — use PNG (more reliable than .icns for nativeImage)
  const iconPng = join(__dirname, "../../build/icon.png");
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconPng);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  const win = createWindow();

  registerConfigIpc(configService);
  registerProjectIpc(configService, projectService, () => mainWindow);
  registerPipelineIpc(configService, projectService, openCodeService, () => mainWindow);
  registerRequirementsIpc(requirementsService, () => mainWindow);
  registerAtlassianIpc();
  registerNetworkIpc();
  registerReportIpc();
  registerRunRegistryBridgeHandlers(() => configService.getProjectPath() || undefined);
  registerWindowIpc();
  registerOpenCodeBridgeHandlers(openCodeService);
  registerDevFeedbackIpc();

  // Open a URL in the system default browser
  const { ipcMain } = await import("electron");
  ipcMain.handle("shell:open-url", (_event, url: string) => shell.openExternal(url));

  // ── Auto-update ──────────────────────────────────────────────────────────
  ipcMain.handle("app:get-version", () => app.getVersion());

  const RELEASES_URL = "https://github.com/SanthoshDhandapani/specwright/releases/latest";

  ipcMain.handle("app:install-update", () => {
    // macOS requires a code-signed app for Squirrel's in-place update.
    // Until the build is signed with an Apple Developer ID, open the releases
    // page so the user can download and install the new DMG manually.
    shell.openExternal(RELEASES_URL);
  });

  if (app.isPackaged) {
    // Don't auto-download — without code signing the install always fails with
    // a signature validation error. Just notify the renderer so it can show the
    // "new version available" badge, and let the user download from GitHub.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("update-available", (info) => {
      log(`[updater] Update available: ${info.version}`);
      mainWindow?.webContents.send("app:update-downloaded", { version: info.version });
    });

    autoUpdater.on("error", (err) => {
      log(`[updater] Check failed: ${err.message}`);
    });

    autoUpdater.checkForUpdates().catch((err) => {
      log(`[updater] Check failed: ${err.message}`);
    });
  }

  buildMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  win.on("ready-to-show", () => {
    if (shouldShowMainWindow()) win.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Clean up zombie MCP/Playwright child processes on quit
app.on("before-quit", () => {
  log("[main] App quitting — cleaning up child processes");
  closeLogger();
  try {
    const { execSync } = require("child_process");
    // Kill any playwright-mcp or specwright-mcp processes spawned by this app
    execSync("pkill -f 'playwright-mcp|@playwright/mcp|@specwright/mcp-server|playwright run-test-mcp-server' 2>/dev/null || true", { stdio: "ignore" });
  } catch {
    // ignore — best effort cleanup
  }
});
