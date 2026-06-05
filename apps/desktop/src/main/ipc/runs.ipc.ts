import { ipcMain } from "electron";

// IPC means Inter-Process Communication. The renderer cannot read project files
// or kill child processes directly, so this bridge exposes only the run-registry
// actions the UI needs: list, inspect logs, abort, and answer permissions.

// agent-runner compiles to CJS but may be resolved from an Electron CJS bundle.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

interface RunRegistryModule {
  abortSpecwrightRun: (projectPath: string, runId: string) => Promise<unknown>;
  getSpecwrightRun: (projectPath: string, runId: string) => unknown;
  listSpecwrightRuns: (projectPath: string) => unknown[];
  readSpecwrightRunDiff: (projectPath: string, runId: string) => { diff: string; changedFiles: string[] };
  readSpecwrightRunLog: (projectPath: string, runId: string) => string;
  respondSpecwrightRunPermission: (projectPath: string, runId: string, permissionId: string, allowed: boolean, optionId?: string) => Promise<unknown>;
}

let _runRegistryModule: RunRegistryModule | null = null;
let runRegistryLoader = (): Promise<unknown> => dynamicImport("@specwright/agent-runner");

async function loadRunRegistry(): Promise<RunRegistryModule> {
  if (!_runRegistryModule) {
    _runRegistryModule = await runRegistryLoader() as RunRegistryModule;
  }
  return _runRegistryModule;
}

export function __setRunRegistryLoaderForTests(loader: (() => Promise<unknown>) | null): void {
  _runRegistryModule = null;
  runRegistryLoader = loader ?? (() => dynamicImport("@specwright/agent-runner"));
}

export function registerRunRegistryBridgeHandlers(getProjectPath: () => string | undefined): void {
  ipcMain.handle("runs:list", async (_event, projectPath?: string) => {
    return safeRunRegistryCall([], async () => {
      const registry = await loadRunRegistry();
      return registry.listSpecwrightRuns(resolveProjectPathForRunRegistryBridge(getProjectPath, projectPath));
    });
  });

  ipcMain.handle("runs:inspect", async (_event, runId: string, projectPath?: string) => {
    return safeRunRegistryCall(null, async () => {
      const registry = await loadRunRegistry();
      return registry.getSpecwrightRun(resolveProjectPathForRunRegistryBridge(getProjectPath, projectPath), runId);
    });
  });

  ipcMain.handle("runs:logs", async (_event, runId: string, projectPath?: string) => {
    return safeRunRegistryCall("", async () => {
      const registry = await loadRunRegistry();
      return registry.readSpecwrightRunLog(resolveProjectPathForRunRegistryBridge(getProjectPath, projectPath), runId);
    });
  });

  ipcMain.handle("runs:diff", async (_event, runId: string, projectPath?: string) => {
    return safeRunRegistryCall({ diff: "", changedFiles: [] }, async () => {
      const registry = await loadRunRegistry();
      return registry.readSpecwrightRunDiff(resolveProjectPathForRunRegistryBridge(getProjectPath, projectPath), runId);
    });
  });

  ipcMain.handle("runs:abort", async (_event, runId: string, projectPath?: string) => {
    const registry = await loadRunRegistry();
    return registry.abortSpecwrightRun(resolveProjectPathForRunRegistryBridge(getProjectPath, projectPath), runId);
  });

  ipcMain.handle("runs:respond-permission", async (_event, payload: { runId: string; permissionId: string; allowed: boolean; optionId?: string; projectPath?: string }) => {
    const registry = await loadRunRegistry();
    return registry.respondSpecwrightRunPermission(resolveProjectPathForRunRegistryBridge(getProjectPath, payload.projectPath), payload.runId, payload.permissionId, payload.allowed, payload.optionId);
  });
}

async function safeRunRegistryCall<T>(fallback: T, callback: () => Promise<T> | T): Promise<T> {
  try {
    return await callback();
  } catch {
    return fallback;
  }
}

function resolveProjectPathForRunRegistryBridge(getProjectPath: () => string | undefined, projectPath?: string): string {
  const resolved = projectPath || getProjectPath();
  if (!resolved) throw new Error("No Specwright project selected.");
  return resolved;
}
