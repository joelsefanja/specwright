import React from "react";
import { cn } from "./utils";

type IconBubbleTone = "default" | "accent" | "success" | "warning";

export interface IconBubbleProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: IconBubbleTone;
  children: React.ReactNode;
}

const tones: Record<IconBubbleTone, string> = {
  default: "border-[var(--sw-line)] bg-[color-mix(in_srgb,var(--sw-field)_76%,transparent)] text-[var(--sw-text-muted)]",
  accent: "border-[color-mix(in_srgb,var(--sw-accent)_28%,var(--sw-line))] bg-[color-mix(in_srgb,var(--sw-accent)_9%,var(--sw-field))] text-[var(--sw-accent-strong)]",
  success: "border-[color-mix(in_srgb,var(--sw-success)_28%,var(--sw-line))] bg-[color-mix(in_srgb,var(--sw-success)_9%,var(--sw-field))] text-[color-mix(in_srgb,var(--sw-success)_82%,var(--sw-text))]",
  warning: "border-[color-mix(in_srgb,var(--sw-warning)_28%,var(--sw-line))] bg-[color-mix(in_srgb,var(--sw-warning)_9%,var(--sw-field))] text-[color-mix(in_srgb,var(--sw-warning)_82%,var(--sw-text))]",
};

export function IconBubble({ className, tone = "accent", children, ...props }: IconBubbleProps): React.JSX.Element {
  return (
    <span className={cn("inline-flex h-[calc(40px*var(--sw-ui-scale))] w-[calc(40px*var(--sw-ui-scale))] flex-shrink-0 items-center justify-center rounded-[var(--sw-radius-icon)] border", tones[tone], className)} {...props}>
      {children}
    </span>
  );
}
