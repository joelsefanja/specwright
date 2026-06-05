import React from "react";
import { cn } from "./utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return <label className={cn("text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)} {...props} />;
}

export function FieldHelp({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn("mt-1 text-xs leading-5 text-muted-foreground", className)} {...props} />;
}

export function FieldLabelText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn("text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)} {...props} />;
}
