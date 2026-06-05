import React, { useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import { useConfigStore } from "@renderer/store/config.store";

interface RunConsolePanelProps {
  logLines: string[];
  status: "idle" | "running" | "done" | "error" | "aborted";
  errorMessage: string | null;
}

function extractBrowserUrl(lines: string[]): string | null {
  const candidates = [...lines].reverse();
  const baseUrlLine = candidates.find((line) => line.match(/\bBASE_URL=https?:\/\//));
  const localAppLine = candidates.find((line) => line.startsWith("[runner] Local app ready:") || line.startsWith("[runner] Local app already running:"));
  const openedUrl = baseUrlLine ?? localAppLine ?? candidates.find((line) => !line.startsWith("[runner] Starting required local app:") && (line.includes("http://localhost") || line.includes("http://127.0.0.1")));
  return openedUrl?.match(/https?:\/\/[^\s)]+/)?.[0] ?? null;
}

export function RunConsolePanel({ logLines, status, errorMessage }: RunConsolePanelProps): React.JSX.Element {
  const webviewRef = useRef<HTMLElement>(null);
  const [browserKey, setBrowserKey] = useState(0);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportState, setReportState] = useState<"idle" | "loading" | "error">("idle");
  const projectPath = useConfigStore((state) => state.projectPath);
  const directBrowserUrl = usePipelineStore((state) => state.directRun.browserUrl);
  const fallbackBrowserUrl = useMemo(() => extractBrowserUrl(logLines), [logLines]);
  const browserUrl = reportUrl ?? directBrowserUrl ?? fallbackBrowserUrl;

  const reloadBrowser = (): void => {
    const webview = webviewRef.current as (HTMLElement & { reload?: () => void }) | null;
    if (webview?.reload) webview.reload();
    else setBrowserKey((value) => value + 1);
  };

  const openTestReport = async (): Promise<void> => {
    if (!projectPath) return;
    setReportState("loading");
    try {
      const result = await window.specwright.report.startTestReport(projectPath);
      setReportUrl(result.url);
      setBrowserKey((value) => value + 1);
      setReportState("idle");
    } catch {
      setReportState("error");
    }
  };

  return (
    <section className="operator-run-console-shell operator-run-sequence">
      <div className="operator-run-browser-frame">
        <div className="operator-run-console-head">
          <span className="operator-run-console-title">Integrated browser</span>
          <div className="operator-run-browser-actions">
            <span className="operator-run-browser-url" title={browserUrl ?? undefined}>{browserUrl ?? "Waiting for local app URL..."}</span>
            <button type="button" className="operator-button operator-button-compact" onClick={openTestReport} disabled={!projectPath || reportState === "loading"}>
              {reportState === "loading" ? "Starting report" : "Open report"}
            </button>
            <button type="button" className="operator-button operator-button-compact" onClick={reloadBrowser} disabled={!browserUrl}>
              <ArrowClockwise className="operator-icon" weight="bold" /> Reload
            </button>
            <button type="button" className="operator-button operator-button-compact" onClick={() => browserUrl && void window.specwright.shell.openUrl(browserUrl)} disabled={!browserUrl}>
              <ArrowSquareOut className="operator-icon" weight="bold" /> Open
            </button>
          </div>
        </div>
        {browserUrl ? (
          <webview
            key={`${browserUrl}-${browserKey}`}
            ref={webviewRef}
            className="operator-run-browser-webview"
            src={browserUrl}
            partition="persist:specwright-run-browser"
          />
        ) : (
          <div className="operator-run-browser-empty">
            <p className="operator-label operator-text-accent">Browser preview</p>
            <p>Specwright will attach this panel when a local test URL appears in the run logs, or open the Allure report via test:report.</p>
            {reportState === "error" && <p className="operator-danger">Could not start test:report or find its local URL.</p>}
            {status === "error" && errorMessage && <p className="operator-danger">{errorMessage}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
