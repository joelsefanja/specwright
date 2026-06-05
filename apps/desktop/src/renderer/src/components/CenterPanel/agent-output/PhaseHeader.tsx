import React from "react";
import type { Phase } from "@renderer/store/pipeline.store";

export function PhaseHeader({ phase, isActive }: { phase: Phase; isActive: boolean }): React.JSX.Element {
  const statusNode = (() => {
    if (phase.status === "done") {
      return <span className="text-[var(--sw-success)] text-[11px] font-medium flex items-center gap-1">Done</span>;
    }
    if (phase.status === "running") {
      return (
        <span className="text-[var(--sw-accent)] text-[11px] font-medium flex items-center gap-1">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-brand-400 border-t-transparent" />
          Running
        </span>
      );
    }
    if (phase.status === "error") {
      return <span className="operator-danger text-[11px] font-medium">Error</span>;
    }
    return null;
  })();

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b ${
      isActive ? "border-[var(--sw-accent)] bg-[var(--sw-accent-soft)]" : "border-operator-line bg-operator-field"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-bold ${
          phase.status === "done"
            ? "bg-[rgba(201,185,138,0.12)] text-[var(--sw-success)] border border-[var(--sw-success)]/60"
            : phase.status === "running"
            ? "bg-[var(--sw-accent-soft)] text-[var(--sw-accent-strong)] border border-[var(--sw-accent)]/60"
            : "bg-operator-field operator-muted border border-operator-line"
        }`}>
          {phase.id}
        </span>
        <span className={`text-sm font-semibold font-mono ${
          phase.status === "running" ? "text-[var(--sw-accent-strong)]" : phase.status === "done" ? "text-operator-ink" : "operator-muted"
        }`}>
          {phase.label}
        </span>
      </div>
      {statusNode}
    </div>
  );
}
