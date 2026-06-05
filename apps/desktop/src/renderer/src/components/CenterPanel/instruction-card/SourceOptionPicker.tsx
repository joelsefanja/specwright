import React from "react";
import { ArrowRight, FileArrowUp, GitBranch, PencilSimpleLine } from "@phosphor-icons/react";

type SourceMode = "brief" | "file" | "gitlab";

interface SourceOptionPickerProps {
  active: SourceMode;
  labels: {
    fileHelp: string;
    fileAction: string;
    fileTitle: string;
    gitlabHelp: string;
    gitlabAction: string;
    gitlabTitle: string;
    ownHelp: string;
    ownAction: string;
    ownTitle: string;
  };
  onSelect: (mode: SourceMode) => void;
}

export function SourceOptionPicker({ active, labels, onSelect }: SourceOptionPickerProps): React.JSX.Element {
  return (
    <div className="operator-source-option-grid" aria-label="Source type">
      <SourceOption active={active === "gitlab"} featured icon={<GitBranch size={18} weight="bold" />} title={labels.gitlabTitle} help={labels.gitlabHelp} action={labels.gitlabAction} onClick={() => onSelect("gitlab")} />
      <SourceOption active={active === "brief"} icon={<PencilSimpleLine size={16} weight="bold" />} title={labels.ownTitle} help={labels.ownHelp} action={labels.ownAction} onClick={() => onSelect("brief")} />
      <SourceOption active={active === "file"} icon={<FileArrowUp size={16} weight="bold" />} title={labels.fileTitle} help={labels.fileHelp} action={labels.fileAction} onClick={() => onSelect("file")} />
    </div>
  );
}

function SourceOption({ active, action, featured = false, help, icon, onClick, title }: { active: boolean; action: string; featured?: boolean; help: string; icon: React.ReactNode; onClick: () => void; title: string }): React.JSX.Element {
  return (
    <button type="button" className="operator-source-option" data-active={active} data-featured={featured} aria-pressed={active} onClick={onClick}>
      <span className="operator-source-option-icon">{icon}</span>
      <span className="operator-source-option-copy">
        <span className="operator-source-option-title">{title}</span>
        <span className="operator-source-option-help">{help}</span>
        <span className="operator-source-option-action" aria-hidden="true">
          {action}
          <ArrowRight size={13} weight="bold" />
        </span>
      </span>
    </button>
  );
}
