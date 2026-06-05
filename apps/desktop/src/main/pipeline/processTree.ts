import { spawnSync } from "child_process";
import type { ChildProcess } from "child_process";

export function killProcessTree(target: ChildProcess | number): void {
  const pid = typeof target === "number" ? target : target.pid;
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }

  try {
    process.kill(pid);
  } catch {
    // Process may already be gone.
  }
}
