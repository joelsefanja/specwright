import React, { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "../../components/ui";
import { useLanguageStore, useTranslations } from "../../i18n/localeStore";
import { useConfigStore } from "../../store/config.store";
import { useInstructionStore } from "../../store/instruction.store";
import { usePipelineStore } from "../../store/pipeline.store";
import type { WorkflowStepId } from "../workflowSteps";
import { StudioStep } from "./StudioStep";
import { InstallRequirementsModal, PipelinePreview, SetupChecklist, StartButton, TestGoalReview } from "./run-tests";

const AUTOMATE_MESSAGE = "Run the /e2e-automate skill to execute the full E2E test automation pipeline. The instructions.js file has been saved. Read it from e2e-tests/instructions.js and execute all phases.";

export function RunTestsStep({ onSelectStep }: { onSelectStep: (stepId: WorkflowStepId) => void }): React.JSX.Element {
  const translations = useTranslations();
  const isDutch = useLanguageStore((state) => state.language === "nl");
  const text = translations.runTests;
  const scenarioTitle = isDutch ? "Controleer je scenario's" : "Review your scenarios";
  const scenarioHelp = isDutch
    ? "Dit gaat Specwright straks automatiseren. Controleer vooral de gebruikerstaak en het zichtbare resultaat."
    : "This is what Specwright will automate. Check the user task and visible result before starting.";
  const projectPath = useConfigStore((state) => state.projectPath);
  const envVars = useConfigStore((state) => state.envVars);
  const skipPermissions = useConfigStore((state) => state.skipPermissions);
  const cards = useInstructionStore((state) => state.cards);
  const serialize = useInstructionStore((state) => state.serialize);
  const pipelineStatus = usePipelineStore((state) => state.status);
  const phases = usePipelineStore((state) => state.phases);
  const logLines = usePipelineStore((state) => state.logLines);
  const errorMessage = usePipelineStore((state) => state.errorMessage);
  const startRun = usePipelineStore((state) => state.startRun);
  const setError = usePipelineStore((state) => state.setError);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirements, setRequirements] = useState<RequirementsResult | null>(null);
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);
  const [installingAction, setInstallingAction] = useState<RequirementInstallAction | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installLogs, setInstallLogs] = useState<string[]>([]);

  const isRunning = isSubmitting || pipelineStatus === "running";
  const validScenarios = cards.filter((card) => card.steps.some((step) => step.trim()) || card.filePath?.trim());
  const hasScenarios = validScenarios.length > 0;
  const hasAppLink = Boolean(envVars.BASE_URL?.trim());
  const hasRequiredStartRoutes = validScenarios.every((card) => !card.explore || Boolean(card.pageURL?.trim()) || Boolean(card.filePath?.trim()) || Boolean(card.gitlabSource));
  const authNeedsEmail = envVars.AUTH_STRATEGY === "oauth" && !envVars.TEST_USER_EMAIL?.trim();
  const setupReady = Boolean(projectPath) && hasAppLink && hasScenarios && hasRequiredStartRoutes && !authNeedsEmail;
  const canStart = setupReady && !isRunning;
  const visiblePhases = phases.filter((phase) => phase.status !== "pending" || pipelineStatus === "running");
  const emptyScenarioText = isDutch
    ? "Nog geen scenario. Voeg er één toe in stap 3."
    : "Add at least one scenario in step 3 first. You can still preview this page.";
  const readinessItems = [
    { label: isDutch ? "Projectmap" : "Project folder", description: isDutch ? "Waar Specwright bestanden opslaat." : "Where Specwright saves files.", ready: Boolean(projectPath), action: () => onSelectStep("connect-project") },
    { label: isDutch ? "URL van je app" : "App URL", description: isDutch ? "Waar Specwright de test start." : "Where Specwright starts the test.", ready: hasAppLink, action: () => onSelectStep("configure-access") },
    { label: isDutch ? "Scenario's" : "Scenarios", description: isDutch ? "Minimaal één scenario staat klaar." : "At least one scenario is ready.", ready: hasScenarios, action: () => onSelectStep("describe-test") },
    { label: isDutch ? "Startpunt of bron" : "Starting point or source", description: isDutch ? "Voeg een startpagina, GitLab-issue of bestand toe." : "Add a start page, GitLab issue, or file.", ready: !hasScenarios || hasRequiredStartRoutes, action: () => onSelectStep("describe-test") },
    { label: isDutch ? "Login" : "Login", description: isDutch ? "Alleen nodig voor tests met login." : "Only needed for tests with login.", ready: !authNeedsEmail, action: () => onSelectStep("configure-access") },
  ];
  const blockers = readinessItems.filter((item) => !item.ready);
  const hasFinishedRun = pipelineStatus === "done" || pipelineStatus === "error" || pipelineStatus === "aborted";
  const actionHelper = runActionHelper(pipelineStatus, setupReady, blockers[0]?.description, isDutch);
  const startLabel = pipelineStatus === "done"
    ? (isDutch ? "Opnieuw draaien" : "Run again")
    : pipelineStatus === "error" || pipelineStatus === "aborted"
      ? (isDutch ? "Opnieuw proberen" : "Try again")
      : text.start;
  const runFlow = isDutch
    ? ["Instructies opslaan", "App bekijken", "Test schrijven", "Draaien en fouten herstellen", "Resultaat tonen"]
    : ["Save instructions", "Inspect the app", "Write the test", "Run and fix failures", "Show results"];

  const onStartPipeline = async (): Promise<void> => {
    if (!canStart || !projectPath) {
      return;
    }

    setIsSubmitting(true);
    setSaveError(null);
    try {
      const nextRequirements = await checkRequirements(projectPath);
      if (!nextRequirements.ready) {
        setRequirements(nextRequirements);
        setRequirementsOpen(true);
        return;
      }

      const instructions = serialize();
      const validationError = validatePageUrls(instructions as Array<Record<string, unknown>>, envVars.BASE_URL || "", text);
      if (validationError) {
        setSaveError(validationError);
        return;
      }

      await window.specwright.project.writeInstructions(projectPath, instructions);
      startRun(AUTOMATE_MESSAGE);
      await window.specwright.pipeline.start({
        userMessage: AUTOMATE_MESSAGE,
        mode: "claude-code",
        skipPermissions,
      });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkRequirements = async (path: string): Promise<RequirementsResult> => {
    setIsCheckingRequirements(true);
    setInstallError(null);
    try {
      const result = await window.specwright.requirements.check(path);
      setRequirements(result);
      if (result.ready) setRequirementsOpen(false);
      return result;
    } finally {
      setIsCheckingRequirements(false);
    }
  };

  const onRecheckRequirements = (): void => {
    if (!projectPath) return;
    void checkRequirements(projectPath);
  };

  const onInstallRequirement = async (action: RequirementInstallAction): Promise<void> => {
    if (!projectPath) return;
    setInstallingAction(action);
    setInstallError(null);
    setInstallLogs([]);
    const unsubscribe = window.specwright.requirements.onInstallLog((data) => {
      setInstallLogs((current) => [...current, data.line]);
    });
    try {
      const result = await window.specwright.requirements.install({ projectPath, action });
      if (!result.ok) {
        setInstallError(result.error ?? (isDutch ? "Installatie mislukt." : "Install failed."));
        return;
      }
      await checkRequirements(projectPath);
    } finally {
      unsubscribe();
      setInstallingAction(null);
    }
  };

  return (
    <StudioStep
      stepId="run-tests"
      stepLabel={text.label}
      title={text.title}
      description={text.description}
      width="wide"
      actionBar={{
        title: isDutch ? "Start" : "Start",
        helper: actionHelper,
        secondary: (
          <Button type="button" variant="secondary" disabled={isRunning} onClick={() => onSelectStep("describe-test")}>
            <ArrowLeft size={14} weight="bold" />
            {hasFinishedRun ? (isDutch ? "Scenario wijzigen" : "Change scenario") : text.adjustButton}
          </Button>
        ),
        primary: <StartButton canStart={canStart} isRunning={isRunning} startLabel={startLabel} text={text} onStart={() => void onStartPipeline()} />,
      }}
    >
      <InstallRequirementsModal
        installError={installError}
        installingAction={installingAction}
        isChecking={isCheckingRequirements}
        isDutch={isDutch}
        logs={installLogs}
        open={requirementsOpen}
        requirements={requirements}
        onInstall={(action) => void onInstallRequirement(action)}
        onOpenChange={setRequirementsOpen}
        onRecheck={onRecheckRequirements}
      />
      <div className="grid gap-5">
        {isRunning || visiblePhases.length > 0 ? (
          <PipelinePreview errorMessage={errorMessage} isDutch={isDutch} isRunning={isRunning} logLines={logLines} pipelineStatus={pipelineStatus} runFlow={runFlow} text={text} visiblePhases={visiblePhases} />
        ) : (
          <>
            <PipelinePreview errorMessage={errorMessage} isDutch={isDutch} isRunning={isRunning} logLines={logLines} pipelineStatus={pipelineStatus} runFlow={runFlow} text={text} visiblePhases={visiblePhases} />

            <div className="grid items-start gap-4 min-[980px]:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <TestGoalReview
                emptyScenarioText={emptyScenarioText}
                isDutch={isDutch}
                scenarioHelp={scenarioHelp}
                scenarioTitle={scenarioTitle}
                text={text}
                validScenarios={validScenarios}
              />

              <SetupChecklist isDutch={isDutch} isRunning={isRunning} readinessItems={readinessItems} text={text} />
            </div>
          </>
        )}

        {saveError && <p className="operator-danger text-sm">{saveError}</p>}
        {authNeedsEmail && <p className="operator-danger text-sm">{text.oauthEmailRequired}</p>}
      </div>
    </StudioStep>
  );
}

function runActionHelper(status: string, setupReady: boolean, firstBlockerDescription: string | undefined, isDutch: boolean): string {
  if (status === "running") return isDutch ? "Specwright werkt. Je ziet live wat er gebeurt." : "Specwright is working. You can follow every step live.";
  if (status === "done") return isDutch ? "Klaar. Controleer het resultaat of draai opnieuw." : "Done. Review the result or run again.";
  if (status === "error") return isDutch ? "Niet gelukt. Bekijk de laatste stappen en probeer opnieuw." : "Failed. Review the latest steps and try again.";
  if (status === "aborted") return isDutch ? "Gestopt. Je kunt de run opnieuw starten." : "Stopped. You can start the run again.";
  if (setupReady) return isDutch ? "Controleer nog één keer en start daarna de test." : "Review once more, then start the test.";
  return firstBlockerDescription ?? (isDutch ? "Vul de ontbrekende gegevens aan voordat je start." : "Complete the missing details before starting.");
}

function validatePageUrls(instructions: Array<Record<string, unknown>>, baseUrl: string, text: ReturnType<typeof useTranslations>["runTests"]): string | null {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  for (let index = 0; index < instructions.length; index += 1) {
    const pageUrl = String(instructions[index].pageURL ?? "");
    if (!pageUrl) {
      continue;
    }

    if (pageUrl.startsWith("/")) {
      if (!normalizedBaseUrl) {
        return text.relativeUrlError(index + 1);
      }
      instructions[index].pageURL = `${normalizedBaseUrl}${pageUrl}`;
      continue;
    }

    try {
      const parsedUrl = new URL(pageUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return text.invalidProtocolError(index + 1);
      }
    } catch {
      return text.invalidUrlError(index + 1);
    }
  }

  return null;
}
