"use client";

import { motion } from "framer-motion";
import type { QuickStartStep, QuickStartVideo } from "./quick-start-data";

type QuickStartStepCardProps = {
  step: QuickStartStep;
  stepIndex: number;
};

export function QuickStartStepCard({ step, stepIndex }: QuickStartStepCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: stepIndex * 0.08 }}
      className="flex gap-4"
    >
      {/* Step number */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-400 mt-1">
        {stepIndex + 1}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium mb-2">{step.title}</p>
        <div className="rounded-xl bg-slate-900 border border-slate-700/60 overflow-hidden">
          <pre className="p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed font-mono">
            <code>{step.code}</code>
          </pre>
        </div>
        {step.note && (
          <p className="text-xs text-slate-500 mt-1.5 ml-1">{step.note}</p>
        )}
      </div>
    </motion.div>
  );
}

type QuickStartDemoVideoProps = {
  video: QuickStartVideo;
  delay: number;
};

export function QuickStartDemoVideo({ video, delay }: QuickStartDemoVideoProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="mt-6"
    >
      <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">
        {video.label}
      </p>
      <div className="rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900">
        <video
          key={video.src}
          src={video.src}
          poster={video.poster}
          controls
          preload="none"
          className="w-full"
        />
      </div>
    </motion.div>
  );
}
