import { AnimatePresence, motion } from "framer-motion";
import type { PipelinePhase } from "./pipeline-types";

type PhaseDetailCardProps = {
  phase: PipelinePhase | null;
};

export function PhaseDetailCard({ phase }: PhaseDetailCardProps) {
  return (
    <AnimatePresence>
      {phase && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="mt-6 mx-auto max-w-lg rounded-xl border bg-slate-900/80 backdrop-blur-sm p-5"
          style={{ borderColor: phase.color + "50" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{phase.icon}</span>
            <div>
              <h3 className="font-semibold text-white">Phase {phase.id}: {phase.label}</h3>
              <p className="text-sm text-slate-400">{phase.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-slate-500 mb-1">Reads</p>
              <p className="text-slate-200 font-mono">{phase.reads}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-slate-500 mb-1">Writes</p>
              <p className="text-slate-200 font-mono">{phase.writes}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-slate-500 mb-1">Agent</p>
              <p className="text-slate-200 font-mono text-[10px]">{phase.agent}</p>
            </div>
          </div>
          {phase.isGate && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              ⛔ Pipeline pauses here — review the exploration output before approving generation.
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
