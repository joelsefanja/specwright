#!/usr/bin/env node
import path from "path";
import {
  abortSpecwrightRun,
  getSpecwrightRun,
  listSpecwrightRuns,
  readSpecwrightRunLog,
  respondSpecwrightRunPermission,
} from "./RunRegistry";

interface CliOptions {
  projectPath: string;
  json: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const options = parseOptions(args.slice(1));
  const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));

  if (command === "runs" || command === "list") {
    const runs = listSpecwrightRuns(options.projectPath);
    if (options.json) {
      console.log(JSON.stringify(runs, null, 2));
      return;
    }

    if (runs.length === 0) {
      console.log("No Specwright runs found.");
      return;
    }

    for (const run of runs) {
      const session = run.opencodeSessionId ? ` session=${run.opencodeSessionId}` : "";
      console.log(`${run.id}  ${run.status.padEnd(8)}  ${run.kind.padEnd(13)}  ${run.startedAt}${session}`);
    }
    return;
  }

  if (command === "inspect") {
    const runId = positional[0];
    if (!runId) throw new Error("Usage: specwright-agent inspect <runId>");
    const run = getSpecwrightRun(options.projectPath, runId);
    if (!run) throw new Error(`Specwright run not found: ${runId}`);
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  if (command === "logs") {
    const runId = positional[0];
    if (!runId) throw new Error("Usage: specwright-agent logs <runId>");
    console.log(readSpecwrightRunLog(options.projectPath, runId));
    return;
  }

  if (command === "abort") {
    const runId = positional[0];
    if (!runId) throw new Error("Usage: specwright-agent abort <runId>");
    const run = await abortSpecwrightRun(options.projectPath, runId);
    console.log(`Aborted ${run.id}`);
    return;
  }

  if (command === "permissions") {
    const runId = positional[0];
    if (!runId) throw new Error("Usage: specwright-agent permissions <runId>");
    const run = getSpecwrightRun(options.projectPath, runId);
    if (!run) throw new Error(`Specwright run not found: ${runId}`);
    const permissions = options.json ? run.permissionHistory : run.pendingPermissions;
    if (options.json) {
      console.log(JSON.stringify(permissions, null, 2));
      return;
    }
    if (permissions.length === 0) {
      console.log("No pending permissions.");
      return;
    }
    for (const permission of permissions) {
      const description = permission.description ? `  ${permission.description}` : "";
      console.log(`${permission.id}  ${permission.status.padEnd(8)}  ${permission.toolName}${description}`);
    }
    return;
  }

  if (command === "approve" || command === "deny") {
    const runId = positional[0];
    const permissionId = positional[1];
    const optionId = positional[2];
    if (!runId || !permissionId) throw new Error(`Usage: specwright-agent ${command} <runId> <permissionId> [optionId]`);
    await respondSpecwrightRunPermission(options.projectPath, runId, permissionId, command === "approve", optionId);
    console.log(`${command === "approve" ? "Approved" : "Denied"} ${permissionId}`);
    return;
  }

  printHelp();
}

function parseOptions(args: string[]): CliOptions {
  const projectFlag = args.find((arg) => arg.startsWith("--project="));
  const projectPath = projectFlag ? projectFlag.slice("--project=".length) : process.cwd();
  return {
    projectPath: path.resolve(projectPath),
    json: args.includes("--json"),
  };
}

function printHelp(): void {
  console.log(`Specwright agent orchestration CLI

Usage:
  specwright-agent runs [--project=<path>] [--json]
  specwright-agent inspect <runId> [--project=<path>]
  specwright-agent logs <runId> [--project=<path>]
  specwright-agent abort <runId> [--project=<path>]
  specwright-agent permissions <runId> [--project=<path>] [--json]
  specwright-agent approve <runId> <permissionId> [optionId] [--project=<path>]
  specwright-agent deny <runId> <permissionId> [optionId] [--project=<path>]

The CLI reads .specwright/runs/ so OpenCode CLI/TUI remains the primary agent UI.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
