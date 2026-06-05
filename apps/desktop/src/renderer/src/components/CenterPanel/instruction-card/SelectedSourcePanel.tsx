import React from "react";
import { CaretDown, FileText, X } from "@phosphor-icons/react";
import { StatusPill } from "../../ui";

interface SelectedIssue {
  iid: string;
  title: string;
  updatedAt?: string;
}

interface SelectedSourcePanelProps {
  children?: React.ReactNode;
  filePath?: string;
  fetchingLabel: string;
  fileLabel: string;
  clearLabel: string;
  hidePreviewLabel: string;
  previewLabel: string;
  previewUnavailableLabel: string;
  repoLabel: string;
  selectedIssue: SelectedIssue | null;
  showPreview: boolean;
  updatedLabel: string;
  formatDate: (value?: string) => string | null;
  onClear: () => void;
  onTogglePreview: () => void;
}

export function SelectedSourcePanel(props: SelectedSourcePanelProps): React.JSX.Element {
  const { filePath, selectedIssue } = props;
  return (
    <div className="operator-selected-source" data-open={props.showPreview}>
      {selectedIssue && (
        <div className="operator-selected-issue">
          <div className="flex min-w-0 items-center gap-2">
            <StatusPill status="info" size="xs">GitLab issue</StatusPill>
            <p className="operator-text truncate" title={selectedIssue.title}>{selectedIssue.title}</p>
          </div>
          <div className="operator-selected-meta">
            <span>{props.repoLabel}</span>
            <span>#{selectedIssue.iid}</span>
            <span>{props.updatedLabel} {props.formatDate(selectedIssue.updatedAt) ?? "-"}</span>
          </div>
        </div>
      )}
      <div className="operator-selected-file-row">
        <button type="button" className="operator-selected-file-toggle" disabled={!filePath} onClick={props.onTogglePreview} aria-expanded={props.showPreview}>
          <FileText size={16} weight="duotone" />
          <span className="operator-label">{props.fileLabel}</span>
          <span className="operator-selected-file-name operator-text-muted font-mono truncate" title={filePath}>{filePath ? filePath.split("/").pop() : props.fetchingLabel}</span>
          <span className="operator-selected-preview-label">{props.showPreview ? props.hidePreviewLabel : props.previewLabel}</span>
          <CaretDown size={15} weight="bold" className={props.showPreview ? "operator-selected-caret operator-selected-caret-open" : "operator-selected-caret"} />
        </button>
        {!filePath && <p className="operator-field-help m-0">{props.previewUnavailableLabel}</p>}
        <button type="button" onClick={props.onClear} className="operator-selected-clear" aria-label={props.clearLabel}>
          <X size={13} weight="bold" />
          {props.clearLabel}
        </button>
      </div>
      {props.children}
    </div>
  );
}
