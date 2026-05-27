import { ipcMain } from "electron";

export function registerNetworkIpc(): void {
  ipcMain.handle("network:verify", async (_event, baseUrl: string): Promise<{ ok: boolean; message: string }> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      let res = await fetch(baseUrl, { method: "GET", signal: controller.signal });
      if (!res.ok) {
        const trials = ["/v1/models", "/v1/engines", "/v1"];
        let ok = false;
        for (const t of trials) {
          try {
            const url = baseUrl.endsWith("/") ? baseUrl.replace(/\/$/, "") + t : baseUrl + t;
            res = await fetch(url, { method: "GET", signal: controller.signal });
            if (res.ok) { ok = true; break; }
          } catch {
            // ignore
          }
        }
        if (!ok) throw new Error("No OK response on known endpoints");
      }
      clearTimeout(timeout);
      return { ok: true, message: "Endpoint reachable" };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        return { ok: false, message: "Request timed out" };
      }
      return { ok: false, message: String(err) };
    }
  });
}
