import React from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { cx, MutedText, SectionTitle } from "./ui";
import { StatusPill, Surface } from "../ui";

type Status = "ready" | "needed" | "pending" | "running" | "done" | "error" | "skipped";

interface WorkflowSectionProps extends React.HTMLAttributes<HTMLElement> {
  number?: number;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  accent?: boolean;
  sticky?: boolean;
}

export function WorkflowSection({ number, title, description, action, accent = false, sticky = false, className, children, ...props }: WorkflowSectionProps): React.JSX.Element {
  return (
    <motion.section
      {...props}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.8 }}
      className={cx("operator-numbered-section", accent && "operator-action-strip", sticky && "operator-workflow-action-footer", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle className={number ? "operator-numbered-title" : undefined}>
            {number != null && <span className="operator-numbered-marker">{number}</span>}
            {title}
          </SectionTitle>
          {description && <MutedText>{description}</MutedText>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

interface ActionPanelProps extends React.HTMLAttributes<HTMLElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action: React.ReactNode;
  sticky?: boolean;
  children?: React.ReactNode;
}

export function ActionPanel({ title, description, action, sticky = false, className, children, ...props }: ActionPanelProps): React.JSX.Element {
  return (
    <motion.section
      {...props}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.8 }}
      className={cx("operator-numbered-section operator-numbered-action operator-action-strip", sticky && "operator-workflow-action-footer", className)}
    >
      <div className="min-w-0">
        <SectionTitle>{title}</SectionTitle>
        {description && <MutedText>{description}</MutedText>}
      </div>
      {action}
      {children}
    </motion.section>
  );
}

interface StatusBadgeProps {
  status: Status;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps): React.JSX.Element {
  const variant = status === "done" || status === "ready"
    ? "success"
    : status === "error" || status === "needed"
      ? "warning"
      : status === "running"
        ? "default"
        : "muted";

  return <StatusPill status={variant === "default" ? "info" : variant} className={className}>{children}</StatusPill>;
}

export interface ReadinessItem {
  label: string;
  description?: string;
  ready: boolean;
  action?: () => void;
}

interface ReadinessListProps {
  items: ReadinessItem[];
  doneLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}

export function ReadinessList({ items, doneLabel, pendingLabel, disabled = false }: ReadinessListProps): React.JSX.Element {
  return (
    <div className="operator-readiness-list-redesign">
      {items.map((item) => {
        const Icon = item.ready ? CheckCircle : WarningCircle;
        const isDisabled = disabled || !item.action;
        return (
          <motion.button key={item.label} type="button" className="operator-readiness-row" data-ready={item.ready} disabled={isDisabled} onClick={item.action}>
            <Icon size={16} weight={item.ready ? "fill" : "bold"} />
            <span className="min-w-0">
              <span className="block font-semibold text-operator-ink">{item.label}</span>
              <span className="block text-xs text-operator-muted">{item.description ?? (item.ready && item.action ? doneLabel : item.ready ? doneLabel : pendingLabel)}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

interface SummaryListProps<T> {
  items: T[];
  empty: React.ReactNode;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function SummaryList<T>({ items, empty, renderItem }: SummaryListProps<T>): React.JSX.Element {
  if (items.length === 0) return <Surface variant="muted" padding="md" className="operator-summary-card border-dashed py-4 text-sm text-operator-muted">{empty}</Surface>;
  return <div className="grid gap-2">{items.map(renderItem)}</div>;
}

interface FlowPreviewProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  progress?: boolean;
}

export function FlowPreview<T>({ items, renderItem, progress = false }: FlowPreviewProps<T>): React.JSX.Element {
  return <div className={progress ? "operator-flow-progress" : "operator-flow-preview"}>{items.map(renderItem)}</div>;
}
