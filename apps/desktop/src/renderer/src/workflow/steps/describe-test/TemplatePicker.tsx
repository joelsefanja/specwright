import React from "react";
import { Browsers, Database, PencilSimpleLine } from "@phosphor-icons/react";
import { Button } from "../../../components/common/ui";
import type { InstructionCard as ICard } from "../../../store/instruction.store";
import type { TestGoalTemplate } from "./types";

interface TemplatePickerProps {
  templates: TestGoalTemplate[];
  isDutch: boolean;
  onUseTemplate: (template: Partial<ICard>) => void;
}

export function TemplatePicker({ templates, isDutch, onUseTemplate }: TemplatePickerProps): React.JSX.Element {
  return (
    <div className="operator-template-choice-grid">
      {templates.map((template, index) => {
        const Icon = iconForTemplate(index);
        return (
        <Button key={template.labelNl} type="button" compact className="operator-template-choice" data-template={index + 1} onClick={() => onUseTemplate(isDutch ? template.cardNl : template.cardEn)}>
          <Icon size={15} weight="bold" className="mt-0.5 flex-shrink-0" />
          <span>{isDutch ? template.labelNl : template.labelEn}</span>
        </Button>
      );
      })}
    </div>
  );
}

function iconForTemplate(index: number): typeof Browsers {
  if (index === 1) return PencilSimpleLine;
  if (index === 2) return Database;
  return Browsers;
}
