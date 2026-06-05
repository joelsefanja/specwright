import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import type { ProjectService } from "./ProjectService";
import { detectPackageManager } from "../pipeline/runCommandResolver";

export type RequirementStatus = "pass" | "fail" | "warning";
export type RequirementKey = "node" | "npm" | "package-manager" | "project-bootstrap" | "node-modules" | "playwright-cli" | "playwright-chromium" | "opencode-cli" | "opencode-server" | "glab";
export type RequirementInstallAction = "project-dependencies" | "playwright-chromium";

export interface RequirementCheck {
  key: RequirementKey;
  status: RequirementStatus;
  message: string;
  detail?: string;
  blocksRun: boolean;
  installAction?: RequirementInstallAction;
}

export interface RequirementsResult {
  projectPath: string;
  ready: boolean;
  checks: RequirementCheck[];
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class RequirementsService {
  constructor(private readonly projectService: ProjectService) {}

  async check(projectPath: string): Promise<RequirementsResult> {
    const resolvedProjectPath = path.resolve(projectPath);
    const packageManager = detectPackageManager(resolvedProjectPath);
    const checks: RequirementCheck[] = [];

    checks.push(await commandCheck("node", "node", ["--version"], true, "Node.js is available.", "Node.js was not found. Install Node.js 20+ and restart Specwright."));
    checks.push(await commandCheck("npm", npmCommand(), ["--version"], packageManagerName(packageManager) === "npm", "npm is available.", "npm was not found. Install Node.js/npm and restart Specwright."));
    checks.push(await commandCheck("package-manager", packageManager, ["--version"], true, `${packageManagerName(packageManager)} is available.`, `${packageManagerName(packageManager)} was not found. Install it or add it to PATH, then restart Specwright.`));

    const bootstrapped = this.projectService.isBootstrapped(resolvedProjectPath);
    checks.push({
      key: "project-bootstrap",
      status: bootstrapped ? "pass" : "fail",
      message: bootstrapped ? "Specwright project files are installed." : "Specwright project files are missing.",
      detail: bootstrapped ? undefined : "Go back to project setup and install the Specwright plugin first.",
      blocksRun: true,
    });

    const hasNodeModules = fs.existsSync(path.join(resolvedProjectPath, "node_modules"));
    checks.push({
      key: "node-modules",
      status: hasNodeModules ? "pass" : "fail",
      message: hasNodeModules ? "Project dependencies are installed." : "Project dependencies are not installed.",
      detail: hasNodeModules ? undefined : `Run ${packageManagerName(packageManager)} install in this project.`,
      blocksRun: true,
      installAction: hasNodeModules ? undefined : "project-dependencies",
    });

    checks.push(await commandCheck("playwright-cli", packageManager, ["exec", "playwright", "--version"], true, "Playwright CLI is available.", "Playwright CLI was not found in this project. Install project dependencies first."));
    const chromium = await hasPlaywrightChromium(resolvedProjectPath);
    checks.push({
      key: "playwright-chromium",
      status: chromium.ok ? "pass" : "fail",
      message: chromium.ok ? "Playwright Chromium is installed." : "Playwright Chromium is not installed.",
      detail: chromium.ok ? chromium.detail : "Install the Playwright Chromium browser for this project.",
      blocksRun: true,
      installAction: chromium.ok ? undefined : "playwright-chromium",
    });

    checks.push(await commandCheck("opencode-cli", cmdShim("opencode"), ["--version"], false, "OpenCode CLI is available.", "OpenCode CLI was not found. Install OpenCode to watch or steer the agent live."));
    checks.push(await opencodeServerCheck());
    checks.push(await commandCheck("glab", "glab", ["--version"], false, "GitLab CLI is available.", "GitLab CLI is optional. Install glab only if you import GitLab issues."));

    return {
      projectPath: resolvedProjectPath,
      ready: checks.every((check) => !check.blocksRun || check.status === "pass"),
      checks,
    };
  }

  async install(projectPath: string, action: RequirementInstallAction, win?: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
    const resolvedProjectPath = path.resolve(projectPath);
    const packageManager = detectPackageManager(resolvedProjectPath);
    const args = action === "project-dependencies"
      ? installArgs(packageManager)
      : ["exec", "playwright", "install", "chromium"];

    try {
      const result = await runCommand(packageManager, args, resolvedProjectPath, (line) => {
        win?.webContents.send("requirements:install-log", { line });
      }, 10 * 60_000);
      if (result.code !== 0) {
        return { ok: false, error: (result.stderr || result.stdout || "Install failed.").trim() };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

async function commandCheck(key: RequirementKey, command: string, args: string[], blocksRun: boolean, okMessage: string, failMessage: string): Promise<RequirementCheck> {
  const result = await runCommand(command, args, process.cwd(), undefined, 10_000).catch(() => null);
  if (result && result.code === 0) {
    return { key, status: "pass", message: okMessage, detail: firstLine(result.stdout || result.stderr), blocksRun };
  }
  return { key, status: blocksRun ? "fail" : "warning", message: failMessage, detail: result ? firstLine(result.stderr || result.stdout) : undefined, blocksRun };
}

async function hasPlaywrightChromium(projectPath: string): Promise<{ ok: boolean; detail?: string }> {
  const script = "const fs=require('fs');const { chromium }=require('playwright');const p=chromium.executablePath();if(!fs.existsSync(p))process.exit(1);console.log(p);";
  const result = await runCommand("node", ["-e", script], projectPath, undefined, 10_000).catch(() => null);
  return { ok: result?.code === 0, detail: firstLine(result?.stdout ?? "") };
}

async function opencodeServerCheck(): Promise<RequirementCheck> {
  try {
    const response = await fetch("http://127.0.0.1:18789/global/health", { signal: AbortSignal.timeout(1_000) });
    const data = await response.json() as { healthy?: boolean };
    if (data.healthy === true) {
      return { key: "opencode-server", status: "pass", message: "OpenCode server is running.", blocksRun: false };
    }
  } catch { /* server is not running */ }
  return { key: "opencode-server", status: "warning", message: "OpenCode server is not running yet.", detail: "Specwright can start it when the run begins if OpenCode is installed.", blocksRun: false };
}

function runCommand(command: string, args: string[], cwd: string, onLog?: (line: string) => void, timeoutMs = 60_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
      windowsHide: true,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1", npm_config_audit: "false", npm_config_fund: "false", npm_config_yes: "true" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);
    const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
      const text = chunk.toString();
      if (target === "stdout") stdout += text;
      else stderr += text;
      for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        onLog?.(line);
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  });
}

function installArgs(packageManager: string): string[] {
  const name = packageManagerName(packageManager);
  if (name === "pnpm") return ["install", "--ignore-scripts", "--yes"];
  if (name === "yarn") return ["install", "--ignore-scripts", "--non-interactive"];
  return ["install", "--ignore-scripts"];
}

function packageManagerName(command: string): string {
  return path.basename(command).replace(/\.cmd$/i, "");
}

function npmCommand(): string {
  return cmdShim("npm");
}

function cmdShim(command: string): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
