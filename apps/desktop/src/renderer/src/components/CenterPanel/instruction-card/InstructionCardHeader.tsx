import React from "react";

interface Props {
  briefNumber: number;
  hasContext: boolean;
  onRemove: () => void;
  labels?: {
    title: string;
    ready: string;
    missing: string;
    remove: string;
  };
}

export function InstructionCardHeader({ briefNumber, hasContext, onRemove, labels }: Props): React.JSX.Element {
  const statusClassName = hasContext ? "operator-brief-status-ready" : "operator-brief-status-missing";
  const statusText = hasContext ? labels?.ready ?? "Context added" : labels?.missing ?? "Add one context source";

  return (
    <div className="operator-card-header-compact">
      <span className="min-w-0">
        <span className="operator-label operator-text-accent block">{labels?.title ?? "Brief"} {briefNumber}</span>
        <span className={statusClassName}>{statusText}</span>
      </span>
      <button
        onClick={onRemove}
        className="operator-remove-action"
        title={labels?.remove ?? "Remove instruction"}
      >
        {labels?.remove ?? "Remove"}
      </button>
    </div>
  );
}
