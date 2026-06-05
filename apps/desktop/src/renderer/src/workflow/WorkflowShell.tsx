import React, { useEffect } from "react";
import { ActivityDrawer } from "./ActivityDrawer";
import { WorkflowCoach } from "./WorkflowCoach";
import { WorkflowWorkspace } from "./WorkflowWorkspace";
import { useWorkflowViewModel } from "./workflowState";
import { useConfigStore } from "../store/config.store";
import { usePipelineStore } from "../store/pipeline.store";
import { hasActiveRuns, useRunsStore } from "../store/runs.store";

interface WorkflowShellProps {
  children: React.ReactNode;
}

export function WorkflowShell({ children }: WorkflowShellProps): React.JSX.Element {
  const workflow = useWorkflowViewModel();
  const pipelineStatus = usePipelineStore((state) => state.status);
  const logLines = usePipelineStore((state) => state.logLines);
  const projectPath = useConfigStore((state) => state.projectPath);
  const projectState = useConfigStore((state) => state.projectState);
  const runs = useRunsStore((state) => state.runs);
  const refreshRuns = useRunsStore((state) => state.refresh);
  const activeRegistryRuns = hasActiveRuns(runs);
  const showActivity = workflow.activeStep.id === "run-tests" && (
    pipelineStatus === "running"
    || logLines.length > 0
    || activeRegistryRuns
  );

  useEffect(() => {
    if (projectState !== "ready" || !projectPath) return;

    void refreshRuns(projectPath);
    const interval = window.setInterval(() => {
      void refreshRuns(projectPath);
    }, pipelineStatus === "running" || activeRegistryRuns ? 2000 : 8000);
    return () => window.clearInterval(interval);
  }, [projectPath, projectState, pipelineStatus, activeRegistryRuns, refreshRuns]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-operator-canvas">
      <WorkflowCoach
        activeStep={workflow.activeStep}
        steps={workflow.steps}
        summary={workflow.summary}
        canGoBack={workflow.canGoBack}
        canGoForward={workflow.canGoForward}
        onBack={workflow.goBack}
        onForward={workflow.goForward}
        onSelectStep={workflow.goToStep}
      />
      <div className="operator-workflow-main" data-activity={showActivity ? "true" : "false"}>
        <WorkflowWorkspace activeStepId={workflow.activeStep.id} onSelectStep={workflow.goToStep}>{children}</WorkflowWorkspace>
        {showActivity && <ActivityDrawer />}
      </div>
    </div>
  );
}
