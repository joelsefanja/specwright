import { ipcMain, app } from "electron";
import { spawn } from "child_process";
import type { IPty } from "node-pty";
import type { OpenCodeService } from "../services/OpenCodeService";

const attachProcesses = new Map<string, IPty>();

// IPC means Inter-Process Communication. Electron keeps the React renderer
// away from Node APIs, so these handlers form the allowed bridge to main-process
// work: checking OpenCode, starting/stopping its server, and opening a terminal.

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildAttachCommand(baseUrl: string, sessionId: string): string {
  return `opencode attach ${baseUrl} --session ${sessionId}`;
}

function isPreferredGptProvider(providerId: string): boolean {
  const id = providerId.toLowerCase();
  return id.includes("opencode") || id.includes("openai") || id.includes("chatgpt");
}

async function fetchJson<T>(url: string, timeout = 5000): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function registerOpenCodeBridgeHandlers(openCodeService: OpenCodeService): void {
  app.on("before-quit", () => {
    openCodeService.stop();
    for (const childProcess of attachProcesses.values()) {
      childProcess.kill();
    }
    attachProcesses.clear();
  });

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
      try {
        await openCodeService.start({ baseUrl: `http://127.0.0.1:${port}` });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    "opencode:stop-server",
    async (): Promise<{ ok: boolean }> => {
      openCodeService.stop();
      return { ok: true };
    }
  );

  ipcMain.handle(
    "opencode:server-status",
    async (): Promise<{ running: boolean }> => {
      return { running: openCodeService.isManagedServerRunning() };
    }
  );

  ipcMain.handle(
    "opencode:open-attach-terminal",
    async (
      _event,
      payload: { baseUrl: string; sessionId: string; cwd?: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const command = buildAttachCommand(payload.baseUrl, payload.sessionId);
      const cwd = payload.cwd || process.cwd();

      try {
        if (process.platform === "win32") {
          spawn("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `Start-Process powershell.exe -WorkingDirectory ${quotePowerShell(cwd)} -ArgumentList '-NoExit','-Command',${quotePowerShell(command)}`,
          ], { detached: true, stdio: "ignore", windowsHide: true }).unref();
          return { ok: true };
        }

        if (process.platform === "darwin") {
          const script = `cd ${quoteShell(cwd)} && ${command}`;
          spawn("osascript", [
            "-e",
            "tell application \"Terminal\" to activate",
            "-e",
            `tell application \"Terminal\" to do script ${JSON.stringify(script)}`,
          ], { detached: true, stdio: "ignore" }).unref();
          return { ok: true };
        }

        spawn("x-terminal-emulator", ["-e", "sh", "-lc", `cd ${quoteShell(cwd)} && ${command}; echo; echo 'Press Enter to close...'; read _`], {
          detached: true,
          stdio: "ignore",
        }).unref();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle(
    "opencode:start-attach-stream",
    async (
      event,
      payload: { attachId?: string; baseUrl: string; sessionId: string; cwd?: string }
    ): Promise<{ ok: boolean; attachId?: string; error?: string }> => {
      const attachId = payload.attachId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cwd = payload.cwd || process.cwd();

      try {
        const pty = await import("node-pty");
        const useWindowsShell = process.platform === "win32";
        const child = pty.spawn(
          useWindowsShell ? "cmd.exe" : "opencode",
          useWindowsShell ? ["/d", "/s", "/c", `opencode attach ${payload.baseUrl} --session ${payload.sessionId}`] : ["attach", payload.baseUrl, "--session", payload.sessionId],
          {
          cwd,
          cols: 100,
          env: {
            ...process.env,
            FORCE_COLOR: process.env.FORCE_COLOR || "1",
            NO_UPDATE_NOTIFIER: "1",
            TERM: process.env.TERM || "xterm-256color",
          },
          name: "xterm-256color",
          rows: 30,
        });

        attachProcesses.set(attachId, child);
        child.onData((chunk) => {
          event.sender.send("opencode:attach-output", { attachId, stream: "stdout", chunk });
        });
        child.onExit(({ exitCode }) => {
          attachProcesses.delete(attachId);
          event.sender.send("opencode:attach-exit", { attachId, code: exitCode });
        });

        return { ok: true, attachId };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle(
    "opencode:stop-attach-stream",
    async (_event, attachId: string): Promise<{ ok: boolean }> => {
      const child = attachProcesses.get(attachId);
      if (child) {
        child.kill();
        attachProcesses.delete(attachId);
      }
      return { ok: true };
    }
  );

  ipcMain.handle(
    "opencode:send-attach-input",
    async (_event, payload: { attachId: string; input: string }): Promise<{ ok: boolean; error?: string }> => {
      const child = attachProcesses.get(payload.attachId);
      if (!child) {
        return { ok: false, error: "OpenCode attach stream is not running" };
      }
      child.write(payload.input);
      return { ok: true };
    }
  );

  ipcMain.handle(
    "opencode:resize-attach-stream",
    async (_event, payload: { attachId: string; cols: number; rows: number }): Promise<{ ok: boolean }> => {
      const child = attachProcesses.get(payload.attachId);
      if (child) {
        child.resize(payload.cols, payload.rows);
      }
      return { ok: true };
    }
  );
}
