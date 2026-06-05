import { execSync } from "child_process";
import { app } from "electron";
import fs from "fs";
import { homedir } from "os";
import { log as fileLog } from "../logger";

let cachedClaudeExecutablePath: string | null = null;

export function resolveClaudeExecutablePath(): string | null {
  if (cachedClaudeExecutablePath !== null) {
    return cachedClaudeExecutablePath;
  }

  if (!app.isPackaged) {
    return null;
  }

  const homeDirectory = homedir();
  const candidatePaths = [
    `${homeDirectory}/.local/bin/claude`,
    `${homeDirectory}/.npm-global/bin/claude`,
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    `${homeDirectory}/.volta/bin/claude`,
    `${homeDirectory}/.nvm/versions/node/current/bin/claude`,
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      cachedClaudeExecutablePath = candidatePath;
      fileLog(`[pipeline] resolveClaudePath → ${candidatePath} (direct lookup)`);
      return cachedClaudeExecutablePath;
    }
  }

  const shellPath = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
  const shellRcFile = shellPath.includes("zsh") ? "~/.zshrc" : "~/.bashrc";
  const lookupCommands = [
    `source ${shellRcFile} 2>/dev/null; which claude`,
    "which claude",
  ];

  for (const lookupCommand of lookupCommands) {
    try {
      const resolvedPath = execSync(`${shellPath} -l -c '${lookupCommand}'`, {
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        cachedClaudeExecutablePath = resolvedPath;
        fileLog(`[pipeline] resolveClaudePath → ${resolvedPath} (shell lookup)`);
        return cachedClaudeExecutablePath;
      }
    } catch {
      // Try the next lookup command.
    }
  }

  fileLog("[pipeline] resolveClaudePath → not found (claude CLI not on known paths)");
  cachedClaudeExecutablePath = "";
  return null;
}
