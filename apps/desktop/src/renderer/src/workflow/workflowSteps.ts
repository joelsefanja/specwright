import { FolderOpen, Key, ListChecks, PlayCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export type WorkflowStepId =
  | "connect-project"
  | "configure-access"
  | "describe-test"
  | "run-tests";

export type WorkflowStepStatus = "locked" | "ready" | "active" | "running" | "done" | "warning" | "error";

export interface WorkflowStepDefinition {
  id: WorkflowStepId;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  primaryAction: string;
  icon: Icon;
}

export const WORKFLOW_STEPS: WorkflowStepDefinition[] = [
  {
    id: "connect-project",
    number: 1,
    title: "Choose project folder",
    shortTitle: "Choose project folder",
    description: "Choose your app's folder. Specwright saves the test files there.",
    primaryAction: "Choose project folder",
    icon: FolderOpen,
  },
  {
    id: "configure-access",
    number: 2,
    title: "App URL and login",
    shortTitle: "App URL and login",
    description: "Add the URL where Specwright should start the test. Add login only when a scenario needs it.",
    primaryAction: "Add app URL",
    icon: Key,
  },
  {
    id: "describe-test",
    number: 3,
    title: "Describe scenarios",
    shortTitle: "Scenarios",
    description: "Describe what the user does and what should be visible when it works.",
    primaryAction: "Add scenario",
    icon: ListChecks,
  },
  {
    id: "run-tests",
    number: 4,
    title: "Review and start",
    shortTitle: "Review",
    description: "Review the scenarios and setup before Specwright creates and runs the test.",
    primaryAction: "Create and run test",
    icon: PlayCircle,
  },
];
