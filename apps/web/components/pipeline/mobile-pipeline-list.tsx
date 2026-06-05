import { motion } from "framer-motion";
import type { PipelinePhase } from "./pipeline-types";

type MobilePipelineListProps = {
  phases: PipelinePhase[];
  activePhase: number;
};

export function MobilePipelineList({ phases, activePhase }: MobilePipelineListProps) {
  return (
    <div className="lg:hidden mt-6 space-y-3">
      {phases.map((phase, phaseIndex) => (
        <motion.div
          key={phase.id}
          className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50"
          animate={{ borderColor: activePhase >= phaseIndex ? phase.color + "50" : undefined }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 border-2 transition-colors duration-300"
            style={{ borderColor: activePhase >= phaseIndex ? phase.color : "#334155" }}
          >
            {phase.icon}
          </div>
          <div>
            <p className="text-sm font-medium text-white">Phase {phase.id}: {phase.label}</p>
            <p className="text-xs text-slate-400">{phase.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
