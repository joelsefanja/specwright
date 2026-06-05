import fs from "fs";
import path from "path";

export interface GeneratedSpecStats {
  count: number;
  latestPath: string | undefined;
  latestMtimeMs: number;
}

export function collectGeneratedSpecStats(projectPath: string): GeneratedSpecStats {
  const root = path.join(projectPath, ".features-gen");
  const stats: GeneratedSpecStats = { count: 0, latestPath: undefined, latestMtimeMs: 0 };
  if (!fs.existsSync(root)) {
    return stats;
  }

  visitGeneratedSpecDirectory(root, projectPath, stats);
  return stats;
}

export function formatGeneratedStats(stats: GeneratedSpecStats): string {
  if (stats.count === 0) {
    return "0 generated specs";
  }

  const latest = stats.latestPath ? `, latest ${stats.latestPath}` : "";
  const changedAt = stats.latestMtimeMs ? ` (${new Date(stats.latestMtimeMs).toLocaleTimeString()})` : "";
  return `${stats.count} generated specs${latest}${changedAt}`;
}

function visitGeneratedSpecDirectory(dir: string, projectPath: string, stats: GeneratedSpecStats): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      visitGeneratedSpecDirectory(fullPath, projectPath, stats);
      continue;
    }

    if (!entry.name.endsWith(".spec.js")) {
      continue;
    }

    recordGeneratedSpec(fullPath, projectPath, stats);
  }
}

function recordGeneratedSpec(fullPath: string, projectPath: string, stats: GeneratedSpecStats): void {
  const fileStats = fs.statSync(fullPath);
  stats.count += 1;

  if (fileStats.mtimeMs <= stats.latestMtimeMs) {
    return;
  }

  stats.latestMtimeMs = fileStats.mtimeMs;
  stats.latestPath = path.relative(projectPath, fullPath);
}
