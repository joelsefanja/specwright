export type PipelinePhase = {
  id: number;
  label: string;
  description: string;
  icon: string;
  color: string;
  glow: string;
  reads: string;
  writes: string;
  agent: string;
  isGate?: boolean;
};
