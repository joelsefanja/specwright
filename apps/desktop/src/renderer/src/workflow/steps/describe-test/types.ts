import type { InstructionCard as ICard } from "../../../store/instruction.store";

export interface TestGoalTemplate {
  labelNl: string;
  labelEn: string;
  cardNl: Partial<ICard>;
  cardEn: Partial<ICard>;
}

export interface DescribeTestCopy {
  emptyTitle: string;
  emptyDescription: string;
  emptyHint: string;
}
