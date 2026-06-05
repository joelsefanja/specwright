import React from "react";
import { ArrowBendDownRight, ListChecks, Plus } from "@phosphor-icons/react";
import { Button, SectionTitle } from "../../../components/common/ui";
import { IconBubble, Surface } from "../../../components/ui";
import type { DescribeTestCopy } from "./types";

interface TestGoalEmptyStateProps {
  copy: DescribeTestCopy;
  addScenarioLabel: string;
  onAddScenario: () => void;
}

export function TestGoalEmptyState({ copy, addScenarioLabel, onAddScenario }: TestGoalEmptyStateProps): React.JSX.Element {
  return (
    <Surface variant="muted" padding="lg" className="operator-test-goal-empty">
      <IconBubble tone="accent" className="operator-test-goal-empty-icon">
        <ListChecks size={20} weight="duotone" />
      </IconBubble>
      <div className="min-w-0">
        <SectionTitle>{copy.emptyTitle}</SectionTitle>
        <p className="operator-test-goal-empty-copy">{copy.emptyDescription}</p>
        <div className="operator-test-goal-empty-hint">
          <ArrowBendDownRight size={14} weight="bold" />
          <span>{copy.emptyHint}</span>
        </div>
      </div>
      <Button type="button" variant="primary" className="operator-test-goal-empty-action" onClick={onAddScenario}>
        <Plus size={15} weight="bold" />
        {addScenarioLabel}
      </Button>
    </Surface>
  );
}
