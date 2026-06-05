import fs from "fs";
import path from "path";

export interface PipelineContextFiles {
  plan: string;
  seed: string;
  conventions: string;
}

const EMPTY_CONTEXT_FILES: PipelineContextFiles = {
  plan: "",
  seed: "",
  conventions: "",
};

const AGENT_INSTRUCTION_PATHS = [
  ".claude/agents/code-generator.md",
  ".claude/agents/bdd-generator.md",
];

const DEFAULT_CONVENTIONS = [
  "- Import fixtures from: e2e-tests/playwright/fixtures.js",
  "- Shared steps in: e2e-tests/features/playwright-bdd/shared/",
  "- processDataTable + validateExpectations from: e2e-tests/utils/stepHelpers.js",
  "- 3-column data tables: Field Name | Value | Type",
].join("\n");

export function readPipelineContextFiles(projectPath: string | undefined): PipelineContextFiles {
  if (!projectPath) {
    return EMPTY_CONTEXT_FILES;
  }

  const planContent = readMostRecentPlanFile(projectPath);
  const seedContent = readProjectFile(projectPath, "e2e-tests/playwright/generated/seed.spec.js");
  const conventions = readPipelineConventions(projectPath);

  return { plan: planContent, seed: seedContent, conventions };
}

function readProjectFile(projectPath: string, relativePath: string): string {
  const filePath = path.join(projectPath, relativePath);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }

  return "";
}

function readMostRecentPlanFile(projectPath: string): string {
  const plansDirectoryPath = path.join(projectPath, "e2e-tests/plans");
  if (!fs.existsSync(plansDirectoryPath)) {
    return "";
  }

  const planFileNames = fs.readdirSync(plansDirectoryPath)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith("-plan.md"))
    .sort((firstFileName, secondFileName) => {
      const firstModifiedAt = fs.statSync(path.join(plansDirectoryPath, firstFileName)).mtimeMs;
      const secondModifiedAt = fs.statSync(path.join(plansDirectoryPath, secondFileName)).mtimeMs;
      return secondModifiedAt - firstModifiedAt;
    });

  if (planFileNames.length === 0) {
    return "";
  }

  return fs.readFileSync(path.join(plansDirectoryPath, planFileNames[0]), "utf-8");
}

function readPipelineConventions(projectPath: string): string {
  const agentContents: string[] = [];

  for (const relativePath of AGENT_INSTRUCTION_PATHS) {
    const content = readProjectFile(projectPath, relativePath);
    if (content) {
      const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
      const agentName = path.basename(relativePath, ".md");
      agentContents.push(`## ${agentName} agent instructions\n\n${body}`);
    }
  }

  const testConfigContent = readProjectFile(projectPath, "e2e-tests/data/testConfig.js");
  if (testConfigContent) {
    agentContents.push(`## testConfig.js (routes and timeouts)\n\`\`\`javascript\n${testConfigContent}\n\`\`\``);
  }

  if (agentContents.length === 0) {
    return DEFAULT_CONVENTIONS;
  }

  return agentContents.join("\n\n---\n\n");
}
