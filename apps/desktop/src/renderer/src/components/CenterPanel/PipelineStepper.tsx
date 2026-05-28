import React from "react";
import { usePipelineStore, type Phase, type PhaseStatus } from "@renderer/store/pipeline.store";

function statusIcon(status: PhaseStatus): string {
  switch (status) {
    case "done":    return "✓";
    case "running": return "●";
    case "error":   return "!";
    case "skipped": return "–";
    default:        return "○";
  }
}

function statusColors(status: PhaseStatus): string {
  switch (status) {
    case "done":    return "text-[var(--sw-success)] border-[var(--sw-success)] bg-[rgba(201,185,138,0.12)]";
    case "running": return "text-brand-400 border-brand-500 bg-brand-950/40";
    case "error":   return "text-[var(--sw-danger)] border-[var(--sw-danger)] bg-[rgba(217,120,104,0.12)]";
    case "skipped": return "text-stone-500 border-stone-700 bg-transparent";
    default:        return "text-stone-600 border-stone-800 bg-transparent";
  }
}

function PhaseStep({ phase }: { phase: Phase }): React.JSX.Element {
  const colors = statusColors(phase.status);
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 min-w-0">
      {/* Step circle */}
      <div
        className={`flex-shrink-0 w-6 h-6 border flex items-center justify-center text-[10px] font-bold ${colors}`}
      >
        {statusIcon(phase.status)}
      </div>
      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium truncate ${
          phase.status === "running" ? "text-stone-100" :
          phase.status === "done"    ? "text-stone-300" :
          "text-stone-500"
        }`}>
          {phase.id}. {phase.label}
        </span>
        {phase.agentName && (
          <span className="text-stone-600 text-xs ml-1 hidden xl:inline">
            {phase.agentName}
          </span>
        )}
      </div>
      {/* Duration */}
      {phase.durationMs != null && (
        <span className="text-stone-600 text-xs flex-shrink-0 font-mono tabular-nums">
          {(phase.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

export default function PipelineStepper(): React.JSX.Element {
  const { phases, status } = usePipelineStore();

  return (
    <div className="bg-operator-panel border-b border-operator-line px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="operator-label">Pipeline</span>
        {status === "running" && (
          <span className="text-brand-400 text-[10px] font-semibold uppercase tracking-[0.16em]">Running</span>
        )}
        {status === "done" && (
          <span className="text-[var(--sw-success)] text-[10px] font-semibold uppercase tracking-[0.16em]">Done</span>
        )}
        {status === "error" && (
          <span className="operator-danger text-[10px] font-semibold uppercase tracking-[0.16em]">Error</span>
        )}
      </div>

      {/* Two-column grid of steps */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
        {phases.map((phase) => (
          <PhaseStep key={phase.id} phase={phase} />
        ))}
      </div>
    </div>
  );
}
