import { motion } from "framer-motion";
import { cn } from "../ui/cn";
import type { PipelinePhase } from "./pipeline-types";

type DesktopPipelineFlowProps = {
  phases: PipelinePhase[];
  activePhase: number;
  beamProgress: number;
  selectedPhase: number | null;
  onSelectedPhaseChange: (selectedPhase: number | null) => void;
};

export function DesktopPipelineFlow({
  phases,
  activePhase,
  beamProgress,
  selectedPhase,
  onSelectedPhaseChange,
}: DesktopPipelineFlowProps) {
  return (
    <div className="hidden lg:block overflow-x-auto pb-6">
      <div className="relative min-w-[1100px] px-8 pt-6">
        {/* Beam track — top-[50px] = pt-6 (24px) + half circle height (26px) */}
        <div className="absolute top-[50px] left-16 right-16 h-[2px] bg-slate-800 rounded-full z-0" />

        {/* Animated beam fill */}
        <motion.div
          className="absolute top-[50px] left-16 h-[2px] rounded-full z-0"
          style={{ background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981, #f97316, #eab308)" }}
          animate={{ width: `calc(${beamProgress}% - 4rem)` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />

        {/* Phase nodes */}
        <div className="relative flex justify-between items-start z-10">
          {phases.map((phase, phaseIndex) => (
            // relative + z-index on the column so the active button's shadow
            // paints above its neighbours (later DOM siblings otherwise cover it)
            <div
              key={phase.id}
              className="relative flex flex-col items-center gap-3 w-[96px]"
              style={{ zIndex: activePhase === phaseIndex ? 20 : 1 }}
            >
              {/* Node circle — pulse via box-shadow so it never overflows layout */}
              <motion.button
                onClick={() => onSelectedPhaseChange(selectedPhase === phaseIndex ? null : phaseIndex)}
                className={cn(
                  "relative w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center text-xl cursor-pointer shrink-0",
                  activePhase >= phaseIndex ? "border-current" : "border-slate-700 bg-slate-900"
                )}
                style={{ borderColor: activePhase >= phaseIndex ? phase.color : undefined }}
                animate={{
                  backgroundColor: activePhase >= phaseIndex ? `${phase.color}20` : "#0f172a",
                  // box-shadow pulse stays inside layout box — no overflow clipping ever
                  boxShadow:
                    activePhase === phaseIndex
                      ? [
                          `0 0 0 0px ${phase.color}cc, 0 0 20px 4px ${phase.color}40`,
                          `0 0 0 18px ${phase.color}00, 0 0 20px 4px ${phase.color}40`,
                        ]
                      : `0 0 0 0px ${phase.color}00, 0 0 0 0px ${phase.color}00`,
                }}
                transition={{
                  backgroundColor: { duration: 0.3 },
                  boxShadow: activePhase === phaseIndex
                    ? { repeat: Infinity, duration: 1.1, ease: "easeOut" }
                    : { duration: 0.3 },
                }}
              >
                {phase.isGate && activePhase === phaseIndex ? (
                  <motion.span
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    ⏸️
                  </motion.span>
                ) : (
                  <span>{phase.icon}</span>
                )}
              </motion.button>

              {/* Phase label */}
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-semibold transition-colors duration-300",
                    activePhase >= phaseIndex ? "text-white" : "text-slate-500"
                  )}
                  style={{ color: activePhase >= phaseIndex ? phase.color : undefined }}
                >
                  P{phase.id}
                </p>
                <p className={cn("text-[11px] mt-0.5", activePhase >= phaseIndex ? "text-slate-300" : "text-slate-600")}>
                  {phase.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
