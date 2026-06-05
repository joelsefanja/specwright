import React from "react";
import { motion } from "framer-motion";
import { cn } from "./utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.75 }}
    className={cn("rounded-[var(--sw-radius-surface)] border border-border bg-card p-5 text-card-foreground shadow-sm", className)}
    {...props}
  />
));

Card.displayName = "Card";

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn("text-base font-semibold leading-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn("mt-1 text-sm leading-6 text-muted-foreground", className)} {...props} />;
}
