import { create } from "zustand";

export type RunStatus = "queued" | "running" | "waiting-for-approval" | "done" | "error" | "aborted";

export interface RunPermission {
  id: string;
  toolName: string;
  status: "pending" | "approved" | "denied";
}

export interface RunRecord {
  id: string;
  kind: string;
  status: RunStatus;
  title: string;
  projectPath: string;
  opencodeBaseUrl?: string;
  opencodeSessionId?: string;
  childSessionIds?: string[];
  pendingPermissions?: RunPermission[];
  permissionHistory?: RunPermission[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  changedFiles?: string[];
  diffPath?: string;
}

interface RunsState {
  runs: RunRecord[];
  loading: boolean;
  error: string | null;
  refresh: (projectPath: string) => Promise<void>;
  abort: (runId: string, projectPath: string) => Promise<void>;
}

export const useRunsStore = create<RunsState>((set, get) => ({
  runs: [],
  loading: false,
  error: null,

  refresh: async (projectPath) => {
    if (!projectPath) return;
    set({ loading: true, error: null });
    try {
      const runs = await window.specwright.runs.list(projectPath) as RunRecord[];
      set({ runs, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  abort: async (runId, projectPath) => {
    await window.specwright.runs.abort(runId, projectPath);
    await get().refresh(projectPath);
  },
}));

export function hasActiveRuns(runs: RunRecord[]): boolean {
  return runs.some((run) => run.status === "queued" || run.status === "running" || run.status === "waiting-for-approval");
}
