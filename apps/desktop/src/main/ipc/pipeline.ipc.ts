import { ipcMain, BrowserWindow, app } from "electron";
import { execSync, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
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
let activeTestProcess: ChildProcess | null = null;
let activeManagedAppProcesses: ChildProcess[] = [];
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

interface TestRunCommand {
  command: string;
  args: string[];
  label: string;
  reason: string;
}

interface DirectRunOptions {
  headed: boolean;
  integrated: boolean;
  targetUrl?: string;
}

interface TestRunContext {
  projectPath: string;
  input: string;
  scripts: Record<string, string>;
  packageManager: string;
}

interface TestRunStrategy {
  matches(context: TestRunContext): boolean;
  resolve(context: TestRunContext): TestRunCommand;
}

function parseScriptInvocation(input: string, scripts: Record<string, string>): { scriptName: string; extraArgs: string[] } | null {
  const [scriptName, ...extraArgs] = input.trim().split(/\s+/);
  if (!scriptName || !scripts[scriptName]) return null;
  return { scriptName, extraArgs };
}

function scriptArgs(scriptName: string, extraArgs: string[]): string[] {
  return ["run", scriptName, ...(extraArgs.length ? ["--", ...extraArgs] : [])];
}

const createScriptCommand = (packageManager: string, scriptName: string, extraArgs: string[] = []): TestRunCommand => ({
  command: packageManager,
  args: scriptArgs(scriptName, extraArgs),
  label: extraArgs.length ? `${scriptName} ${extraArgs.join(" ")}` : scriptName,
  reason: extraArgs.length ? `npm run script with forwarded args` : `npm run script`,
});

const createPlaywrightCommand = (packageManager: string, args: string[], label: string): TestRunCommand => ({
  command: packageManager,
  args: ["exec", "playwright", "test", ...args],
  label,
  reason: "direct Playwright command",
});

function readPackageScripts(projectPath: string): Record<string, string> {
  const pkgPath = path.join(projectPath, "package.json");
  return fs.existsSync(pkgPath)
    ? (JSON.parse(fs.readFileSync(pkgPath, "utf-8")).scripts ?? {}) as Record<string, string>
    : {};
}

function detectPackageManager(projectPath: string): string {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const lockfiles: Array<[string, string]> = [
    ["pnpm-lock.yaml", `pnpm${extension}`],
    ["yarn.lock", `yarn${extension}`],
    ["package-lock.json", `npm${extension}`],
  ];
  return lockfiles.find(([file]) => fs.existsSync(path.join(projectPath, file)))?.[1] ?? `pnpm${extension}`;
}

function hasRunnableFeatureDir(projectPath: string, bucket: "@Modules" | "@Workflows", tag: string): boolean {
  const dirName = tag.startsWith("@") ? tag : `@${tag}`;
  return fs.existsSync(path.join(projectPath, "e2e-tests/features/playwright-bdd", bucket, dirName));
}

function scriptFor(scripts: Record<string, string>, kind: "all" | "workflows" | "auth"): string | null {
  const candidates = kind === "all"
    ? ["test:bdd", "test:e2e"]
    : kind === "workflows"
      ? ["test:bdd:workflows", "test:e2e:workflows"]
      : ["test:bdd:auth", "test:e2e:auth"];
  return candidates.find((script) => scripts[script]) ?? null;
}

function readPrimaryFeatureTag(projectPath: string, bucket: "@Modules" | "@Workflows", folderTag: string): string {
  const dirName = folderTag.startsWith("@") ? folderTag : `@${folderTag}`;
  const dir = path.join(projectPath, "e2e-tests/features/playwright-bdd", bucket, dirName);
  if (!fs.existsSync(dir)) return folderTag;
  const featureFile = fs.readdirSync(dir).find((file) => file.endsWith(".feature"));
  if (!featureFile) return folderTag;
  const firstLine = fs.readFileSync(path.join(dir, featureFile), "utf-8").split(/\r?\n/)[0] ?? "";
  return firstLine.match(/@[\w-]+/g)?.find((tag) => tag.toLowerCase() !== "@workflows" && tag.toLowerCase() !== "@modules") ?? folderTag;
}

function normalizeKnownFeatureTag(projectPath: string, scriptName: string, tag: string): string {
  const bucket = scriptName.includes("workflow") ? "@Workflows" : "@Modules";
  return hasRunnableFeatureDir(projectPath, bucket, tag) ? readPrimaryFeatureTag(projectPath, bucket, tag) : tag;
}

function normalizeScriptExtraArgs(projectPath: string, scriptName: string, extraArgs: string[]): string[] {
  const grepIndex = extraArgs.findIndex((arg) => arg === "--grep");
  if (grepIndex < 0 || !extraArgs[grepIndex + 1]?.startsWith("@")) return extraArgs;
  const next = [...extraArgs];
  next[grepIndex + 1] = normalizeKnownFeatureTag(projectPath, scriptName, next[grepIndex + 1]);
  return next;
}

const testRunStrategies: TestRunStrategy[] = [
  {
    matches: ({ scripts, input }) => Boolean(parseScriptInvocation(input || "test:bdd", scripts)),
    resolve: ({ projectPath, scripts, input, packageManager }) => {
      const parsed = parseScriptInvocation(input || "test:bdd", scripts)!;
      return createScriptCommand(packageManager, parsed.scriptName, normalizeScriptExtraArgs(projectPath, parsed.scriptName, parsed.extraArgs));
    },
  },
  {
    matches: ({ scripts, input }) => Boolean(scripts[input || "test:bdd"]),
    resolve: ({ scripts, input, packageManager }) => createScriptCommand(packageManager, scripts[input || "test:bdd"] ? input || "test:bdd" : "test:bdd"),
  },
  {
    matches: ({ input }) => input.startsWith("@"),
    resolve: ({ projectPath, scripts, input, packageManager }) => {
      const matchingScript = Object.entries(scripts).find(([name, cmd]) => name.startsWith("test:bdd") && cmd.includes(input))?.[0];
      if (matchingScript) return createScriptCommand(packageManager, matchingScript);

      const workflowScript = scriptFor(scripts, "workflows");
      if (hasRunnableFeatureDir(projectPath, "@Workflows", input) && workflowScript) {
        return createScriptCommand(packageManager, workflowScript, ["--grep", readPrimaryFeatureTag(projectPath, "@Workflows", input)]);
      }
      const allScript = scriptFor(scripts, "all");
      if (hasRunnableFeatureDir(projectPath, "@Modules", input) && allScript) {
        return createScriptCommand(packageManager, allScript, ["--grep", readPrimaryFeatureTag(projectPath, "@Modules", input)]);
      }

      const lower = input.toLowerCase();
      const authScript = scriptFor(scripts, "auth");
      if (lower.includes("auth") && authScript) return createScriptCommand(packageManager, authScript, ["--grep", input]);
      if (lower.includes("workflow") && workflowScript) return createScriptCommand(packageManager, workflowScript, ["--grep", input]);
      return createScriptCommand(packageManager, allScript ?? workflowScript ?? "test:e2e", ["--grep", input]);
    },
  },
  {
    matches: ({ input }) => input.startsWith("--"),
    resolve: ({ input, packageManager }) => createPlaywrightCommand(packageManager, input.split(/\s+/), input),
  },
  {
    matches: () => true,
    resolve: ({ input, packageManager }) => createScriptCommand(packageManager, input || "test:bdd"),
  },
];

function resolveE2eRunCommand(projectPath: string, rawArgs: string): TestRunCommand {
  const context: TestRunContext = {
    projectPath,
    input: rawArgs.trim(),
    scripts: readPackageScripts(projectPath),
    packageManager: detectPackageManager(projectPath),
  };
  return testRunStrategies.find((strategy) => strategy.matches(context))!.resolve(context);
}

function parseDirectRunOptions(rawArgs: string): { args: string; options: DirectRunOptions } {
  const parts = rawArgs.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let headed = false;
  let integrated = false;

  for (const part of parts) {
    if (part === "--headed" || part === "--visible-browser") {
      headed = true;
      continue;
    }
    if (part === "--integrated-browser" || part === "--cdp-browser") {
      integrated = true;
      headed = false;
      continue;
    }
    kept.push(part);
  }

  return { args: kept.join(" "), options: { headed, integrated } };
}

function withIntegratedBrowserArgs(args: string[], options: DirectRunOptions): string[] {
  if (!options.integrated || args.includes("--workers") || args.some((arg) => arg.startsWith("--workers="))) return args;
  return [...args, "--workers=1"];
}

function normalizePackageRunArgs(args: string[]): string[] {
  if (args[0] !== "run" || args.length <= 2 || args[2] === "--") return args;
  return [args[0], args[1], "--", ...args.slice(2)];
}

function describeLikelyWait(commandLine: string): string {
  if (commandLine.includes("bddgen")) {
    return "BDD generation can be silent while it scans feature files and writes .features-gen specs.";
  }
  if (commandLine.includes("playwright")) {
    return "Likely stages: webServer startup, auth setup, browser actions, waits, or a dependent local service.";
  }
  if (commandLine.includes("test:e2e") || commandLine.includes("test:bdd")) {
    return "Likely stages: bddgen, Playwright webServer startup, auth setup, then selected tests.";
  }
  return "The process is still alive but has not written output.";
}

function diagnoseOutput(text: string): string | null {
  if (text.includes("spawn EINVAL")) {
    return "[diagnostic] Windows could not start the command process. This is a launcher problem, not a Playwright or BDD failure. Specwright should run .cmd tools through the Windows shell; restart the desktop app so the updated runner is used, then rerun.";
  }
  if (text.includes("ERR_CONNECTION_REFUSED")) {
    const target = text.match(/https?:\/\/[^\s,)]+/)?.[0];
    const url = target ? new URL(target) : null;
    const serviceHint = url?.port === "4202"
      ? "Start the narrowcasting frontend repo/app locally on port 4202, then rerun this workflow. This value comes from NARROWCASTING_URL."
      : "Start the repo/app that owns this URL locally, then rerun the workflow. If the service should not be local, update the matching URL env var.";
    return `[diagnostic] Connection refused${target ? `: ${target}` : ""}. No service is listening at the URL the test opened. ${serviceHint}`;
  }
  if (text.includes("No tests found")) {
    return "[diagnostic] The package script ran, but Playwright found no tests for this selection. This usually means the script's Playwright projects do not include the chosen feature tag. Add or adjust an npm script in this repo for that workflow, then rerun it from Specwright.";
  }
  return null;
}

interface GeneratedSpecStats {
  count: number;
  latestPath: string | null;
  latestMtimeMs: number;
}

interface LocalAppRequirement {
  key: string;
  url: string;
  hostname: string;
  port: number;
}

interface ManagedLocalApp {
  requirement: LocalAppRequirement;
  process: ChildProcess;
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) values[key] = value;
  }
  return values;
}

function localAppRequirements(projectPath: string): LocalAppRequirement[] {
  const env = readEnvFile(path.join(projectPath, "e2e-tests", ".env.testing"));
  const seen = new Set<string>();
  const requirements: LocalAppRequirement[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.endsWith("URL") || !value) continue;
    if (key.startsWith("SPECWRIGHT_")) continue;
    let url: URL;
    try { url = new URL(value); } catch { continue; }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) continue;
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (!Number.isFinite(port)) continue;
    const id = `${url.hostname}:${port}`;
    if (seen.has(id)) continue;
    seen.add(id);
    requirements.push({ key, url: value, hostname: url.hostname, port });
  }
  return requirements;
}

function isPortOpen(hostname: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    const done = (open: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function findSiblingProject(projectPath: string, name: string): string | null {
  const parent = path.dirname(projectPath);
  const candidate = path.join(parent, name);
  return fs.existsSync(path.join(candidate, "package.json")) ? candidate : null;
}

function commandForLocalApp(projectPath: string, requirement: LocalAppRequirement): { cwd: string; command: string; args: string[] } | null {
  const packageManager = detectPackageManager(projectPath);
  if (requirement.port === 4200) {
    return { cwd: projectPath, command: "npx", args: ["ng", "serve", "--host", requirement.hostname, "--port", String(requirement.port)] };
  }
  if (requirement.port === 4202 || requirement.key.toLowerCase().includes("narrowcasting")) {
    const cwd = findSiblingProject(projectPath, "narrowcasting");
    if (!cwd) return null;
    return { cwd, command: detectPackageManager(cwd), args: ["run", "dev"] };
  }
  return { cwd: projectPath, command: packageManager, args: ["run", "dev"] };
}

async function waitForLocalApp(requirement: LocalAppRequirement, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(requirement.hostname, requirement.port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureLocalApps(win: BrowserWindow, projectPath: string): Promise<ManagedLocalApp[]> {
  const started: ManagedLocalApp[] = [];
  for (const requirement of localAppRequirements(projectPath)) {
    if (await isPortOpen(requirement.hostname, requirement.port)) {
      sendLog(win, `[runner] Local app already running: ${requirement.key}=${requirement.url}`);
      sendDirectRunUpdate(win, { browserUrl: requirement.key === "BASE_URL" ? requirement.url : undefined, localApps: "done" });
      continue;
    }
    const command = commandForLocalApp(projectPath, requirement);
    if (!command) {
      throw new Error(`Required local app is not running and no start command is known: ${requirement.key}=${requirement.url}`);
    }
    sendLog(win, `[runner] Starting required local app: ${requirement.key}=${requirement.url}`);
    sendDirectRunUpdate(win, { localApps: "running" });
    sendLog(win, `[runner] Local app command: ${command.command} ${command.args.join(" ")} (${command.cwd})`);
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: process.platform === "win32",
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1", npm_config_audit: "false", npm_config_fund: "false" },
    });
    activeManagedAppProcesses.push(child);
    started.push({ requirement, process: child });
    child.stdout?.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (shouldShowManagedAppLog(line)) sendLog(win, `[${requirement.key}] ${line.trim()}`);
      }
    });
    child.stderr?.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (shouldShowManagedAppLog(line)) sendLog(win, `[${requirement.key}] ${line.trim()}`);
      }
    });
    child.once("exit", (code) => {
      activeManagedAppProcesses = activeManagedAppProcesses.filter((process) => process !== child);
      if (code !== null && code !== 0) sendLog(win, `[runner] Local app exited early (${requirement.key}) with code ${code}`);
    });
    if (!await waitForLocalApp(requirement, 120_000)) {
      sendDirectRunUpdate(win, { localApps: "error" });
      throw new Error(`Required local app did not become reachable: ${requirement.key}=${requirement.url}`);
    }
    sendLog(win, `[runner] Local app ready: ${requirement.key}=${requirement.url}`);
    sendDirectRunUpdate(win, { browserUrl: requirement.key === "BASE_URL" ? requirement.url : undefined, localApps: "done" });
  }
  return started;
}

function stopManagedLocalApps(win: BrowserWindow, apps: ManagedLocalApp[]): void {
  for (const app of apps) {
    if (app.process.killed) continue;
    sendLog(win, `[runner] Stopping managed local app: ${app.requirement.key}=${app.requirement.url}`);
    app.process.kill();
    activeManagedAppProcesses = activeManagedAppProcesses.filter((process) => process !== app.process);
  }
}

function shouldShowManagedAppLog(line: string): boolean {
  const clean = line.trim();
  if (!clean) return false;
  if (clean.includes("Building...") || clean.includes("Application bundle generation complete")) return true;
  if (clean.includes("Local:") || clean.includes("ready in") || clean.includes("error") || clean.includes("Error")) return true;
  if (clean.includes("Watch mode enabled") || clean.includes("Re-optimizing dependencies")) return true;
  if (/^Initial chunk files|^Lazy chunk files|^chunk-|^styles\.css|^polyfills\.js|^main\.js|^\.\.\.and \d+ more/.test(clean)) return false;
  if (/^\|?\s*(Names|Raw size|Initial total)/.test(clean)) return false;
  return false;
}

function shouldShowTestCommandLog(line: string): boolean {
  const clean = line.trim();
  if (!clean) return false;
  if (/^\[\d+\/\d+\]/.test(clean)) return true;
  if (/^\s*\d+\s+(passed|failed|skipped|flaky)/.test(clean)) return true;
  if (clean.startsWith("Running ") || clean.startsWith("Error:") || clean.startsWith("[global.")) return true;
  if (clean.startsWith("[auth]") || clean.startsWith("[auth:") || clean.startsWith("[fixtures]")) return true;
  if (clean.startsWith("[runner]") || clean.startsWith("> ")) return true;
  if (clean.includes("›") && !clean.startsWith("[")) return false;
  return true;
}

function collectGeneratedSpecStats(projectPath: string): GeneratedSpecStats {
  const root = path.join(projectPath, ".features-gen");
  const stats: GeneratedSpecStats = { count: 0, latestPath: null, latestMtimeMs: 0 };
  if (!fs.existsSync(root)) return stats;

  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".spec.js")) continue;
      const fileStats = fs.statSync(fullPath);
      stats.count += 1;
      if (fileStats.mtimeMs > stats.latestMtimeMs) {
        stats.latestMtimeMs = fileStats.mtimeMs;
        stats.latestPath = path.relative(projectPath, fullPath);
      }
    }
  };

  visit(root);
  return stats;
}

function formatGeneratedStats(stats: GeneratedSpecStats): string {
  if (stats.count === 0) return "0 generated specs";
  const latest = stats.latestPath ? `, latest ${stats.latestPath}` : "";
  const changedAt = stats.latestMtimeMs ? ` (${new Date(stats.latestMtimeMs).toLocaleTimeString()})` : "";
  return `${stats.count} generated specs${latest}${changedAt}`;
}

function runChildCommand(
  win: BrowserWindow,
  projectPath: string,
  command: string,
  args: string[],
  userMessage: string,
  fullTextRef: { value: string },
  options: DirectRunOptions = { headed: false, integrated: false },
  timeoutMs?: number
): Promise<void> {
  const commandLine = [command, ...args].join(" ");
  sendLog(win, `[runner] Running: ${commandLine}`);
  sendDirectRunUpdate(win, { command: commandLine, tests: "running" });
  win.webContents.send("pipeline:token", { token: `\n$ ${commandLine}\n` });

  return new Promise<void>((resolve, reject) => {
    const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const child = spawn(command, args, {
      cwd: projectPath,
      shell: useShell,
      env: {
        ...process.env,
        CI: options.headed ? process.env.CI : process.env.CI || "1",
        ...(options.headed ? { HEADLESS: "false" } : {}),
        ...(options.integrated ? {
          HEADLESS: "false",
          SPECWRIGHT_BROWSER_MODE: "cdp",
          SPECWRIGHT_CDP_ENDPOINT: `http://127.0.0.1:${process.env.SPECWRIGHT_DESKTOP_CDP_PORT || "9333"}`,
          SPECWRIGHT_CDP_TARGET_URL: options.targetUrl || process.env.SPECWRIGHT_CDP_TARGET_URL || "",
        } : {}),
        NO_UPDATE_NOTIFIER: "1",
        npm_config_yes: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
        PLAYWRIGHT_HTML_OPEN: "never",
      },
    });
    activeTestProcess = child;
    activeTestRunAborted = false;
    child.stdin?.end();
    if (child.pid) sendLog(win, `[runner] Process started: pid ${child.pid}`);

    let timedOut = false;
    let lastOutputAt = Date.now();
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const idleMs = Date.now() - lastOutputAt;
      if (idleMs < 5000) return;
      const seconds = Math.round(idleMs / 1000);
      const line = `\n[runner] Still running after ${seconds}s without output. ${describeLikelyWait(commandLine)}\n`;
      fullTextRef.value += line;
      win.webContents.send("pipeline:token", { token: line });
      sendLog(win, line.trim());
      lastOutputAt = Date.now();
    }, 5000);
    const timeout = timeoutMs
      ? setTimeout(() => {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        const line = `[runner] Timeout after ${seconds}s: ${commandLine}. If this is BDD generation, run it once in the project terminal to inspect prompts/errors.`;
        fullTextRef.value += `\n${line}\n`;
        sendLog(win, line);
        win.webContents.send("pipeline:token", { token: `\n${line}\n` });
        timedOut = true;
        child.kill();
      }, timeoutMs)
      : null;

    const append = (chunk: Buffer): void => {
      const text = chunk.toString();
      lastOutputAt = Date.now();
      fullTextRef.value += text;
      win.webContents.send("pipeline:token", { token: text });
      for (const line of text.split(/\r?\n/)) {
        if (shouldShowTestCommandLog(line)) sendLog(win, line.trim());
      }
      const diagnostic = diagnoseOutput(text);
      if (text.includes("authenticate")) sendDirectRunUpdate(win, { auth: "running" });
      if (text.includes("Login successful") || text.includes("Saved storageState")) sendDirectRunUpdate(win, { auth: "done" });
      if (/\b\d+\s+passed\b/.test(text)) sendDirectRunUpdate(win, { tests: "done" });
      if (diagnostic) {
        fullTextRef.value += `\n${diagnostic}\n`;
        sendLog(win, diagnostic);
        win.webContents.send("pipeline:token", { token: `\n${diagnostic}\n` });
      }
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
      activeTestProcess = null;
      activeTestRunPending = false;
      const message = error instanceof Error ? error.message : String(error);
      const line = `[runner] Failed to start command: ${message}`;
      fullTextRef.value += `\n${line}\n`;
      sendLog(win, line);
      win.webContents.send("pipeline:token", { token: `\n${line}\n` });
      const diagnostic = diagnoseOutput(message);
      if (diagnostic) {
        fullTextRef.value += `${diagnostic}\n`;
        sendLog(win, diagnostic);
        win.webContents.send("pipeline:token", { token: `${diagnostic}\n` });
      }
      reject(error);
    });
    child.on("close", (code) => {
      clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
      activeTestProcess = null;
      activeTestRunPending = false;
      if (activeTestRunAborted) {
        const summary = "\n\nTest run aborted by user.";
        fullTextRef.value += summary;
        win.webContents.send("pipeline:token", { token: summary });
        win.webContents.send("pipeline:aborted", { fullText: fullTextRef.value, userMessage });
        resolve();
        return;
      }
      if (timedOut) {
        reject(new Error(`Command timed out: ${commandLine}`));
        return;
      }
      if (code === 0) {
        const line = `[runner] Completed: ${commandLine}`;
        sendDirectRunUpdate(win, { tests: "done" });
        fullTextRef.value += `\n${line}\n`;
        sendLog(win, line);
        win.webContents.send("pipeline:token", { token: `\n${line}\n` });
        resolve();
      } else {
        sendDirectRunUpdate(win, { tests: "error" });
        reject(new Error(`Command failed with exit code ${code ?? "unknown"}: ${commandLine}`));
      }
    });
  });
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
  sendLog(win, `[runner] Working directory: ${projectPath}`);
  sendLog(win, `[runner] Resolution: ${run.reason}`);
  if (runOptions.headed) sendLog(win, `[runner] Browser mode: visible Playwright window (HEADLESS=false)`);
  if (runOptions.integrated) sendLog(win, `[runner] Browser mode: Desktop integrated browser via CDP (${runOptions.targetUrl || "no target URL"})`);
  sendLog(win, `[runner] Running tests directly: ${commandLine}`);
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
    managedLocalApps = await ensureLocalApps(win, projectPath);
    const beforeStats = collectGeneratedSpecStats(projectPath);
    sendLog(win, `[runner] Before package script: ${formatGeneratedStats(beforeStats)}`);
    await runChildCommand(win, projectPath, run.command, run.args, userMessage, fullTextRef, runOptions);
    if (activeTestRunAborted) return;
    const afterStats = collectGeneratedSpecStats(projectPath);
    const changed = afterStats.count !== beforeStats.count || afterStats.latestMtimeMs > beforeStats.latestMtimeMs;
    sendLog(win, `[runner] After package script: ${formatGeneratedStats(afterStats)}${changed ? " — generated/updated" : " — no generated spec timestamp change detected"}`);
    const summary = `\n\nTest command exited with code 0.`;
    fullTextRef.value += summary;
    win.webContents.send("pipeline:token", { token: summary });
    win.webContents.send("pipeline:done", { fullText: fullTextRef.value, sessionId: null, userMessage });
  } catch (error) {
    if (activeTestRunAborted) return;
    const msg = error instanceof Error ? error.message : String(error);
    win.webContents.send("pipeline:error", { error: msg });
    throw error;
  } finally {
    stopManagedLocalApps(win, managedLocalApps);
  }
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
          if (!model) model = "gpt-5.5-fast";

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
    const win = getWindow();
    if (activeTestProcess) {
      activeTestRunAborted = true;
      if (win) sendLog(win, "[pipeline] Abort requested — stopping test process");
      activeTestProcess.kill();
      for (const process of activeManagedAppProcesses) process.kill();
      activeManagedAppProcesses = [];
      pendingPermissions.clear();
      return { ok: true, state: "aborting" };
    }
    if (activeTestRunPending) {
      activeTestRunAborted = true;
      if (win) sendLog(win, "[pipeline] Abort requested — waiting for test process to start");
      for (const process of activeManagedAppProcesses) process.kill();
      activeManagedAppProcesses = [];
      pendingPermissions.clear();
      return { ok: true, state: "aborting" };
    }
    if (activeClaudeRunner) {
      win?.webContents.send("pipeline:log", { line: "[pipeline] Abort requested — stopping model run" });
      win?.webContents.send("pipeline:token", { token: "\n\nAbort requested. Stopping run..." });
      activeClaudeRunner.abort();
      activeClaudeRunner = null;
      activeStream = null;
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
