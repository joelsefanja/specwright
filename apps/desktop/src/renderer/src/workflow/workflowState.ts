import { useConfigStore } from "../store/config.store";
import { useInstructionStore } from "../store/instruction.store";
import { usePipelineStore } from "../store/pipeline.store";
import { useTranslations } from "../i18n/localeStore";
import { WORKFLOW_STEPS, type WorkflowStepDefinition, type WorkflowStepId, type WorkflowStepStatus } from "./workflowSteps";
import { create } from "zustand";

export interface WorkflowStepViewModel extends WorkflowStepDefinition {
  status: WorkflowStepStatus;
  canNavigate: boolean;
}

export interface WorkflowViewModel {
  activeStep: WorkflowStepViewModel;
  steps: WorkflowStepViewModel[];
  summary: string;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  goToStep: (stepId: WorkflowStepId) => void;
}

interface WorkflowNavigationState {
  selectedStepId: WorkflowStepId | null;
  setSelectedStepId: (stepId: WorkflowStepId | null) => void;
}

const useWorkflowNavigationStore = create<WorkflowNavigationState>((set) => ({
  selectedStepId: "connect-project",
  setSelectedStepId: (selectedStepId) => set({ selectedStepId }),
}));

export function useWorkflowViewModel(): WorkflowViewModel {
  const text = useTranslations();
  const projectState = useConfigStore((state) => state.projectState);
  const projectPath = useConfigStore((state) => state.projectPath);
  const envVars = useConfigStore((state) => state.envVars);
  const cards = useInstructionStore((state) => state.cards);
  const pipelineStatus = usePipelineStore((state) => state.status);
  const activePhase = usePipelineStore((state) => state.activePhase);
  const errorMessage = usePipelineStore((state) => state.errorMessage);
  const selectedStepId = useWorkflowNavigationStore((state) => state.selectedStepId);
  const setSelectedStepId = useWorkflowNavigationStore((state) => state.setSelectedStepId);

  const progressStepId = getActiveWorkflowStepId({
    projectState,
    projectPath,
    hasBaseUrl: Boolean(envVars.BASE_URL),
    hasValidInstruction: cards.some((card) => card.steps.some((step) => step.trim()) || card.filePath?.trim() || card.gitlabSource),
    pipelineStatus,
  });
  const reachableStepIds = getReachableStepIds(progressStepId, pipelineStatus);
  const activeStepId = selectedStepId && reachableStepIds.includes(selectedStepId) && pipelineStatus !== "running"
    ? selectedStepId
    : progressStepId;
  const steps = WORKFLOW_STEPS.map((step) => ({
    ...step,
    status: getStepStatus(step.id, activeStepId, progressStepId, pipelineStatus, activePhase, errorMessage),
    canNavigate: reachableStepIds.includes(step.id) && pipelineStatus !== "running",
  }));
  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];
  const activeIndex = WORKFLOW_STEPS.findIndex((step) => step.id === activeStep.id);
  const reachableIndexes = reachableStepIds.map((stepId) => WORKFLOW_STEPS.findIndex((step) => step.id === stepId)).filter((index) => index >= 0);
  const minReachableIndex = Math.min(...reachableIndexes);
  const maxReachableIndex = Math.max(...reachableIndexes);

  return {
    activeStep,
    steps,
    summary: getWorkflowSummary(projectState, projectPath, cards.length, pipelineStatus, text.workflow.summaries),
    canGoBack: pipelineStatus !== "running" && activeIndex > minReachableIndex,
    canGoForward: pipelineStatus !== "running" && activeIndex < maxReachableIndex,
    goBack: () => {
      const previousStep = WORKFLOW_STEPS[activeIndex - 1];
      if (previousStep && reachableStepIds.includes(previousStep.id)) transitionWorkflowStep(() => setSelectedStepId(previousStep.id));
    },
    goForward: () => {
      const nextStep = WORKFLOW_STEPS[activeIndex + 1];
      if (nextStep && reachableStepIds.includes(nextStep.id)) transitionWorkflowStep(() => setSelectedStepId(nextStep.id));
    },
    goToStep: (stepId) => {
      if (reachableStepIds.includes(stepId) && pipelineStatus !== "running") transitionWorkflowStep(() => setSelectedStepId(stepId));
    },
  };
}

function transitionWorkflowStep(update: () => void): void {
  update();
}

function getActiveWorkflowStepId(input: {
  projectState: string;
  projectPath: string;
  hasBaseUrl: boolean;
  hasValidInstruction: boolean;
  pipelineStatus: string;
}): WorkflowStepId {
  if (input.projectState !== "ready" || !input.projectPath) {
    return "connect-project";
  }

  if (!input.hasBaseUrl) {
    return "configure-access";
  }

  if (input.pipelineStatus === "running") {
    return "run-tests";
  }

  if (!input.hasValidInstruction) {
    return "describe-test";
  }

  return "run-tests";
}

function getStepStatus(
  stepId: WorkflowStepId,
  activeStepId: WorkflowStepId,
  progressStepId: WorkflowStepId,
  pipelineStatus: string,
  activePhase: number,
  errorMessage: string | null
): WorkflowStepStatus {
  if (isStepAfter(stepId, progressStepId)) {
    return "locked";
  }

  if (stepId === activeStepId && errorMessage) {
    return "error";
  }

  if (stepId === activeStepId && pipelineStatus === "running") {
    return "running";
  }

  if (stepId === activeStepId) {
    return "active";
  }

  if (isStepBefore(stepId, progressStepId, activePhase)) {
    return "done";
  }

  return "ready";
}

function getReachableStepIds(progressStepId: WorkflowStepId, pipelineStatus: string): WorkflowStepId[] {
  if (pipelineStatus === "running") return [progressStepId];
  const progressIndex = WORKFLOW_STEPS.findIndex((step) => step.id === progressStepId);
  return WORKFLOW_STEPS.slice(0, progressIndex + 1).map((step) => step.id);
}

function isStepBefore(stepId: WorkflowStepId, activeStepId: WorkflowStepId, activePhase: number): boolean {
  const stepIndex = WORKFLOW_STEPS.findIndex((step) => step.id === stepId);
  const activeIndex = WORKFLOW_STEPS.findIndex((step) => step.id === activeStepId);
  return stepIndex >= 0 && activeIndex >= 0 && (stepIndex < activeIndex || activePhase > 8);
}

function isStepAfter(stepId: WorkflowStepId, activeStepId: WorkflowStepId): boolean {
  const stepIndex = WORKFLOW_STEPS.findIndex((step) => step.id === stepId);
  const activeIndex = WORKFLOW_STEPS.findIndex((step) => step.id === activeStepId);
  return stepIndex >= 0 && activeIndex >= 0 && stepIndex > activeIndex;
}

function getWorkflowSummary(projectState: string, projectPath: string, instructionCount: number, pipelineStatus: string, summaries: { running: string; connectProject: string; describeTest: string; ready: string }): string {
  if (pipelineStatus === "running") {
    return summaries.running;
  }

  if (projectState !== "ready" || !projectPath) {
    return summaries.connectProject;
  }

  if (instructionCount === 0) {
    return summaries.describeTest;
  }

  return summaries.ready;
}
