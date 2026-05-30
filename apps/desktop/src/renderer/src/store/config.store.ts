import { create } from "zustand";
import { usePipelineStore } from "./pipeline.store";
import { useInstructionStore } from "./instruction.store";

export type PluginSource =
  | { type: "local"; dirPath: string }
  | { type: "npm"; packageName: string; registry?: string };

export type ProjectState = "none" | "bootstrapping" | "ready" | "error";

export interface EnvVars {
  BASE_URL: string;
  TEST_ENV: string;
  TEST_USERNAME?: string;
  TEST_PASSWORD?: string;
  [key: string]: string | undefined;
}

export type ActiveTab = "explorer" | "healer";

interface ConfigState {
  projectPath: string;
  projectState: ProjectState;
  envVars: EnvVars;
  bootstrapLog: string[];
  loaded: boolean;
  skipPermissions: boolean;
  activeTab: ActiveTab;
  recentProjects: string[];
  /** Plugin selected before project creation. null = use default @specwright/plugin. */
  pendingPlugin: PluginSource | null;

  hydrate: () => Promise<void>;
  pickAndBootstrap: (authStrategy?: "email-password" | "oauth" | "none") => Promise<void>;
  /** Two-step alternative: caller already has a folder; we only need to run bootstrap. */
  bootstrapAt: (folderPath: string, authStrategy?: "email-password" | "oauth" | "none") => Promise<void>;
  loadExistingProject: (folderPath: string) => Promise<void>;
  addRecentProject: (folderPath: string) => void;
  setEnvVar: (key: string, value: string) => void;
  removeEnvVar: (key: string) => void;
  saveEnv: () => Promise<void>;
  appendBootstrapLog: (line: string) => void;
  setSkipPermissions: (skip: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setPendingPlugin: (source: PluginSource | null) => void;
  resetProject: () => Promise<void>;
}

const DEFAULT_ENV: EnvVars = { BASE_URL: "", TEST_ENV: "qat" };
const RECENT_PROJECTS_KEY = "specwright.recentProjects";

function readRecentProjects(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function writeRecentProjects(projects: string[]): void {
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects.slice(0, 6)));
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  projectPath: "",
  projectState: "none",
  envVars: { ...DEFAULT_ENV },
  bootstrapLog: [],
  loaded: false,
  skipPermissions: true,
  activeTab: "explorer",
  recentProjects: [],
  pendingPlugin: null,

  hydrate: async () => {
    set({ recentProjects: readRecentProjects() });
    const projectPath = await window.specwright.project.getPath();
    if (!projectPath) {
      set({ loaded: true, projectState: "none" });
      return;
    }

    const isReady = await window.specwright.project.isBootstrapped(projectPath);
    if (isReady) {
      const envVars = await window.specwright.project.readEnv(projectPath);
      set({ projectPath, projectState: "ready", envVars, loaded: true });
    } else {
      set({ projectPath, projectState: "none", loaded: true });
    }
  },

  pickAndBootstrap: async (authStrategy?: "email-password" | "oauth" | "none") => {
    const folder = await window.specwright.project.pickFolder();
    if (!folder) return;

    // Check if already bootstrapped — load it directly
    const isReady = await window.specwright.project.isBootstrapped(folder);
    if (isReady) {
      await get().loadExistingProject(folder);
      return;
    }

    await get().bootstrapAt(folder, authStrategy);
  },

  bootstrapAt: async (folder: string, authStrategy?: "email-password" | "oauth" | "none") => {
    usePipelineStore.getState().clearFeed();
    useInstructionStore.getState().clearAll();
    set({ projectPath: folder, projectState: "bootstrapping", bootstrapLog: [] });

    const { pendingPlugin } = get();
    const bootstrapOptions: { authStrategy?: string; overlay?: PluginSource } = {};
    if (authStrategy) bootstrapOptions.authStrategy = authStrategy;
    if (pendingPlugin) bootstrapOptions.overlay = pendingPlugin;
    const result = await window.specwright.project.bootstrap(
      folder,
      Object.keys(bootstrapOptions).length > 0 ? bootstrapOptions : undefined
    );

    if (result.success) {
      let envVars: EnvVars = { ...DEFAULT_ENV };
      try {
        envVars = await window.specwright.project.readEnv(folder);
      } catch {
        /* env file missing or unreadable — project still ready, use defaults */
      }
      set({ projectState: "ready", envVars, pendingPlugin: null });
      get().addRecentProject(folder);
    } else {
      set({ projectState: "error" });
    }
  },

  loadExistingProject: async (folderPath: string) => {
    usePipelineStore.getState().clearFeed();
    useInstructionStore.getState().clearAll();
    await window.specwright.project.setPath(folderPath);
    const isReady = await window.specwright.project.isBootstrapped(folderPath);
    if (!isReady) {
      set({ projectPath: folderPath, projectState: "none" });
      return;
    }
    const envVars = await window.specwright.project.readEnv(folderPath);
    set({ projectPath: folderPath, projectState: "ready", envVars });
    get().addRecentProject(folderPath);
  },

  addRecentProject: (folderPath) => {
    if (!folderPath || folderPath.includes("specwright-run-tests-")) return;
    const next = [folderPath, ...get().recentProjects.filter((project) => project !== folderPath)].slice(0, 6);
    writeRecentProjects(next);
    set({ recentProjects: next });
  },

  setEnvVar: (key, value) => {
    set((s) => ({ envVars: { ...s.envVars, [key]: value } }));
  },

  removeEnvVar: (key) => {
    set((s) => {
      const next = { ...s.envVars };
      delete next[key];
      return { envVars: next };
    });
  },

  saveEnv: async () => {
    const { projectPath, envVars } = get();
    if (!projectPath) return;
    await window.specwright.project.writeEnv(projectPath, envVars);
  },

  appendBootstrapLog: (line) => {
    set((s) => ({ bootstrapLog: [...s.bootstrapLog, line] }));
  },

  setSkipPermissions: (skip) => {
    set({ skipPermissions: skip });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  setPendingPlugin: (source) => {
    set({ pendingPlugin: source });
  },

  resetProject: async () => {
    usePipelineStore.getState().clearFeed();
    useInstructionStore.getState().clearAll();
    await window.specwright.project.setPath("");
    set({ projectPath: "", projectState: "none", envVars: { ...DEFAULT_ENV }, pendingPlugin: null });
  },
}));
