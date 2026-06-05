import React from "react";
import { cn } from "./utils";

export interface SettingsRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "default" | "warning" | "danger";
  className?: string;
}

export function SettingsRow({ title, description, control, children, tone = "default", className }: SettingsRowProps): React.JSX.Element {
  return (
    <div className={cn("operator-settings-row", tone !== "default" && `operator-settings-row-${tone}`, className)}>
      <div className="operator-settings-row-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
        {children}
      </div>
      {control && <div className="operator-settings-row-control">{control}</div>}
    </div>
  );
}
