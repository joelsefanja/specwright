import React from "react";
import { CheckCircle, Circle, ClockCounterClockwise, ListChecks, WarningCircle } from "@phosphor-icons/react";
import { CardTitle, StatusPill, Surface, type StatusPillProps } from "../../../components/ui";
import type { Phase, PhaseStatus, PipelineStatus } from "../../../store/pipeline.store";
import type { PipelinePreviewProps } from "./types";

export function PipelinePreview({ errorMessage, isDutch, isRunning, logLines, pipelineStatus, runFlow, text, visiblePhases }: PipelinePreviewProps): React.JSX.Element {
  const hasStarted = pipelineStatus !== "idle" || isRunning || visiblePhases.length > 0;
  const activePhase = visiblePhases.find((phase) => phase.status === "running") ?? latestKnownPhase(visiblePhases);
  const latestActivity = readableActivityLines(logLines).slice(-5);
  const doneCount = visiblePhases.filter((phase) => phase.status === "done" || phase.status === "skipped").length;
  const progressTotal = Math.max(visiblePhases.length, doneCount, 1);
  const progressPercent = pipelineStatus === "done" ? 100 : Math.round((doneCount / progressTotal) * 100);
  const copy = previewCopy(pipelineStatus, isDutch, activePhase ? text.phaseLabels[activePhase.label] ?? activePhase.label : undefined);
  const plannedSteps = text.whatHappensItems.length > 0 ? text.whatHappensItems : runFlow;
  const evidenceSteps = runEvidenceSteps(pipelineStatus, isDutch, latestActivity.length > 0, Boolean(errorMessage));

  return (
    <Surface variant={pipelineStatus === "done" ? "success" : pipelineStatus === "error" || pipelineStatus === "aborted" ? "accent" : "default"} padding="lg" className="grid gap-5">
      <div className="grid gap-4 min-[920px]:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
        <div className="grid content-start gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--sw-radius-pill)] bg-[color-mix(in_srgb,var(--sw-accent)_12%,transparent)] text-[var(--sw-accent-strong)]">
              {statusIcon(pipelineStatus)}
            </span>
            <span className="min-w-0">
              <span className="operator-label">{hasStarted ? text.automaticProgressTitle : text.whatHappensTitle}</span>
              <CardTitle className="mt-1 text-xl">{copy.title}</CardTitle>
              <span className="mt-2 block text-sm leading-6 text-operator-muted">{copy.description}</span>
            </span>
          </div>

          {hasStarted ? (
            <div className="grid gap-3">
              <div className="h-2 overflow-hidden rounded-[var(--sw-radius-pill)] bg-[color-mix(in_srgb,var(--sw-line)_44%,transparent)]">
                <span className="block h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--sw-accent),var(--sw-accent-strong))] transition-[width] duration-500" style={{ width: `${Math.max(8, progressPercent)}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-operator-muted">
                <StatusPill status={statusVariant(pipelineStatus)} dot>{copy.statusLabel}</StatusPill>
                {activePhase && <span>{isDutch ? "Nu:" : "Now:"} {text.phaseLabels[activePhase.label] ?? activePhase.label}</span>}
              </div>
              {errorMessage && (
                <Surface variant="muted" padding="sm" className="border-[color-mix(in_srgb,var(--sw-danger)_24%,var(--sw-line))] text-sm leading-6 text-[var(--sw-danger)]">
                  {errorMessage}
                </Surface>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              <span className="text-sm font-semibold text-operator-ink">{isDutch ? "Je ziet straks:" : "You will see:"}</span>
              <ol className="grid gap-2 text-sm leading-5 text-operator-muted">
                {plannedSteps.map((item, index) => (
                  <li key={`${index}-${item}`} className="grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--sw-radius-pill)] bg-[var(--sw-field)] text-xs font-semibold text-[var(--sw-text-subtle)]">{index + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-operator-ink">{hasStarted ? (isDutch ? "Fases" : "Phases") : (isDutch ? "Live feedback" : "Live feedback")}</span>
            {hasStarted && <span className="text-xs text-operator-muted">{doneCount}/{visiblePhases.length || 10}</span>}
          </div>
          {hasStarted ? (
            <div className="grid gap-2">
              {visiblePhases.map((phase) => (
                <PhaseRow key={phase.id} phase={phase} text={text} />
              ))}
              {visiblePhases.length === 0 && (
                <Surface variant="muted" padding="sm" className="text-sm text-operator-muted">
                  {isDutch ? "De run wordt gestart. De eerste fase verschijnt zodra Specwright output geeft." : "The run is starting. The first phase appears as soon as Specwright reports progress."}
                </Surface>
              )}
            </div>
          ) : (
            <Surface variant="muted" padding="md" className="grid gap-2 text-sm leading-6 text-operator-muted">
              <span className="flex items-center gap-2 font-semibold text-operator-ink"><ListChecks size={16} weight="duotone" />{isDutch ? "Niet meer magisch" : "No hidden work"}</span>
              <span>{isDutch ? "Na start toont Specwright per fase wat er gebeurt, wat klaar is en waar het eventueel misgaat." : "After start, Specwright shows each phase, what is done, and where a failure happens."}</span>
            </Surface>
          )}
        </div>
      </div>

      <div className="grid gap-3 min-[860px]:grid-cols-3">
        {evidenceSteps.map((step) => (
          <Surface key={step.title} variant="muted" padding="md" className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sw-text-subtle)]">{step.stage}</span>
              <StatusPill status={step.status}>{step.statusLabel}</StatusPill>
            </div>
            <span className="text-sm font-semibold text-operator-ink">{step.title}</span>
            <span className="text-sm leading-6 text-operator-muted">{step.description}</span>
          </Surface>
        ))}
      </div>

      <Surface variant="muted" padding="md" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-operator-ink">{isDutch ? "Laatste activiteit" : "Latest activity"}</span>
          <span className="text-xs text-operator-muted">{isDutch ? "Live vanuit de run" : "Live from the run"}</span>
        </div>
        {latestActivity.length > 0 ? (
          <div className="grid gap-2">
            {latestActivity.map((line, index) => (
              <span key={`${index}-${line.slice(0, 32)}`} className="rounded-[var(--sw-radius-control)] bg-[color-mix(in_srgb,var(--sw-surface)_76%,transparent)] px-3 py-2 text-sm leading-5 text-operator-muted">
                {line}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm leading-6 text-operator-muted">
            {isRunning ? (isDutch ? "Specwright start de run. De eerste activiteit verschijnt hier zo." : "Specwright is starting the run. The first activity will appear here soon.") : (isDutch ? "Nog geen activiteit. Start de test om live feedback te zien." : "No activity yet. Start the test to see live feedback.")}
          </span>
        )}
      </Surface>
    </Surface>
  );
}

function PhaseRow({ phase, text }: { phase: Phase; text: PipelinePreviewProps["text"] }): React.JSX.Element {
  return (
    <Surface variant="muted" padding="sm" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="text-[var(--sw-text-subtle)]">{phaseIcon(phase.status)}</span>
      <span className="min-w-0 truncate text-operator-ink">{text.phaseLabels[phase.label] ?? phase.label}</span>
      <StatusPill status={phaseStatusVariant(phase.status)}>{text.phaseStatusLabels[phase.status] ?? phase.status}</StatusPill>
    </Surface>
  );
}

function phaseStatusVariant(status: PhaseStatus): StatusPillProps["status"] {
  if (status === "done") return "success";
  if (status === "error") return "danger";
  if (status === "running") return "running";
  return "muted";
}

function statusVariant(status: PipelineStatus): StatusPillProps["status"] {
  if (status === "done") return "success";
  if (status === "error" || status === "aborted") return "danger";
  if (status === "running") return "running";
  return "muted";
}

function latestKnownPhase(phases: Phase[]): Phase | undefined {
  return [...phases].reverse().find((phase) => phase.status !== "pending");
}

function statusIcon(status: PipelineStatus): React.ReactNode {
  if (status === "done") return <CheckCircle size={22} weight="fill" />;
  if (status === "error" || status === "aborted") return <WarningCircle size={22} weight="bold" />;
  if (status === "running") return <ClockCounterClockwise size={22} weight="duotone" />;
  return <ListChecks size={22} weight="duotone" />;
}

function phaseIcon(status: PhaseStatus): React.ReactNode {
  if (status === "done") return <CheckCircle size={16} weight="fill" />;
  if (status === "error") return <WarningCircle size={16} weight="bold" />;
  if (status === "running") return <ClockCounterClockwise size={16} weight="duotone" />;
  return <Circle size={16} weight="bold" />;
}

function readableActivityLines(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(/^\[(pipeline|runner|tool|opencode)\]\s*/i, "").trim())
    .filter((line) => line && !line.toLowerCase().includes("system prompt:"));
}

function previewCopy(status: PipelineStatus, isDutch: boolean, currentPhase?: string): { title: string; description: string; statusLabel: string } {
  if (status === "running") {
    return {
      title: isDutch ? "Specwright werkt zichtbaar" : "Specwright is working visibly",
      description: currentPhase
        ? (isDutch ? `Nu bezig met ${currentPhase.toLowerCase()}. Je kunt volgen wat klaar is en wat nog loopt.` : `Now working on ${currentPhase.toLowerCase()}. You can follow what is done and what is still running.`)
        : (isDutch ? "De run is gestart. De eerste fase verschijnt zodra Specwright output geeft." : "The run has started. The first phase appears as soon as Specwright reports progress."),
      statusLabel: isDutch ? "Bezig" : "Running",
    };
  }

  if (status === "done") {
    return {
      title: isDutch ? "Test klaar" : "Test done",
      description: isDutch ? "Specwright heeft de run afgerond. Bekijk de laatste activiteit en controleer het resultaat in je projectmap." : "Specwright finished the run. Review the latest activity and check the result in your project folder.",
      statusLabel: isDutch ? "Klaar" : "Done",
    };
  }

  if (status === "error") {
    return {
      title: isDutch ? "Run niet gelukt" : "Run failed",
      description: isDutch ? "Er is iets misgegaan. De laatste activiteit laat zien waar je kunt beginnen met herstellen." : "Something went wrong. The latest activity shows where to start fixing it.",
      statusLabel: isDutch ? "Niet gelukt" : "Failed",
    };
  }

  if (status === "aborted") {
    return {
      title: isDutch ? "Run gestopt" : "Run stopped",
      description: isDutch ? "De run is gestopt. Je kunt de instellingen aanpassen of opnieuw starten." : "The run was stopped. You can adjust the setup or start again.",
      statusLabel: isDutch ? "Gestopt" : "Stopped",
    };
  }

  return {
    title: isDutch ? "Klaar voor zichtbare voortgang" : "Ready for visible progress",
    description: isDutch ? "Na start zie je niet alleen dat Specwright bezig is, maar ook welke fase loopt, wat klaar is en wat het resultaat is." : "After start, you will see more than a spinner: the active phase, completed work, and the final result.",
    statusLabel: isDutch ? "Wacht" : "Waiting",
  };
}

function runEvidenceSteps(status: PipelineStatus, isDutch: boolean, hasLiveActivity: boolean, hasError: boolean): Array<{ stage: string; title: string; description: string; status: StatusPillProps["status"]; statusLabel: string }> {
  const started = status !== "idle";
  const finished = status === "done" || status === "error" || status === "aborted";

  return [
    {
      stage: isDutch ? "Voor start" : "Before start",
      title: isDutch ? "Setup en scenario gecontroleerd" : "Setup and scenario checked",
      description: isDutch ? "Je ziet vooraf welke projectmap, app-URL, login en scenario's Specwright gebruikt." : "You can see the project folder, app URL, login, and scenarios before Specwright starts.",
      status: started ? "success" : "muted",
      statusLabel: started ? (isDutch ? "Vastgelegd" : "Captured") : (isDutch ? "Klaarzetten" : "Prepare"),
    },
    {
      stage: isDutch ? "Tijdens run" : "During run",
      title: isDutch ? "Live observatie per fase" : "Live observation by phase",
      description: isDutch ? "Tijdens de run toont Specwright de actieve fase, laatste activiteit en eventuele toestemming." : "During the run, Specwright shows the active phase, latest activity, and any permission requests.",
      status: status === "running" || hasLiveActivity ? "running" : "muted",
      statusLabel: status === "running" ? (isDutch ? "Live" : "Live") : (isDutch ? "Wacht" : "Waiting"),
    },
    {
      stage: isDutch ? "Na afloop" : "Afterwards",
      title: isDutch ? "Resultaat blijft inspecteerbaar" : "Result stays inspectable",
      description: isDutch ? "De run, log, OpenCode-sessie en gemaakte testbestanden blijven terug te vinden in je project." : "The run, log, OpenCode session, and generated test files remain available in your project.",
      status: status === "done" ? "success" : hasError ? "danger" : finished ? "warning" : "muted",
      statusLabel: status === "done" ? (isDutch ? "Klaar" : "Done") : finished ? (isDutch ? "Bekijk" : "Review") : (isDutch ? "Nog niet" : "Not yet"),
    },
  ];
}
