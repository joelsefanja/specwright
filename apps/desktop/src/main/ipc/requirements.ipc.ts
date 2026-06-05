import { ipcMain, type BrowserWindow } from "electron";
import type { RequirementsService, RequirementInstallAction, RequirementsResult } from "../services/RequirementsService";

export function registerRequirementsIpc(requirementsService: RequirementsService, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("requirements:check", async (_event, projectPath: string): Promise<RequirementsResult> => {
    try {
      return await requirementsService.check(projectPath);
    } catch (error) {
      return {
        projectPath,
        ready: false,
        checks: [{
          key: "project-bootstrap",
          status: "fail",
          message: "Requirements check failed.",
          detail: error instanceof Error ? error.message : String(error),
          blocksRun: true,
        }],
      };
    }
  });

  ipcMain.handle("requirements:install", async (_event, payload: { projectPath: string; action: RequirementInstallAction }): Promise<{ ok: boolean; error?: string }> => {
    try {
      return await requirementsService.install(payload.projectPath, payload.action, getWindow());
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
