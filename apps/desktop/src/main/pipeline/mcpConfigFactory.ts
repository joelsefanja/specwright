import { app } from "electron";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { log as fileLog } from "../logger";

export interface CommandMcpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface DesktopHttpMcpServer {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
}

export type DesktopMcpServer = CommandMcpServer | DesktopHttpMcpServer;

export type DesktopMcpServers = Record<string, DesktopMcpServer>;

export type ClaudeMcpServer = string | CommandMcpServer | {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

interface DesktopMcpConfigInput {
  projectPath: string | undefined;
  headless: boolean;
  getAtlassianAccessToken: () => Promise<string | null | undefined>;
}

let cachedNodePath: string | undefined;

export async function createDesktopMcpServers(input: DesktopMcpConfigInput): Promise<DesktopMcpServers> {
  const screenshotDir = input.projectPath
    ? path.join(input.projectPath, ".playwright-mcp")
    : ".playwright-mcp";
  const playwrightMcpCli = resolvePlaywrightMcpCli();

  fileLog(`[pipeline] playwright-mcp cli -> ${playwrightMcpCli}`);

  return {
    "playwright-test": {
      command: resolveNodePath(),
      args: [
        playwrightMcpCli,
        "--output-dir",
        screenshotDir,
        ...(input.headless ? ["--headless"] : []),
      ],
    },
    "markitdown": {
      command: resolveUvxCommand(),
      args: ["markitdown-mcp"],
    },
    "atlassian": await createAtlassianMcpServer(input.getAtlassianAccessToken),
  };
}

export function commandMcpServers(mcpServers: DesktopMcpServers): Record<string, CommandMcpServer> {
  const commandServers: Record<string, CommandMcpServer> = {};

  for (const [name, server] of Object.entries(mcpServers)) {
    if (!isCommandMcpServer(server)) {
      continue;
    }

    commandServers[name] = server;
  }

  return commandServers;
}

export function claudeMcpConfig(mcpServers: DesktopMcpServers): Record<string, ClaudeMcpServer> {
  const config: Record<string, ClaudeMcpServer> = {};

  for (const [name, server] of Object.entries(mcpServers)) {
    config[name] = isCommandMcpServer(server)
      ? server
      : {
          type: "http",
          url: server.url,
          ...(server.headers ? { headers: server.headers } : {}),
        };
  }

  return config;
}

function isCommandMcpServer(server: DesktopMcpServer): server is CommandMcpServer {
  return "command" in server;
}

function resolvePlaywrightMcpCli(): string {
  const packageDirectory = path.dirname(require.resolve("@playwright/mcp/package.json"));
  const unpackedDirectory = packageDirectory.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
  return path.join(unpackedDirectory, "cli.js");
}

function resolveUvxCommand(): string {
  if (!app.isPackaged) {
    return "uvx";
  }

  return path.join(process.resourcesPath, "bin", process.platform === "win32" ? "uvx.exe" : "uvx");
}

async function createAtlassianMcpServer(getAccessToken: () => Promise<string | null | undefined>): Promise<DesktopHttpMcpServer> {
  const token = await getAccessToken();
  return {
    type: "streamable-http",
    url: "https://mcp.atlassian.com/v1/mcp",
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}

function resolveNodePath(): string {
  if (cachedNodePath) {
    return cachedNodePath;
  }

  if (!app.isPackaged) {
    cachedNodePath = "node";
    return cachedNodePath;
  }

  const directPath = resolveKnownNodePath();
  if (directPath) {
    cachedNodePath = directPath;
    fileLog(`[pipeline] resolveNodePath -> ${directPath} (direct lookup)`);
    return cachedNodePath;
  }

  const shellPath = resolveNodePathFromShell();
  if (shellPath) {
    cachedNodePath = shellPath;
    fileLog(`[pipeline] resolveNodePath -> ${shellPath} (shell lookup)`);
    return cachedNodePath;
  }

  cachedNodePath = "node";
  fileLog("[pipeline] resolveNodePath -> node (fallback)");
  return cachedNodePath;
}

function resolveKnownNodePath(): string | undefined {
  const home = require("os").homedir();
  const candidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    `${home}/.volta/bin/node`,
    `${home}/.nvm/versions/node/current/bin/node`,
    "/usr/bin/node",
  ];

  return candidates.find((candidatePath) => fs.existsSync(candidatePath));
}

function resolveNodePathFromShell(): string | undefined {
  const shell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
  try {
    const result = execSync(`${shell} -l -c 'which node'`, {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return result && fs.existsSync(result) ? result : undefined;
  } catch {
    return undefined;
  }
}
