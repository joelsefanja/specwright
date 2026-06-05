import React from "react";
import { CheckCircle, Circle, LockKey, PlayCircle, WarningCircle } from "@phosphor-icons/react";
import { useTranslations } from "../i18n/localeStore";
import type { WorkflowStepViewModel } from "./workflowState";
import type { WorkflowStepId } from "./workflowSteps";

interface WorkflowCoachProps {
  activeStep: WorkflowStepViewModel;
  steps: WorkflowStepViewModel[];
  summary: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onSelectStep: (stepId: WorkflowStepId) => void;
}

export function WorkflowCoach({ steps, canGoBack, canGoForward, onBack, onForward, onSelectStep }: WorkflowCoachProps): React.JSX.Element {
  const text = useTranslations();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isInsideModal(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      if (event.key === "Escape") {
        if (focusActiveWorkflowStepButton()) event.preventDefault();
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        if (isTypingTarget(event.target) && !shouldLeaveTypingTarget(event)) return;

        if (isInsideWorkflowCoach(event.target)) {
          if (event.key === "ArrowRight") {
            if (canGoForward) {
              onForward();
              event.preventDefault();
              focusActiveWorkflowStepButtonAfterUpdate();
            }
            return;
          }

          if (event.key === "ArrowLeft") {
            if (canGoBack) {
              onBack();
              event.preventDefault();
              focusActiveWorkflowStepButtonAfterUpdate();
            }
            return;
          }

          if (event.key === "ArrowDown") {
            if (focusFirstStepControl()) event.preventDefault();
            return;
          }

          if (event.key === "ArrowUp") {
            if (focusActiveWorkflowStepButton()) event.preventDefault();
            return;
          }
          return;
        }

        if (event.key === "ArrowUp" && isAtStepContentBoundary(-1)) {
          if (focusActiveWorkflowStepButton()) event.preventDefault();
          return;
        }

        if (event.key === "ArrowDown" && isAtStepContentBoundary(1)) {
          if (focusActiveWorkflowStepButton()) event.preventDefault();
          return;
        }

        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          if (focusAdjacentStepControl(direction)) event.preventDefault();
        }
        return;
      }

      if (event.key === "Enter") return;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, canGoForward, onBack, onForward]);

  return (
    <nav className="operator-workflow-coach" data-workflow-coach="true" aria-keyshortcuts="Escape ArrowLeft ArrowRight ArrowUp ArrowDown Enter" aria-label={text.coach.stepsAriaLabel}>
      <ol className="operator-workflow-stepper">
        {steps.map((step) => (
          <li key={step.id} className="min-w-0">
            {(() => {
              const stepTitle = text.workflow.steps[step.id].title;
              const visibleStepTitle = text.workflow.steps[step.id].shortTitle || stepTitle;
              const lockedStepHelp = step.status === "running" ? text.workflow.lockedReasons.running : text.workflow.lockedReasons[step.id] ?? text.coach.lockedStep;
              return (
            <button
              type="button"
              data-step-id={step.id}
              data-step-status={step.status}
              data-workflow-step-button={step.status === "active" || step.status === "running" ? "active" : "true"}
              className={`${stepClassName(step.status)} relative h-full w-full disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={!step.canNavigate}
              title={step.canNavigate ? `${text.coach.goToStep}: ${stepTitle}` : lockedStepHelp}
              onClick={() => onSelectStep(step.id)}
            >
              {(step.status === "active" || step.status === "running") && (
                <span className="operator-workflow-active-frame" />
              )}
              <span className="operator-step-title relative z-10 min-w-0">
                <span className="operator-step-number">{String(step.number).padStart(2, "0")}</span>
                <span className="operator-step-copy">{visibleStepTitle}</span>
                <span className="operator-step-status-icon" data-status={step.status} aria-hidden="true">
                  <StepStatusIcon status={step.status} />
                </span>
              </span>
            </button>
              );
            })()}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepStatusIcon({ status }: { status: WorkflowStepViewModel["status"] }): React.JSX.Element {
  if (status === "done") return <CheckCircle size={18} weight="fill" />;
  if (status === "active" || status === "running") return <PlayCircle size={18} weight="fill" />;
  if (status === "locked") return <LockKey size={17} weight="bold" />;
  if (status === "error" || status === "warning") return <WarningCircle size={18} weight="fill" />;
  return <Circle size={17} weight="bold" />;
}

function isInsideModal(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest("[role='dialog'], [aria-modal='true'], .operator-command"));
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function shouldLeaveTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement) return false;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") return true;
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.selectionStart === null || target.selectionEnd === null || target.selectionStart !== target.selectionEnd) return false;
  if (event.key === "ArrowLeft") return target.selectionStart === 0;
  if (event.key === "ArrowRight") return target.selectionStart === target.value.length;
  return false;
}

function isInsideWorkflowCoach(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest("[data-workflow-coach='true']"));
}

function focusActiveWorkflowStepButton(): boolean {
  const activeStepButton = document.querySelector<HTMLElement>("[data-workflow-step-button='active']");
  if (!activeStepButton) return false;
  activeStepButton.focus({ preventScroll: true });
  return true;
}

function focusActiveWorkflowStepButtonAfterUpdate(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusActiveWorkflowStepButton();
    });
  });
}

function focusFirstStepControl(): boolean {
  const workspace = document.querySelector<HTMLElement>("[data-workflow-step-content='true']");
  if (!workspace) return false;

  const firstControl = Array.from(workspace.querySelectorAll<HTMLElement>(STEP_CONTROL_SELECTOR)).find(isFocusableControl);
  if (!firstControl) return false;
  firstControl.focus();
  firstControl.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

const STEP_CONTROL_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusAdjacentStepControl(direction: 1 | -1): boolean {
  const workspace = document.querySelector<HTMLElement>("[data-workflow-step-content='true']");
  if (!workspace) return false;

  const controls = Array.from(workspace.querySelectorAll<HTMLElement>(STEP_CONTROL_SELECTOR)).filter(isFocusableControl);
  if (controls.length === 0) return false;

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeIndex = activeElement ? controls.findIndex((control) => control === activeElement || control.contains(activeElement)) : -1;
  const nextIndex = activeIndex < 0
    ? direction > 0 ? 0 : controls.length - 1
    : Math.max(0, Math.min(controls.length - 1, activeIndex + direction));
  const nextControl = controls[nextIndex];

  if (!nextControl || nextControl === activeElement) return false;
  nextControl.focus();
  nextControl.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function isAtStepContentBoundary(direction: 1 | -1): boolean {
  const workspace = document.querySelector<HTMLElement>("[data-workflow-step-content='true']");
  if (!workspace) return false;

  const controls = Array.from(workspace.querySelectorAll<HTMLElement>(STEP_CONTROL_SELECTOR)).filter(isFocusableControl);
  if (controls.length === 0) return false;

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!activeElement || !workspace.contains(activeElement)) return false;
  const activeIndex = controls.findIndex((control) => control === activeElement || control.contains(activeElement));
  if (activeIndex < 0) return false;
  return direction < 0 ? activeIndex === 0 : activeIndex === controls.length - 1;
}

function isFocusableControl(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

function stepClassName(status: WorkflowStepViewModel["status"]): string {
  const base = "operator-workflow-step relative flex items-center gap-2";
  if (status === "active" || status === "running") {
    return `${base} operator-workflow-step-active text-operator-ink`;
  }

  if (status === "done") {
    return `${base} operator-workflow-step-done`;
  }

  if (status === "error" || status === "warning") {
    return `${base} text-[var(--sw-danger)]`;
  }

  return `${base} text-operator-muted`;
}
