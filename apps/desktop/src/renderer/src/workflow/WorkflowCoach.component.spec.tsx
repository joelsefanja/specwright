import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { WorkflowCoach } from "./WorkflowCoach";
import { FolderOpen, Key, ListChecks, PlayCircle } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { WorkflowStepViewModel } from "./workflowState";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

vi.mock("../i18n/localeStore", () => ({
  useLanguageStore: Object.assign(
    (selector?: (s: { language: string }) => string) => selector?.({ language: "en" }) ?? { language: "en" },
    { getState: () => ({ language: "en" }), setState: () => {} },
  ),
  useTranslations: () => ({
    coach: {
      label: "Test helper",
      nextAction: "Next step",
      back: "Back",
      forward: "Next",
      lockedStep: "Not ready yet",
      lockedStepHelp: (stepTitle: string) => stepTitle ? `Complete '${stepTitle}' first.` : "Complete the current step first.",
      goToStep: "Go to",
      stepsAriaLabel: "Test steps",
      currentStep: "Now",
      completed: "Done",
      backUnavailable: "No previous step",
      forwardUnavailable: "No next step",
    },
    workflow: {
      steps: {
        "connect-project": { title: "Choose project folder", shortTitle: "Choose project folder" },
        "configure-access": { title: "App URL and login", shortTitle: "App URL and login" },
        "describe-test": { title: "Describe scenarios", shortTitle: "Scenarios" },
        "run-tests": { title: "Review and start", shortTitle: "Review" },
      },
      lockedReasons: {
        running: "Wait until the current step is done.",
        "configure-access": "Choose your project folder first.",
        "describe-test": "Add your app URL first.",
        "run-tests": "Let Specwright create the test first.",
      },
    },
  }),
}));

const baseSteps: WorkflowStepViewModel[] = [
  {
    id: "connect-project", number: 1, title: "Choose project folder", shortTitle: "Choose project folder",
    description: "", primaryAction: "", icon: FolderOpen, status: "done" as const, canNavigate: true,
  },
  {
    id: "configure-access", number: 2, title: "App URL and login", shortTitle: "App URL and login",
    description: "", primaryAction: "", icon: Key, status: "locked" as const, canNavigate: false,
  },
  {
    id: "describe-test", number: 3, title: "Describe scenarios", shortTitle: "Scenarios",
    description: "", primaryAction: "", icon: ListChecks, status: "locked" as const, canNavigate: false,
  },
  {
    id: "run-tests", number: 4, title: "Review and start", shortTitle: "Review",
    description: "", primaryAction: "", icon: PlayCircle, status: "locked" as const, canNavigate: false,
  },
];

function renderWorkflowCoach(steps: WorkflowStepViewModel[] = baseSteps): void {
  render(
    <Tooltip.Provider delayDuration={0}>
      <WorkflowCoach
        steps={steps}
        canGoBack={false}
        canGoForward={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onSelectStep={vi.fn()}
      />
    </Tooltip.Provider>,
  );
}

describe("WorkflowCoach tooltip", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows locked reason tooltip when hovering a locked step", async () => {
    const user = userEvent.setup();
    renderWorkflowCoach();

    const lockedButton = screen.getByTestId("workflow-step-configure-access");
    await user.hover(lockedButton);

    expect(await screen.findByTestId("workflow-tooltip-configure-access")).toHaveTextContent("Choose your project folder first.");
  });

  it("shows navigation hint tooltip when hovering an unlocked step", async () => {
    const user = userEvent.setup();
    const unlockedSteps = baseSteps.map((s) =>
      s.id === "connect-project" ? { ...s, status: "active" as const, canNavigate: true } : s
    );
    renderWorkflowCoach(unlockedSteps);

    const activeButton = screen.getByTestId("workflow-step-connect-project");
    await user.hover(activeButton);

    expect(await screen.findByTestId("workflow-tooltip-connect-project")).toHaveTextContent("Go to: Choose project folder");
  });
});
