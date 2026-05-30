import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "@phosphor-icons/react";
import TemplatePanel from "./TemplatePanel";
import TerminalPanel from "./TerminalPanel";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import { useConfigStore } from "@renderer/store/config.store";

function lineTone(line: string): "runner" | "app" | "test" | "success" | "error" | "muted" {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("failed") || lower.includes("timed out")) return "error";
  if (lower.includes("passed") || lower.includes("completed") || lower.includes("ready")) return "success";
  if (line.startsWith("[runner]")) return "runner";
  if (line.startsWith("[BASE_URL]") || line.startsWith("[NARROWCASTING_URL]")) return "app";
  if (line.startsWith("[auth") || line.startsWith("[fixtures]") || line.startsWith("Running ") || /^\[\d+\/\d+\]/.test(line)) return "test";
  return "muted";
}

function runSteps(lines: string[], status: string): Array<{ label: string; state: "done" | "running" | "pending" | "error" }> {
  const text = lines.join("\n").toLowerCase();
  return [
    { label: "Local apps", state: text.includes("local app ready") || text.includes("already running") ? "done" : status === "running" ? "running" : "pending" },
    { label: "Auth setup", state: text.includes("login successful") || text.includes("auth] saved") ? "done" : text.includes("authenticate") ? "running" : "pending" },
    { label: "E2E tests", state: status === "error" ? "error" : text.includes(" passed") || text.includes("completed:") ? "done" : text.includes("running ") ? "running" : "pending" },
  ];
}

function summarizeRun(lines: string[]): { result: string; duration: string | null; generated: number } {
  const text = lines.join("\n");
  const passed = text.match(/(\d+)\s+passed\s+\(([^)]+)\)/i);
  const failed = text.match(/(\d+)\s+failed/i);
  const generated = lines.filter((line) => line.includes("generated/updated")).length;

  if (failed) return { result: `${failed[1]} failed`, duration: null, generated };
  if (passed) return { result: `${passed[1]} passed`, duration: passed[2], generated };
  return { result: "Waiting for result", duration: null, generated };
}

function isWaitingNoise(line: string): boolean {
  return line.includes("Still running after") && line.includes("without output");
}

function RunDetailsPanel(): React.JSX.Element {
  const { status, logLines, errorMessage, directRun } = usePipelineStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [showWaitingNoise, setShowWaitingNoise] = useState(false);
  const command = directRun.command ?? [...logLines].reverse().find((line) => line.startsWith("[runner] Running tests directly:"))?.replace("[runner] Running tests directly:", "").trim();
  const cwd = directRun.cwd ?? [...logLines].reverse().find((line) => line.startsWith("[runner] Working directory:"))?.replace("[runner] Working directory:", "").trim();
  const steps = directRun.isDirectRun
    ? [
      { label: "Local apps", state: directRun.localApps },
      { label: "Auth setup", state: directRun.auth },
      { label: "E2E tests", state: directRun.tests },
    ]
    : runSteps(logLines, status);
  const summary = useMemo(() => summarizeRun(logLines), [logLines]);
  const waitingNoiseCount = logLines.filter(isWaitingNoise).length;
  const visibleLines = logLines
    .map((line, index) => ({ line, index }))
    .filter((entry) => showWaitingNoise || !isWaitingNoise(entry.line));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logLines]);

  const copyOutput = (): void => {
    void navigator.clipboard.writeText(logLines.join("\n")).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="operator-toolbar-top flex items-center justify-between">
        <span className="operator-tab operator-tab-standalone" data-active="true">Run details</span>
      </div>
      <div className="operator-run-details-content operator-run-details-sequence flex-1 min-h-0 overflow-hidden" data-tab-staging="true">
        <div className="operator-inline-panel operator-stack-sm">
          <p className="operator-label operator-text-accent">Status</p>
          <p className="operator-text font-semibold capitalize">{status === "running" ? "Running tests" : status}</p>
          <div className="operator-run-step-overview operator-run-step-overview-right">
            {steps.map((step) => <span key={step.label} data-state={step.state}>{step.label}</span>)}
          </div>
        </div>
        <div className="operator-inline-panel operator-stack-sm">
          <p className="operator-label operator-text-accent">Command</p>
          <p className="operator-project-path font-mono" title={command}>{command ?? "Resolving..."}</p>
        </div>
        {cwd && (
          <div className="operator-inline-panel operator-stack-sm">
            <p className="operator-label operator-text-accent">Working directory</p>
            <p className="operator-project-path font-mono" title={cwd}>{cwd}</p>
          </div>
        )}
        {status === "error" && errorMessage && (
          <div className="operator-inline-panel operator-stack-sm">
            <p className="operator-label operator-danger">Failure</p>
            <p className="operator-danger select-text">{errorMessage}</p>
          </div>
        )}
        <div className="operator-run-side-output">
          <div className="operator-run-console-head">
            <span className="operator-run-console-title">Run output</span>
            <div className="operator-run-output-actions">
              {waitingNoiseCount > 0 && (
                <button type="button" onClick={() => setShowWaitingNoise((value) => !value)} className="operator-button operator-button-compact">
                  {showWaitingNoise ? "Hide waits" : `Show waits (${waitingNoiseCount})`}
                </button>
              )}
              <button type="button" onClick={copyOutput} disabled={logLines.length === 0} className="operator-button operator-button-compact">
                <Copy className="operator-icon" weight="bold" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div className="operator-run-output-summary">
            <span data-tone={status === "error" ? "error" : summary.result.includes("passed") ? "success" : "muted"}>{summary.result}</span>
            {summary.duration && <span>{summary.duration}</span>}
            {summary.generated > 0 && <span>{summary.generated} specs generated</span>}
          </div>
          <div className="operator-run-console-body scrollable">
            {logLines.length === 0 ? (
              <p className="operator-run-console-empty">Waiting for command output...</p>
            ) : visibleLines.map(({ line, index }) => {
              const tone = lineTone(line);
              return (
              <div key={`${index}-${line}`} className="operator-run-console-line" data-tone={tone} data-important={tone === "success" || tone === "error"}>
                <span>{String(index + 1).padStart(3, "0")}</span>
                <code>{line}</code>
              </div>
            );})}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RightPanel(): React.JSX.Element {
  const activeTab = useConfigStore((state) => state.activeTab);
  const status = usePipelineStore((state) => state.status);
  const isDirectTestRun = usePipelineStore((state) => state.directRun.isDirectRun || state.logLines.some((line) => line.startsWith("[runner] Starting direct test run:") || line.startsWith("[runner] Running tests directly:")));
  const terminalFocused = isDirectTestRun && (status === "running" || status === "done" || status === "error" || status === "aborted");
  const hasGenerateRun = status === "running" || status === "done" || status === "error" || status === "aborted";
  const showTerminal = activeTab !== "explorer" || hasGenerateRun;

  if (terminalFocused) return <RunDetailsPanel />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`${terminalFocused ? "h-[34%]" : "flex-1"} min-h-0 ${showTerminal ? "border-b border-operator-line" : ""} transition-[height] duration-200`}>
        <TemplatePanel />
      </div>
      {showTerminal && (
        <div className={`${terminalFocused ? "h-[66%]" : "flex-1"} min-h-0 transition-[height] duration-200`}>
          <TerminalPanel />
        </div>
      )}
    </div>
  );
}
