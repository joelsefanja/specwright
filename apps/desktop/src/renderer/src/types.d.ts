interface EnvVars {
  BASE_URL: string;
  TEST_ENV: string;
  TEST_USERNAME?: string;
  TEST_PASSWORD?: string;
  [key: string]: string | undefined;
}

interface BootstrapResult {
  success: boolean;
  error?: string;
}

interface PluginInfo {
  name: string;
  version: string;
  authStrategy: string;
  hasOverlay: boolean;
  overlayName?: string;
}

interface PermissionRequestData {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
}

interface ToolEventData {
  toolName: string;
  toolId: string;
  durationMs?: number;
}

interface ExploreResultData {
  url: string;
  title: string;
  summary: string;
  pageCount: number;
  error: string | null;
}

type PluginSource =
  | { type: "local"; dirPath: string }
  | { type: "npm"; packageName: string; registry?: string };

interface PluginValidationResult {
  valid: boolean;
  pluginName?: string;
  error?: string;
}

interface ShellAPI {
  openUrl: (url: string) => Promise<void>;
}

interface NetworkAPI {
  verifyEndpoint: (baseUrl: string) => Promise<{ ok: boolean; message: string }>;
}

interface ReportAPI {
  checkAvailable: (projectPath: string) => Promise<{ playwright: boolean; bdd: boolean }>;
  openPlaywright: (projectPath: string) => Promise<void>;
  openBdd: (projectPath: string) => Promise<void>;
}

interface WindowControlsAPI {
  minimize: () => Promise<void>;
  toggleFullscreen: () => Promise<boolean>;
  close: () => Promise<void>;
}

interface OpenCodeProviderData {
  all?: Array<{ id: string; models?: Record<string, unknown> }>;
  default: Record<string, string>;
  connected: string[];
}

interface GitLabItem {
  kind: "issue" | "work_item";
  iid: string;
  title: string;
  state?: string;
  updatedAt?: string;
  webUrl?: string;
  ref: string;
  assignedToMe?: boolean;
}

interface SpecwrightAPI {
  project: {
    pickFolder: () => Promise<string | null>;
    pickFiles: () => Promise<string[]>;
    uploadTestFile: (sourcePath: string) => Promise<string>;
    fetchGitLabIssue: (folderPath: string, issueRef: string) => Promise<{ filePath: string; title: string; updatedAt: string; changed: boolean }>;
    listGitLabItems: (folderPath: string, mode?: "assigned" | "project") => Promise<{ repo: string; username?: string | null; items: GitLabItem[]; errors: string[] }>;
    gitLabStatus: (folderPath: string) => Promise<{ hasGlab: boolean; authenticated: boolean; repo?: string; username?: string | null; error?: string }>;
    readGitLabSource: (folderPath: string, relativePath: string) => Promise<{ markdown: string; images: string[] }>;
    bootstrap: (folderPath: string, options?: { skipAuth?: boolean; authStrategy?: string; overlay?: PluginSource }) => Promise<BootstrapResult>;
    validatePlugin: (dirPath: string) => Promise<PluginValidationResult>;
    detectPlugin: (folderPath: string) => Promise<PluginInfo>;
    listAuthStrategies: (folderPath: string) => Promise<string[]>;
    getPath: () => Promise<string>;
    setPath: (p: string) => Promise<void>;
    isBootstrapped: (p: string) => Promise<boolean>;
    readEnv: (p: string) => Promise<EnvVars>;
    writeEnv: (p: string, vars: EnvVars) => Promise<void>;
    readInstructions: (p: string) => Promise<object[]>;
    writeInstructions: (p: string, cards: object[]) => Promise<void>;
    readTemplates: (p: string) => Promise<Array<object & { templateName: string }>>;
    readCustomTemplates: (p: string) => Promise<Array<object & { templateName: string }>>;
    writeCustomTemplates: (p: string, templates: object[]) => Promise<void>;
    onBootstrapLog: (cb: (data: { line: string }) => void) => () => void;
    readTestScripts: (p: string) => Promise<Record<string, string>>;
    readFeatureModules: (p: string) => Promise<{ modules: string[]; workflows: string[] }>;
  };
  pipeline: {
    start: (payload: {
      systemPromptPath?: string;
      systemPrompt?: string;
      userMessage: string;
      mode?: "claude-code";
      skipPermissions?: boolean;
    }) => Promise<void>;
    abort: () => Promise<void>;
    interrupt: () => Promise<void>;
    sendMessage: (text: string, priority?: "now" | "next") => Promise<void>;
    respondPermission: (requestId: string, allowed: boolean) => Promise<void>;
    readContextFiles: () => Promise<{ plan: string; seed: string; conventions: string }>;
    onToken: (cb: (data: { token: string }) => void) => () => void;
    onDone: (cb: (data: { fullText: string; sessionId?: string; userMessage?: string }) => void) => () => void;
    onError: (cb: (data: { error: string }) => void) => () => void;
    onLog: (cb: (data: { line: string }) => void) => () => void;
    onPermissionRequest: (cb: (data: PermissionRequestData) => void) => () => void;
    onToolStart: (cb: (data: ToolEventData) => void) => () => void;
    onToolEnd: (cb: (data: ToolEventData) => void) => () => void;
    onExploreResult: (cb: (data: ExploreResultData) => void) => () => void;
    onMcpStatus: (cb: (data: { server: string; status: string }) => void) => () => void;
    getLogPath: () => Promise<string | null>;
    openLog: () => Promise<boolean>;
    clearLogs: () => Promise<number>;
  };
  shell: ShellAPI;
  window: WindowControlsAPI;
  network: NetworkAPI;
  report: ReportAPI;
  opencode: {
    health: (baseUrl: string) => Promise<{ ok: boolean }>;
    detectModel: (baseUrl: string) => Promise<{ modelId: string; providerId: string } | null>;
    listProviders: (baseUrl: string) => Promise<OpenCodeProviderData | null>;
    startServer: (port?: number) => Promise<{ ok: boolean; error?: string }>;
    stopServer: () => Promise<{ ok: boolean }>;
    serverStatus: () => Promise<{ running: boolean }>;
  };
  app: {
    getVersion: () => Promise<string>;
    onUpdateAvailable: (cb: (data: { version: string }) => void) => () => void;
    onUpdateDownloaded: (cb: (data: { version: string }) => void) => () => void;
    installUpdate: () => Promise<void>;
  };
  atlassian: {
    status: () => Promise<{ status: "idle" | "connected" | "needs-auth" }>;
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean }>;
  };
}

declare global {
  interface Window {
    specwright: SpecwrightAPI;
  }
}

export {};
