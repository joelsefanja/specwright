import type { RefObject } from "react";
import { ThemeSelect } from "./ThemeSelect";

type WebsiteToTestSectionProps = {
  appUrlInputRef: RefObject<HTMLInputElement>;
  appUrlValue: string;
  environmentLabel?: string;
  environmentLabels: string[];
  isAppUrlConfigured: boolean;
  onAppUrlChange: (value: string) => void;
  onEnvironmentLabelChange: (value: string) => void;
  onSaveEnvironment: () => void;
  labels?: {
    title: string;
    description: string;
    set: string;
    needed: string;
    appUrl: string;
    appUrlPlaceholder: string;
    help: React.ReactNode;
    environment: string;
  };
};

function SidebarHeading({ title, description }: { title: string; description?: string }): React.JSX.Element {
  return (
    <div className="operator-sidebar-heading">
      <p className="operator-section-title">{title}</p>
      {description && <p>{description}</p>}
    </div>
  );
}

export function WebsiteToTestSection({
  appUrlInputRef,
  appUrlValue,
  environmentLabel,
  environmentLabels,
  isAppUrlConfigured,
  onAppUrlChange,
  onEnvironmentLabelChange,
  onSaveEnvironment,
  labels,
}: WebsiteToTestSectionProps): React.JSX.Element {
  const onAppUrlInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onAppUrlChange(event.target.value);
  };

  const onEnvironmentChange = (value: string): void => {
    onEnvironmentLabelChange(value);
    onSaveEnvironment();
  };

  return (
    <div className="operator-app-link-panel">
      <div className="flex items-center justify-between gap-3">
          <SidebarHeading
          title={labels?.title ?? "Website to test"}
          description={labels?.description ?? "The running app Specwright opens while creating the test."}
        />
        <span className={isAppUrlConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>
          {isAppUrlConfigured ? labels?.set ?? "Set" : labels?.needed ?? "Needed"}
        </span>
      </div>

      <div className="operator-app-link-field">
        <label className="operator-control-label">{labels?.appUrl ?? "App URL"}</label>
        <input
          ref={appUrlInputRef}
          type="text"
          value={appUrlValue}
          onChange={onAppUrlInputChange}
          onBlur={onSaveEnvironment}
          placeholder={labels?.appUrlPlaceholder ?? "https://app.example.com"}
          className="operator-field w-full px-3 py-3"
        />
        <p className="operator-field-help">
          {labels?.help ?? <>Specwright opens this app while it learns how the test should work. Relative page paths such as <span className="font-mono">/dashboard</span> start from here.</>}
        </p>
      </div>

      {environmentLabel && (
        <div>
          <label className="operator-control-label">{labels?.environment ?? "Environment label"}</label>
          <ThemeSelect
            value={environmentLabel}
            onChange={onEnvironmentChange}
            options={environmentLabels.map((label) => ({ value: label, label }))}
          />
        </div>
      )}
    </div>
  );
}
