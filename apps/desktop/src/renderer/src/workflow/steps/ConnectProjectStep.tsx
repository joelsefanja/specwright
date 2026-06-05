import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle, FolderOpen, PlugsConnected } from "@phosphor-icons/react";
import { presenceTransition } from "@renderer/motion/presets";
import { Button, IconBubble, StatusPill, Surface } from "../../components/ui";
import { useTranslations } from "../../i18n/localeStore";
import { useConfigStore } from "../../store/config.store";
import type { WorkflowStepId } from "../workflowSteps";
import { StudioStep } from "./StudioStep";

export function ConnectProjectStep({ onSelectStep }: { onSelectStep: (stepId: WorkflowStepId) => void }): React.JSX.Element {
  const translations = useTranslations();
  const text = translations.connectProject;
  const stepText = translations.workflow.steps["connect-project"];
  const projectPath = useConfigStore((state) => state.projectPath);
  const projectState = useConfigStore((state) => state.projectState);
  const recentProjects = useConfigStore((state) => state.recentProjects);
  const bootstrapLog = useConfigStore((state) => state.bootstrapLog);
  const pickAndBootstrap = useConfigStore((state) => state.pickAndBootstrap);
  const loadExistingProject = useConfigStore((state) => state.loadExistingProject);
  const resetProject = useConfigStore((state) => state.resetProject);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  const isBootstrapping = projectState === "bootstrapping";
  const isDutch = text.step.startsWith("Stap");
  const visibleRecentProjects = recentProjects.filter((recentProject) => recentProject !== projectPath).slice(0, 4);
  const setupDetailsLabel = text.setupDetails;
  const connectedLabel = isDutch ? "Gekoppeld" : "Connected";
  const changeFolderLabel = isDutch ? "Andere map" : "Change folder";
  const disconnectLabel = isDutch ? "Loskoppelen" : "Disconnect";
  const cancelDisconnectLabel = isDutch ? "Behouden" : "Keep project";
  const confirmDisconnectLabel = isDutch ? "Toch loskoppelen" : "Disconnect anyway";
  const disconnectHelp = isDutch
    ? "De map blijft op je computer. Specwright vergeet alleen deze koppeling."
    : "The folder stays on your computer. Specwright only forgets this link.";

  const onOpenProject = (): void => {
    void pickAndBootstrap("none");
  };

  const onDisconnectProject = (): void => {
    void resetProject();
    setConfirmDisconnect(false);
  };

  return (
    <StudioStep
      stepId="connect-project"
      stepLabel={text.step}
      title={stepText.title}
      description={stepText.description}
      width="standard"
      actionBar={{
        title: text.whatNext,
        helper: projectPath ? text.nextDescription : text.description,
        secondary: undefined,
        primary: projectPath ? (
          <Button type="button" variant="default" onClick={() => onSelectStep("configure-access")}>
            {text.nextButton}
            <ArrowRight size={15} weight="bold" />
          </Button>
        ) : null,
      }}
    >
      <div className="grid items-start gap-4">
        <Surface variant="raised" padding="lg" className="operator-project-card" data-connected={Boolean(projectPath)}>
          <AnimatePresence mode="wait" initial={false}>
          {!projectPath ? (
            <motion.div key="project-empty" className="operator-project-card-state operator-project-card-head" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={presenceTransition}>
              <div className="min-w-0">
                <p className="operator-section-title">{text.title}</p>
                <p className="operator-section-copy">{text.description}</p>
              </div>
              <Button type="button" variant="default" disabled={isBootstrapping} onClick={onOpenProject}>
                <FolderOpen size={16} weight="bold" />
                {isBootstrapping ? text.preparingProject : text.openProject}
              </Button>
            </motion.div>
          ) : (
            <motion.div key="project-linked" className="operator-project-card-state operator-project-linked-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={presenceTransition}>

              <div className="operator-project-linked-main">
                <StatusPill status="success" dot className="operator-project-ready">
                  <CheckCircle size={15} weight="fill" />
                  {connectedLabel}
                </StatusPill>
                <div className="operator-project-path">
                  <span className="operator-project-linked-name">{projectName(projectPath)}</span>
                  <code>{projectPath}</code>
                </div>
              </div>
              <div className="operator-project-card-actions">
                {confirmDisconnect ? (
                  <>
                    <p className="operator-project-disconnect-help">{disconnectHelp}</p>
                    <Button type="button" variant="secondary" disabled={isBootstrapping} onClick={() => setConfirmDisconnect(false)}>
                      {cancelDisconnectLabel}
                    </Button>
                    <Button type="button" variant="destructive" disabled={isBootstrapping} onClick={onDisconnectProject}>
                      {confirmDisconnectLabel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="secondary" disabled={isBootstrapping} onClick={onOpenProject}>
                      <FolderOpen size={16} weight="bold" />
                      {isBootstrapping ? text.preparingProject : changeFolderLabel}
                    </Button>
                    <Button type="button" variant="secondary" disabled={isBootstrapping} onClick={() => setConfirmDisconnect(true)}>
                      {disconnectLabel}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {isBootstrapping && bootstrapLog.length > 0 && (
            <details className="operator-config-section mt-5">
              <summary className="cursor-pointer operator-section-title">{setupDetailsLabel}</summary>
              <div className="mt-3 max-h-36 overflow-auto border border-operator-line bg-operator-panel p-4 font-mono text-[11px] text-operator-muted">
                {bootstrapLog.slice(-8).map((line, lineIndex) => (
                  <div key={`${lineIndex}-${line.slice(0, 20)}`}>{line}</div>
                ))}
              </div>
            </details>
          )}
        </Surface>

        {(visibleRecentProjects.length > 0 || !projectPath) && <Surface as="aside" variant="default" padding="lg" className="operator-form operator-recent-projects-panel">
          <div className="mb-4 flex items-center gap-3">
            <IconBubble className="h-10 w-10" tone="accent"><PlugsConnected size={20} weight="duotone" /></IconBubble>
            <div>
              <p className="operator-label">{text.recentProjects}</p>
              <p className="text-xs text-operator-muted">{text.recentDescription}</p>
            </div>
          </div>

          <div className="operator-recent-projects-list">
            {visibleRecentProjects.length > 0 ? (
              visibleRecentProjects.map((recentProject) => (
                <button
                  key={recentProject}
                  type="button"
                   className="operator-recent-project-button"
                  disabled={isBootstrapping}
                  onClick={() => {
                    void loadExistingProject(recentProject);
                  }}
                >
                  <span className="block truncate text-sm font-medium text-operator-ink">{projectName(recentProject)}</span>
                  <span className="block truncate text-[11px] text-operator-muted">{recentProject}</span>
                </button>
              ))
            ) : (
              <p className="rounded-[var(--sw-radius-card-compact)] border border-dashed border-operator-line px-3 py-4 text-sm text-operator-muted">
                {text.noRecent}
              </p>
            )}
          </div>
        </Surface>}
      </div>
    </StudioStep>
  );
}

function projectName(projectPath: string): string {
  const normalizedPath = projectPath.replace(/\\/g, "/");
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? projectPath;
}
