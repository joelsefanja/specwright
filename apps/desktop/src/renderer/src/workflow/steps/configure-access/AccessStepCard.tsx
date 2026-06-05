import React from "react";
import { StatusPill, Surface } from "../../../components/ui";

interface AccessStepCardProps {
  number: number;
  title: string;
  status: string;
  ready: boolean;
  primary?: boolean;
  children: React.ReactNode;
}

export function AccessStepCard({ number, title, status, ready, primary = false, children }: AccessStepCardProps): React.JSX.Element {
  return (
    <Surface as="section" variant={primary ? "raised" : "default"} padding="lg" className={primary ? "operator-access-card operator-access-card-primary" : "operator-access-card"}>
      <div className="operator-access-card-head">
        <div className="operator-access-step-label"><span>{number}</span>{title}</div>
        <StatusPill status={ready ? "success" : "warning"} dot className="operator-access-status">
          {status}
        </StatusPill>
      </div>
      {children}
    </Surface>
  );
}
