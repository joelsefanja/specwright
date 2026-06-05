import { spawn, type ChildProcess } from "child_process";
import type { DirectRunOptions } from "./directRunOptions";
import { killProcessTree } from "./processTree";
import { describeLikelyWait, diagnoseOutput, shouldShowTestCommandLog } from "./testCommandOutput";

interface MutableTextRef {
  value: string;
}

interface ChildCommandEvents {
  onLog: (line: string) => void;
  onToken: (token: string) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onAborted: (fullText: string, userMessage: string) => void;
  onProcessStarted: (process: ChildProcess) => void;
  onProcessEnded: () => void;
  isAborted: () => boolean;
}

interface CommandState {
  heartbeat?: ReturnType<typeof setInterval>;
  lastOutputAt: number;
  startedAt: number;
  timedOut: boolean;
}

export interface ChildCommandInput {
  projectPath: string;
  command: string;
  args: string[];
  userMessage: string;
  fullTextRef: MutableTextRef;
  options?: DirectRunOptions;
  timeoutMs?: number;
  events: ChildCommandEvents;
}

export function runChildCommand(input: ChildCommandInput): Promise<void> {
  const commandLine = [input.command, ...input.args].join(" ");
  input.events.onLog(`[runner] Running: ${commandLine}`);
  input.events.onUpdate({ command: commandLine, tests: "running" });
  input.events.onToken(`\n$ ${commandLine}\n`);

  return new Promise<void>((resolve, reject) => {
    const child = spawnChildProcess(input);
    input.events.onProcessStarted(child);
    child.stdin?.end();

    if (child.pid) {
      input.events.onLog(`[runner] Process started: pid ${child.pid}`);
    }

    const state = createCommandState(commandLine, input.fullTextRef, input.events);
    const timeout = createCommandTimeout(input, child, commandLine, state);

    child.stdout?.on("data", (chunk: Buffer) => appendCommandOutput(chunk, input.fullTextRef, input.events, state));
    child.stderr?.on("data", (chunk: Buffer) => appendCommandOutput(chunk, input.fullTextRef, input.events, state));
    child.on("error", (error) => {
      cleanupCommandTimers(state.heartbeat, timeout);
      input.events.onProcessEnded();
      handleCommandStartError(error, input.fullTextRef, input.events);
      reject(error);
    });
    child.on("close", (code) => {
      cleanupCommandTimers(state.heartbeat, timeout);
      input.events.onProcessEnded();
      handleCommandClose(code, commandLine, input, state.timedOut, resolve, reject);
    });
  });
}

function spawnChildProcess(input: ChildCommandInput): ChildProcess {
  const options = input.options ?? { headed: false, integrated: false };
  const useShell = process.platform === "win32" && input.command.toLowerCase().endsWith(".cmd");

  return spawn(input.command, input.args, {
    cwd: input.projectPath,
    shell: useShell,
    windowsHide: true,
    env: {
      ...process.env,
      CI: options.headed ? process.env.CI : process.env.CI || "1",
      ...(options.headed ? { HEADLESS: "false" } : {}),
      ...(options.integrated ? integratedBrowserEnv(options) : {}),
      NO_UPDATE_NOTIFIER: "1",
      npm_config_yes: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      PLAYWRIGHT_HTML_OPEN: "never",
    },
  });
}

function integratedBrowserEnv(options: DirectRunOptions): Record<string, string> {
  return {
    HEADLESS: "false",
    SPECWRIGHT_BROWSER_MODE: "cdp",
    SPECWRIGHT_CDP_ENDPOINT: `http://127.0.0.1:${process.env.SPECWRIGHT_DESKTOP_CDP_PORT || "9333"}`,
    SPECWRIGHT_CDP_TARGET_URL: options.targetUrl || process.env.SPECWRIGHT_CDP_TARGET_URL || "",
  };
}

function createCommandState(commandLine: string, fullTextRef: MutableTextRef, events: ChildCommandEvents): CommandState {
  const state: CommandState = {
    lastOutputAt: Date.now(),
    startedAt: Date.now(),
    timedOut: false,
  };

  state.heartbeat = setInterval(() => {
    const idleMs = Date.now() - state.lastOutputAt;
    if (idleMs < 5000) {
      return;
    }

    const seconds = Math.round(idleMs / 1000);
    const line = `\n[runner] Still running after ${seconds}s without output. ${describeLikelyWait(commandLine)}\n`;
    fullTextRef.value += line;
    events.onToken(line);
    events.onLog(line.trim());
    state.lastOutputAt = Date.now();
  }, 5000);

  return state;
}

function createCommandTimeout(
  input: ChildCommandInput,
  child: ChildProcess,
  commandLine: string,
  state: CommandState
): ReturnType<typeof setTimeout> | undefined {
  if (!input.timeoutMs) {
    return undefined;
  }

  return setTimeout(() => {
    const seconds = Math.round((Date.now() - state.startedAt) / 1000);
    const line = `[runner] Timeout after ${seconds}s: ${commandLine}. If this is BDD generation, run it once in the project terminal to inspect prompts/errors.`;
    input.fullTextRef.value += `\n${line}\n`;
    input.events.onLog(line);
    input.events.onToken(`\n${line}\n`);
    state.timedOut = true;
    killProcessTree(child);
  }, input.timeoutMs);
}

function appendCommandOutput(
  chunk: Buffer,
  fullTextRef: MutableTextRef,
  events: ChildCommandEvents,
  state: CommandState
): void {
  const text = chunk.toString();
  state.lastOutputAt = Date.now();
  fullTextRef.value += text;
  events.onToken(text);

  for (const line of text.split(/\r?\n/)) {
    if (shouldShowTestCommandLog(line)) {
      events.onLog(line.trim());
    }
  }

  updateCommandStatus(text, events);
  appendDiagnostic(text, fullTextRef, events);
}

function updateCommandStatus(text: string, events: ChildCommandEvents): void {
  if (text.includes("authenticate")) {
    events.onUpdate({ auth: "running" });
  }

  if (text.includes("Login successful") || text.includes("Saved storageState")) {
    events.onUpdate({ auth: "done" });
  }

  if (/\b\d+\s+passed\b/.test(text)) {
    events.onUpdate({ tests: "done" });
  }
}

function appendDiagnostic(text: string, fullTextRef: MutableTextRef, events: ChildCommandEvents): void {
  const diagnostic = diagnoseOutput(text);
  if (!diagnostic) {
    return;
  }

  fullTextRef.value += `\n${diagnostic}\n`;
  events.onLog(diagnostic);
  events.onToken(`\n${diagnostic}\n`);
}

function handleCommandStartError(error: unknown, fullTextRef: MutableTextRef, events: ChildCommandEvents): void {
  const message = error instanceof Error ? error.message : String(error);
  const line = `[runner] Failed to start command: ${message}`;
  fullTextRef.value += `\n${line}\n`;
  events.onLog(line);
  events.onToken(`\n${line}\n`);
  appendDiagnostic(message, fullTextRef, events);
}

function handleCommandClose(
  code: number | null,
  commandLine: string,
  input: ChildCommandInput,
  timedOut: boolean,
  resolve: () => void,
  reject: (error: Error) => void
): void {
  if (input.events.isAborted()) {
    const summary = "\n\nTest run aborted by user.";
    input.fullTextRef.value += summary;
    input.events.onToken(summary);
    input.events.onAborted(input.fullTextRef.value, input.userMessage);
    resolve();
    return;
  }

  if (timedOut) {
    reject(new Error(`Command timed out: ${commandLine}`));
    return;
  }

  if (code !== 0) {
    input.events.onUpdate({ tests: "error" });
    reject(new Error(`Command failed with exit code ${code ?? "unknown"}: ${commandLine}`));
    return;
  }

  const line = `[runner] Completed: ${commandLine}`;
  input.events.onUpdate({ tests: "done" });
  input.fullTextRef.value += `\n${line}\n`;
  input.events.onLog(line);
  input.events.onToken(`\n${line}\n`);
  resolve();
}

function cleanupCommandTimers(heartbeat?: ReturnType<typeof setInterval>, timeout?: ReturnType<typeof setTimeout>): void {
  if (heartbeat) {
    clearInterval(heartbeat);
  }

  if (timeout) {
    clearTimeout(timeout);
  }
}
