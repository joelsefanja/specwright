import React from "react";
import { DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import { Button, ModalShell } from "../../../components/ui";

interface InstallRequirementsModalProps {
  installError: string | null;
  installingAction: RequirementInstallAction | null;
  isChecking: boolean;
  isDutch: boolean;
  logs: string[];
  open: boolean;
  requirements: RequirementsResult | null;
  onInstall: (action: RequirementInstallAction) => void;
  onOpenChange: (open: boolean) => void;
  onRecheck: () => void;
}

export function InstallRequirementsModal({ installError, installingAction, isChecking, isDutch, logs, open, requirements, onInstall, onOpenChange, onRecheck }: InstallRequirementsModalProps): React.JSX.Element {
  const text = copy(isDutch);
  const fixableActions = uniqueActions(requirements?.checks ?? []);
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      description={text.description}
      icon={<WarningCircle size={18} weight="duotone" />}
      size="lg"
      closeLabel={isDutch ? "Sluiten" : "Close"}
      footer={(
        <>
          <p className="operator-field-help m-0 flex-1">{text.footer}</p>
          <Button type="button" variant="secondary" disabled={isChecking || Boolean(installingAction)} onClick={onRecheck}>{text.recheck}</Button>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>{isDutch ? "Sluiten" : "Close"}</Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          {(requirements?.checks ?? []).map((check) => (
            <div key={check.key} className="rounded-[var(--sw-radius-card)] border border-border bg-card/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-foreground">{labelFor(check.key, isDutch)}</p>
                  <p className="operator-field-help m-0">{check.message}</p>
                  {check.detail && <p className="operator-field-help m-0 opacity-80">{check.detail}</p>}
                </div>
                <span className={statusClass(check.status)}>{statusLabel(check.status, isDutch)}</span>
              </div>
            </div>
          ))}
        </div>

        {fixableActions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fixableActions.map((action) => (
              <Button key={action} type="button" variant="secondary" disabled={isChecking || Boolean(installingAction)} onClick={() => onInstall(action)}>
                <DownloadSimple size={14} weight="bold" />
                {installingAction === action ? text.installing : actionLabel(action, isDutch)}
              </Button>
            ))}
          </div>
        )}

        {installError && <p className="operator-danger m-0 text-sm">{installError}</p>}
        {logs.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded-[var(--sw-radius-card)] border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">{logs.slice(-20).join("\n")}</pre>
        )}
      </div>
    </ModalShell>
  );
}

function uniqueActions(checks: RequirementCheck[]): RequirementInstallAction[] {
  return [...new Set(checks.map((check) => check.status !== "pass" ? check.installAction : undefined).filter(Boolean))] as RequirementInstallAction[];
}

function copy(isDutch: boolean): { title: string; description: string; footer: string; recheck: string; installing: string } {
  return isDutch
    ? {
      title: "Benodigdheden installeren",
      description: "Specwright controleert wat nodig is om de test veilig te starten.",
      footer: "Alleen projectdependencies en Playwright Chromium worden automatisch geïnstalleerd.",
      recheck: "Opnieuw controleren",
      installing: "Installeren...",
    }
    : {
      title: "Install requirements",
      description: "Specwright checks what is needed before starting the test run.",
      footer: "Only project dependencies and Playwright Chromium are installed automatically.",
      recheck: "Re-check",
      installing: "Installing...",
    };
}

function labelFor(key: RequirementCheck["key"], isDutch: boolean): string {
  const labels: Record<RequirementCheck["key"], [string, string]> = {
    node: ["Node.js", "Node.js"],
    npm: ["npm", "npm"],
    "package-manager": ["Package manager", "Package manager"],
    "project-bootstrap": ["Specwright project", "Specwright project"],
    "node-modules": ["Projectdependencies", "Project dependencies"],
    "playwright-cli": ["Playwright CLI", "Playwright CLI"],
    "playwright-chromium": ["Playwright Chromium", "Playwright Chromium"],
    "opencode-cli": ["OpenCode CLI", "OpenCode CLI"],
    "opencode-server": ["OpenCode server", "OpenCode server"],
    glab: ["GitLab CLI", "GitLab CLI"],
  };
  return labels[key][isDutch ? 0 : 1];
}

function actionLabel(action: RequirementInstallAction, isDutch: boolean): string {
  if (action === "project-dependencies") return isDutch ? "Dependencies installeren" : "Install dependencies";
  return isDutch ? "Chromium installeren" : "Install Chromium";
}

function statusLabel(status: RequirementStatus, isDutch: boolean): string {
  if (status === "pass") return isDutch ? "Klaar" : "Ready";
  if (status === "warning") return isDutch ? "Let op" : "Guidance";
  return isDutch ? "Nodig" : "Required";
}

function statusClass(status: RequirementStatus): string {
  if (status === "pass") return "rounded-full border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-600";
  if (status === "warning") return "rounded-full border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-600";
  return "rounded-full border border-destructive/30 px-2 py-0.5 text-xs font-semibold text-destructive";
}
