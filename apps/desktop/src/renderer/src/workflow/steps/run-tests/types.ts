import type { InstructionCard } from "../../../store/instruction.store";
import type { Phase, PipelineStatus } from "../../../store/pipeline.store";
import type { ReadinessItem } from "../../../components/common/workflow-ui";
import type { useTranslations } from "../../../i18n/localeStore";

export type RunTestsText = ReturnType<typeof useTranslations>["runTests"];

export interface StartActionProps {
  canStart: boolean;
  isRunning: boolean;
  startLabel?: string;
  text: RunTestsText;
  onStart: () => void;
}

export interface TestGoalReviewProps {
  emptyScenarioText: string;
  isDutch: boolean;
  scenarioHelp: string;
  scenarioTitle: string;
  text: RunTestsText;
  validScenarios: InstructionCard[];
}

export interface PipelinePreviewProps {
  isDutch: boolean;
  isRunning: boolean;
  errorMessage: string | null;
  logLines: string[];
  pipelineStatus: PipelineStatus;
  runFlow: string[];
  text: RunTestsText;
  visiblePhases: Phase[];
}

export interface SetupChecklistProps {
  isDutch: boolean;
  isRunning: boolean;
  readinessItems: ReadinessItem[];
  text: RunTestsText;
}
