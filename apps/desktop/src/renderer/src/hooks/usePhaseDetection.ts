import { MAX_PHASE_ID } from "@renderer/store/pipeline.store";

export const TOOL_TO_PHASE: Record<string, number> = {
  "e2e-process": 3,
  "e2e-plan": 4,
  "e2e-validate": 5,
  "e2e-generate": 7,
  "e2e-heal": 8,

  "input-processor": 3,
  "jira-processor": 3,
  "playwright-test-planner": 4,
  "playwright-test-generator": 7,
  "bdd-generator": 7,
  "code-generator": 7,
  "execution-manager": 8,
  "playwright-test-healer": 8,
  "_review-agent": 10,
};

export function detectPhaseFromTool(toolName: string, toolDetail: string): number | null {
  if (toolName === "Skill" && toolDetail) {
    const skillName = toolDetail.replace(/^\//, "");
    if (TOOL_TO_PHASE[skillName] !== undefined) return TOOL_TO_PHASE[skillName];
  }
  if (toolName === "Agent" && toolDetail) {
    for (const [agentKey, phaseId] of Object.entries(TOOL_TO_PHASE)) {
      if (toolDetail.toLowerCase().includes(agentKey.toLowerCase())) return phaseId;
    }
  }
  return null;
}

export function detectPhaseFromText(text: string, currentPhase: number): number | null {
  if (currentPhase >= MAX_PHASE_ID) return null;
  const regex = /###\s*Phase\s+(\d+)/gi;
  let match: RegExpExecArray | null;
  let candidate: number | null = null;
  while ((match = regex.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > currentPhase && n <= MAX_PHASE_ID) {
      if (candidate === null || n < candidate) candidate = n;
    }
  }
  return candidate;
}
