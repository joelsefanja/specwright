import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, ClockCounterClockwise, Copy, FileText, GitBranch, ListChecks, StopCircle, TerminalWindow, WarningCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "@xterm/xterm/css/xterm.css";
import { IconBubble, StatusPill, Surface, type StatusPillProps } from "../components/ui";
import { useTranslations } from "../i18n/localeStore";
import { useConfigStore } from "../store/config.store";
import { usePipelineStore } from "../store/pipeline.store";
import { type RunRecord, useRunsStore } from "../store/runs.store";
import { normalizeActivityLines } from "./activityNormalizer";

export function ActivityDrawer(): React.JSX.Element {
  const text = useTranslations();
  const reduceMotion = useReducedMotion();
  const logLines = usePipelineStore((state) => state.logLines);
  const status = usePipelineStore((state) => state.status);
  const projectPath = useConfigStore((state) => state.projectPath);
  const runs = useRunsStore((state) => state.runs);
  const abortRun = useRunsStore((state) => state.abort);
  const [copied, setCopied] = useState<"attach" | "summary" | "raw" | "diff" | null>(null);
  const [abortingRunId, setAbortingRunId] = useState<string | null>(null);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const statusLabel = text.activity.statuses[status] ?? status;
  const isEnglish = text.activity.statuses.idle === "Waiting";
  const normalized = useMemo(() => normalizeActivityLines(logLines, isEnglish), [logLines, isEnglish]);
  const latestEvents = normalized.events.slice(-6);
  const hasActivity = latestEvents.length > 0;
  const latestRun = runs[0];
  const attachCommand = useMemo(() => latestRun ? formatAttachCommand(latestRun) : "", [latestRun]);
  const [runDiff, setRunDiff] = useState<{ runId: string; diff: string; changedFiles: string[]; loading: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!latestRun) {
      setRunDiff(null);
      return;
    }

    let cancelled = false;
    const diffProjectPath = latestRun.projectPath || projectPath;
    if (!diffProjectPath) return;

    setRunDiff({ runId: latestRun.id, diff: "", changedFiles: latestRun.changedFiles ?? [], loading: true });
    void window.specwright.runs.diff(latestRun.id, diffProjectPath).then((result) => {
      if (cancelled) return;
      setRunDiff({ runId: latestRun.id, diff: result.diff, changedFiles: result.changedFiles, loading: false });
    }).catch((error) => {
      if (cancelled) return;
      setRunDiff({ runId: latestRun.id, diff: "", changedFiles: latestRun.changedFiles ?? [], loading: false, error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
    };
  }, [latestRun?.id, latestRun?.updatedAt, latestRun?.projectPath, latestRun?.changedFiles, projectPath]);

  const copyText = (value: string, kind: "attach" | "summary" | "raw" | "diff"): void => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };

  const stopRun = async (run: RunRecord): Promise<void> => {
    if (!projectPath || !isActiveRun(run)) return;
    setAbortingRunId(run.id);
    try {
      await abortRun(run.id, projectPath);
    } finally {
      setAbortingRunId(null);
    }
  };

  const openInTerminal = async (run: RunRecord): Promise<void> => {
    if (!run.opencodeBaseUrl || !run.opencodeSessionId) return;

    setOpeningTerminal(true);
    try {
      const result = await window.specwright.opencode.openAttachTerminal({
        baseUrl: run.opencodeBaseUrl,
        sessionId: run.opencodeSessionId,
        cwd: run.projectPath || projectPath || undefined,
      });
      if (!result.ok) copyText(formatAttachCommand(run), "attach");
    } catch {
      copyText(formatAttachCommand(run), "attach");
    } finally {
      setOpeningTerminal(false);
    }
  };

  return (
    <aside className="operator-activity-rail" aria-label={text.activity.title}>
      <Surface variant="raised" padding="md" className="operator-activity-card" role="status" aria-live={status === "running" ? "polite" : "off"}>
        <div className="operator-activity-head">
          <IconBubble tone="accent" className="operator-activity-icon"><ListChecks size={18} weight="duotone" /></IconBubble>
          <span className="min-w-0">
            <span className="operator-section-title block">{text.activity.title}</span>
            <span className="operator-activity-subtitle">{activitySubtitle(status, hasActivity, isEnglish)}</span>
          </span>
        </div>
        <StatusPill status={activityStatusTone(status)} dot className="operator-activity-status" data-status={status}>
          {statusIcon(status)}
          <span>{statusLabel}</span>
        </StatusPill>

        {latestRun && (
          <div className="operator-activity-run-monitor">
            <div className="operator-activity-run-head">
              <span className="operator-activity-run-title">
                <GitBranch size={14} weight="duotone" />
                {isEnglish ? "Live run" : "Actieve run"}
              </span>
              <span className="operator-activity-run-status" data-status={latestRun.status}>{runStatusLabel(latestRun.status, isEnglish)}</span>
            </div>
            <p className="operator-activity-run-help">
              {isEnglish ? "Follow the test run here. OpenCode is only needed when you want to watch or steer the agent live." : "Volg hier de testrun. OpenCode heb je alleen nodig als je live wilt meekijken of de agent wilt bijsturen."}
            </p>
            <div className="operator-activity-run-grid">
              <span>{isEnglish ? "Run" : "Run"}</span>
              <code title={latestRun.id}>{shortId(latestRun.id)}</code>
              <span>{isEnglish ? "OpenCode session" : "OpenCode-sessie"}</span>
              <code title={latestRun.opencodeSessionId ?? ""}>{latestRun.opencodeSessionId ? shortId(latestRun.opencodeSessionId) : "-"}</code>
              {(latestRun.childSessionIds?.length ?? 0) > 0 && (
                <>
                  <span>{isEnglish ? "Subagents" : "Subagents"}</span>
                  <code>{latestRun.childSessionIds?.length ?? 0}</code>
                </>
              )}
              {(latestRun.pendingPermissions?.length ?? 0) > 0 && (
                <>
                  <span>{isEnglish ? "Permissions" : "Toestemming"}</span>
                  <code>{latestRun.pendingPermissions?.length ?? 0}</code>
                </>
              )}
            </div>
            {attachCommand ? (
              <>
                <details className="operator-activity-command-card">
                  <summary>{isEnglish ? "Terminal attach command" : "Terminal-koppelopdracht"}</summary>
                  <code>{attachCommand}</code>
                </details>
                <OpenCodeAttachPanel
                  attachCommand={attachCommand}
                  copied={copied}
                  isEnglish={isEnglish}
                  openingTerminal={openingTerminal}
                  run={latestRun}
                  onCopy={() => copyText(attachCommand, "attach")}
                  onOpenExternal={() => void openInTerminal(latestRun)}
                />
              </>
            ) : (
              <OpenCodeAttachUnavailable isEnglish={isEnglish} />
            )}
            {latestRun && runDiff?.runId === latestRun.id && (runDiff.changedFiles.length > 0 || runDiff.diff.trim()) && (
              <div className="operator-activity-diff-card">
                <div className="operator-activity-diff-head">
                  <span className="operator-activity-run-title">
                    <FileText size={14} weight="duotone" />
                    {isEnglish ? "File diff" : "Bestandsdiff"}
                  </span>
                  <span className="operator-activity-run-status" data-status="done">{runDiff.changedFiles.length}</span>
                </div>
                <p className="operator-activity-run-help">
                  {isEnglish ? "These are the test files Specwright changed during this run." : "Dit zijn de testbestanden die Specwright tijdens deze run heeft aangepast."}
                </p>
                <div className="operator-activity-file-list">
                  {runDiff.changedFiles.slice(0, 6).map((filePath) => <code key={filePath}>{filePath}</code>)}
                  {runDiff.changedFiles.length > 6 && <span>{isEnglish ? `+${runDiff.changedFiles.length - 6} more` : `+${runDiff.changedFiles.length - 6} meer`}</span>}
                </div>
                {runDiff.diff.trim() && (
                  <details className="operator-activity-details operator-activity-diff-details">
                    <summary>{isEnglish ? "View diff" : "Bekijk diff"}</summary>
                    <div className="operator-activity-run-actions">
                      <button type="button" className="operator-button operator-button-compact" onClick={() => copyText(runDiff.diff, "diff")}>
                        <Copy className="operator-icon" weight="bold" /> {copied === "diff" ? (isEnglish ? "Diff copied" : "Diff gekopieerd") : (isEnglish ? "Copy diff" : "Kopieer diff")}
                      </button>
                    </div>
                    <div className="operator-activity-diff-view" role="region" aria-label={isEnglish ? "File diff" : "Bestandsdiff"}>
                      {runDiff.diff.split("\n").slice(0, 220).map((line, index) => (
                        <code key={`${index}-${line}`} data-diff-line={diffLineKind(line)}>{line || " "}</code>
                      ))}
                      {runDiff.diff.split("\n").length > 220 && <code data-diff-line="meta">{isEnglish ? "... diff truncated in this view" : "... diff ingekort in deze weergave"}</code>}
                    </div>
                  </details>
                )}
                {runDiff.error && <p className="operator-activity-run-error">{runDiff.error}</p>}
              </div>
            )}
            {latestRun.error && <p className="operator-activity-run-error">{latestRun.error}</p>}
            <div className="operator-activity-run-actions operator-activity-run-actions-compact">
              <button type="button" className="operator-button operator-button-compact" onClick={() => copyText(formatRunSummary(latestRun, latestEvents, isEnglish), "summary")}>
                <Copy className="operator-icon" weight="bold" /> {copied === "summary" ? (isEnglish ? "Summary copied" : "Samenvatting gekopieerd") : (isEnglish ? "Copy summary" : "Kopieer samenvatting")}
              </button>
              {isActiveRun(latestRun) && (
                <button type="button" className="operator-button operator-button-compact" disabled={abortingRunId === latestRun.id} onClick={() => void stopRun(latestRun)}>
                  <StopCircle className="operator-icon" weight="bold" /> {abortingRunId === latestRun.id ? (isEnglish ? "Stopping" : "Stopt") : (isEnglish ? "Stop run" : "Run stoppen")}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="operator-activity-list">
          <AnimatePresence initial={false}>
            {hasActivity ? latestEvents.map((event, eventIndex) => (
              <motion.div
                key={event.id}
                className="operator-activity-line"
                data-tone={event.tone}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                transition={{ delay: reduceMotion ? 0 : eventIndex * 0.018, duration: 0.16 }}
              >
                <span className="operator-activity-line-title">{event.title}</span>
                {event.detail && <span className="operator-activity-line-detail">{event.detail}</span>}
              </motion.div>
            )) : (
              <motion.p className="operator-activity-empty" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                {text.activity.empty}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {(normalized.technicalLines.length > 0 || normalized.rawLines.length > 0) && (
          <div className="operator-activity-debug">
            {normalized.technicalLines.length > 0 && (
              <details className="operator-activity-details">
                <summary>{isEnglish ? "Technical details" : "Technische details"}</summary>
                <div className="operator-activity-debug-lines">
                  {normalized.technicalLines.slice(-8).map((line, index) => <code key={`${index}-${line}`}>{line}</code>)}
                </div>
              </details>
            )}
            <details className="operator-activity-details">
              <summary>{isEnglish ? "Raw log" : "Raw log"}</summary>
              <div className="operator-activity-run-actions">
                <button type="button" className="operator-button operator-button-compact" onClick={() => copyText(normalized.rawLines.join("\n"), "raw")}>
                  <Copy className="operator-icon" weight="bold" /> {copied === "raw" ? (isEnglish ? "Raw log copied" : "Raw log gekopieerd") : (isEnglish ? "Copy raw log" : "Kopieer raw log")}
                </button>
              </div>
              <div className="operator-activity-debug-lines">
                {normalized.rawLines.slice(-12).map((line, index) => <code key={`${index}-${line}`}>{line}</code>)}
              </div>
            </details>
          </div>
        )}
      </Surface>
    </aside>
  );
}

type AttachStatus = "idle" | "starting" | "running" | "stopped" | "error";

function OpenCodeAttachPanel({
  attachCommand,
  copied,
  isEnglish,
  openingTerminal,
  run,
  onCopy,
  onOpenExternal,
}: {
  attachCommand: string;
  copied: "attach" | "summary" | "raw" | "diff" | null;
  isEnglish: boolean;
  openingTerminal: boolean;
  run: RunRecord;
  onCopy: () => void;
  onOpenExternal: () => void;
}): React.JSX.Element {
  const terminalElRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const attachIdRef = useRef<string | null>(null);
  const outputChunksRef = useRef<string[]>([]);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [outputChunks, setOutputChunks] = useState<string[]>([]);
  const [status, setStatus] = useState<AttachStatus>("idle");

  const appendOutput = (chunk: string): void => {
    const next = [...outputChunksRef.current, chunk].slice(-400);
    outputChunksRef.current = next;
    setOutputChunks(next);
    terminalRef.current?.write(chunk);
    terminalRef.current?.scrollToBottom();
  };

  const resizeAttach = (): void => {
    const currentAttachId = attachIdRef.current;
    const term = terminalRef.current;
    if (!currentAttachId || !term) return;
    void window.specwright.opencode.resizeAttachStream({ attachId: currentAttachId, cols: term.cols, rows: term.rows });
  };

  useEffect(() => {
    attachIdRef.current = attachId;
  }, [attachId]);

  useEffect(() => {
    if (!expanded || !terminalElRef.current || terminalRef.current) return;
    let disposed = false;
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/addon-web-links")])
      .then(([xterm, fitAddon, webLinksAddon]) => {
        if (disposed || !terminalElRef.current) return;
        const term = new xterm.Terminal({
          convertEol: true,
          cursorBlink: false,
          disableStdin: false,
          fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, monospace',
          fontSize: 11,
          scrollback: 6000,
          theme: {
            background: "#07090c",
            foreground: "#dbe4ee",
            cursor: "#f2d47b",
            selectionBackground: "#26303b",
          },
        });
        const fit = new fitAddon.FitAddon();
        term.loadAddon(fit);
        term.loadAddon(new webLinksAddon.WebLinksAddon());
        term.onData((data: string) => {
          const currentAttachId = attachIdRef.current;
          if (!currentAttachId) return;
          void window.specwright.opencode.sendAttachInput({ attachId: currentAttachId, input: data });
        });
        term.open(terminalElRef.current);
        fit.fit();
        for (const chunk of outputChunksRef.current) term.write(chunk);
        terminalRef.current = term;
        fitRef.current = fit;
        window.setTimeout(() => {
          fit.fit();
          resizeAttach();
          term.scrollToBottom();
        }, 0);
      })
      .catch(() => null);

    return () => {
      disposed = true;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [expanded]);

  useEffect(() => {
    const offOutput = window.specwright.opencode.onAttachOutput((data) => {
      if (data.attachId !== attachIdRef.current) return;
      appendOutput(data.chunk);
    });
    const offExit = window.specwright.opencode.onAttachExit((data) => {
      if (data.attachId !== attachIdRef.current) return;
      if (data.error) {
        appendOutput(`\r\n[Specwright] OpenCode attach stopped: ${data.error}\r\n`);
        setStatus("error");
      } else {
        appendOutput(`\r\n[Specwright] OpenCode attach exited with code ${data.code ?? "unknown"}.\r\n`);
        setStatus("stopped");
      }
      attachIdRef.current = null;
      setAttachId(null);
    });
    return () => {
      offOutput();
      offExit();
    };
  }, []);

  useEffect(() => {
    setAttachId((currentAttachId) => {
      if (currentAttachId) void window.specwright.opencode.stopAttachStream(currentAttachId);
      return null;
    });
    attachIdRef.current = null;
    outputChunksRef.current = [];
    setOutputChunks([]);
    terminalRef.current?.clear();
    setStatus("idle");
    setInput("");
  }, [run.id, run.opencodeSessionId]);

  useEffect(() => {
    if (!expanded) return;
    window.setTimeout(() => {
      fitRef.current?.fit();
      resizeAttach();
    }, 0);
  }, [expanded]);

  useEffect(() => {
    const onResize = (): void => {
      fitRef.current?.fit();
      resizeAttach();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startAttach = async (): Promise<void> => {
    if (!run.opencodeBaseUrl || !run.opencodeSessionId || attachId) return;
    const nextAttachId = `${run.id}-${Date.now()}`;
    setExpanded(true);
    attachIdRef.current = nextAttachId;
    setAttachId(nextAttachId);
    setStatus("starting");
    outputChunksRef.current = [];
    setOutputChunks([]);
    terminalRef.current?.clear();
    appendOutput(`$ ${attachCommand}\r\n`);
    const result = await window.specwright.opencode.startAttachStream({
      attachId: nextAttachId,
      baseUrl: run.opencodeBaseUrl,
      sessionId: run.opencodeSessionId,
      cwd: run.projectPath,
    });
    if (!result.ok) {
      appendOutput(`[Specwright] ${result.error ?? (isEnglish ? "OpenCode attach could not start." : "OpenCode attach kon niet starten.")}\r\n`);
      attachIdRef.current = null;
      setAttachId(null);
      setStatus("error");
      return;
    }
    setStatus("running");
  };

  const stopAttach = async (): Promise<void> => {
    if (!attachId) return;
    await window.specwright.opencode.stopAttachStream(attachId);
    appendOutput(isEnglish ? "\r\n[Specwright] OpenCode attach stopped.\r\n" : "\r\n[Specwright] OpenCode attach gestopt.\r\n");
    attachIdRef.current = null;
    setAttachId(null);
    setStatus("stopped");
  };

  const sendInput = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!attachId || !input.trim()) return;
    const value = `${input}\n`;
    setInput("");
    await window.specwright.opencode.sendAttachInput({ attachId, input: value });
  };

  const statusLabel = attachStatusLabel(status, isEnglish);
  const canSendInput = Boolean(attachId) && status === "running";

  return (
    <div className="operator-activity-attach-panel" data-status={status}>
      <div className="operator-activity-attach-head">
        <span className="operator-activity-run-title">
          <TerminalWindow size={14} weight="duotone" />
          {isEnglish ? "OpenCode terminal" : "OpenCode-terminal"}
        </span>
        <span className="operator-activity-run-status" data-status={status === "running" ? "running" : status}>{statusLabel}</span>
      </div>
      <p className="operator-activity-run-help">
        {isEnglish
          ? "Show the agent terminal here to watch live output or type a follow-up. Open a separate window when you need more room."
          : "Toon de agent-terminal hier om live output te zien of iets te typen. Open een los venster als je meer ruimte wilt."}
      </p>
      <div className="operator-activity-run-actions operator-activity-attach-actions">
        {!attachId ? (
          <button type="button" className="operator-button operator-button-compact operator-activity-attach-primary" onClick={() => void startAttach()}>
            <TerminalWindow className="operator-icon" weight="bold" /> {isEnglish ? "Show terminal here" : "Toon terminal hier"}
          </button>
        ) : (
          <button type="button" className="operator-button operator-button-compact operator-activity-attach-primary" onClick={() => void stopAttach()}>
            <StopCircle className="operator-icon" weight="bold" /> {isEnglish ? "Stop live view" : "Live weergave stoppen"}
          </button>
        )}
        <button type="button" className="operator-button operator-button-compact" disabled={openingTerminal} onClick={onOpenExternal}>
          <TerminalWindow className="operator-icon" weight="bold" /> {openingTerminal ? (isEnglish ? "Opening..." : "Opent...") : (isEnglish ? "Open separate" : "Open los")}
        </button>
        <button type="button" className="operator-button operator-button-compact" onClick={onCopy}>
          <Copy className="operator-icon" weight="bold" /> {copied === "attach" ? (isEnglish ? "Copied" : "Gekopieerd") : (isEnglish ? "Copy attach" : "Kopieer koppeling")}
        </button>
        <button type="button" className="operator-button operator-button-compact" onClick={() => setExpanded((current) => !current)}>
          {expanded ? (isEnglish ? "Hide output" : "Output verbergen") : (isEnglish ? "Show output" : "Output tonen")}
        </button>
      </div>
      {expanded && (
        <div className="operator-activity-attach-terminal">
          <div ref={terminalElRef} className="operator-activity-attach-xterm" />
          <pre className="operator-activity-attach-output-mirror">{outputChunks.join("")}</pre>
          {outputChunks.length === 0 && (
            <p className="operator-activity-attach-empty">
              {isEnglish ? "Attach the session, then click here to control OpenCode." : "Koppel de sessie en klik hier om OpenCode te bedienen."}
            </p>
          )}
        </div>
      )}
      {(expanded || attachId) && (
        <form className="operator-activity-attach-input" onSubmit={(event) => void sendInput(event)}>
          <input
            aria-label={isEnglish ? "Send input to OpenCode" : "Stuur invoer naar OpenCode"}
            disabled={!canSendInput}
            onChange={(event) => setInput(event.target.value)}
            placeholder={canSendInput ? (isEnglish ? "Quick send, or type directly in the terminal..." : "Snel sturen, of typ direct in de terminal...") : (isEnglish ? "Start in-app attach first" : "Start eerst koppelen in app")}
            value={input}
          />
          <button type="submit" className="operator-button operator-button-compact" disabled={!canSendInput || !input.trim()}>
            {isEnglish ? "Send" : "Stuur"}
          </button>
        </form>
      )}
    </div>
  );
}

function attachStatusLabel(status: AttachStatus, isEnglish: boolean): string {
  if (status === "starting") return isEnglish ? "starting" : "start";
  if (status === "running") return isEnglish ? "attached" : "gekoppeld";
  if (status === "stopped") return isEnglish ? "stopped" : "gestopt";
  if (status === "error") return isEnglish ? "error" : "fout";
  return isEnglish ? "ready" : "klaar";
}

function formatAttachCommand(run: RunRecord): string {
  if (!run.opencodeBaseUrl || !run.opencodeSessionId) return "";
  return `opencode attach ${run.opencodeBaseUrl} --session ${run.opencodeSessionId}`;
}

function isActiveRun(run: RunRecord): boolean {
  return run.status === "queued" || run.status === "running" || run.status === "waiting-for-approval";
}

function runStatusLabel(status: string, isEnglish: boolean): string {
  if (isEnglish) return status.replace(/-/g, " ");
  if (status === "waiting-for-approval") return "wacht op akkoord";
  if (status === "running") return "actief";
  if (status === "queued") return "wachtrij";
  if (status === "done") return "klaar";
  if (status === "error") return "fout";
  if (status === "aborted") return "gestopt";
  return status;
}

function shortId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-5)}`;
}

function formatRunSummary(run: RunRecord, events: Array<{ title: string; detail?: string }>, isEnglish: boolean): string {
  const lines = [
    `${isEnglish ? "Run" : "Run"}: ${run.id}`,
    `${isEnglish ? "Status" : "Status"}: ${runStatusLabel(run.status, isEnglish)}`,
    run.opencodeSessionId ? `${isEnglish ? "OpenCode session" : "OpenCode-sessie"}: ${run.opencodeSessionId}` : null,
    run.opencodeBaseUrl ? `${isEnglish ? "OpenCode URL" : "OpenCode URL"}: ${run.opencodeBaseUrl}` : null,
    run.error ? `${isEnglish ? "Error" : "Fout"}: ${run.error}` : null,
    events.length > 0 ? "" : null,
    events.length > 0 ? (isEnglish ? "Latest activity:" : "Laatste activiteit:") : null,
    ...events.map((event) => `- ${event.title}${event.detail ? `: ${event.detail}` : ""}`),
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function diffLineKind(line: string): "header" | "hunk" | "added" | "removed" | "meta" | "context" {
  if (line.startsWith("diff --")) return "header";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  if (line.startsWith("...")) return "meta";
  return "context";
}

function activityStatusTone(status: string): StatusPillProps["status"] {
  if (status === "done") return "success";
  if (status === "error" || status === "aborted") return "warning";
  if (status === "running") return "running";
  return "muted";
}

function statusIcon(status: string): React.ReactNode {
  if (status === "done") return <CheckCircle size={15} weight="fill" />;
  if (status === "error" || status === "aborted") return <WarningCircle size={15} weight="bold" />;
  return <ClockCounterClockwise size={15} weight="duotone" />;
}

function activitySubtitle(status: string, hasActivity: boolean, isEnglish: boolean): string {
  if (status === "running") return isEnglish ? "Live overview" : "Live overzicht";
  if (hasActivity) return isEnglish ? "Latest steps" : "Laatste stappen";
  return isEnglish ? "Appears when you start" : "Verschijnt zodra je start";
}
