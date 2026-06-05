import React from "react";
import { Button as ShadButton, Card as ShadCard, CardDescription, CardTitle, cn } from "../ui";

type ClassValue = string | false | null | undefined;

export function cx(...classes: ClassValue[]): string {
  return cn(...classes);
}

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  compact?: boolean;
}

export function Button({ variant = "secondary", compact = false, className, ...props }: ButtonProps): React.JSX.Element {
  return (
    <ShadButton
      {...props}
      variant={variant === "primary" ? "default" : "secondary"}
      size={compact ? "sm" : "default"}
      className={className}
    />
  );
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "aside";
}

export function Card({ as: Component = "div", className, ...props }: CardProps): React.JSX.Element {
  if (Component === "aside") return <aside {...props} className={cn("rounded-lg border border-border bg-card/70 p-4 text-card-foreground", className)} />;
  return <ShadCard {...props} className={className} />;
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <CardTitle {...props} className={className} />;
}

export function MutedText({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <CardDescription {...props} className={className} />;
}
