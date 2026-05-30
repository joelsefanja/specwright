import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "@xterm/xterm/css/xterm.css";
import { usePipelineStore } from "@renderer/store/pipeline.store";
import { collapsePresenceVariants, presenceTransition } from "@renderer/motion/presets";

export default function TerminalPanel(): React.JSX.Element {
  const { logLines, status, errorMessage } = usePipelineStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const terminalElRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const writtenLinesRef = useRef(0);
  const [minimized, setMinimized] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalFailed, setTerminalFailed] = useState(false);

  useEffect(() => {
    if (!terminalElRef.current || terminalRef.current) return;
    let disposed = false;
    void Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/addon-web-links"),
      import("@xterm/addon-search"),
    ])
      .then(([xterm, fitAddon, webLinksAddon, searchAddon]) => {
        if (disposed || !terminalElRef.current) return;
        const term = new xterm.Terminal({
          convertEol: true,
          cursorBlink: false,
        fontSize: 11,
        scrollback: 5000,
        disableStdin: true,
          theme: {
            background: "#0b0d10",
            foreground: "#dbe4ee",
            cursor: "#f2d47b",
            selectionBackground: "#26303b",
          },
        });
        const fit = new fitAddon.FitAddon();
        const webLinks = new webLinksAddon.WebLinksAddon();
        const search = new searchAddon.SearchAddon();
        term.loadAddon(fit);
        term.loadAddon(webLinks);
        term.loadAddon(search);
        term.open(terminalElRef.current);
        fit.fit();
        for (const line of logLines) term.writeln(line);
        writtenLinesRef.current = logLines.length;
        terminalRef.current = term;
        fitRef.current = fit;
        setTerminalReady(true);
        setTimeout(() => {
          fit.fit();
          term.scrollToBottom();
        }, 0);
      })
      .catch(() => setTerminalFailed(true));
    return () => {
      disposed = true;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [logLines]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    for (const line of logLines.slice(writtenLinesRef.current)) {
      term.writeln(line);
    }
    writtenLinesRef.current = logLines.length;
    if (!minimized) term.scrollToBottom();
  }, [logLines, minimized]);

  useEffect(() => {
    if (!minimized) setTimeout(() => fitRef.current?.fit(), 0);
  }, [minimized]);

  // Auto-expand when pipeline starts running
  useEffect(() => {
    if (status === "running") setMinimized(false);
  }, [status]);

  return (
    <div className={`flex flex-col overflow-hidden transition-[height] duration-200 ${minimized ? "h-9" : "h-full"}`}>
      {/* Header — always visible, clickable to toggle */}
      <div
      className="operator-terminal-head"
        onClick={() => setMinimized(!minimized)}
      >
        <span className="min-w-0">
          <span className="operator-label block">Run output</span>
          {!minimized && (
            <span className="operator-terminal-subtitle">
              {status === "running"
                ? "Live command stream, tool output, and heartbeat messages."
                : status === "error"
                  ? "Use the last failing command and error lines to decide whether to heal or rerun."
                  : logLines.length > 0
                    ? "Most recent command output is kept here for inspection."
                    : "Waiting for generation or test execution to start."}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 ${
                status === "running" ? "bg-[var(--sw-accent)] animate-pulse" :
                status === "error"   ? "bg-[var(--sw-danger)]" :
                status === "done"    ? "bg-[var(--sw-success)]" :
                "bg-[var(--sw-text-subtle)]"
              }`}
            />
            <span className="operator-terminal-state">{status === "running" ? "Running" : status}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
            className="operator-terminal-toggle"
            title={minimized ? "Expand terminal" : "Minimize terminal"}
          >
            {minimized ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Log lines — hidden when minimized */}
      <AnimatePresence initial={false}>
      {!minimized && (
        <motion.div className="flex-1 min-h-0 overflow-hidden px-3 py-2" variants={collapsePresenceVariants} initial="initial" animate="animate" exit="exit" transition={presenceTransition}>
            {logLines.length === 0 && status === "idle" && (
              <p className="operator-text-subtle terminal">Waiting for pipeline to start.</p>
            )}
            <div ref={terminalElRef} className={`h-full min-h-0 ${terminalReady && !terminalFailed && logLines.length > 0 ? "" : "hidden"}`} />
            {(!terminalReady || terminalFailed || logLines.length === 0) && (
              <div className="terminal operator-terminal-fallback space-y-0.5 overflow-y-auto scrollable h-full">
                {logLines.length === 0 ? (
                  <p className="operator-text-subtle terminal">
                    {status === "running" ? "Starting test command..." : "No command output yet."}
                  </p>
                ) : logLines.map((line, i) => (
                    <div key={i} className="leading-relaxed">
                      <span className="operator-terminal-line-number mr-2 select-none">{String(i + 1).padStart(3, " ")}</span>
                      <span className="select-text cursor-text">{line}</span>
                    </div>
                  ))}
              </div>
            )}
            {status === "error" && errorMessage && <p className="operator-danger mt-1">Error: {errorMessage}</p>}

            <div ref={bottomRef} />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
