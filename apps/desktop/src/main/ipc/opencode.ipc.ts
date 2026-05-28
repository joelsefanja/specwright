import { ipcMain, app } from "electron";
import { spawn, type ChildProcess } from "child_process";

let serverProcess: ChildProcess | null = null;

function isPreferredGptProvider(providerId: string): boolean {
  const id = providerId.toLowerCase();
  return id.includes("opencode") || id.includes("openai") || id.includes("chatgpt");
}

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

async function fetchJson<T>(url: string, timeout = 5000): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function registerOpencodeIpc(): void {
  ipcMain.handle(
    "opencode:health",
    async (
      _event,
      baseUrl: string
    ): Promise<{ ok: boolean }> => {
      const data = await fetchJson<{ healthy: boolean }>(
        `${baseUrl}/global/health`,
        5000
      );
      return { ok: data?.healthy === true };
    }
  );

  ipcMain.handle(
    "opencode:detect-model",
    async (
      _event,
      baseUrl: string
    ): Promise<{ modelId: string; providerId: string } | null> => {
      const data = await fetchJson<{
        all?: Array<{ id: string; models?: Record<string, unknown> }>;
        default: Record<string, string>;
        connected: string[];
      }>(`${baseUrl}/provider`, 10_000);
      if (!data) return null;
      const pid =
        data.connected.find((p) => isPreferredGptProvider(p) && data.default[p]) ??
        data.connected.find((p) => data.default[p]) ?? data.connected[0];
      if (!pid) return null;
      return { modelId: data.default[pid], providerId: pid };
    }
  );

  ipcMain.handle(
    "opencode:list-providers",
    async (
      _event,
      baseUrl: string
    ): Promise<{ all?: Array<{ id: string; models?: Record<string, unknown> }>; default: Record<string, string>; connected: string[] } | null> => {
      return fetchJson<{
        all?: Array<{ id: string; models?: Record<string, unknown> }>;
        default: Record<string, string>;
        connected: string[];
      }>(`${baseUrl}/provider`, 10_000);
    }
  );

  ipcMain.handle(
    "opencode:start-server",
    async (
      _event,
      port: number
    ): Promise<{ ok: boolean; error?: string }> => {
      if (serverProcess) {
        return { ok: true };
      }
      try {
        serverProcess = spawn("opencode", ["serve", "--port", String(port)], {
          stdio: "ignore",
          shell: process.platform === "win32",
          detached: false,
        });
        serverProcess.on("exit", () => {
          serverProcess = null;
        });
        serverProcess.on("error", (err) => {
          serverProcess = null;
        });
        // wait a bit for server to start
        await new Promise((r) => setTimeout(r, 2000));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    "opencode:stop-server",
    async (): Promise<{ ok: boolean }> => {
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
      }
      return { ok: true };
    }
  );

  ipcMain.handle(
    "opencode:server-status",
    async (): Promise<{ running: boolean }> => {
      return { running: serverProcess !== null };
    }
  );
}
