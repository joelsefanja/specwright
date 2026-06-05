import React, { useState } from "react";
import { usePipelineStore } from "@renderer/store/pipeline.store";

function ToolCode({ toolName }: { toolName: string }): React.JSX.Element {
  const codes: Record<string, string> = {
    Bash: "SH",
    Write: "WR",
    Edit: "ED",
    Read: "RD",
    Glob: "GB",
    Grep: "GP",
    Agent: "AG",
  };
  return <span className="operator-label text-brand-400 w-7">{codes[toolName] ?? "TL"}</span>;
}

function getSeverityColor(toolName: string): string {
  if (["Bash", "Write"].includes(toolName)) return "border-[var(--sw-danger)] bg-[color-mix(in_srgb,var(--sw-danger)_10%,transparent)]";
  if (toolName === "Edit") return "border-[var(--sw-accent)] bg-[var(--sw-accent-soft)]";
  return "border-[var(--sw-line)] bg-[var(--sw-surface)]";
}

export default function PermissionPrompt(): React.JSX.Element | null {
  const { pendingPermission, clearPermission } = usePipelineStore();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!pendingPermission) return null;

  const { id, toolName, toolInput, description } = pendingPermission;
  const severityClass = getSeverityColor(toolName);

  const handleAllow = (): void => {
    window.specwright.pipeline.respondPermission(id, true);
    clearPermission();
  };

  const handleDeny = (): void => {
    window.specwright.pipeline.respondPermission(id, false);
    clearPermission();
  };

  // Format tool input for display
  const inputPreview = toolName === "Bash"
    ? (toolInput.command as string) ?? ""
    : toolName === "Write" || toolName === "Edit" || toolName === "Read"
      ? (toolInput.file_path as string) ?? ""
      : JSON.stringify(toolInput, null, 2);

  return (
    <div className={`mx-4 mb-3 border ${severityClass} p-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <ToolCode toolName={toolName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-stone-100 text-sm font-semibold">Permission Required</span>
            <span className="text-stone-400 text-xs px-2 py-0.5 bg-stone-800/70 border border-stone-700">
              {toolName}
            </span>
          </div>
          <p className="text-stone-300 text-sm">{description}</p>
        </div>
      </div>

      {/* Tool input preview */}
      {inputPreview && (
        <div className="mb-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-stone-500 text-xs hover:text-stone-300 transition-colors flex items-center gap-1"
          >
            <span className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>›</span>
            {isExpanded ? "Hide details" : "Show details"}
          </button>
          {isExpanded && (
            <pre className="mt-2 bg-operator-canvas border border-operator-line px-3 py-2 text-xs text-stone-300 font-mono overflow-x-auto max-h-48 scrollable">
              {inputPreview}
            </pre>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAllow}
          className="operator-button-primary px-4 py-2"
        >
          Allow
        </button>
        <button
          onClick={handleDeny}
          className="operator-button px-4 py-2"
        >
          Deny
        </button>
        <span className="text-stone-600 text-xs ml-auto">
          Engine is waiting for your approval
        </span>
      </div>
    </div>
  );
}
