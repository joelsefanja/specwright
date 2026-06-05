import * as fs from "fs";
import * as path from "path";

const SPECWRIGHT_CONTEXT = "You are running inside Specwright, an E2E test automation desktop app.";

function removeFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\n?/, "").trim();
}

function readPromptBody(filePath: string): string {
  return removeFrontmatter(fs.readFileSync(filePath, "utf-8"));
}

function collectInlineSkillPrompts(projectSkillsDir: string): string[] {
  const inlinedPrompts: string[] = [];

  if (!fs.existsSync(projectSkillsDir)) {
    return inlinedPrompts;
  }

  const entries = fs.readdirSync(projectSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "e2e-automate") {
      continue;
    }

    const skillPath = path.join(projectSkillsDir, entry.name, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      const skillBody = readPromptBody(skillPath);
      inlinedPrompts.push(`### /${entry.name}\n\n${skillBody}`);
    }
  }

  return inlinedPrompts;
}

function collectInlineAgentPrompts(projectPath: string): string[] {
  const inlinedPrompts: string[] = [];
  const agentDirs = [path.join(projectPath, ".claude/agents"), path.join(projectPath, ".claude_agents")];

  for (const agentsDir of agentDirs) {
    collectAgentPromptFiles(agentsDir, inlinedPrompts);
  }

  return inlinedPrompts;
}

function collectAgentPromptFiles(agentsDir: string, inlinedPrompts: string[]): void {
  if (!fs.existsSync(agentsDir)) return;
  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(agentsDir, entry.name);
    if (entry.isDirectory()) {
      collectAgentPromptFiles(entryPath, inlinedPrompts);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const agentPath = entryPath;
    const agentBody = readPromptBody(agentPath);
    const agentName = entry.name.replace(".md", "");
    inlinedPrompts.push(`### @${agentName}\n\n${agentBody}`);
  }
}

function buildInlineReferenceSection(inlinedPrompts: string[]): string {
  if (inlinedPrompts.length === 0) {
    return "";
  }

  return `\n\n---\n\n## Sub-Skill & Agent Reference (Inline)\n\n` +
    `When pipeline phases instruct you to invoke a sub-skill (/e2e-process, /e2e-plan, etc.) or an agent (@explorer, etc.), ` +
    `execute the matching instructions below directly — do NOT use the Skill or Agent tool in this environment.\n\n` +
    inlinedPrompts.join("\n\n---\n\n");
}

export function loadSkillPrompt(projectPath: string, skillName: string): string | null {
  const skillPaths = [
    path.join(projectPath, `.claude/skills/${skillName}/SKILL.md`),
    path.join(projectPath, `.claude_skills/${skillName}/SKILL.md`),
  ];

  for (const skillPath of skillPaths) {
    if (fs.existsSync(skillPath)) {
      const body = readPromptBody(skillPath);
      return `${SPECWRIGHT_CONTEXT}\n\n${body}`;
    }
  }

  return null;
}

export function loadOrchestratorPrompt(projectPath?: string): string {
  if (projectPath) {
    const skillPaths = [
      path.join(projectPath, ".claude/skills/e2e-automate/SKILL.md"),
      path.join(projectPath, ".claude_skills/e2e-automate/SKILL.md"),
    ];

    for (const skillPath of skillPaths) {
      if (fs.existsSync(skillPath)) {
        const skillDir = path.dirname(skillPath);
        const projectSkillsDir = path.dirname(skillDir);
        const body = readPromptBody(skillPath);
        const inlinedPrompts = [
          ...collectInlineSkillPrompts(projectSkillsDir),
          ...collectInlineAgentPrompts(projectPath),
        ];
        const inlineReferenceSection = buildInlineReferenceSection(inlinedPrompts);

        return `${SPECWRIGHT_CONTEXT} The user has configured test instructions via the UI. Execute the pipeline below.\n\n${body}${inlineReferenceSection}`;
      }
    }

    const agentPaths = [
      path.join(projectPath, ".claude/agents/orchestrator.md"),
      path.join(projectPath, ".claude_agents/orchestrator.md"),
    ];

    for (const agentPath of agentPaths) {
      if (fs.existsSync(agentPath)) {
        return readPromptBody(agentPath);
      }
    }
  }

  return "You are a helpful test automation assistant. Read e2e-tests/instructions.js and execute the E2E test automation pipeline.";
}
