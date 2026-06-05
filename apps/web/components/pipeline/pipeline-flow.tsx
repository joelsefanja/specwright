"use client";
import { useRef, useState } from "react";
import { useInView } from "framer-motion";
import { DesktopPipelineFlow } from "./desktop-pipeline-flow";
import { MobilePipelineList } from "./mobile-pipeline-list";
import { PhaseDetailCard } from "./phase-detail-card";
import { PIPELINE_PHASES } from "./pipeline-phases";
import { usePipelineAnimation } from "./use-pipeline-animation";

export function PipelineFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const { activePhase, beamProgress } = usePipelineAnimation(isInView, PIPELINE_PHASES.length);
  const selected = selectedPhase !== null ? PIPELINE_PHASES[selectedPhase] : null;

  return (
    <div ref={ref} className="w-full">
      <DesktopPipelineFlow
        phases={PIPELINE_PHASES}
        activePhase={activePhase}
        beamProgress={beamProgress}
        selectedPhase={selectedPhase}
        onSelectedPhaseChange={setSelectedPhase}
      />
      <PhaseDetailCard phase={selected} />
      <MobilePipelineList phases={PIPELINE_PHASES} activePhase={activePhase} />
    </div>
  );
}
