import { app, BrowserWindow, nativeImage, shell, Menu, MenuItem, ipcMain } from "electron";
import { join } from "path";
import { autoUpdater } from "electron-updater";
import { ConfigService } from "./services/ConfigService";
import { ProjectService } from "./services/ProjectService";
import { registerConfigIpc } from "./ipc/config.ipc";
import { registerProjectIpc } from "./ipc/project.ipc";
import { registerPipelineIpc } from "./ipc/pipeline.ipc";
import { registerAtlassianIpc } from "./ipc/atlassian.ipc";
import { registerNetworkIpc } from "./ipc/network.ipc";
import { registerOpencodeIpc } from "./ipc/opencode.ipc";
import { registerReportIpc } from "./ipc/report.ipc";
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

const configService = new ConfigService();
const projectService = new ProjectService();

function registerWindowIpc(): void {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-fullscreen", () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Specwright",
    icon: join(__dirname, "../../build/icon.png"),
    backgroundColor: "#11100e",
    autoHideMenuBar: process.platform !== "darwin",
    fullscreen: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
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
    mainWindow?.show();
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
  registerPipelineIpc(configService, projectService, () => mainWindow);
  registerAtlassianIpc();
  registerNetworkIpc();
  registerReportIpc();
  registerWindowIpc();
  registerOpencodeIpc();

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
    win.show();
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
