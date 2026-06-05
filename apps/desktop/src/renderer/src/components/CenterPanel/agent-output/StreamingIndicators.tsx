import React from "react";

export function StreamingDots({ className = "h-5" }: { className?: string }): React.JSX.Element {
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:300ms]" />
    </span>
  );
}

export function StreamingCursor({ className = "h-4" }: { className?: string }): React.JSX.Element {
  return <span className={`ml-0.5 inline-block w-0.5 animate-pulse bg-brand-400 align-middle ${className}`} />;
}
