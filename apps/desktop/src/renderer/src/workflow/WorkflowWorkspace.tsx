import React from "react";
import { ConfigureAccessStep } from "./steps/ConfigureAccessStep";
import { ConnectProjectStep } from "./steps/ConnectProjectStep";
import { DescribeTestStep } from "./steps/DescribeTestStep";
import { RunTestsStep } from "./steps/RunTestsStep";
import type { WorkflowStepId } from "./workflowSteps";

interface WorkflowWorkspaceProps {
  children: React.ReactNode;
  activeStepId: WorkflowStepId;
  onSelectStep: (stepId: WorkflowStepId) => void;
}

export function WorkflowWorkspace({ children, activeStepId, onSelectStep }: WorkflowWorkspaceProps): React.JSX.Element {
  const stepContent = getStepContent(activeStepId, onSelectStep);
  if (stepContent) return <WorkflowStepWorkspace activeStepId={activeStepId} fallback={children}>{stepContent}</WorkflowStepWorkspace>;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-operator-canvas">
      {children}
    </section>
  );
}

function getStepContent(activeStepId: WorkflowStepId, onSelectStep: (stepId: WorkflowStepId) => void): React.ReactNode | null {
  if (activeStepId === "connect-project") return <ConnectProjectStep onSelectStep={onSelectStep} />;
  if (activeStepId === "configure-access") return <ConfigureAccessStep onSelectStep={onSelectStep} />;
  if (activeStepId === "describe-test") return <DescribeTestStep />;
  if (activeStepId === "run-tests") return <RunTestsStep onSelectStep={onSelectStep} />;
  return null;
}

function WorkflowStepWorkspace({ children, activeStepId, fallback }: { children: React.ReactNode; activeStepId: WorkflowStepId; fallback: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-operator-canvas">
      <div data-workflow-step-content="true" className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
      <div className="hidden" aria-hidden="true">{fallback}</div>
    </section>
  );
}
