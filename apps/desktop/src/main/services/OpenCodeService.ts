import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const DEFAULT_BASE_URL = "http://127.0.0.1:18789";
const DEFAULT_PORT = 18789;

type OpenCodeStatus = "healthy" | "unhealthy" | "unreachable";

interface OpenCodeServiceOptions {
  fetch?: typeof fetch;
  platform?: NodeJS.Platform;
  pollIntervalMs?: number;
  spawn?: typeof nodeSpawn;
  startupTimeoutMs?: number;
}

interface StartOpenCodeInput {
  baseUrl?: unknown;
  projectPath?: string;
}

export interface OpenCodeUrl {
  baseUrl: string;
  port: number;
}

export interface OpenCodeStartResult extends OpenCodeUrl {
  processId?: number;
  status: "healthy";
}

export function normalizeOpenCodeUrl(rawUrl: unknown): OpenCodeUrl {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { baseUrl: DEFAULT_BASE_URL, port: DEFAULT_PORT };
  }

  try {
    const url = new URL(rawUrl);
    const port = Number(url.port || DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0) {
      return { baseUrl: DEFAULT_BASE_URL, port: DEFAULT_PORT };
    }
    url.hash = "";
    url.search = "";
    url.pathname = "";
    return { baseUrl: url.toString().replace(/\/$/, ""), port };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, port: DEFAULT_PORT };
  }
}

export function opencodeCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "opencode.cmd" : "opencode";
}

export class OpenCodeService {
  private readonly fetchImpl: typeof fetch;
  private readonly platform: NodeJS.Platform;
  private readonly pollIntervalMs: number;
  private readonly spawnImpl: typeof nodeSpawn;
  private readonly startupTimeoutMs: number;
  private serverProcess: ChildProcess | null = null;

  constructor(options: OpenCodeServiceOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.platform = options.platform ?? process.platform;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.spawnImpl = options.spawn ?? nodeSpawn;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 10_000;
  }

  async status(baseUrl: string): Promise<OpenCodeStatus> {
    try {
      const response = await this.fetchImpl(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1_000) });
      if (!response.ok) return "unhealthy";
      const data = await response.json() as { healthy?: boolean };
      return data.healthy === true ? "healthy" : "unhealthy";
    } catch {
      return "unreachable";
    }
  }

  async isHealthy(baseUrl: string): Promise<boolean> {
    return await this.status(baseUrl) === "healthy";
  }

  async start(input: StartOpenCodeInput = {}): Promise<OpenCodeStartResult> {
    const { baseUrl, port } = normalizeOpenCodeUrl(input.baseUrl);
    const initialStatus = await this.status(baseUrl);

    if (initialStatus === "healthy") {
      return { baseUrl, port, status: "healthy" };
    }
    if (initialStatus === "unhealthy") {
      throw new Error("OpenCode server is running but not healthy");
    }

    let spawnError: string | undefined;
    this.serverProcess = this.spawnImpl(opencodeCommand(this.platform), ["serve", "--port", String(port)], {
      cwd: input.projectPath,
      shell: this.platform === "win32",
      windowsHide: true,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    });
    this.serverProcess.once("error", (error) => {
      spawnError = error.message;
      this.serverProcess = null;
    });
    this.serverProcess.once("exit", () => {
      this.serverProcess = null;
    });

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      await delay(this.pollIntervalMs);
      if (spawnError) {
        throw new Error(`OpenCode could not start: ${spawnError}`);
      }
      if (await this.isHealthy(baseUrl)) {
        return { baseUrl, port, processId: this.serverProcess?.pid, status: "healthy" };
      }
    }

    throw new Error(spawnError ? `OpenCode could not start: ${spawnError}` : "OpenCode server did not become healthy");
  }

  stop(): void {
    if (!this.serverProcess) return;
    this.serverProcess.kill();
    this.serverProcess = null;
  }

  isManagedServerRunning(): boolean {
    return this.serverProcess !== null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
