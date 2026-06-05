import React from "react";
import { ClipboardText } from "@phosphor-icons/react";
import { CardTitle, Surface } from "../../../components/ui";
import type { TestGoalReviewProps } from "./types";

export function TestGoalReview({ emptyScenarioText, isDutch, scenarioHelp, scenarioTitle, text, validScenarios }: TestGoalReviewProps): React.JSX.Element {
  return (
    <Surface variant="default" padding="lg" className="flex flex-col gap-4">
      <CardTitle className="flex items-center gap-2">
        <ClipboardText size={16} weight="bold" />
        {scenarioTitle}
      </CardTitle>
      <p className="text-sm leading-6 text-operator-muted">{scenarioHelp}</p>
      {validScenarios.length === 0 ? (
        <Surface variant="muted" padding="md" className="border-dashed text-sm text-operator-muted">{emptyScenarioText}</Surface>
      ) : (
        <div className="grid gap-2">
          {validScenarios.map((card, index) => (
            <Surface key={card.id} variant="muted" padding="sm" className="grid gap-2">
              <span className="text-operator-ink">
                {index + 1}. {scenarioDisplayName(card, text.untitledScenario)}
              </span>
              {card.pageURL && <span className="mt-1 block truncate text-xs text-operator-muted">{card.pageURL}</span>}
              {card.steps.some((step) => step.trim()) && (
                <ol className="grid gap-1 text-sm leading-5 text-operator-muted">
                  {card.steps.filter((step) => step.trim()).slice(0, 3).map((step, stepIndex) => (
                    <li key={`${card.id}-${stepIndex}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                      <span className="text-[var(--sw-text-subtle)]">{stepIndex + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                  {card.steps.filter((step) => step.trim()).length > 3 && (
                    <li className="text-xs text-[var(--sw-text-subtle)]">+{card.steps.filter((step) => step.trim()).length - 3} {isDutch ? "meer" : "more"}</li>
                  )}
                </ol>
              )}
              {card.gitlabSource ? (
                <span className="mt-1 block truncate text-xs text-operator-muted" title={`${card.gitlabSource.repo ?? "GitLab"} #${card.gitlabSource.iid}: ${card.gitlabSource.title}`}>
                  GitLab #{card.gitlabSource.iid}: {card.gitlabSource.title}
                </span>
              ) : card.filePath ? (
                <span className="mt-1 block truncate font-mono text-xs text-operator-muted" title={card.filePath}>{card.filePath}</span>
              ) : null}
            </Surface>
          ))}
        </div>
      )}
    </Surface>
  );
}

function scenarioDisplayName(card: TestGoalReviewProps["validScenarios"][number], fallback: string): string {
  const moduleName = card.moduleName.trim();
  if (moduleName) return moduleName;
  if (card.gitlabSource?.title) return card.gitlabSource.title;
  if (card.filePath.trim()) return card.filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? card.filePath;
  return fallback;
}
