#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hasBlockingUiAuditIssues, summarizeUiAudit, type UiAuditOptions } from "./index.js";
import { auditPlaywrightPage } from "./playwright.js";
import { parseTypeScriptDiagnostics } from "./typescript.js";

interface CliArgs {
  command?: "ts";
  url?: string;
  output?: string;
  project?: string;
  config?: string;
  themes: string[];
  motions: string[];
}

interface CliConfig {
  audit?: UiAuditOptions;
  themes?: string[];
  motions?: string[];
  viewport?: { width: number; height: number };
}

const CLI_FLAGS = {
  config: "--config",
  motion: "--motion",
  output: "--output",
  project: "--project",
  theme: "--theme",
  url: "--url",
} as const;

const VALUE_FLAGS = new Set<string>(Object.values(CLI_FLAGS));
const USAGE = "Usage: specwright-ui-audit --url <url> [--config ui-audit.config.json] [--theme light,dark] [--motion calm] [--output report.json]\n       specwright-ui-audit ts [--project tsconfig.json] [--output ts-diagnostics.json]";

const args = parseArgs(process.argv.slice(2));
if (args.command === "ts") {
  const result = await runTypeScriptDiagnostics(args);
  process.exit(result.exitCode);
}

if (!args.url) {
  console.error(USAGE);
  process.exit(2);
}

const config = await loadCliConfig(args.config);
const themes = args.themes.length ? args.themes : config.themes ?? [];
const motions = args.motions.length ? args.motions : config.motions ?? [];
const viewport = config.viewport ?? { width: 1440, height: 1000 };

const { chromium } = await import("@playwright/test").catch(() => {
  throw new Error("@playwright/test is required for the CLI. Install it in the target repo or use the Playwright adapter from tests.");
});

const browser = await chromium.launch({ headless: true });
const snapshots = [];
try {
  for (const theme of themes.length ? themes : [undefined]) {
    for (const motion of motions.length ? motions : [undefined]) {
      const page = await browser.newPage({ viewport });
      await page.goto(args.url, { waitUntil: "domcontentloaded" });
      if (theme) await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      if (motion) await page.evaluate((value) => { document.documentElement.dataset.motion = value; }, motion);
      const snapshot = await auditPlaywrightPage(page, config.audit);
      snapshots.push(snapshot);
      console.log(summarizeUiAudit(snapshot));
      await page.close();
    }
  }
} finally {
  await browser.close();
}

if (args.output) {
  await writeJsonFile(args.output, { snapshots });
}

process.exitCode = snapshots.some(hasBlockingUiAuditIssues) ? 1 : 0;

function parseArgs(values: string[]): CliArgs {
  const parsed: CliArgs = { themes: [], motions: [] };
  if (values[0] === "ts") {
    parsed.command = "ts";
    values = values.slice(1);
  }

  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    const next = values[index + 1];
    if (!VALUE_FLAGS.has(flag)) throwUsage(`Unknown option: ${flag}`);

    const value = readFlagValue(flag, next);
    index += 1;

    if (flag === CLI_FLAGS.theme) parsed.themes = parseList(value);
    else if (flag === CLI_FLAGS.motion) parsed.motions = parseList(value);
    else if (flag === CLI_FLAGS.url) parsed.url = value;
    else if (flag === CLI_FLAGS.output) parsed.output = value;
    else if (flag === CLI_FLAGS.project) parsed.project = value;
    else if (flag === CLI_FLAGS.config) parsed.config = value;
  }
  return parsed;
}

function readFlagValue(flag: string, value?: string): string {
  if (!value || VALUE_FLAGS.has(value)) throwUsage(`Missing value for ${flag}.`);
  return value;
}

function parseList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function throwUsage(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

async function loadCliConfig(configPath?: string): Promise<CliConfig> {
  if (!configPath) return {};
  const content = await readFile(configPath, "utf8");
  return JSON.parse(content) as CliConfig;
}

async function runTypeScriptDiagnostics(args: CliArgs): Promise<{ exitCode: number }> {
  const tscArgs = ["--noEmit", "--pretty", "false"];
  if (args.project) tscArgs.push("--project", args.project);
  const result = await runCommand(process.platform === "win32" ? "tsc.cmd" : "tsc", tscArgs);
  const output = `${result.stdout}${result.stderr}`;
  const diagnostics = parseTypeScriptDiagnostics(output);
  if (args.output) {
    await writeJsonFile(args.output, { ok: result.exitCode === 0, diagnostics, output });
  }
  if (diagnostics.length > 0) {
    console.error(`TypeScript diagnostics: ${diagnostics.length}`);
    for (const diagnostic of diagnostics.slice(0, 25)) {
      console.error(`${diagnostic.file ?? "<unknown>"}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column ?? 0}` : ""} ${diagnostic.code} ${diagnostic.message}`);
    }
  } else if (output.trim()) {
    console.log(output.trim());
  } else {
    console.log("TypeScript diagnostics: 0");
  }
  return { exitCode: result.exitCode };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

function runCommand(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: process.platform === "win32", env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}
