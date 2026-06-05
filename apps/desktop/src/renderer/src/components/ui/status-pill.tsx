import React from "react";
import { cn } from "./utils";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: "success" | "warning" | "danger" | "muted" | "info" | "running";
  size?: "xs" | "sm";
  dot?: boolean;
}

export function StatusPill({ status = "muted", size = "sm", dot = false, className, children, ...props }: StatusPillProps): React.JSX.Element {
  return (
    <span className={cn("operator-status-pill", `operator-status-pill-${status}`, `operator-status-pill-${size}`, className)} {...props}>
      {dot && <span className="operator-status-pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
