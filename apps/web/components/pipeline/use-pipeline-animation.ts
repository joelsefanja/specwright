import { useEffect, useState } from "react";

type PipelineAnimationState = {
  activePhase: number;
  beamProgress: number;
};

export function usePipelineAnimation(isInView: boolean, phaseCount: number): PipelineAnimationState {
  const [activePhase, setActivePhase] = useState<number>(-1);
  const [beamProgress, setBeamProgress] = useState(0);

  useEffect(() => {
    if (!isInView) {
      return;
    }

    let phase = 0;
    let resetTimeout: ReturnType<typeof setTimeout> | undefined;

    resetTimeout = setTimeout(() => {
      setActivePhase(-1);
      setBeamProgress(0);
    }, 0);

    const interval = setInterval(() => {
      if (phase >= phaseCount) {
        resetTimeout = setTimeout(() => {
          phase = 0;
          setActivePhase(-1);
          setBeamProgress(0);
        }, 2000);
        clearInterval(interval);
        return;
      }

      setActivePhase(phase);
      setBeamProgress(((phase + 1) / phaseCount) * 100);
      phase++;
    }, 700);

    return () => {
      clearInterval(interval);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [isInView, phaseCount]);

  return { activePhase, beamProgress };
}
