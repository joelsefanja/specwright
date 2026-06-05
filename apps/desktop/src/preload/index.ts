import { contextBridge, ipcRenderer } from "electron";

// The preload script is Specwright's safe IPC bridge. React code talks to the
// typed window.specwright API below; only this file can forward those calls to
// Electron's main process, where filesystem, process, and shell access live.

interface ExploreResultData {
  url: string;
  title: string;
  summary: string;
  pageCount: number;
  error: string | null;
}

contextBridge.exposeInMainWorld("specwright", {
  project: {
    pickFolder: () => ipcRenderer.invoke("project:pick-folder"),
    pickFiles: () => ipcRenderer.invoke("project:pick-files") as Promise<string[]>,
    uploadTestFile: (sourcePath: string) =>
      ipcRenderer.invoke("project:upload-test-file", sourcePath) as Promise<string>,
    fetchGitLabIssue: (folderPath: string, issueRef: string) =>
      ipcRenderer.invoke("project:fetch-gitlab-issue", folderPath, issueRef) as Promise<{
        filePath: string; title: string; updatedAt: string; changed: boolean;
      }>,
    listGitLabItems: (folderPath: string, mode?: "assigned" | "project") =>
      ipcRenderer.invoke("project:list-gitlab-items", folderPath, mode) as Promise<{
        repo: string;
        username?: string | null;
        items: Array<{ kind: "issue" | "work_item"; iid: string; title: string; state?: string; updatedAt?: string; webUrl?: string; ref: string; assignedToMe?: boolean }>;
        errors: string[];
      }>,
    gitLabStatus: (folderPath: string) =>
      ipcRenderer.invoke("project:gitlab-status", folderPath) as Promise<{ hasGlab: boolean; authenticated: boolean; repo?: string; username?: string | null; error?: string }>,
    readGitLabSource: (folderPath: string, relativePath: string) =>
      ipcRenderer.invoke("project:read-gitlab-source", folderPath, relativePath) as Promise<{ markdown: string; images: string[]; missing?: boolean }>,
    bootstrap: (folderPath: string, options?: { skipAuth?: boolean; authStrategy?: string; overlay?: { type: "local"; dirPath: string } | { type: "npm"; packageName: string; registry?: string } }) =>
      ipcRenderer.invoke("project:bootstrap", folderPath, options),
    validatePlugin: (dirPath: string) =>
      ipcRenderer.invoke("project:validate-plugin", dirPath) as Promise<{ valid: boolean; pluginName?: string; error?: string }>,
    detectPlugin: (folderPath: string) =>
      ipcRenderer.invoke("project:detect-plugin", folderPath) as Promise<{
        name: string; version: string; authStrategy: string;
        hasOverlay: boolean; overlayName?: string;
      }>,
    listAuthStrategies: (folderPath: string) =>
      ipcRenderer.invoke("project:list-auth-strategies", folderPath) as Promise<string[]>,
    getPath: () => ipcRenderer.invoke("project:get-path"),
    setPath: (p: string) => ipcRenderer.invoke("project:set-path", p),
    isBootstrapped: (p: string) => ipcRenderer.invoke("project:is-bootstrapped", p),
    readEnv: (p: string) => ipcRenderer.invoke("project:read-env", p),
    writeEnv: (p: string, vars: Record<string, string | undefined>) =>
      ipcRenderer.invoke("project:write-env", p, vars),
    readInstructions: (p: string) => ipcRenderer.invoke("project:read-instructions", p),
    writeInstructions: (p: string, cards: unknown[]) =>
      ipcRenderer.invoke("project:write-instructions", p, cards),
    readTemplates: (p: string) => ipcRenderer.invoke("project:read-templates", p),
    readCustomTemplates: (p: string) => ipcRenderer.invoke("project:read-custom-templates", p),
    writeCustomTemplates: (p: string, templates: unknown[]) =>
      ipcRenderer.invoke("project:write-custom-templates", p, templates),
    onBootstrapLog: (cb: (data: { line: string }) => void) => {
      ipcRenderer.on("project:bootstrap-log", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("project:bootstrap-log");
    },
    readTestScripts: (p: string) =>
      ipcRenderer.invoke("project:read-test-scripts", p) as Promise<Record<string, string>>,
    readFeatureModules: (p: string) =>
      ipcRenderer.invoke("project:read-feature-modules", p) as Promise<{ modules: string[]; workflows: string[] }>,
  },

  pipeline: {
    start: (payload: {
      systemPromptPath?: string;
      systemPrompt?: string;
      userMessage: string;
      mode?: "claude-code";
      skipPermissions?: boolean;
      resumeSessionId?: string;
    }) => ipcRenderer.invoke("pipeline:start", payload),

    abort: () => ipcRenderer.invoke("pipeline:abort"),
    interrupt: () => ipcRenderer.invoke("pipeline:interrupt"),
    sendMessage: (text: string, priority?: "now" | "next") =>
      ipcRenderer.invoke("pipeline:send-message", { text, priority }),
    respondPermission: (requestId: string, allowed: boolean) =>
      ipcRenderer.invoke("pipeline:respond-permission", { requestId, allowed }),
    readContextFiles: () =>
      ipcRenderer.invoke("pipeline:read-context-files") as Promise<{ plan: string; seed: string; conventions: string }>,

    onToken: (cb: (data: { token: string }) => void) => {
      ipcRenderer.on("pipeline:token", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:token");
    },
    onDone: (cb: (data: { fullText: string; sessionId?: string }) => void) => {
      ipcRenderer.on("pipeline:done", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:done");
    },
    onError: (cb: (data: { error: string }) => void) => {
      ipcRenderer.on("pipeline:error", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:error");
    },
    onAborted: (cb: (data: { fullText: string; userMessage?: string }) => void) => {
      ipcRenderer.on("pipeline:aborted", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:aborted");
    },
    onLog: (cb: (data: { line: string }) => void) => {
      ipcRenderer.on("pipeline:log", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:log");
    },
    onDirectRunUpdate: (cb: (data: {
      command?: string | null;
      cwd?: string | null;
      browserUrl?: string | null;
      localApps?: "pending" | "running" | "done" | "error";
      auth?: "pending" | "running" | "done" | "error";
      tests?: "pending" | "running" | "done" | "error";
    }) => void) => {
      ipcRenderer.on("pipeline:direct-run-update", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:direct-run-update");
    },
    onPermissionRequest: (
      cb: (data: { id: string; toolName: string; toolInput: Record<string, unknown>; description: string }) => void
    ) => {
      ipcRenderer.on("pipeline:permission-request", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:permission-request");
    },
    onToolStart: (cb: (data: { toolName: string; toolId: string }) => void) => {
      ipcRenderer.on("pipeline:tool-start", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:tool-start");
    },
    onToolEnd: (cb: (data: { toolName: string; toolId: string; durationMs: number }) => void) => {
      ipcRenderer.on("pipeline:tool-end", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:tool-end");
    },
    onExploreResult: (cb: (data: ExploreResultData) => void) => {
      ipcRenderer.on("pipeline:explore-result", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:explore-result");
    },
    onMcpStatus: (cb: (data: { server: string; status: string }) => void) => {
      ipcRenderer.on("pipeline:mcp-status", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:mcp-status");
    },

    getLogPath: () =>
      ipcRenderer.invoke("pipeline:get-log-path") as Promise<string | null>,
    openLog: () =>
      ipcRenderer.invoke("pipeline:open-log") as Promise<boolean>,
    clearLogs: () =>
      ipcRenderer.invoke("pipeline:clear-logs") as Promise<number>,
  },

  atlassian: {
    status: () =>
      ipcRenderer.invoke("atlassian:status") as Promise<{ status: "idle" | "connected" | "needs-auth" }>,
    connect: () =>
      ipcRenderer.invoke("atlassian:connect") as Promise<{ success: boolean; error?: string }>,
    disconnect: () =>
      ipcRenderer.invoke("atlassian:disconnect") as Promise<{ success: boolean }>,
  },

  shell: {
    openUrl: (url: string) => ipcRenderer.invoke("shell:open-url", url) as Promise<void>,
  },

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen") as Promise<boolean>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>,
  },

  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
    onUpdateAvailable: (cb: (data: { version: string }) => void) => {
      ipcRenderer.on("app:update-available", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("app:update-available");
    },
    onUpdateDownloaded: (cb: (data: { version: string }) => void) => {
      ipcRenderer.on("app:update-downloaded", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("app:update-downloaded");
    },
    installUpdate: () => ipcRenderer.invoke("app:install-update"),
  },

  network: {
    verifyEndpoint: (baseUrl: string) =>
      ipcRenderer.invoke("network:verify", baseUrl) as Promise<{ ok: boolean; message: string }>,
  },

  requirements: {
    check: (projectPath: string) =>
      ipcRenderer.invoke("requirements:check", projectPath) as Promise<unknown>,
    install: (payload: { projectPath: string; action: "project-dependencies" | "playwright-chromium" }) =>
      ipcRenderer.invoke("requirements:install", payload) as Promise<{ ok: boolean; error?: string }>,
    onInstallLog: (cb: (data: { line: string }) => void) => {
      ipcRenderer.on("requirements:install-log", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("requirements:install-log");
    },
  },

  opencode: {
    health: (baseUrl: string) =>
      ipcRenderer.invoke("opencode:health", baseUrl) as Promise<{ ok: boolean }>,
    detectModel: (baseUrl: string) =>
      ipcRenderer.invoke("opencode:detect-model", baseUrl) as Promise<{ modelId: string; providerId: string } | null>,
    listProviders: (baseUrl: string) =>
      ipcRenderer.invoke("opencode:list-providers", baseUrl) as Promise<{ default: Record<string, string>; connected: string[] } | null>,
    startServer: (port?: number) =>
      ipcRenderer.invoke("opencode:start-server", port ?? 18789) as Promise<{ ok: boolean; error?: string }>,
    stopServer: () =>
      ipcRenderer.invoke("opencode:stop-server") as Promise<{ ok: boolean }>,
    serverStatus: () =>
      ipcRenderer.invoke("opencode:server-status") as Promise<{ running: boolean }>,
    openAttachTerminal: (payload: { baseUrl: string; sessionId: string; cwd?: string }) =>
      ipcRenderer.invoke("opencode:open-attach-terminal", payload) as Promise<{ ok: boolean; error?: string }>,
    startAttachStream: (payload: { attachId?: string; baseUrl: string; sessionId: string; cwd?: string }) =>
      ipcRenderer.invoke("opencode:start-attach-stream", payload) as Promise<{ ok: boolean; attachId?: string; error?: string }>,
    stopAttachStream: (attachId: string) =>
      ipcRenderer.invoke("opencode:stop-attach-stream", attachId) as Promise<{ ok: boolean }>,
    sendAttachInput: (payload: { attachId: string; input: string }) =>
      ipcRenderer.invoke("opencode:send-attach-input", payload) as Promise<{ ok: boolean; error?: string }>,
    resizeAttachStream: (payload: { attachId: string; cols: number; rows: number }) =>
      ipcRenderer.invoke("opencode:resize-attach-stream", payload) as Promise<{ ok: boolean }>,
    onAttachOutput: (cb: (data: { attachId: string; stream: "stdout" | "stderr"; chunk: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { attachId: string; stream: "stdout" | "stderr"; chunk: string }) => cb(data);
      ipcRenderer.on("opencode:attach-output", listener);
      return () => ipcRenderer.removeListener("opencode:attach-output", listener);
    },
    onAttachExit: (cb: (data: { attachId: string; code: number | null; error?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { attachId: string; code: number | null; error?: string }) => cb(data);
      ipcRenderer.on("opencode:attach-exit", listener);
      return () => ipcRenderer.removeListener("opencode:attach-exit", listener);
    },
  },

  report: {
    checkAvailable: (projectPath: string) =>
      ipcRenderer.invoke("report:check-available", projectPath) as Promise<{ playwright: boolean; bdd: boolean; allure: boolean }>,
    openPlaywright: (projectPath: string) =>
      ipcRenderer.invoke("report:open-playwright", projectPath) as Promise<void>,
    openBdd: (projectPath: string) =>
      ipcRenderer.invoke("report:open-bdd", projectPath) as Promise<void>,
    openAllure: (projectPath: string) =>
      ipcRenderer.invoke("report:open-allure", projectPath) as Promise<void>,
    startTestReport: (projectPath: string) =>
      ipcRenderer.invoke("report:start-test-report", projectPath) as Promise<{ url: string }>,
  },

  runs: {
    list: (projectPath?: string) =>
      ipcRenderer.invoke("runs:list", projectPath) as Promise<unknown[]>,
    inspect: (runId: string, projectPath?: string) =>
      ipcRenderer.invoke("runs:inspect", runId, projectPath) as Promise<unknown>,
    logs: (runId: string, projectPath?: string) =>
      ipcRenderer.invoke("runs:logs", runId, projectPath) as Promise<string>,
    diff: (runId: string, projectPath?: string) =>
      ipcRenderer.invoke("runs:diff", runId, projectPath) as Promise<{ diff: string; changedFiles: string[] }>,
    abort: (runId: string, projectPath?: string) =>
      ipcRenderer.invoke("runs:abort", runId, projectPath) as Promise<unknown>,
    respondPermission: (payload: { runId: string; permissionId: string; allowed: boolean; optionId?: string; projectPath?: string }) =>
      ipcRenderer.invoke("runs:respond-permission", payload) as Promise<unknown>,
  },

  devFeedback: {
    isE2E: process.env.SPECWRIGHT_E2E === "1",
    captureScreenshot: (rect?: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke("dev-feedback:capture-screenshot", rect) as Promise<{ ok: boolean; dataUrl?: string; error?: string }>,
    run: (payload: { id?: string; prompt: string }) =>
      ipcRenderer.invoke("dev-feedback:run", payload) as Promise<{ ok: boolean; id?: string; worktreePath?: string; error?: string }>,
    applyWorktree: (payload: { worktreePath: string }) =>
      ipcRenderer.invoke("dev-feedback:apply-worktree", payload) as Promise<{ ok: boolean; applied?: boolean; error?: string; errorCode?: "patch-conflict" | "apply-failed" }>,
    cancel: (payload: { id: string }) =>
      ipcRenderer.invoke("dev-feedback:cancel", payload) as Promise<{ ok: boolean; cancelled?: boolean; error?: string }>,
    onToken: (cb: (data: { id?: string; token: string }) => void) => {
      ipcRenderer.on("dev-feedback:token", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("dev-feedback:token");
    },
    onLog: (cb: (data: { id?: string; line: string }) => void) => {
      ipcRenderer.on("dev-feedback:log", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("dev-feedback:log");
    },
    onDone: (cb: (data: { id?: string; fullText: string; worktreePath?: string }) => void) => {
      ipcRenderer.on("dev-feedback:done", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("dev-feedback:done");
    },
    onError: (cb: (data: { id?: string; error: string }) => void) => {
      ipcRenderer.on("dev-feedback:error", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("dev-feedback:error");
    },
  },
});
