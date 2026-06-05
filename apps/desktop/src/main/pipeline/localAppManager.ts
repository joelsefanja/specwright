import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { killProcessTree } from "./processTree";
import { detectPackageManager } from "./runCommandResolver";

export interface LocalAppRequirement {
  key: string;
  url: string;
  hostname: string;
  port: number;
}

export interface ManagedLocalApp {
  requirement: LocalAppRequirement;
  process: ChildProcess;
}

interface LocalAppEvents {
  onLog: (line: string) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onProcessStarted?: (process: ChildProcess) => void;
  onProcessExit?: (process: ChildProcess) => void;
}

export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      values[key] = value;
    }
  }

  return values;
}

function localAppRequirements(projectPath: string): LocalAppRequirement[] {
  const env = readEnvFile(path.join(projectPath, "e2e-tests", ".env.testing"));
  const seen = new Set<string>();
  const requirements: LocalAppRequirement[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (!key.endsWith("URL") || !value) {
      continue;
    }

    if (key.startsWith("SPECWRIGHT_")) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue;
    }

    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      continue;
    }

    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (!Number.isFinite(port)) {
      continue;
    }

    const appId = `${url.hostname}:${port}`;
    if (seen.has(appId)) {
      continue;
    }

    seen.add(appId);
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
    if (!cwd) {
      return null;
    }

    return { cwd, command: detectPackageManager(cwd), args: ["run", "dev"] };
  }

  return { cwd: projectPath, command: packageManager, args: ["run", "dev"] };
}

async function waitForLocalApp(requirement: LocalAppRequirement, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(requirement.hostname, requirement.port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

export async function ensureLocalApps(projectPath: string, events: LocalAppEvents): Promise<ManagedLocalApp[]> {
  const started: ManagedLocalApp[] = [];

  for (const requirement of localAppRequirements(projectPath)) {
    if (await isPortOpen(requirement.hostname, requirement.port)) {
      events.onLog(`[runner] Local app already running: ${requirement.key}=${requirement.url}`);
      events.onUpdate({ browserUrl: requirement.key === "BASE_URL" ? requirement.url : undefined, localApps: "done" });
      continue;
    }

    const command = commandForLocalApp(projectPath, requirement);
    if (!command) {
      throw new Error(`Required local app is not running and no start command is known: ${requirement.key}=${requirement.url}`);
    }

    events.onLog(`[runner] Starting required local app: ${requirement.key}=${requirement.url}`);
    events.onUpdate({ localApps: "running" });
    events.onLog(`[runner] Local app command: ${command.command} ${command.args.join(" ")} (${command.cwd})`);

    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: process.platform === "win32",
      windowsHide: true,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1", npm_config_audit: "false", npm_config_fund: "false" },
    });

    events.onProcessStarted?.(child);
    started.push({ requirement, process: child });

    child.stdout?.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (shouldShowManagedAppLog(line)) {
          events.onLog(`[${requirement.key}] ${line.trim()}`);
        }
      }
    });
    child.stderr?.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (shouldShowManagedAppLog(line)) {
          events.onLog(`[${requirement.key}] ${line.trim()}`);
        }
      }
    });
    child.once("exit", (code) => {
      events.onProcessExit?.(child);
      if (code !== null && code !== 0) {
        events.onLog(`[runner] Local app exited early (${requirement.key}) with code ${code}`);
      }
    });

    if (!await waitForLocalApp(requirement, 120_000)) {
      events.onUpdate({ localApps: "error" });
      throw new Error(`Required local app did not become reachable: ${requirement.key}=${requirement.url}`);
    }

    events.onLog(`[runner] Local app ready: ${requirement.key}=${requirement.url}`);
    events.onUpdate({ browserUrl: requirement.key === "BASE_URL" ? requirement.url : undefined, localApps: "done" });
  }

  return started;
}

export function stopManagedLocalApps(apps: ManagedLocalApp[], events: Pick<LocalAppEvents, "onLog" | "onProcessExit">): void {
  for (const app of apps) {
    if (app.process.killed) {
      continue;
    }

    events.onLog(`[runner] Stopping managed local app: ${app.requirement.key}=${app.requirement.url}`);
    killProcessTree(app.process);
    events.onProcessExit?.(app.process);
  }
}

function shouldShowManagedAppLog(line: string): boolean {
  const clean = line.trim();
  if (!clean) {
    return false;
  }

  if (clean.includes("Building...") || clean.includes("Application bundle generation complete")) {
    return true;
  }

  if (clean.includes("Local:") || clean.includes("ready in") || clean.includes("error") || clean.includes("Error")) {
    return true;
  }

  if (clean.includes("Watch mode enabled") || clean.includes("Re-optimizing dependencies")) {
    return true;
  }

  if (/^Initial chunk files|^Lazy chunk files|^chunk-|^styles\.css|^polyfills\.js|^main\.js|^\.\.\.and \d+ more/.test(clean)) {
    return false;
  }

  if (/^\|?\s*(Names|Raw size|Initial total)/.test(clean)) {
    return false;
  }

  return false;
}
