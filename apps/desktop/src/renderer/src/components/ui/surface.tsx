import React from "react";
import { motion } from "framer-motion";
import { cn } from "./utils";

type SurfaceVariant = "default" | "muted" | "raised" | "accent" | "success";
type SurfacePadding = "none" | "sm" | "md" | "lg";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "aside" | "section";
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
  interactive?: boolean;
}

const variants: Record<SurfaceVariant, string> = {
  default: "border-[var(--sw-line)] bg-[var(--sw-surface-card)]",
  muted: "border-[var(--sw-line)] bg-[var(--sw-surface-card-muted)]",
  raised: "border-[var(--sw-line)] bg-[var(--sw-surface-raised)] shadow-[var(--sw-shadow-card)]",
  accent: "border-[color-mix(in_srgb,var(--sw-accent)_24%,var(--sw-line))] bg-[var(--sw-surface-accent)]",
  success: "border-[color-mix(in_srgb,var(--sw-success)_24%,var(--sw-line))] bg-[var(--sw-surface-success)]",
};

const paddings: Record<SurfacePadding, string> = {
  none: "p-0",
  sm: "p-[var(--sw-space-3)]",
  md: "p-[var(--sw-space-4)]",
  lg: "p-[var(--sw-space-5)]",
};

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ as = "div", className, variant = "default", padding = "md", ...props }, ref) => {
    const MotionSurface = as === "aside" ? motion.aside : as === "section" ? motion.section : motion.div;

    return (
      <MotionSurface
      ref={ref}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      className={cn("rounded-[var(--sw-radius-card)] border", variants[variant], paddings[padding], className)}
      {...props}
      />
    );
  },
);

Surface.displayName = "Surface";
