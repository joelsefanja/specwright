import React from "react";
import { ArrowLeft, ArrowRight, Plus } from "@phosphor-icons/react";
import { WorkflowSection } from "../../components/common/workflow-ui";
import { Button as CompactButton } from "../../components/common/ui";
import { Button } from "../../components/ui";
import { useTranslations } from "../../i18n/localeStore";
import { useInstructionStore, type InstructionCard as ICard } from "../../store/instruction.store";
import { useWorkflowViewModel } from "../workflowState";
import { TemplatePicker, TestGoalList, type TestGoalTemplate } from "./describe-test";
import { StudioStep } from "./StudioStep";

const TEST_GOAL_TEMPLATES: TestGoalTemplate[] = [
  {
    labelNl: "Pagina controleren",
    labelEn: "Check a page",
    cardNl: { moduleName: "Pagina", category: "@Modules", fileName: "pagina-controleren", steps: ["Open de pagina", "Controleer dat de belangrijkste titel, acties en status zichtbaar zijn"] },
    cardEn: { moduleName: "Page", category: "@Modules", fileName: "check-page", steps: ["Open the page", "Check that the main title, actions, and status are visible"] },
  },
  {
    labelNl: "Formulier invullen",
    labelEn: "Fill a form",
    cardNl: { moduleName: "Formulier", category: "@Modules", fileName: "formulier-invullen", steps: ["Open het formulier", "Vul verplichte velden in met testdata", "Verstuur het formulier", "Controleer de succesmelding"] },
    cardEn: { moduleName: "Form", category: "@Modules", fileName: "fill-form", steps: ["Open the form", "Fill required fields with test data", "Submit the form", "Check the success message"] },
  },
  {
    labelNl: "Workflow met data",
    labelEn: "Data workflow",
    cardNl: { moduleName: "Workflow", category: "@Workflows", fileName: "workflow-met-data", subModules: ["@0-Precondition", "@1-Verify"], steps: ["Maak of kies de benodigde data", "Gebruik die data in een vervolgstap", "Controleer dat de eindstatus klopt"] },
    cardEn: { moduleName: "Workflow", category: "@Workflows", fileName: "data-workflow", subModules: ["@0-Precondition", "@1-Verify"], steps: ["Create or choose the required data", "Use that data in a later step", "Check that the final state is correct"] },
  },
];

export function DescribeTestStep(): React.JSX.Element {
  const translations = useTranslations();
  const text = translations.describeTest;
  const isDutch = translations.app.close !== "Close";
  const workflow = useWorkflowViewModel();
  const cards = useInstructionStore((state) => state.cards);
  const addCard = useInstructionStore((state) => state.addCard);
  const updateCard = useInstructionStore((state) => state.updateCard);
  const hasReadyTestGoal = cards.some((card) => card.steps.some((step) => step.trim()) || card.filePath?.trim() || card.gitlabSource);
  const copy = isDutch ? describeCopy.nl : describeCopy.en;

  const onAddScenario = (): void => {
    addCard();
  };

  React.useEffect(() => {
    if (cards.length === 0) addCard();
  }, [addCard, cards.length]);

  const onUseTemplate = (template: Partial<ICard>): void => {
    const target = cards[0]?.id ?? addCard();
    updateCard(target, template);
  };

  return (
    <StudioStep
      stepId="describe-test"
      stepLabel={text.step}
      title={copy.frameTitle}
      description={copy.frameDescription}
      width="wide"
      actionBar={{
        title: isDutch ? "Volgende stap" : "Next step",
        helper: hasReadyTestGoal ? copy.continueRequirementReady : copy.continueRequirementMissing,
        secondary: (
          <Button type="button" variant="secondary" onClick={() => workflow.goToStep("configure-access")}>
            <ArrowLeft size={14} weight="bold" />
            {isDutch ? "Terug" : "Back"}
          </Button>
        ),
        primary: (
          <Button type="button" variant="default" disabled={!hasReadyTestGoal} onClick={() => workflow.goToStep("run-tests")}>
            {copy.continueButton}
            <ArrowRight size={15} weight="bold" />
          </Button>
        ),
      }}
    >
        <WorkflowSection
          className="operator-test-goal-section operator-test-goal-section-editor"
          title={copy.describeTitle}
          description={copy.describeDescription}
          action={(
            <CompactButton type="button" compact className="gap-2" onClick={onAddScenario}>
              <Plus size={14} weight="bold" />
              {text.addScenario}
            </CompactButton>
          )}
        >
          <TestGoalList cards={cards} copy={copy} addScenarioLabel={text.addScenario} onAddScenario={onAddScenario} />
        </WorkflowSection>

        <WorkflowSection
          className="operator-test-goal-section operator-test-goal-section-templates"
          title={copy.chooseTitle}
          description={copy.chooseDescription}
        >
            <TemplatePicker templates={TEST_GOAL_TEMPLATES} isDutch={isDutch} onUseTemplate={onUseTemplate} />
        </WorkflowSection>
    </StudioStep>
  );
}

const describeCopy = {
  nl: {
    frameTitle: "Scenario's beschrijven",
    frameDescription: "Start bij voorkeur met een GitLab issue. Als dat genoeg context geeft, hoef je alleen nog te controleren en te starten.",
    chooseTitle: "Start met een voorbeeld",
    chooseDescription: "Gebruik een voorbeeld als startpunt of voeg een leeg scenario toe.",
    describeTitle: "Kies je bron of taak",
    describeDescription: "Gebruik een GitLab issue als bron. Voeg alleen eigen tekst toe als het issue extra richting nodig heeft.",
    emptyTitle: "Begin met één scenario",
    emptyDescription: "Beschrijf één gebruikersactie en het zichtbare resultaat.",
    emptyHint: "Bijvoorbeeld: gebruiker vult adres in en ziet de juiste totaalprijs.",
    continueTitle: "Klaar voor controle",
    continueDescription: "Controleer hierna de setup. Daarna start je het maken en draaien van de test.",
    continueRequirement: "Gebruikerstaak beschreven",
    continueRequirementReady: "Je kunt door naar de controle.",
    continueRequirementMissing: "Kies een GitLab issue, bestand of beschrijf één taak.",
    continueButton: "Controleer en start",
  },
  en: {
    frameTitle: "Describe scenarios",
    frameDescription: "Prefer starting from a GitLab issue. If it has enough context, you only need to review and start.",
    chooseTitle: "Start with an example",
    chooseDescription: "Use an example as a starting point or add an empty scenario.",
    describeTitle: "Choose your source or task",
    describeDescription: "Use a GitLab issue as the source. Add your own text only when the issue needs extra direction.",
    emptyTitle: "Start with one scenario",
    emptyDescription: "Describe one user action and the visible result.",
    emptyHint: "For example: user enters an address and sees the correct total price.",
    continueTitle: "Ready to review",
    continueDescription: "Next, review the setup. Then start creating and running the test.",
    continueRequirement: "User task described",
    continueRequirementReady: "You can continue to review.",
    continueRequirementMissing: "Choose a GitLab issue, file, or describe one task.",
    continueButton: "Review and start",
  },
};
