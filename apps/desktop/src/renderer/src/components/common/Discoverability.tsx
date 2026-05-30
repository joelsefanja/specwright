import React from "react";

interface ContextHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function ContextHeader({ eyebrow, title, description, action }: ContextHeaderProps): React.JSX.Element {
  return (
    <div className="operator-context-header">
      <div className="min-w-0">
        {eyebrow && <p className="operator-label operator-text-accent">{eyebrow}</p>}
        <h2 className="operator-context-title">{title}</h2>
        <p className="operator-context-description">{description}</p>
      </div>
      {action && <div className="operator-context-action">{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="operator-empty-state">
      <p className="operator-context-title">{title}</p>
      <p className="operator-context-description">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

interface GuidanceItem {
  label: string;
  description: string;
}

interface GuidanceRailProps {
  title: string;
  description?: string;
  items: GuidanceItem[];
}

export function GuidanceRail({ title, description, items }: GuidanceRailProps): React.JSX.Element {
  return (
    <div className="operator-guidance-rail">
      <div>
        <p className="operator-label operator-text-accent">Guide</p>
        <p className="operator-guidance-title">{title}</p>
        {description && <p className="operator-guidance-description">{description}</p>}
      </div>
      <div className="operator-guidance-steps">
        {items.map((item, index) => (
          <div key={item.label} className="operator-guidance-step">
            <span className="operator-guidance-index">{index + 1}</span>
            <span className="min-w-0">
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ReadinessStep {
  label: string;
  description: string;
  complete: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface ReadinessChecklistProps {
  title: string;
  description?: string;
  steps: ReadinessStep[];
}

export function ReadinessChecklist({ title, description, steps }: ReadinessChecklistProps): React.JSX.Element {
  const completeCount = steps.filter((step) => step.complete).length;
  const incompleteSteps = steps.filter((step) => !step.complete);
  const allComplete = incompleteSteps.length === 0;

  return (
    <div className="operator-readiness-card">
      <div className="operator-readiness-card-head">
        <div className="min-w-0">
          <p className="operator-section-title">{title}</p>
          {description && !allComplete && <p>{description}</p>}
        </div>
        <span>{completeCount}/{steps.length}</span>
      </div>
      {allComplete && (
        <p className="operator-readiness-complete">Generation can start. Project, website, login choice, and AI model are configured.</p>
      )}
      <div className="operator-readiness-list">
        {incompleteSteps.map((step) => (
          <div
            key={step.label}
            data-ok={step.complete}
            className="operator-readiness-item"
          >
            <span className="operator-readiness-marker" />
            <span className="min-w-0 flex-1">
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
            {step.actionLabel && !step.complete && step.onAction && (
              <button type="button" onClick={step.onAction} className="operator-button operator-button-compact">{step.actionLabel}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
