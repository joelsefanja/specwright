import { ipcMain, BrowserWindow, app } from "electron";
import { execSync } from "child_process";
import { log as fileLog, getLogFilePath, clearLocalLogs } from "../logger";
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
  onToolEnd?: (toolName: string, durationMs: number) => void;
  onStepFinish?: (info: { stepNumber: number; totalTokens: number; toolCalls: string[] }) => void;
}

let _aiSdkRunnerModule: AiSdkRunnerModule | null = null;
async function loadAiSdkRunner(): Promise<AiSdkRunnerModule> {
  if (!_aiSdkRunnerModule) {
    _aiSdkRunnerModule = await dynamicImport("@specwright/agent-runner") as unknown as AiSdkRunnerModule;
  }
  return _aiSdkRunnerModule;
}
import type { ConfigService } from "../services/ConfigService";
import type { ProjectService } from "../services/ProjectService";
import * as fs from "fs";
import * as path from "path";
import { getAtlassianAccessToken } from "./atlassian.ipc";

/**
 * Resolve the system `claude` CLI path for use in a packaged .app.
 *
 * Strategy (in order):
 * 1. Check known install locations directly (fast, no subprocess)
 * 2. Try login shell with `source ~/.zshrc` to pick up nvm/volta/npm paths
 * 3. Try login+interactive shell as last resort
 *
 * Result is cached after the first successful lookup.
 */
let _nodePath: string | null = null;
function resolveNodePath(): string {
  if (_nodePath !== null) return _nodePath;
  if (!app.isPackaged) { _nodePath = "node"; return _nodePath; }

  const home = require("os").homedir();

  // Check well-known node install locations
  const candidates = [
    `/opt/homebrew/bin/node`,                          // Homebrew (Apple Silicon)
    `/usr/local/bin/node`,                             // Homebrew (Intel) or manual
    `${home}/.volta/bin/node`,                         // Volta
    `${home}/.nvm/versions/node/current/bin/node`,    // nvm symlink
    `/usr/bin/node`,
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      _nodePath = p;
      fileLog(`[pipeline] resolveNodePath → ${p} (direct lookup)`);
      return _nodePath;
    }
  }

  // Fall back to login shell which picks up nvm/pyenv shims
  const shell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
  try {
    const result = execSync(`${shell} -l -c 'which node'`, {
      timeout: 5000, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (result && fs.existsSync(result)) {
      _nodePath = result;
      fileLog(`[pipeline] resolveNodePath → ${result} (shell lookup)`);
      return _nodePath;
    }
  } catch { /* ignore */ }

  _nodePath = "node"; // last resort — may fail if not in PATH
  fileLog("[pipeline] resolveNodePath → node (fallback)");
  return _nodePath;
}

let _claudePath: string | null = null;
function resolveClaudePath(): string | null {
  if (_claudePath !== null) return _claudePath;
  if (!app.isPackaged) return null; // dev: normal PATH already has claude

  const home = require("os").homedir();

  // 1. Check well-known install locations directly
  const candidates = [
    `${home}/.local/bin/claude`,          // npm global (Linux/macOS default)
    `${home}/.npm-global/bin/claude`,     // npm --prefix ~/.npm-global
    `/usr/local/bin/claude`,              // Homebrew (Intel Mac) or manual
    `/opt/homebrew/bin/claude`,           // Homebrew (Apple Silicon)
    `${home}/.volta/bin/claude`,          // Volta
    `${home}/.nvm/versions/node/current/bin/claude`, // nvm (approximate)
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      _claudePath = p;
      fileLog(`[pipeline] resolveClaudePath → ${p} (direct lookup)`);
      return _claudePath;
    }
  }

  // 2. Login shell + source .zshrc (picks up nvm/volta PATH additions)
  const shell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
  const rcFile = shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";
  for (const cmd of [
    `source ${rcFile} 2>/dev/null; which claude`,
    `which claude`,
  ]) {
    try {
      const result = execSync(`${shell} -l -c '${cmd}'`, {
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (result && fs.existsSync(result)) {
        _claudePath = result;
        fileLog(`[pipeline] resolveClaudePath → ${result} (shell lookup)`);
        return _claudePath;
      }
    } catch {
      // try next
    }
  }

  fileLog("[pipeline] resolveClaudePath → not found (claude CLI not on known paths)");
  _claudePath = "";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeClaudeRunner: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeStream: any = null;

// Pending permission requests: id → resolve function
const pendingPermissions = new Map<string, (allowed: boolean) => void>();
// Last completed session ID — used for resume
let lastSessionId: string | null = null;

/** Send a log line to the renderer window AND write it to the file log. */
function sendLog(win: BrowserWindow, line: string): void {
  win.webContents.send("pipeline:log", { line });
  fileLog(line);
}

export function registerPipelineIpc(
  configService: ConfigService,
  projectService: ProjectService,
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
      if (!win) return;

      const projectPath = configService.getProjectPath() || undefined;

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

      // Append env credentials and auth instructions to user message
      let userMessage = payload.userMessage;
      // HEADLESS=false in .env.testing → show browser during exploration (default: headless)
      const headless = projectPath ? projectService.readEnv(projectPath)["HEADLESS"] !== "false" : true;
      if (projectPath) {
        const env = projectService.readEnv(projectPath);
        const lines: string[] = [];
        const PIPELINE_VARS = new Set([
          "BASE_URL", "TEST_ENV", "AUTH_STRATEGY",
          "TEST_USER_EMAIL", "TEST_USER_PASSWORD",
          "TEST_USERNAME", "TEST_PASSWORD",
          // Auth identity — needed by planner agent for localStorage injection
          "TEST_USER_NAME", "TEST_USER_PICTURE",
          "OAUTH_STORAGE_KEY", "OAUTH_SIGNIN_PATH", "OAUTH_BUTTON_TEST_ID",
        ]);
        for (const [k, v] of Object.entries(env)) {
          if (PIPELINE_VARS.has(k) && v) lines.push(`${k}: ${v}`);
        }
        if (lines.length) {
          userMessage += `\n\n---\nEnvironment configuration:\n${lines.join("\n")}`;
          win.webContents.send("pipeline:log", {
            line: `[pipeline] Credentials injected (${lines.length} vars)`,
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

      // Load MCP servers: project's .mcp.json + always include Playwright MCP
      const screenshotDir = projectPath
        ? path.join(projectPath, ".playwright-mcp")
        : ".playwright-mcp";

      // Desktop is fully self-contained — hardcodes all 3 core MCP servers.
      // No read of project .mcp.json; that file is only for CLI users.
      //
      // Both MCP servers are installed as local dependencies and unpacked from
      // asar (see asarUnpack in electron-builder.yml) so Node can execute them
      // directly without npx. require.resolve returns the virtual asar path even
      // when asarUnpack is set — replace app.asar with app.asar.unpacked so the
      // external node process can actually read the file off disk.
      const playwrightMcpCli = path.join(
        path.dirname(require.resolve("@playwright/mcp/package.json"))
          .replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep),
        "cli.js"
      );
      fileLog(`[pipeline] playwright-mcp cli → ${playwrightMcpCli}`);
      const mcpServers: Record<string, Record<string, unknown>> = {
        "playwright-test": {
          command: resolveNodePath(),
          args: [
            playwrightMcpCli,
            "--output-dir", screenshotDir,
            ...(headless ? ["--headless"] : []),
          ],
        },
        "markitdown": {
          // In packaged app: use bundled uvx from extraResources (downloaded by beforePack).
          // In dev: fall back to system uvx.
          command: app.isPackaged
            ? path.join(process.resourcesPath, "bin", process.platform === "win32" ? "uvx.exe" : "uvx")
            : "uvx",
          args: ["markitdown-mcp"],
        },
        "atlassian": await (async () => {
          const token = await getAtlassianAccessToken();
          return {
            type: "streamable-http",
            url: "https://mcp.atlassian.com/v1/mcp",
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          };
        })(),
      };

      win.webContents.send("pipeline:log", {
        line: `[pipeline] MCP servers: ${Object.keys(mcpServers).join(", ")}`,
      });

      // Determine which provider to use
      const provider = projectPath
        ? (projectService.readEnv(projectPath)["SPECWRIGHT_LLM_PROVIDER"] as string ?? "anthropic").toLowerCase()
        : "anthropic";

      pendingPermissions.clear();

      try {
        let fullText: string;

        if (provider === "opencode") {
          // ── AiSdkRunner + OpenCode direct path ──
          win.webContents.send("pipeline:log", { line: `[pipeline] Launching OpenCode runner…` });

          // Set env vars so AiSdkRunner can read them
          const env = projectPath ? projectService.readEnv(projectPath) : {};
          for (const [k, v] of Object.entries(env)) {
            if (v) process.env[k] = v;
          }

          const ocUrl = (env["SPECWRIGHT_OPENCODE_URL"] as string) || "http://127.0.0.1:18789";
          const port = new URL(ocUrl).port ? parseInt(new URL(ocUrl).port, 10) : 18789;

          // Auto-start opencode server if not running
          try {
            const healthRes = await fetch(`${ocUrl}/global/health`, { signal: AbortSignal.timeout(3000) });
            if (!healthRes.ok) throw new Error("not healthy");
          } catch {
            win.webContents.send("pipeline:log", { line: `[pipeline] Starting opencode serve on port ${port}…` });
            const { spawn } = await import("child_process");
            spawn("opencode", ["serve", "--port", String(port)], {
              stdio: "ignore",
              shell: process.platform === "win32",
              detached: true,
              cwd: projectPath ?? undefined,
            });
            await new Promise((r) => setTimeout(r, 3000));
          }

          // Detect model from server only if user didn't explicitly set one
          let model = (env["SPECWRIGHT_MODEL"] as string) || "";
          if (!model) {
            try {
              const provRes = await fetch(`${ocUrl}/provider`, { signal: AbortSignal.timeout(5000) });
              if (provRes.ok) {
                const provData = await provRes.json() as { default: Record<string, string>; connected: string[] };
                const pid =
                  provData.connected.find((p: string) => {
                    const id = p.toLowerCase();
                    return (id.includes("openai") || id.includes("chatgpt")) && provData.default[p];
                  }) ??
                  provData.connected.find((p: string) => provData.default[p]) ??
                  provData.connected[0];
                if (pid && provData.default[pid]) {
                  model = provData.default[pid];
                  win.webContents.send("pipeline:log", { line: `[pipeline] Detected model: ${model} (${pid})` });
                }
              }
            } catch {
              // use default model
            }
          }
          if (!model) model = "gpt-5.5";

          const { AiSdkRunner } = await loadAiSdkRunner();
          const runner = new AiSdkRunner();
          activeClaudeRunner = runner;

          // Filter to only command-based MCPs (AiSdkRunner doesn't support HTTP MCPs)
          const cmdMcps: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};
          for (const [name, cfg] of Object.entries(mcpServers)) {
            if (cfg.command) cmdMcps[name] = cfg as { command: string; args?: string[]; env?: Record<string, string> };
          }

          fullText = await runner.run({
            systemPrompt,
            userMessage,
            model,
            mcpServers: cmdMcps,
            includePlaywrightMcp: false,
            projectPath: projectPath ?? undefined,
            onToken: (token: string) => {
              win.webContents.send("pipeline:token", { token });
            },
            onLog: (line: string) => {
              sendLog(win, line);
            },
            onToolEnd: (toolName: string, durationMs: number) => {
              win.webContents.send("pipeline:tool-end", { toolName, toolId: "", durationMs });
            },
            onStepFinish: () => {},
          });

          win.webContents.send("pipeline:log", { line: "[pipeline] Done" });
        } else {
          // ── claude-runner ──
          win.webContents.send("pipeline:log", { line: `[pipeline] Launching Claude Runner…` });

          const { Runner } = await loadClaudeRunner();

          const mcpConfig: Record<string, string | { command: string; args?: string[]; env?: Record<string, string> } | { type: "http"; url: string; headers?: Record<string, string> }> = {};
          for (const [name, config] of Object.entries(mcpServers)) {
            if (config.url) {
              // HTTP-based MCP (streamable-http or http) — claude-runner uses type: "http"
              mcpConfig[name] = {
                type: "http",
                url: config.url as string,
                ...(config.headers ? { headers: config.headers as Record<string, string> } : {}),
              };
            } else {
              mcpConfig[name] = config as { command: string; args?: string[]; env?: Record<string, string> };
            }
          }

          const claudePath = resolveClaudePath();
          const runner = new Runner({
            cwd: projectPath,
            systemPrompt: systemPrompt ? { preset: "claude_code" as const, append: systemPrompt } : undefined,
            mcp: mcpConfig,
            // When the user has toggled "Skip permissions" in the Desktop UI they've
            // opted in to a trusted run. Use the SDK's `bypassPermissions` mode
            // (via sdkOptions) — this skips the classifier LLM call per tool,
            // which otherwise adds 3–10s latency per Read/Grep/Bash and makes
            // long-running skills like `/e2e-heal` feel frozen for 10+ minutes.
            //
            // When skip is OFF, use `prompt` so every tool call goes through the
            // interactive approval flow (the safer default for untrusted runs).
            permissions: payload.skipPermissions ? "auto" : "prompt",
            onPermission: async (req) => {
              win.webContents.send("pipeline:permission-request", {
                id: req.id,
                toolName: req.tool,
                toolInput: req.input ?? {},
                description: req.description,
              });
              return new Promise<boolean>((resolve) => {
                pendingPermissions.set(req.id, resolve);
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
          for await (const event of stream) {
            switch (event.type) {
              case "text":
                fullText += event.text;
                win.webContents.send("pipeline:token", { token: event.text });
                break;
              case "tool_start": {
                win.webContents.send("pipeline:tool-start", { toolName: event.tool, toolId: event.id });
                const toolInput = event.input ?? {};
                if (event.tool === "Write" && toolInput.file_path) {
                  const fileName = path.basename(String(toolInput.file_path));
                  win.webContents.send("pipeline:log", { line: `[tool] Write → ${fileName}` });
                  win.webContents.send("pipeline:token", { token: `\n📝 Writing \`${fileName}\`...\n` });
                } else if (event.tool === "Edit" && toolInput.file_path) {
                  const fileName = path.basename(String(toolInput.file_path));
                  win.webContents.send("pipeline:log", { line: `[tool] Edit → ${fileName}` });
                } else {
                  win.webContents.send("pipeline:log", { line: `[tool] ${event.tool} — started` });
                }
                break;
              }
              case "tool_end":
                win.webContents.send("pipeline:tool-end", { toolName: event.tool, toolId: event.id, durationMs: event.duration });
                win.webContents.send("pipeline:log", { line: `[tool] ${event.tool} — done (${(event.duration / 1000).toFixed(1)}s)` });
                break;
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
                win.webContents.send("pipeline:token", { token: `\n\n**Blocked by policy:** ${event.message}\n` });
                win.webContents.send("pipeline:log", { line: `[pipeline] Error: ${event.message}` });
                break;
              case "task_start":
                win.webContents.send("pipeline:log", { line: `[agent] ${event.description} — started` });
                win.webContents.send("pipeline:tool-start", { toolName: event.description, toolId: event.taskId });
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
                if (event.result.usage.input > 0 || event.result.usage.output > 0) {
                  lastSessionId = event.result.sessionId;
                }
                // Cost / token breakdown temporarily hidden from the pipeline terminal.
                // Re-enable by restoring the full line below.
                win.webContents.send("pipeline:log", {
                  line: `[pipeline] Done — ${event.result.duration}ms`,
                  // line: `[pipeline] Done — ${event.result.duration}ms, cost $${event.result.cost.toFixed(4)}, tokens: ${event.result.usage.input}in/${event.result.usage.output}out`,
                });
                break;
            }
          }
        }

        win.webContents.send("pipeline:done", { fullText, sessionId: lastSessionId, userMessage });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        win.webContents.send("pipeline:error", { error: msg });
      } finally {
        activeClaudeRunner = null;
        activeStream = null;
        pendingPermissions.clear();
      }
    }
  );

  ipcMain.handle("pipeline:abort", () => {
    if (activeClaudeRunner) {
      activeClaudeRunner.abort();
      activeClaudeRunner = null;
      activeStream = null;
    }
    pendingPermissions.clear();
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
    if (activeStream) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", {
        line: `[pipeline] Interrupted by user — Claude will pause and await instructions`,
      });
      activeStream.send("\n\n[User interrupted. Pause what you're doing and wait for instructions.]");
    } else if (activeClaudeRunner?.interrupt) {
      const win = getWindow();
      win?.webContents.send("pipeline:log", {
        line: `[pipeline] Interrupted by user — model will pause and await instructions`,
      });
      activeClaudeRunner.interrupt();
    }
  });

  ipcMain.handle(
    "pipeline:respond-permission",
    (_event, { requestId, allowed }: { requestId: string; allowed: boolean }) => {
      const resolve = pendingPermissions.get(requestId);
      if (resolve) {
        resolve(allowed);
        pendingPermissions.delete(requestId);
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

  // Read context files (plan + seed) for continuation prompts
  ipcMain.handle("pipeline:read-context-files", async () => {
    const projPath = configService.getProjectPath();
    if (!projPath) return { plan: "", seed: "", conventions: "" };

    const readFile = (relPath: string): string => {
      const full = path.join(projPath, relPath);
      if (fs.existsSync(full)) return fs.readFileSync(full, "utf-8");
      return "";
    };

    // Find the most recent plan file
    const plansDir = path.join(projPath, "e2e-tests/plans");
    let planContent = "";
    if (fs.existsSync(plansDir)) {
      const planFiles = fs.readdirSync(plansDir)
        .filter(f => f.endsWith(".md") || f.endsWith("-plan.md"))
        .sort((a, b) => {
          const sa = fs.statSync(path.join(plansDir, a)).mtimeMs;
          const sb = fs.statSync(path.join(plansDir, b)).mtimeMs;
          return sb - sa; // newest first
        });
      if (planFiles.length > 0) {
        planContent = fs.readFileSync(path.join(plansDir, planFiles[0]), "utf-8");
      }
    }

    const seedContent = readFile("e2e-tests/playwright/generated/seed.spec.js");

    const agentFiles = [
      ".claude/agents/code-generator.md",
      ".claude/agents/bdd-generator.md",
    ];
    const agentContents: string[] = [];
    for (const rel of agentFiles) {
      const content = readFile(rel);
      if (content) {
        const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
        agentContents.push(`## ${path.basename(rel, ".md")} agent instructions\n\n${body}`);
      }
    }

    const testConfigContent = readFile("e2e-tests/data/testConfig.js");
    if (testConfigContent) {
      agentContents.push(`## testConfig.js (routes and timeouts)\n\`\`\`javascript\n${testConfigContent}\n\`\`\``);
    }

    const conventions = agentContents.length > 0
      ? agentContents.join("\n\n---\n\n")
      : [
          "- Import fixtures from: e2e-tests/playwright/fixtures.js",
          "- Shared steps in: e2e-tests/features/playwright-bdd/shared/",
          "- processDataTable + validateExpectations from: e2e-tests/utils/stepHelpers.js",
          "- 3-column data tables: Field Name | Value | Type",
        ].join("\n");

    return { plan: planContent, seed: seedContent, conventions };
  });
}
