import React from "react";
import InstructionCard from "../../../components/CenterPanel/instruction-card";
import type { InstructionCard as ICard } from "../../../store/instruction.store";
import { TestGoalEmptyState } from "./TestGoalEmptyState";
import type { DescribeTestCopy } from "./types";

interface TestGoalListProps {
  cards: ICard[];
  copy: DescribeTestCopy;
  addScenarioLabel: string;
  onAddScenario: () => void;
}

export function TestGoalList({ cards, copy, addScenarioLabel, onAddScenario }: TestGoalListProps): React.JSX.Element {
  if (cards.length === 0) {
    return <TestGoalEmptyState copy={copy} addScenarioLabel={addScenarioLabel} onAddScenario={onAddScenario} />;
  }

  return (
    <>
      {cards.map((card, index) => (
        <InstructionCard key={card.id} card={card} index={index} />
      ))}
    </>
  );
}
