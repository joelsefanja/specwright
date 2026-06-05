import type { HTMLAttributes } from "react";

type PillProps = HTMLAttributes<HTMLSpanElement>;

export function Pill({ className = "", ...props }: PillProps) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border border-transparent bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-300 ${className}`}
      {...props}
    />
  );
}
