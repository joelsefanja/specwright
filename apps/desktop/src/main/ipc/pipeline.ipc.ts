import { ipcMain, BrowserWindow } from "electron";
import { type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { log as fileLog, getLogFilePath, clearLocalLogs } from "../logger";
import { runChildCommand } from "../pipeline/childProcessRunner";
import { resolveClaudeExecutablePath } from "../pipeline/claudeExecutableResolver";
import { readPipelineContextFiles } from "../pipeline/contextFilesReader";
import { normalizePackageRunArgs, parseDirectRunOptions, withIntegratedBrowserArgs } from "../pipeline/directRunOptions";
import { collectGeneratedSpecStats, formatGeneratedStats } from "../pipeline/generatedSpecStats";
import { killProcessTree } from "../pipeline/processTree";
import { createSpecwrightFileDiff, createSpecwrightFileSnapshot, type SpecwrightFileSnapshot } from "../pipeline/runFileDiff";
import { ensureLocalApps, readEnvFile, stopManagedLocalApps, type ManagedLocalApp } from "../pipeline/localAppManager";
import { claudeMcpConfig, commandMcpServers, createDesktopMcpServers } from "../pipeline/mcpConfigFactory";
import { resolveE2eRunCommand } from "../pipeline/runCommandResolver";
// claude-runner is ESM-only — must use dynamic import in Electron's CJS main process
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

interface ClaudeRunnerModule {
  Runner: new (options: Record<string, unknown>) => {
    stream(prompt: string, overrides?: Record<string, unknown>): AsyncIterable<Record<string, unknown>> & {
      result: Promise<Record<string, unknown>>;
      send(msg: string): void;
      abort(): void;
    };
    abort(): void;
    lastSessionId: string | null;
  };
}

let _claudeRunnerModule: ClaudeRunnerModule | null = null;
async function loadClaudeRunner(): Promise<ClaudeRunnerModule> {
  if (!_claudeRunnerModule) {
    _claudeRunnerModule = await dynamicImport("claude-runner") as ClaudeRunnerModule;
  }
  return _claudeRunnerModule;
}

interface AiSdkRunnerModule {
  AiSdkRunner: new () => {
    run(options: AiSdkRunOptions): Promise<string>;
    abort(): void;
    interrupt(): void;
  };
  createSpecwrightRun: (input: { kind: "e2e-automate" | "e2e-run" | "cli" | "healer" | "subagent" | "specwright-init"; projectPath: string; title?: string; opencodeBaseUrl?: string; processIds?: number[] }) => { id: string; projectPath: string };
  getSpecwrightRun: (projectPath: string, runId: string) => { status?: string; permissionHistory?: Array<{ id: string; status: string }> } | null;
  updateSpecwrightRun: (projectPath: string, runId: string, patch: Record<string, unknown>) => { id: string };
  appendSpecwrightRunLog: (projectPath: string, runId: string, line: string) => void;
  writeSpecwrightRunDiff: (projectPath: string, runId: string, diff: string, changedFiles: string[]) => { id: string };
  addSpecwrightRunPermission: (projectPath: string, runId: string, input: { id: string; toolName: string; toolInput?: Record<string, unknown>; description?: string }) => { id: string };
  respondSpecwrightRunPermission: (projectPath: string, runId: string, permissionId: string, allowed: boolean, optionId?: string) => Promise<{ id: string }>;
}

interface AiSdkRunOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  includePlaywrightMcp?: boolean;
  playwrightMcpArgs?: string[];
  maxSteps?: number;
  onToken: (token: string) => void;
  onLog?: (line: string) => void;
  onOpenCodeSession?: (info: { sessionId: string; baseUrl: string }) => void;
  onToolEnd?: (toolName: string, durationMs: number) => void;
  onStepFinish?: (info: { stepNumber: number; totalTokens: number; toolCalls: string[] }) => void;
  projectPath?: string;
}

interface ClaudePermissionRequest {
  id: string;
  tool: string;
  input?: Record<string, unknown>;
  description?: string;
}

interface ClaudeStreamEvent {
  type: string;
  text?: string;
  tool?: string;
  id?: string;
  input?: Record<string, unknown>;
  duration?: number;
  sessionId?: string;
  model?: string;
  status?: string;
  server?: string;
  message?: string;
  description?: string;
  taskId?: string;
  summary?: string;
  toolName?: string;
  usage?: { durationMs?: number; tools?: number; input?: number; output?: number };
  result?: { usage: { input: number; output: number }; sessionId: string; duration: number };
}

let _aiSdkRunnerModule: AiSdkRunnerModule | null = null;
async function loadAiSdkRunner(): Promise<AiSdkRunnerModule> {
  if (!_aiSdkRunnerModule) {
    _aiSdkRunnerModule = await dynamicImport("@specwright/agent-runner") as unknown as AiSdkRunnerModule;
  }
  return _aiSdkRunnerModule;
}
import type { ConfigService } from "../services/ConfigService";
import { normalizeOpenCodeUrl, type OpenCodeService } from "../services/OpenCodeService";
import type { ProjectService } from "../services/ProjectService";
import { getAtlassianAccessToken } from "./atlassian.ipc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeClaudeRunner: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeStream: any = null;
let activeTestProcess: ChildProcess | null = null;
let activeManagedAppProcesses: ChildProcess[] = [];
let activeSpecwrightRun: { id: string; projectPath: string; processIds: number[]; appendLog: (line: string) => void; update: (patch: Record<string, unknown>) => void; addPermission: (input: { id: string; toolName: string; toolInput?: Record<string, unknown>; description?: string }) => void; respondPermission: (permissionId: string, allowed: boolean) => Promise<void>; registerProcessId: (processId: number) => void } | null = null;
let activeTestRunPending = false;
let activeTestRunAborted = false;

// Pending permission requests: id → resolve function
const pendingPermissions = new Map<string, (allowed: boolean) => void>();
// Last completed session ID — used for resume
let lastSessionId: string | null = null;

/** Send a log line to the renderer window AND write it to the file log. */
function sendLog(win: BrowserWindow, line: string): void {
  win.webContents.send("pipeline:log", { line });
  fileLog(line);
}

function sendDirectRunUpdate(win: BrowserWindow, patch: Record<string, unknown>): void {
  win.webContents.send("pipeline:direct-run-update", patch);
}

async function fetchOpenCodeChildSessionIds(baseUrl: string, sessionId: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/session/${sessionId}/children`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`OpenCode children endpoint returned ${response.status}`);
  }

  return extractOpenCodeChildSessionIds(await response.json(), sessionId);
}

function extractOpenCodeChildSessionIds(value: unknown, parentSessionId: string): string[] {
  const ids = new Set<string>();
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      if (item !== parentSessionId) ids.add(item);
      return;
    }

    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const id = record.id ?? record.sessionID ?? record.sessionId;
    if (typeof id === "string" && id !== parentSessionId) ids.add(id);
    const children = record.children ?? record.sessions;
    if (Array.isArray(children)) children.forEach(visit);
  };

  if (Array.isArray(value)) {
    value.forEach(visit);
  } else {
    visit(value);
  }

  return [...ids];
}

async function runE2eTestsDirect(win: BrowserWindow, projectPath: string, userMessage: string): Promise<void> {
  activeTestRunPending = true;
  activeTestRunAborted = false;
  const rawArgs = userMessage.replace(/^\/e2e-run\b/, "").trim();
  const { args: runArgs, options } = parseDirectRunOptions(rawArgs);
  const resolved = resolveE2eRunCommand(projectPath, runArgs);
  const envValues = readEnvFile(path.join(projectPath, "e2e-tests", ".env.testing"));
  const runOptions = { ...options, targetUrl: envValues.BASE_URL };
  const run = { ...resolved, args: withIntegratedBrowserArgs(normalizePackageRunArgs(resolved.args), runOptions) };
  const commandLine = [run.command, ...run.args].join(" ");
  const agentRunnerModule = await loadAiSdkRunner();
  const specwrightRun = agentRunnerModule.createSpecwrightRun({
    kind: "e2e-run",
    projectPath,
    title: `Specwright /e2e-run: ${commandLine}`,
  });
  activeSpecwrightRun = createActiveSpecwrightRun(agentRunnerModule, specwrightRun);
  activeSpecwrightRun.update({ status: "running" });
  sendLog(win, `[runner] Working directory: ${projectPath}`);
  sendLog(win, `[runner] Resolution: ${run.reason}`);
  if (runOptions.headed) {
    sendLog(win, `[runner] Browser mode: visible Playwright window (HEADLESS=false)`);
  }

  if (runOptions.integrated) {
    sendLog(win, `[runner] Browser mode: Desktop integrated browser via CDP (${runOptions.targetUrl || "no target URL"})`);
  }
  sendLog(win, `[runner] Running tests directly: ${commandLine}`);
  sendLog(win, `[orchestrator] Run ${specwrightRun.id} registered in .specwright/runs/`);
  sendLog(win, `[orchestrator] CLI: specwright-agent inspect ${specwrightRun.id}`);
  sendDirectRunUpdate(win, { command: commandLine, cwd: projectPath, localApps: "pending", auth: "pending", tests: "pending" });
  win.webContents.send("pipeline:token", {
    token: [
      `Running ${run.label}`,
      ``,
      `Working directory: ${projectPath}`,
      `Resolved as: ${run.reason}`,
      `Command: \`${commandLine}\``,
      runOptions.integrated ? `Browser: Desktop integrated browser via CDP` : runOptions.headed ? `Browser: visible Playwright window` : null,
      ``,
    ].filter(Boolean).join("\n"),
  });

  const fullTextRef = { value: "" };
  let managedLocalApps: ManagedLocalApp[] = [];
  try {
    managedLocalApps = await ensureLocalApps(projectPath, {
      onLog: (line) => sendLog(win, line),
      onUpdate: (patch) => sendDirectRunUpdate(win, patch),
      onProcessStarted: (process) => {
        activeManagedAppProcesses.push(process);
        if (process.pid) activeSpecwrightRun?.registerProcessId(process.pid);
      },
      onProcessExit: (process) => {
        activeManagedAppProcesses = activeManagedAppProcesses.filter((activeProcess) => activeProcess !== process);
      },
    });
    const beforeStats = collectGeneratedSpecStats(projectPath);
    const beforeFiles = createSpecwrightFileSnapshot(projectPath);
    sendLog(win, `[runner] Before package script: ${formatGeneratedStats(beforeStats)}`);
    await runChildCommand({
      projectPath,
      command: run.command,
      args: run.args,
      userMessage,
      fullTextRef,
      options: runOptions,
      events: {
        onLog: (line) => sendLog(win, line),
        onToken: (token) => win.webContents.send("pipeline:token", { token }),
        onUpdate: (patch) => sendDirectRunUpdate(win, patch),
        onAborted: (fullText, abortedUserMessage) => {
          activeSpecwrightRun?.appendLog("[runner] Test run aborted by user");
          activeSpecwrightRun?.update({ status: "aborted" });
          win.webContents.send("pipeline:aborted", { fullText, userMessage: abortedUserMessage });
        },
        onProcessStarted: (process) => {
          activeTestProcess = process;
          activeTestRunAborted = false;
          if (process.pid) activeSpecwrightRun?.registerProcessId(process.pid);
        },
        onProcessEnded: () => {
          activeTestProcess = null;
          activeTestRunPending = false;
        },
        isAborted: () => activeTestRunAborted,
      },
    });
    if (activeTestRunAborted) {
      activeSpecwrightRun?.update({ status: "aborted" });
      return;
    }
    const afterStats = collectGeneratedSpecStats(projectPath);
    persistRunFileDiff(agentRunnerModule, projectPath, specwrightRun.id, beforeFiles, win);
    const changed = afterStats.count !== beforeStats.count || afterStats.latestMtimeMs > beforeStats.latestMtimeMs;
    sendLog(win, `[runner] After package script: ${formatGeneratedStats(afterStats)}${changed ? " — generated/updated" : " — no generated spec timestamp change detected"}`);
    const summary = `\n\nTest command exited with code 0.`;
    fullTextRef.value += summary;
    win.webContents.send("pipeline:token", { token: summary });
    win.webContents.send("pipeline:done", { fullText: fullTextRef.value, sessionId: null, userMessage });
    activeSpecwrightRun?.update({ status: "done" });
  } catch (error) {
    if (activeTestRunAborted) {
      activeSpecwrightRun?.update({ status: "aborted" });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    activeSpecwrightRun?.appendLog(`[runner] Error: ${msg}`);
    activeSpecwrightRun?.update({ status: "error", error: msg });
    win.webContents.send("pipeline:error", { error: msg });
    throw error;
  } finally {
    stopManagedLocalApps(managedLocalApps, {
      onLog: (line) => sendLog(win, line),
      onProcessExit: (process) => {
        activeManagedAppProcesses = activeManagedAppProcesses.filter((activeProcess) => activeProcess !== process);
      },
    });
    activeTestRunPending = false;
    activeSpecwrightRun = null;
  }
}

function createActiveSpecwrightRun(
  agentRunnerModule: AiSdkRunnerModule,
  specwrightRun: { id: string; projectPath: string }
): NonNullable<typeof activeSpecwrightRun> {
  const processIds: number[] = [];
  return {
    id: specwrightRun.id,
    projectPath: specwrightRun.projectPath,
    processIds,
    appendLog: (line: string) => agentRunnerModule.appendSpecwrightRunLog(specwrightRun.projectPath, specwrightRun.id, line),
    update: (patch: Record<string, unknown>) => {
      agentRunnerModule.updateSpecwrightRun(specwrightRun.projectPath, specwrightRun.id, patch);
    },
    addPermission: (input) => {
      agentRunnerModule.addSpecwrightRunPermission(specwrightRun.projectPath, specwrightRun.id, input);
    },
    respondPermission: async (permissionId: string, allowed: boolean) => {
      await agentRunnerModule.respondSpecwrightRunPermission(specwrightRun.projectPath, specwrightRun.id, permissionId, allowed);
    },
    registerProcessId: (processId: number) => {
      if (processIds.includes(processId)) {
        return;
      }
      processIds.push(processId);
      agentRunnerModule.updateSpecwrightRun(specwrightRun.projectPath, specwrightRun.id, { processIds });
      agentRunnerModule.appendSpecwrightRunLog(specwrightRun.projectPath, specwrightRun.id, `[orchestrator] Registered process pid ${processId}`);
    },
  };
}

function persistRunFileDiff(
  agentRunnerModule: AiSdkRunnerModule,
  projectPath: string,
  runId: string,
  beforeFiles: SpecwrightFileSnapshot | null,
  win: BrowserWindow
): void {
  if (!beforeFiles) return;

  const afterFiles = createSpecwrightFileSnapshot(projectPath);
  const fileDiff = createSpecwrightFileDiff(beforeFiles, afterFiles);
  if (fileDiff.changedFiles.length === 0) {
    agentRunnerModule.appendSpecwrightRunLog(projectPath, runId, "[orchestrator] File diff: no Specwright test files changed");
    return;
  }

  agentRunnerModule.writeSpecwrightRunDiff(projectPath, runId, fileDiff.diff, fileDiff.changedFiles);
  sendLog(win, `[orchestrator] File diff: ${fileDiff.changedFiles.length} changed file(s)`);
}

function waitForRecordedPermissionResponse(agentRunnerModule: AiSdkRunnerModule, projectPath: string, runId: string, permissionId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const run = agentRunnerModule.getSpecwrightRun(projectPath, runId);
      const permission = run
        ?.permissionHistory
        ?.find((entry) => entry.id === permissionId);
      if (permission?.status === "approved" || permission?.status === "denied") {
        clearInterval(interval);
        resolve(permission.status === "approved");
        return;
      }
      if (run?.status === "aborted" || run?.status === "error" || run?.status === "done") {
        clearInterval(interval);
        resolve(false);
      }
    }, 1000);
  });
}

export function registerPipelineIpc(
  configService: ConfigService,
  projectService: ProjectService,
  openCodeService: OpenCodeService,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    "pipeline:start",
    async (
      _event,
      payload: {
        systemPromptPath?: string;
        systemPrompt?: string;
        userMessage: string;
        mode?: "claude-code";
        skipPermissions?: boolean;
        /** Resume a previous session instead of starting fresh */
        resumeSessionId?: string;
      }
    ) => {
      const win = getWindow();
      if (!win) {
        return;
      }

      const projectPath = configService.getProjectPath() || undefined;

      if (projectPath && payload.userMessage.trim().startsWith("/e2e-run")) {
        try {
          await runE2eTestsDirect(win, projectPath, payload.userMessage.trim());
        } catch {
          // runE2eTestsDirect already emitted pipeline:error with command output.
        }
        return;
      }

      // Resolve system prompt
      let systemPrompt = payload.systemPrompt ?? "";
      if (!systemPrompt && payload.systemPromptPath) {
        try {
          const fs = await import("fs");
          systemPrompt = fs.readFileSync(payload.systemPromptPath, "utf-8");
        } catch (err) {
          win.webContents.send("pipeline:error", {
            error: `Failed to read system prompt: ${String(err)}`,
          });
          return;
        }
      }
      // Detect direct skill invocations (e.g. "/e2e-heal @tag", "/e2e-generate plan.md").
      // When the user explicitly calls a skill by name, load that skill's prompt directly
      // instead of the full pipeline orchestrator — prevents pipeline phase numbering
      // (Phase 1/2/8) from bleeding into standalone skill output.
      const skillMatch = payload.userMessage.trim().match(/^\/([a-zA-Z0-9_-]+)/);
      const skillName = skillMatch?.[1];
      const isSubSkill = Boolean(skillName && skillName !== "e2e-automate" && projectPath);

      if (!systemPrompt) {
        const skillPrompt = isSubSkill
          ? projectService.loadSkillPrompt(projectPath!, skillName!)
          : null;

        systemPrompt = skillPrompt ?? projectService.loadOrchestratorPrompt(projectPath);

        if (skillPrompt) {
          win.webContents.send("pipeline:log", {
            line: `[pipeline] Using skill prompt: /${skillName}`,
          });
        }
      }

      // When skip permissions is enabled, tell the AI it doesn't need to ask
      if (payload.skipPermissions) {
        systemPrompt += `\n\nIMPORTANT: All tool permissions are pre-approved. Do NOT ask the user to grant permission or approve any tool call. Do NOT pause for approval. All tools execute automatically. Proceed directly.`;
      }

      // Phase-transition markers — the renderer's detectPhaseFromText scans for
      // `### Phase N: <Label>` headers to split streaming output into phase cards.
      // Only applies to the full pipeline orchestrator (e2e-automate). Sub-skills
      // (/e2e-run, /e2e-heal, /e2e-generate, …) have no pipeline phases — injecting
      // this rule forces them to invent Phase 1/2/8 headers that have no meaning
      // for a standalone skill call.
      if (!isSubSkill) {
        systemPrompt += [
          ``,
          ``,
          `## Phase transition markers (MANDATORY — Specwright Desktop UI depends on these)`,
          ``,
          `When you begin each phase, emit a markdown header on its OWN line:`,
          `    ### Phase N: <Label>`,
          ``,
          `Valid labels:`,
          `  1 Initialization  |  2 Detection & Routing  |  3 Input Processing`,
          `  4 Exploration & Planning  |  5 Exploration Validation  |  6 User Approval`,
          `  7 BDD Generation  |  8 Test Execution & Healing  |  9 Cleanup  |  10 Final Review`,
          ``,
          `Rules:`,
          `- Emit the header ONCE per phase, BEFORE the phase's work begins.`,
          `- Do NOT use bullet lists to signal phase transitions (e.g. \`- 🔄 Phase 9: Cleanup\`). Bullet checklists INSIDE a phase for progress summaries are fine, but they do NOT open a new card.`,
          `- Example (correct):  \`### Phase 9: Cleanup\` on a fresh line, then the cleanup commands.`,
          `- Example (incorrect, causes card misassignment): \`- 🔄 Phase 9: Cleanup\` inside a bullet list.`,
        ].join('\n');
      }

      // Append non-sensitive environment status to user message. Secrets are
      // passed only through process env/tool context and never echoed to the LLM.
      let userMessage = payload.userMessage;
      // HEADLESS=false in .env.testing → show browser during exploration (default: headless)
      const headless = projectPath ? projectService.readEnv(projectPath)["HEADLESS"] !== "false" : true;
      if (projectPath) {
        const env = projectService.readEnv(projectPath);
        const lines: string[] = [];
        const PIPELINE_VARS = new Set(["BASE_URL", "TEST_ENV", "AUTH_STRATEGY", "OAUTH_SIGNIN_PATH", "OAUTH_BUTTON_TEST_ID"]);
        const SENSITIVE_PIPELINE_VARS = new Set(["TEST_USER_EMAIL", "TEST_USER_PASSWORD", "TEST_USERNAME", "TEST_PASSWORD", "TEST_USER_NAME", "TEST_USER_PICTURE", "OAUTH_STORAGE_KEY"]);
        for (const [envKey, envValue] of Object.entries(env)) {
          if (PIPELINE_VARS.has(envKey) && envValue) {
            lines.push(`${envKey}: ${envValue}`);
          } else if (SENSITIVE_PIPELINE_VARS.has(envKey) && envValue) {
            lines.push(`${envKey}: [set]`);
          }
        }
        if (lines.length) {
          userMessage += `\n\n---\nEnvironment configuration:\n${lines.join("\n")}`;
          win.webContents.send("pipeline:log", {
            line: `[pipeline] Environment status added (${lines.length} vars, secrets redacted)`,
          });
        }

        // Prepend PIPELINE_TICKET_ID to the user message to satisfy any org-level
        // ticket-ID policy hooks that fire at the infrastructure level before the
        // LLM processes anything — system prompt injection cannot reach those hooks.
        // Set PIPELINE_TICKET_ID=YOUR-TICKET in .env.testing (gitignored, never hardcoded).
        const ticketId = env["PIPELINE_TICKET_ID"];
        if (ticketId && !userMessage.match(/[A-Z]+-\d+/)) {
          userMessage = `${ticketId}: ${userMessage}`;
        }
      }

      win.webContents.send("pipeline:log", {
        line: `[pipeline] System prompt: ${systemPrompt.length} chars`,
      });

      const mcpServers = await createDesktopMcpServers({
        projectPath,
        headless,
        getAtlassianAccessToken,
      });

      win.webContents.send("pipeline:log", {
        line: `[pipeline] MCP servers: ${Object.keys(mcpServers).join(", ")}`,
      });

      const projectEnv: Record<string, string | undefined> = projectPath ? projectService.readEnv(projectPath) : {};
      const provider = ((projectEnv["SPECWRIGHT_LLM_PROVIDER"] as string | undefined)
        || process.env.SPECWRIGHT_LLM_PROVIDER
        || "opencode").toLowerCase();

      pendingPermissions.clear();

      try {
        let fullText: string;
        const beforeFiles = projectPath ? createSpecwrightFileSnapshot(projectPath) : null;

        if (provider === "opencode") {
          // ── AiSdkRunner + OpenCode direct path ──
          win.webContents.send("pipeline:log", { line: `[pipeline] Launching OpenCode runner…` });

          // Set env vars so AiSdkRunner can read them
          const env = projectEnv;
          for (const [envKey, envValue] of Object.entries(env)) {
            if (envValue) {
              process.env[envKey] = envValue;
            }
          }

          const { baseUrl: ocUrl, port } = normalizeOpenCodeUrl(env["SPECWRIGHT_OPENCODE_URL"] || process.env.SPECWRIGHT_OPENCODE_URL);
          const agentRunnerModule = await loadAiSdkRunner();
          const { AiSdkRunner } = agentRunnerModule;
          if (projectPath) {
            const specwrightRun = agentRunnerModule.createSpecwrightRun({
              kind: "e2e-automate",
              projectPath,
              title: "Specwright /e2e-automate",
              opencodeBaseUrl: ocUrl,
            });
            activeSpecwrightRun = createActiveSpecwrightRun(agentRunnerModule, specwrightRun);
            activeSpecwrightRun.update({ status: "running" });
            sendLog(win, `[orchestrator] Run ${specwrightRun.id} registered in .specwright/runs/`);
            sendLog(win, `[orchestrator] CLI: specwright-agent inspect ${specwrightRun.id}`);
            sendLog(win, `[orchestrator] OpenCode: opencode attach ${ocUrl}`);
          }

          win.webContents.send("pipeline:log", { line: `[pipeline] Checking OpenCode server on port ${port}…` });
          const startResult = await openCodeService.start({ baseUrl: ocUrl, projectPath });
          if (startResult.processId) activeSpecwrightRun?.registerProcessId(startResult.processId);

          const model = (env["SPECWRIGHT_MODEL"] as string) || process.env.SPECWRIGHT_MODEL || "gpt-5.5-fast";
          process.env.SPECWRIGHT_MODEL = model;
          win.webContents.send("pipeline:log", { line: `[pipeline] Model: ${model}` });
          const runner = new AiSdkRunner();
          activeClaudeRunner = runner;
          let openCodeSession: { sessionId: string; baseUrl: string } | null = null;
          let childSessionIds: string[] = [];
          const refreshOpenCodeChildSessions = async (): Promise<void> => {
            if (!openCodeSession || !activeSpecwrightRun) return;

            try {
              const nextChildSessionIds = await fetchOpenCodeChildSessionIds(openCodeSession.baseUrl, openCodeSession.sessionId);
              if (nextChildSessionIds.join("\0") === childSessionIds.join("\0")) return;

              childSessionIds = nextChildSessionIds;
              activeSpecwrightRun.update({ childSessionIds });
              if (childSessionIds.length > 0) {
                activeSpecwrightRun.appendLog(`[opencode] Child sessions: ${childSessionIds.join(", ")}`);
              }
            } catch (error) {
              activeSpecwrightRun.appendLog(`[opencode] Failed to read child sessions: ${error instanceof Error ? error.message : String(error)}`);
            }
          };

          fullText = await runner.run({
            systemPrompt,
            userMessage,
            model,
            mcpServers: commandMcpServers(mcpServers),
            includePlaywrightMcp: false,
            projectPath: projectPath ?? undefined,
            onToken: (token: string) => {
              win.webContents.send("pipeline:token", { token });
            },
            onLog: (line: string) => {
              activeSpecwrightRun?.appendLog(line);
              sendLog(win, line);
            },
            onOpenCodeSession: (info: { sessionId: string; baseUrl: string }) => {
              openCodeSession = info;
              activeSpecwrightRun?.update({ status: "running", opencodeSessionId: info.sessionId, opencodeBaseUrl: info.baseUrl });
              activeSpecwrightRun?.appendLog(`[opencode] Session: ${info.sessionId}`);
              sendLog(win, `[orchestrator] OpenCode session: ${info.sessionId}`);
              sendLog(win, `[orchestrator] Continue in CLI: opencode attach ${info.baseUrl} --session ${info.sessionId}`);
              void refreshOpenCodeChildSessions();
            },
            onToolEnd: (toolName: string, durationMs: number) => {
              win.webContents.send("pipeline:tool-end", { toolName, toolId: "", durationMs });
            },
            onStepFinish: () => {},
          });

          win.webContents.send("pipeline:log", { line: "[pipeline] Done" });
          await refreshOpenCodeChildSessions();
          activeSpecwrightRun?.update({ status: "done" });
        } else {
          // ── claude-runner ──
          win.webContents.send("pipeline:log", { line: `[pipeline] Launching Claude Runner…` });

          const { Runner } = await loadClaudeRunner();
          const agentRunnerModule = await loadAiSdkRunner();
          if (projectPath) {
            const specwrightRun = agentRunnerModule.createSpecwrightRun({
              kind: "e2e-automate",
              projectPath,
              title: "Specwright /e2e-automate",
            });
            activeSpecwrightRun = createActiveSpecwrightRun(agentRunnerModule, specwrightRun);
            activeSpecwrightRun.update({ status: "running" });
            sendLog(win, `[orchestrator] Run ${specwrightRun.id} registered in .specwright/runs/`);
            sendLog(win, `[orchestrator] CLI: specwright-agent inspect ${specwrightRun.id}`);
          }

          const claudePath = resolveClaudeExecutablePath();
          const runner = new Runner({
            cwd: projectPath,
            systemPrompt: systemPrompt ? { preset: "claude_code" as const, append: systemPrompt } : undefined,
            mcp: claudeMcpConfig(mcpServers),
            // When the user has toggled "Skip permissions" in the Desktop UI they've
            // opted in to a trusted run. Use the SDK's `bypassPermissions` mode
            // (via sdkOptions) — this skips the classifier LLM call per tool,
            // which otherwise adds 3–10s latency per Read/Grep/Bash and makes
            // long-running skills like `/e2e-heal` feel frozen for 10+ minutes.
            //
            // When skip is OFF, use `prompt` so every tool call goes through the
            // interactive approval flow (the safer default for untrusted runs).
            permissions: payload.skipPermissions ? "auto" : "prompt",
            onPermission: async (req: ClaudePermissionRequest) => {
              activeSpecwrightRun?.addPermission({
                id: req.id,
                toolName: req.tool,
                toolInput: req.input ?? {},
                description: req.description,
              });
              win.webContents.send("pipeline:permission-request", {
                id: req.id,
                toolName: req.tool,
                toolInput: req.input ?? {},
                description: req.description,
              });
              return new Promise<boolean>((resolve) => {
                pendingPermissions.set(req.id, resolve);
                if (activeSpecwrightRun) {
                  void waitForRecordedPermissionResponse(agentRunnerModule, activeSpecwrightRun.projectPath, activeSpecwrightRun.id, req.id).then((allowed) => {
                    if (!pendingPermissions.has(req.id)) return;
                    pendingPermissions.delete(req.id);
                    resolve(allowed);
                    win.webContents.send("pipeline:log", {
                      line: `[permission] ${allowed ? "Allowed" : "Denied"} from run registry (${req.id.slice(0, 8)}…)`,
                    });
                  });
                }
              });
            },
            sdkOptions: {
              // Enable AI-generated progress summaries during subagent execution
              agentProgressSummaries: true,
              // Only use MCPs we explicitly configure — don't merge with user's system MCPs from ~/.claude.json
              strictMcpConfig: true,
              // Pass the resolved claude CLI path so the SDK doesn't fall back to
              // require.resolve("./cli.js") which points inside app.asar (not a real path)
              ...(claudePath ? { pathToClaudeCodeExecutable: claudePath } : {}),
              // When the user has toggled "Skip permissions" in the Desktop UI they've
              // opted in to a trusted run. Override claude-runner's 'auto' classifier
              // mode with `bypassPermissions` — skips the 3–10s per-tool classifier
              // LLM call that otherwise makes skills like /e2e-heal feel frozen for
              // 10+ minutes during the healer's dozens of Read/Grep/Bash calls.
              ...(payload.skipPermissions
                ? { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true }
                : {}),
            },
          });
          activeClaudeRunner = runner;

          const stream = runner.stream(userMessage, payload.resumeSessionId ? { _resumeSessionId: payload.resumeSessionId } as never : undefined);
          activeStream = stream;

          fullText = "";
          for await (const rawEvent of stream) {
            const event = rawEvent as unknown as ClaudeStreamEvent;
            switch (event.type) {
              case "text":
                fullText += event.text ?? "";
                win.webContents.send("pipeline:token", { token: event.text ?? "" });
                break;
              case "tool_start": {
                win.webContents.send("pipeline:tool-start", { toolName: event.tool ?? "tool", toolId: event.id ?? "" });
                const toolInput = event.input ?? {};
                if (event.tool === "Write" && typeof toolInput.file_path === "string") {
                  const fileName = path.basename(String(toolInput.file_path));
                  win.webContents.send("pipeline:log", { line: `[tool] Write → ${fileName}` });
                  win.webContents.send("pipeline:token", { token: `\n📝 Writing \`${fileName}\`...\n` });
                } else if (event.tool === "Edit" && typeof toolInput.file_path === "string") {
                  const fileName = path.basename(String(toolInput.file_path));
                  win.webContents.send("pipeline:log", { line: `[tool] Edit → ${fileName}` });
                } else {
                  win.webContents.send("pipeline:log", { line: `[tool] ${event.tool ?? "tool"} — started` });
                }
                break;
              }
              case "tool_end": {
                const duration = event.duration ?? 0;
                win.webContents.send("pipeline:tool-end", { toolName: event.tool ?? "tool", toolId: event.id ?? "", durationMs: duration });
                win.webContents.send("pipeline:log", { line: `[tool] ${event.tool ?? "tool"} — done (${(duration / 1000).toFixed(1)}s)` });
                break;
              }
              case "session_init":
                win.webContents.send("pipeline:log", { line: `[pipeline] Session ${event.sessionId} model=${event.model}` });
                break;
              case "mcp_status":
                if (event.status === "connected") {
                  win.webContents.send("pipeline:log", { line: `[mcp] ✓ ${event.server}` });
                } else if (event.status === "failed") {
                  win.webContents.send("pipeline:log", { line: `[mcp] ✕ ${event.server} — FAILED` });
                } else {
                  win.webContents.send("pipeline:log", { line: `[mcp] ⚠ ${event.server} — needs auth` });
                }
                // Structured event for UI status indicators (e.g., Atlassian connect button)
                win.webContents.send("pipeline:mcp-status", { server: event.server as string, status: event.status as string });
                break;
              case "error":
                // Show error in chat bubble AND terminal log
                win.webContents.send("pipeline:token", { token: `\n\n**Blocked by policy:** ${event.message ?? "Unknown error"}\n` });
                win.webContents.send("pipeline:log", { line: `[pipeline] Error: ${event.message ?? "Unknown error"}` });
                break;
              case "task_start":
                win.webContents.send("pipeline:log", { line: `[agent] ${event.description ?? "Task"} — started` });
                win.webContents.send("pipeline:tool-start", { toolName: event.description ?? "Task", toolId: event.taskId ?? "" });
                break;
              case "task_progress":
                // Show AI-generated summary in chat so user sees activity
                if (event.summary) {
                  win.webContents.send("pipeline:token", { token: `\n> ${event.summary}\n` });
                }
                // Update terminal with current tool activity
                if (event.toolName) {
                  const elapsed = Math.round((event.usage?.durationMs ?? 0) / 1000);
                  win.webContents.send("pipeline:log", {
                    line: `[agent] ${event.toolName} (${elapsed}s, ${event.usage?.tools ?? 0} tools)`,
                  });
                }
                break;
              case "task_done": {
                const elapsed = Math.round((event.usage?.durationMs ?? 0) / 1000);
                win.webContents.send("pipeline:log", {
                  line: `[agent] ${event.summary || "Task"} — ${event.status} (${elapsed}s)`,
                });
                win.webContents.send("pipeline:tool-end", {
                  toolName: event.summary || "Task", toolId: event.taskId, durationMs: event.usage?.durationMs ?? 0,
                });
                break;
              }
              case "done":
                // Only save sessionId for resume if API was actually called (not hook-blocked)
                if (event.result && (event.result.usage.input > 0 || event.result.usage.output > 0)) {
                  lastSessionId = event.result.sessionId;
                }
                // Cost / token breakdown temporarily hidden from the pipeline terminal.
                // Re-enable by restoring the full line below.
                win.webContents.send("pipeline:log", {
                  line: `[pipeline] Done — ${event.result?.duration ?? 0}ms`,
                  // line: `[pipeline] Done — ${event.result.duration}ms, cost $${event.result.cost.toFixed(4)}, tokens: ${event.result.usage.input}in/${event.result.usage.output}out`,
                });
                break;
            }
          }
        }

        activeSpecwrightRun?.update({ status: "done" });
        if (projectPath && activeSpecwrightRun) {
          const agentRunnerModule = await loadAiSdkRunner();
          persistRunFileDiff(agentRunnerModule, projectPath, activeSpecwrightRun.id, beforeFiles, win);
        }
        win.webContents.send("pipeline:done", { fullText, sessionId: lastSessionId, userMessage });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        activeSpecwrightRun?.appendLog(`[pipeline] Error: ${msg}`);
        activeSpecwrightRun?.update({ status: "error", error: msg });
        win.webContents.send("pipeline:error", { error: msg });
      } finally {
        activeClaudeRunner = null;
        activeStream = null;
        if (openCodeService.isManagedServerRunning()) {
          win.webContents.send("pipeline:log", { line: "[pipeline] Stopping OpenCode server" });
          openCodeService.stop();
        }
        activeSpecwrightRun = null;
        pendingPermissions.clear();
      }
    }
  );

  ipcMain.handle("pipeline:abort", () => {
    const win = getWindow();
    if (activeTestProcess) {
      activeTestRunAborted = true;
      if (win) {
        sendLog(win, "[pipeline] Abort requested — stopping test process");
      }
      activeSpecwrightRun?.appendLog("[pipeline] Abort requested — stopping test process");
      activeSpecwrightRun?.update({ status: "aborted" });
      killProcessTree(activeTestProcess);
      for (const process of activeManagedAppProcesses) killProcessTree(process);
      activeManagedAppProcesses = [];
      pendingPermissions.clear();
      return { ok: true, state: "aborting" };
    }
    if (activeTestRunPending) {
      activeTestRunAborted = true;
      if (win) {
        sendLog(win, "[pipeline] Abort requested — waiting for test process to start");
      }
      activeSpecwrightRun?.appendLog("[pipeline] Abort requested — waiting for test process to start");
      activeSpecwrightRun?.update({ status: "aborted" });
      for (const process of activeManagedAppProcesses) killProcessTree(process);
      activeManagedAppProcesses = [];
      pendingPermissions.clear();
      return { ok: true, state: "aborting" };
    }
    if (activeClaudeRunner) {
      win?.webContents.send("pipeline:log", { line: "[pipeline] Abort requested — stopping model run" });
      activeSpecwrightRun?.appendLog("[pipeline] Abort requested — stopping model run");
      activeSpecwrightRun?.update({ status: "aborted" });
      win?.webContents.send("pipeline:token", { token: "\n\nAbort requested. Stopping run..." });
      activeClaudeRunner.abort();
      activeClaudeRunner = null;
      activeStream = null;
      openCodeService.stop();
      activeSpecwrightRun = null;
      win?.webContents.send("pipeline:aborted", { fullText: "Aborted by user", userMessage: "" });
      pendingPermissions.clear();
      return { ok: true, state: "aborted" };
    }
    pendingPermissions.clear();
    return { ok: false, state: "idle" };
  });

  ipcMain.handle("pipeline:send-message", (_event, { text }: { text: string; priority?: "now" | "next" }): boolean => {
    if (activeStream) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", { line: `[user] ${text}` });
      activeStream.send(text);
      return true;
    }
    return false;
  });

  ipcMain.handle("pipeline:interrupt", async () => {
    if (activeTestProcess) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", { line: "[pipeline] Interrupt is not available for direct test commands — use Abort to stop the process" });
      win?.webContents.send("pipeline:token", { token: "\n\nInterrupt is not available while a test command is running. Use Abort to stop it." });
      return { ok: false, reason: "test-process" };
    }
    if (activeStream) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", {
        line: `[pipeline] Interrupted by user — Claude will pause and await instructions`,
      });
      activeStream.send("\n\n[User interrupted. Pause what you're doing and wait for instructions.]");
      return { ok: true };
    } else if (activeClaudeRunner?.interrupt) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", {
        line: `[pipeline] Interrupted by user — model will pause and await instructions`,
      });
      activeClaudeRunner.interrupt();
      return { ok: true };
    }
    return { ok: false, reason: "idle" };
  });

  ipcMain.handle(
    "pipeline:respond-permission",
    (_event, { requestId, allowed }: { requestId: string; allowed: boolean }) => {
      const resolve = pendingPermissions.get(requestId);
      if (resolve) {
        resolve(allowed);
        pendingPermissions.delete(requestId);
        void activeSpecwrightRun?.respondPermission(requestId, allowed);
        const win = getWindow();
        win?.webContents.send("pipeline:log", {
          line: `[permission] ${allowed ? "Allowed" : "Denied"} (${requestId.slice(0, 8)}…)`,
        });
      }
    }
  );

  // Log file helpers — expose path and allow opening via shell
  ipcMain.handle("pipeline:get-log-path", () => getLogFilePath());
  ipcMain.handle("pipeline:open-log", () => {
    const logPath = getLogFilePath();
    if (logPath && fs.existsSync(logPath)) {
      const { shell } = require("electron");
      shell.openPath(logPath);
      return true;
    }
    return false;
  });
  ipcMain.handle("pipeline:clear-logs", () => clearLocalLogs());

  ipcMain.handle("pipeline:read-context-files", async () => {
    return readPipelineContextFiles(configService.getProjectPath() || undefined);
  });
}
