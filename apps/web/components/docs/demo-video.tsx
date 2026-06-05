"use client";

import { Pill } from "../ui/pill";

type DemoVideoProps = {
  src: string;
  poster: string;
  title: string;
  description: string;
  badge?: string;
};

export function DemoVideo({ src, poster, title, description, badge }: DemoVideoProps) {
  return (
    <div className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <video
        src={src}
        poster={poster}
        controls
        preload="none"
        className="w-full block"
      />
      <div className="px-4 py-3 flex items-start gap-3">
        {badge && (
          <Pill className="mt-0.5 shrink-0 text-[10px] uppercase tracking-widest text-violet-400">
            {badge}
          </Pill>
        )}
        <div>
          <p className="text-sm font-semibold text-slate-200 mb-0.5">{title}</p>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
