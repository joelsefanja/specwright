import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export type SpecwrightRunStatus = "queued" | "running" | "waiting-for-approval" | "done" | "error" | "aborted";
export type SpecwrightRunKind = "specwright-init" | "e2e-automate" | "e2e-run" | "healer" | "subagent" | "cli";
export type SpecwrightPermissionStatus = "pending" | "approved" | "denied";

export interface SpecwrightPermissionRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
  status: SpecwrightPermissionStatus;
  createdAt: string;
  respondedAt?: string;
  optionId?: string;
}

export interface SpecwrightRunRecord {
  id: string;
  kind: SpecwrightRunKind;
  status: SpecwrightRunStatus;
  projectPath: string;
  title: string;
  opencodeBaseUrl?: string;
  opencodeSessionId?: string;
  processIds: number[];
  childSessionIds: string[];
  pendingPermissions: SpecwrightPermissionRequest[];
  permissionHistory: SpecwrightPermissionRequest[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  changedFiles?: string[];
  diffPath?: string;
}

export interface CreateSpecwrightRunInput {
  kind: SpecwrightRunKind;
  projectPath: string;
  title?: string;
  opencodeBaseUrl?: string;
  processIds?: number[];
}

export interface UpdateSpecwrightRunInput {
  status?: SpecwrightRunStatus;
  opencodeBaseUrl?: string;
  opencodeSessionId?: string;
  processIds?: number[];
  childSessionIds?: string[];
  pendingPermissions?: SpecwrightPermissionRequest[];
  permissionHistory?: SpecwrightPermissionRequest[];
  error?: string;
  changedFiles?: string[];
  diffPath?: string;
}

export interface CreateSpecwrightPermissionInput {
  id: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  description?: string;
}

export function createSpecwrightRun(input: CreateSpecwrightRunInput): SpecwrightRunRecord {
  const now = new Date().toISOString();
  const run: SpecwrightRunRecord = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    status: "queued",
    projectPath: path.resolve(input.projectPath),
    title: input.title ?? `Specwright ${input.kind}`,
    opencodeBaseUrl: input.opencodeBaseUrl,
    processIds: input.processIds ?? [],
    childSessionIds: [],
    pendingPermissions: [],
    permissionHistory: [],
    startedAt: now,
    updatedAt: now,
  };

  ensureRunDirectory(run.projectPath);
  writeRun(run);
  appendSpecwrightRunLog(run.projectPath, run.id, `[orchestrator] Created ${run.kind} run ${run.id}`);
  return run;
}

export function updateSpecwrightRun(projectPath: string, runId: string, patch: UpdateSpecwrightRunInput): SpecwrightRunRecord {
  const run = getSpecwrightRun(projectPath, runId);
  if (!run) {
    throw new Error(`Specwright run not found: ${runId}`);
  }

  const next: SpecwrightRunRecord = {
    ...run,
    ...patch,
    processIds: patch.processIds ?? run.processIds,
    childSessionIds: patch.childSessionIds ?? run.childSessionIds,
    pendingPermissions: patch.pendingPermissions ?? run.pendingPermissions ?? [],
    permissionHistory: patch.permissionHistory ?? run.permissionHistory ?? [],
    updatedAt: new Date().toISOString(),
    completedAt: patch.status && ["done", "error", "aborted"].includes(patch.status) ? new Date().toISOString() : run.completedAt,
  };

  writeRun(next);
  return next;
}

export function appendSpecwrightRunLog(projectPath: string, runId: string, line: string): void {
  const logPath = getRunLogPath(projectPath, runId);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, "utf-8");
}

export function listSpecwrightRuns(projectPath: string): SpecwrightRunRecord[] {
  const dir = getRunDirectory(projectPath);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readRunFile(path.join(dir, file)))
    .filter((run): run is SpecwrightRunRecord => Boolean(run))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getSpecwrightRun(projectPath: string, runId: string): SpecwrightRunRecord | null {
  return readRunFile(getRunRecordPath(projectPath, runId));
}

export function readSpecwrightRunLog(projectPath: string, runId: string): string {
  const logPath = getRunLogPath(projectPath, runId);
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "";
}

export function writeSpecwrightRunDiff(projectPath: string, runId: string, diff: string, changedFiles: string[]): SpecwrightRunRecord {
  const run = getSpecwrightRun(projectPath, runId);
  if (!run) throw new Error(`Specwright run not found: ${runId}`);

  const diffPath = getRunDiffPath(projectPath, runId);
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, diff, "utf-8");
  appendSpecwrightRunLog(projectPath, runId, `[orchestrator] Stored file diff (${changedFiles.length} files)`);
  return updateSpecwrightRun(projectPath, runId, {
    changedFiles,
    diffPath: path.relative(path.resolve(projectPath), diffPath),
  });
}

export function readSpecwrightRunDiff(projectPath: string, runId: string): { diff: string; changedFiles: string[] } {
  const run = getSpecwrightRun(projectPath, runId);
  const diffPath = getRunDiffPath(projectPath, runId);
  return {
    diff: fs.existsSync(diffPath) ? fs.readFileSync(diffPath, "utf-8") : "",
    changedFiles: run?.changedFiles ?? [],
  };
}

export function addSpecwrightRunPermission(projectPath: string, runId: string, input: CreateSpecwrightPermissionInput): SpecwrightRunRecord {
  const run = getSpecwrightRun(projectPath, runId);
  if (!run) throw new Error(`Specwright run not found: ${runId}`);

  const now = new Date().toISOString();
  const request: SpecwrightPermissionRequest = {
    id: input.id,
    toolName: input.toolName,
    toolInput: input.toolInput ?? {},
    description: input.description,
    status: "pending",
    createdAt: now,
  };
  const pendingPermissions = upsertPermission(run.pendingPermissions ?? [], request);
  const permissionHistory = upsertPermission(run.permissionHistory ?? [], request);

  appendSpecwrightRunLog(run.projectPath, run.id, `[permission] Requested ${request.toolName} (${request.id})`);
  return updateSpecwrightRun(run.projectPath, run.id, { status: "waiting-for-approval", pendingPermissions, permissionHistory });
}

export async function respondSpecwrightRunPermission(
  projectPath: string,
  runId: string,
  permissionId: string,
  allowed: boolean,
  optionId?: string,
): Promise<SpecwrightRunRecord> {
  const run = getSpecwrightRun(projectPath, runId);
  if (!run) throw new Error(`Specwright run not found: ${runId}`);

  await respondOpenCodePermission(run, permissionId, allowed, optionId);

  const now = new Date().toISOString();
  const status: SpecwrightPermissionStatus = allowed ? "approved" : "denied";
  const existing = [...(run.pendingPermissions ?? []), ...(run.permissionHistory ?? [])].find((permission) => permission.id === permissionId);
  const response: SpecwrightPermissionRequest = {
    id: permissionId,
    toolName: existing?.toolName ?? "unknown",
    toolInput: existing?.toolInput ?? {},
    description: existing?.description,
    status,
    createdAt: existing?.createdAt ?? now,
    respondedAt: now,
    optionId,
  };
  const pendingPermissions = (run.pendingPermissions ?? []).filter((permission) => permission.id !== permissionId);
  const permissionHistory = upsertPermission(run.permissionHistory ?? [], response);
  const nextStatus = run.status === "waiting-for-approval" && pendingPermissions.length === 0 ? "running" : run.status;

  appendSpecwrightRunLog(run.projectPath, run.id, `[permission] ${allowed ? "Approved" : "Denied"} ${permissionId}${optionId ? ` option=${optionId}` : ""}`);
  return updateSpecwrightRun(run.projectPath, run.id, { status: nextStatus, pendingPermissions, permissionHistory });
}

export async function abortSpecwrightRun(projectPath: string, runId: string): Promise<SpecwrightRunRecord> {
  const run = getSpecwrightRun(projectPath, runId);
  if (!run) throw new Error(`Specwright run not found: ${runId}`);

  if (run.opencodeBaseUrl && run.opencodeSessionId) {
    await fetch(`${run.opencodeBaseUrl}/session/${run.opencodeSessionId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => {
      appendSpecwrightRunLog(run.projectPath, run.id, `[orchestrator] OpenCode abort failed: ${String(error)}`);
    });
  }

  for (const processId of run.processIds) {
    killRegisteredProcess(processId);
  }

  appendSpecwrightRunLog(run.projectPath, run.id, "[orchestrator] Abort requested");
  return updateSpecwrightRun(run.projectPath, run.id, { status: "aborted" });
}

function ensureRunDirectory(projectPath: string): void {
  fs.mkdirSync(getRunDirectory(projectPath), { recursive: true });
}

function writeRun(run: SpecwrightRunRecord): void {
  ensureRunDirectory(run.projectPath);
  fs.writeFileSync(getRunRecordPath(run.projectPath, run.id), JSON.stringify(run, null, 2) + "\n", "utf-8");
}

function readRunFile(filePath: string): SpecwrightRunRecord | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const run = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SpecwrightRunRecord;
    run.pendingPermissions ??= [];
    run.permissionHistory ??= [];
    run.processIds ??= [];
    run.childSessionIds ??= [];
    run.changedFiles ??= [];
    return run;
  } catch {
    return null;
  }
}

function upsertPermission(permissions: SpecwrightPermissionRequest[], next: SpecwrightPermissionRequest): SpecwrightPermissionRequest[] {
  const existingIndex = permissions.findIndex((permission) => permission.id === next.id);
  if (existingIndex === -1) return [...permissions, next];

  const updated = [...permissions];
  updated[existingIndex] = { ...updated[existingIndex], ...next };
  return updated;
}

async function respondOpenCodePermission(run: SpecwrightRunRecord, permissionId: string, allowed: boolean, optionId?: string): Promise<void> {
  if (!run.opencodeBaseUrl || !run.opencodeSessionId) return;

  await fetch(`${run.opencodeBaseUrl}/session/${run.opencodeSessionId}/permissions/${permissionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      outcome: allowed ? "selected" : "canceled",
      optionID: optionId,
      optionId,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    appendSpecwrightRunLog(run.projectPath, run.id, `[permission] OpenCode response failed: ${String(error)}`);
  });
}

function getRunDirectory(projectPath: string): string {
  return path.join(path.resolve(projectPath), ".specwright", "runs");
}

function getRunRecordPath(projectPath: string, runId: string): string {
  return path.join(getRunDirectory(projectPath), `${runId}.json`);
}

function getRunLogPath(projectPath: string, runId: string): string {
  return path.join(getRunDirectory(projectPath), `${runId}.log`);
}

function getRunDiffPath(projectPath: string, runId: string): string {
  return path.join(getRunDirectory(projectPath), `${runId}.diff`);
}

function killRegisteredProcess(processId: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(processId), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }

  try {
    process.kill(processId);
  } catch {
    // The process may already be gone; the run record still moves to aborted.
  }
}
