import React from "react";
import { cn } from "./utils";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "muted";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary/10 text-[hsl(var(--accent-foreground))]",
  success: "border-transparent bg-[color-mix(in_srgb,var(--sw-success)_10%,transparent)] text-[var(--sw-success)]",
  warning: "border-transparent bg-primary/10 text-[hsl(var(--accent-foreground))]",
  destructive: "border-transparent bg-destructive/10 text-destructive",
  muted: "border-transparent bg-secondary/50 text-muted-foreground",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn("inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-tight", variants[variant], className)} {...props} />;
}
