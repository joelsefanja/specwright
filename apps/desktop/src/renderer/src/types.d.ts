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

type RequirementStatus = "pass" | "fail" | "warning";
type RequirementInstallAction = "project-dependencies" | "playwright-chromium";

interface RequirementCheck {
  key: "node" | "npm" | "package-manager" | "project-bootstrap" | "node-modules" | "playwright-cli" | "playwright-chromium" | "opencode-cli" | "opencode-server" | "glab";
  status: RequirementStatus;
  message: string;
  detail?: string;
  blocksRun: boolean;
  installAction?: RequirementInstallAction;
}

interface RequirementsResult {
  projectPath: string;
  ready: boolean;
  checks: RequirementCheck[];
}

interface RequirementsAPI {
  check: (projectPath: string) => Promise<RequirementsResult>;
  install: (payload: { projectPath: string; action: RequirementInstallAction }) => Promise<{ ok: boolean; error?: string }>;
  onInstallLog: (cb: (data: { line: string }) => void) => () => void;
}

interface ReportAPI {
  checkAvailable: (projectPath: string) => Promise<{ playwright: boolean; bdd: boolean; allure: boolean }>;
  openPlaywright: (projectPath: string) => Promise<void>;
  openBdd: (projectPath: string) => Promise<void>;
  openAllure: (projectPath: string) => Promise<void>;
  startTestReport: (projectPath: string) => Promise<{ url: string }>;
}

interface RunsAPI {
  list: (projectPath?: string) => Promise<unknown[]>;
  inspect: (runId: string, projectPath?: string) => Promise<unknown>;
  logs: (runId: string, projectPath?: string) => Promise<string>;
  diff: (runId: string, projectPath?: string) => Promise<{ diff: string; changedFiles: string[] }>;
  abort: (runId: string, projectPath?: string) => Promise<unknown>;
  respondPermission: (payload: { runId: string; permissionId: string; allowed: boolean; optionId?: string; projectPath?: string }) => Promise<unknown>;
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
    readGitLabSource: (folderPath: string, relativePath: string) => Promise<{ markdown: string; images: string[]; missing?: boolean }>;
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
      resumeSessionId?: string;
    }) => Promise<void>;
    abort: () => Promise<{ ok: boolean; state?: string }>;
    interrupt: () => Promise<{ ok: boolean; reason?: string }>;
    sendMessage: (text: string, priority?: "now" | "next") => Promise<void>;
    respondPermission: (requestId: string, allowed: boolean) => Promise<void>;
    readContextFiles: () => Promise<{ plan: string; seed: string; conventions: string }>;
    onToken: (cb: (data: { token: string }) => void) => () => void;
    onDone: (cb: (data: { fullText: string; sessionId?: string; userMessage?: string }) => void) => () => void;
    onError: (cb: (data: { error: string }) => void) => () => void;
    onAborted: (cb: (data: { fullText: string; userMessage?: string }) => void) => () => void;
    onLog: (cb: (data: { line: string }) => void) => () => void;
    onDirectRunUpdate: (cb: (data: {
      command?: string | null;
      cwd?: string | null;
      browserUrl?: string | null;
      localApps?: "pending" | "running" | "done" | "error";
      auth?: "pending" | "running" | "done" | "error";
      tests?: "pending" | "running" | "done" | "error";
    }) => void) => () => void;
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
  requirements: RequirementsAPI;
  report: ReportAPI;
  runs: RunsAPI;
  opencode: {
    health: (baseUrl: string) => Promise<{ ok: boolean }>;
    detectModel: (baseUrl: string) => Promise<{ modelId: string; providerId: string } | null>;
    listProviders: (baseUrl: string) => Promise<OpenCodeProviderData | null>;
    startServer: (port?: number) => Promise<{ ok: boolean; error?: string }>;
    stopServer: () => Promise<{ ok: boolean }>;
    serverStatus: () => Promise<{ running: boolean }>;
    openAttachTerminal: (payload: { baseUrl: string; sessionId: string; cwd?: string }) => Promise<{ ok: boolean; error?: string }>;
    startAttachStream: (payload: { attachId?: string; baseUrl: string; sessionId: string; cwd?: string }) => Promise<{ ok: boolean; attachId?: string; error?: string }>;
    stopAttachStream: (attachId: string) => Promise<{ ok: boolean }>;
    sendAttachInput: (payload: { attachId: string; input: string }) => Promise<{ ok: boolean; error?: string }>;
    resizeAttachStream: (payload: { attachId: string; cols: number; rows: number }) => Promise<{ ok: boolean }>;
    onAttachOutput: (cb: (data: { attachId: string; stream: "stdout" | "stderr"; chunk: string }) => void) => () => void;
    onAttachExit: (cb: (data: { attachId: string; code: number | null; error?: string }) => void) => () => void;
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
  devFeedback?: {
    isE2E?: boolean;
    captureScreenshot: (rect?: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
    run: (payload: { id?: string; prompt: string }) => Promise<{ ok: boolean; id?: string; worktreePath?: string; error?: string }>;
    applyWorktree: (payload: { worktreePath: string }) => Promise<{ ok: boolean; applied?: boolean; error?: string; errorCode?: "patch-conflict" | "apply-failed" }>;
    cancel: (payload: { id: string }) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
    onToken: (cb: (data: { id?: string; token: string }) => void) => () => void;
    onLog: (cb: (data: { id?: string; line: string }) => void) => () => void;
    onDone: (cb: (data: { id?: string; fullText: string; worktreePath?: string }) => void) => () => void;
    onError: (cb: (data: { id?: string; error: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    specwright: SpecwrightAPI;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: string;
        partition?: string;
      };
    }
  }
}

export {};
