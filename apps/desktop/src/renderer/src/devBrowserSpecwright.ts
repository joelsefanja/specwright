const DEV_BROWSER_PROJECT_KEY = "specwright.devBrowser.projectPath";
const DEV_BROWSER_ENV_KEY = "specwright.devBrowser.env";

const defaultEnv: EnvVars = {
  BASE_URL: "http://localhost:3000",
  TEST_ENV: "local",
  HEADLESS: "true",
};

type Unsubscribe = () => void;

function off(): Unsubscribe {
  return () => undefined;
}

function unsupported(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is only available in the Electron app.`));
}

function readStoredEnv(): EnvVars {
  try {
    const raw = window.localStorage.getItem(DEV_BROWSER_ENV_KEY);
    return raw ? { ...defaultEnv, ...JSON.parse(raw) as EnvVars } : { ...defaultEnv };
  } catch {
    return { ...defaultEnv };
  }
}

function writeStoredEnv(vars: EnvVars): void {
  window.localStorage.setItem(DEV_BROWSER_ENV_KEY, JSON.stringify(vars));
}

export function installDevBrowserSpecwright(): boolean {
  if (window.specwright) return true;
  if (!import.meta.env.DEV) return false;

  const attachOutputListeners = new Set<(data: { attachId: string; stream: "stdout" | "stderr"; chunk: string }) => void>();
  const attachExitListeners = new Set<(data: { attachId: string; code: number | null; error?: string }) => void>();

  const api: Window["specwright"] = {
    project: {
      pickFolder: async () => {
        const projectPath = "Browser preview project";
        window.localStorage.setItem(DEV_BROWSER_PROJECT_KEY, projectPath);
        return projectPath;
      },
      pickFiles: async () => [],
      uploadTestFile: () => unsupported("File upload"),
      fetchGitLabIssue: () => unsupported("GitLab import"),
      listGitLabItems: async () => ({ repo: "browser-preview", items: [], errors: ["GitLab is only available in Electron."] }),
      gitLabStatus: async () => ({ hasGlab: false, authenticated: false, repo: "browser-preview" }),
      readGitLabSource: async () => ({ markdown: "", images: [], missing: true }),
      bootstrap: async () => ({ success: true }),
      validatePlugin: async () => ({ valid: false, error: "Plugin validation is only available in Electron." }),
      detectPlugin: async () => ({ name: "@specwright/plugin", version: "dev-browser", authStrategy: "none", hasOverlay: false }),
      listAuthStrategies: async () => ["email-password", "oauth", "none"],
      getPath: async () => window.localStorage.getItem(DEV_BROWSER_PROJECT_KEY) ?? "",
      setPath: async (projectPath) => {
        if (projectPath) window.localStorage.setItem(DEV_BROWSER_PROJECT_KEY, projectPath);
        else window.localStorage.removeItem(DEV_BROWSER_PROJECT_KEY);
      },
      isBootstrapped: async (projectPath) => Boolean(projectPath),
      readEnv: async () => readStoredEnv(),
      writeEnv: async (_projectPath, vars) => writeStoredEnv(vars),
      readInstructions: async () => [],
      writeInstructions: async () => undefined,
      readTemplates: async () => [],
      readCustomTemplates: async () => [],
      writeCustomTemplates: async () => undefined,
      onBootstrapLog: () => off(),
      readTestScripts: async () => ({}),
      readFeatureModules: async () => ({ modules: [], workflows: [] }),
    },

    pipeline: {
      start: () => unsupported("Pipeline runs"),
      abort: async () => ({ ok: true, state: "idle" }),
      interrupt: async () => ({ ok: true, reason: "Browser preview has no active run." }),
      sendMessage: () => unsupported("Agent messaging"),
      respondPermission: async () => undefined,
      readContextFiles: async () => ({ plan: "", seed: "", conventions: "" }),
      onToken: () => off(),
      onDone: () => off(),
      onError: () => off(),
      onAborted: () => off(),
      onLog: () => off(),
      onDirectRunUpdate: () => off(),
      onPermissionRequest: () => off(),
      onToolStart: () => off(),
      onToolEnd: () => off(),
      onExploreResult: () => off(),
      onMcpStatus: () => off(),
      getLogPath: async () => null,
      openLog: async () => false,
      clearLogs: async () => 0,
    },

    shell: {
      openUrl: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
    },

    window: {
      minimize: async () => undefined,
      toggleFullscreen: async () => {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return false;
        }
        await document.documentElement.requestFullscreen();
        return true;
      },
      close: async () => undefined,
    },

    network: {
      verifyEndpoint: async (baseUrl) => ({ ok: Boolean(baseUrl), message: baseUrl ? "Endpoint saved for browser preview." : "Enter a base URL." }),
    },

    report: {
      checkAvailable: async () => ({ playwright: false, bdd: false, allure: false }),
      openPlaywright: () => unsupported("Playwright reports"),
      openBdd: () => unsupported("BDD reports"),
      openAllure: () => unsupported("Allure reports"),
      startTestReport: () => unsupported("Test reports"),
    },

    runs: {
      list: async () => [],
      inspect: async () => ({}),
      logs: async () => "",
      diff: async () => ({ diff: "", changedFiles: [] }),
      abort: async () => ({ ok: true }),
      respondPermission: async () => ({ ok: true }),
    },

    opencode: {
      health: async () => ({ ok: false }),
      detectModel: async () => null,
      listProviders: async () => ({ default: {}, connected: [] }),
      startServer: async () => ({ ok: false, error: "OpenCode server control is only available in Electron." }),
      stopServer: async () => ({ ok: true }),
      serverStatus: async () => ({ running: false }),
      openAttachTerminal: async () => ({ ok: false, error: "External terminal is only available in Electron." }),
      startAttachStream: async (payload) => {
        const attachId = payload.attachId ?? `browser-preview-${Date.now()}`;
        window.setTimeout(() => {
          for (const listener of attachOutputListeners) {
            listener({ attachId, stream: "stdout", chunk: "Browser preview: OpenCode attach requires the Electron app.\r\n" });
          }
          for (const listener of attachExitListeners) {
            listener({ attachId, code: 0 });
          }
        }, 0);
        return { ok: true, attachId };
      },
      stopAttachStream: async () => ({ ok: true }),
      sendAttachInput: async () => ({ ok: false, error: "OpenCode attach input is only available in Electron." }),
      resizeAttachStream: async () => ({ ok: true }),
      onAttachOutput: (cb) => {
        attachOutputListeners.add(cb);
        return () => attachOutputListeners.delete(cb);
      },
      onAttachExit: (cb) => {
        attachExitListeners.add(cb);
        return () => attachExitListeners.delete(cb);
      },
    },

    app: {
      getVersion: async () => "dev-browser",
      onUpdateAvailable: () => off(),
      onUpdateDownloaded: () => off(),
      installUpdate: async () => undefined,
    },

    atlassian: {
      status: async () => ({ status: "idle" }),
      connect: async () => ({ success: false, error: "Atlassian auth is only available in Electron." }),
      disconnect: async () => ({ success: true }),
    },

    devFeedback: {
      isE2E: false,
      captureScreenshot: async () => ({ ok: false, error: "Screenshots are only available in Electron." }),
      run: async () => ({ ok: false, error: "Dev feedback agents are only available in Electron." }),
      applyWorktree: async () => ({ ok: false, error: "Applying worktrees is only available in Electron." }),
      cancel: async () => ({ ok: true, cancelled: false }),
      onToken: () => off(),
      onLog: () => off(),
      onDone: () => off(),
      onError: () => off(),
    },
  };

  window.specwright = api;
  document.documentElement.dataset.runtime = "browser-preview";
  return true;
}
