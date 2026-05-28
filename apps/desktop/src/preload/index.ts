import { contextBridge, ipcRenderer } from "electron";

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
    listGitLabItems: (folderPath: string) =>
      ipcRenderer.invoke("project:list-gitlab-items", folderPath) as Promise<{
        repo: string;
        username?: string | null;
        items: Array<{ kind: "issue" | "work_item"; iid: string; title: string; state?: string; updatedAt?: string; webUrl?: string; ref: string; assignedToMe?: boolean }>;
        errors: string[];
      }>,
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
    onLog: (cb: (data: { line: string }) => void) => {
      ipcRenderer.on("pipeline:log", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("pipeline:log");
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
  },

  report: {
    checkAvailable: (projectPath: string) =>
      ipcRenderer.invoke("report:check-available", projectPath) as Promise<{ playwright: boolean; bdd: boolean }>,
    openPlaywright: (projectPath: string) =>
      ipcRenderer.invoke("report:open-playwright", projectPath) as Promise<void>,
    openBdd: (projectPath: string) =>
      ipcRenderer.invoke("report:open-bdd", projectPath) as Promise<void>,
  },
});
