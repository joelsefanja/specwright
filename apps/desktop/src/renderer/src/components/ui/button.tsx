import React from "react";
import { cn } from "./utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  default: "border-[var(--sw-accent)] bg-[var(--sw-accent)] text-[var(--sw-on-accent)] shadow-[0_8px_18px_color-mix(in_srgb,var(--sw-accent)_18%,transparent)] hover:border-[var(--sw-accent-strong)] hover:bg-[var(--sw-accent-strong)] hover:text-[var(--sw-on-accent)]",
  secondary: "border-border bg-card text-foreground hover:border-[var(--sw-line-strong)] hover:bg-secondary",
  ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
};

const sizes: Record<ButtonSize, string> = {
  default: "min-h-[var(--sw-control-height)] px-5 py-2 text-[length:var(--sw-font-size-small)]",
  sm: "min-h-[var(--sw-control-height-sm)] px-4 py-1.5 text-[length:var(--sw-font-size-label)]",
  icon: "h-[var(--sw-icon-hit)] w-[var(--sw-icon-hit)] p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "secondary", size = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex w-fit max-w-full items-center justify-center gap-2 rounded-[var(--sw-radius-control)] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:border-[color-mix(in_srgb,var(--sw-line)_86%,var(--sw-bg))] disabled:bg-[color-mix(in_srgb,var(--sw-field)_62%,var(--sw-bg))] disabled:text-[color-mix(in_srgb,var(--sw-text-muted)_82%,transparent)]",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
));

Button.displayName = "Button";
