import React, { useEffect, useRef, useState } from "react";
import { usePipelineStore } from "@renderer/store/pipeline.store";

export default function TerminalPanel(): React.JSX.Element {
  const { logLines, status, errorMessage } = usePipelineStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logLines.length, minimized]);

  // Auto-expand when pipeline starts running
  useEffect(() => {
    if (status === "running") setMinimized(false);
  }, [status]);

  return (
    <div className={`flex flex-col overflow-hidden transition-all duration-200 ${minimized ? "h-9" : "h-full"}`}>
      {/* Header — always visible, clickable to toggle */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-operator-line flex-shrink-0 cursor-pointer hover:bg-stone-900 select-none"
        onClick={() => setMinimized(!minimized)}
      >
        <span className="operator-label">
          Terminal
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 ${
                status === "running" ? "bg-green-400 animate-pulse" :
                status === "error"   ? "bg-[var(--sw-danger)]" :
                status === "done"    ? "bg-green-600" :
                "bg-stone-700"
              }`}
            />
            <span className="text-stone-600 text-xs capitalize">{status}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
            className="text-stone-500 hover:text-stone-300 text-xs transition-colors w-5 h-5 flex items-center justify-center hover:bg-stone-800"
            title={minimized ? "Expand terminal" : "Minimize terminal"}
          >
            {minimized ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Log lines — hidden when minimized */}
      {!minimized && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto scrollable px-3 py-2">
            {logLines.length === 0 && status === "idle" && (
              <p className="text-stone-700 text-xs terminal">Waiting for pipeline to start.</p>
            )}

            <div className="terminal text-stone-300 space-y-0.5">
              {logLines.map((line, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-stone-700 mr-2 select-none flex-shrink-0">{String(i + 1).padStart(3, " ")}</span>
                  <span className={`select-text cursor-text ` +
                    (line.startsWith("[tool]")        ? "text-yellow-400" :
                    line.startsWith("[pipeline]")    ? "text-stone-300" :
                    line.startsWith("[mcp]")         ? "text-brand-300" :
                    line.startsWith("[permission]")  ? "text-amber-400" :
                    line.startsWith("[user]")        ? "text-brand-400" :
                    line.startsWith("[claude")       ? "text-stone-500" :
                    (line.includes("error") || line.includes("Error") || line.includes("ERROR")) ? "operator-danger" :
                    line.includes("Done")            ? "text-green-400" :
                    "text-stone-300")
                  }>
                    {line}
                  </span>
                </div>
              ))}

              {status === "error" && errorMessage && (
                <div className="operator-danger mt-1">Error: {errorMessage}</div>
              )}
            </div>

            <div ref={bottomRef} />
          </div>
        </>
      )}
    </div>
  );
}
