import React from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { workflowStepTransition, workflowStepVariants } from "@renderer/motion/presets";
import { Button } from "../../components/ui";
import type { WorkflowStepId } from "../workflowSteps";

interface StudioActionBarProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  helper?: React.ReactNode;
  title?: React.ReactNode;
}

interface StudioStepProps {
  stepId: WorkflowStepId;
  stepLabel: string;
  title: string;
  description: string;
  children: React.ReactNode;
  actionBar: StudioActionBarProps;
  width?: "standard" | "wide";
}

export function StudioStep({ stepId, stepLabel, title, description, children, actionBar, width = "standard" }: StudioStepProps): React.JSX.Element {
  return (
    <section className="operator-workflow-frame operator-studio-frame">
      <div className="operator-workflow-frame-inner operator-studio-frame-inner" data-width={width} data-step={stepId}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepId}
            className="operator-studio-step-body"
            variants={workflowStepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={workflowStepTransition}
          >
            <header className="operator-studio-header" data-step={stepId}>
              <p className="operator-studio-step-label">{formatStepLabel(stepId, stepLabel)}</p>
              <h1 className="operator-studio-title">{title}</h1>
              <p className="operator-studio-description">{description}</p>
            </header>
            <div className="operator-studio-content">
              {children}
            </div>
            <WorkflowActionBar {...actionBar} />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function formatStepLabel(stepId: WorkflowStepId, fallback: string): string {
  const labels: Record<WorkflowStepId, string> = {
    "connect-project": "01 / Project",
    "configure-access": "02 / Access",
    "describe-test": "03 / Process",
    "run-tests": "04 / Review",
  };
  return labels[stepId] ?? fallback;
}

export function WorkflowActionBar({ primary, secondary, helper, title }: StudioActionBarProps): React.JSX.Element {
  if (!primary && !secondary) return <></>;

  return (
    <footer className="operator-studio-action-bar">
      <div className="operator-studio-action-helper">
        {title && <span className="operator-studio-action-title">{title}</span>}
        {helper && <span className="operator-studio-action-copy">{helper}</span>}
      </div>
      <div className="operator-studio-action-buttons">
        {secondary}
        {primary}
      </div>
    </footer>
  );
}

export function BackButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <Button type="button" variant="secondary" disabled={disabled} onClick={onClick}>
      <ArrowLeft size={14} weight="bold" />
      {label}
    </Button>
  );
}
