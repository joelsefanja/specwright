export interface InstructionCard {
  moduleName: string;
  category: "@Modules" | "@Workflows";
  subModules: string[];
  fileName: string;
  pageURL?: string;
  steps: string[];
  filePath?: string;
  suitName?: string;
  jiraURL?: string;
  explore: boolean;
  runExploredCases: boolean;
  runGeneratedCases: boolean;
  autoApprove: boolean;
}

type InstructionEntry = Record<string, unknown>;

function isInstructionEntry(value: unknown): value is InstructionEntry {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return "";
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getCategory(value: unknown): "@Modules" | "@Workflows" {
  if (typeof value === "string") {
    return value as "@Modules" | "@Workflows";
  }

  return "@Modules";
}

function getNestedJiraUrl(value: unknown): string {
  if (!isInstructionEntry(value)) {
    return "";
  }

  const jira = value.jira;
  if (!isInstructionEntry(jira)) {
    return "";
  }

  return getString(jira.url);
}

function canonicalModuleName(value: string): string {
  const trimmed = value.trim().replace(/^@+/, "");
  return trimmed ? `@${trimmed}` : "@TestGoal";
}

function extractExportedArraySource(raw: string): string | undefined {
  const esmMatch = raw.match(/export\s+default\s+(\[[\s\S]*\]);?\s*$/m);
  const cjsMatch = raw.match(/module\.exports\s*=\s*(\[[\s\S]*\]);?\s*$/m);
  const match = esmMatch || cjsMatch;
  if (!match) {
    return undefined;
  }

  const jsArray = match[1].trim();
  if (jsArray.endsWith(";")) {
    return jsArray.slice(0, -1);
  }

  return jsArray;
}

function evaluateArraySource(arraySource: string): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const evaluate = new Function(`return ${arraySource}`) as () => unknown;
  const evaluated = evaluate();
  if (!Array.isArray(evaluated)) {
    return [];
  }

  return evaluated;
}

function mapInstructionEntry(entry: InstructionEntry): InstructionCard {
  const subModuleName = getStringArray(entry.subModuleName);
  const subModules = Array.isArray(entry.subModuleName) ? subModuleName : getStringArray(entry.subModules);
  const instructions = getStringArray(entry.instructions);
  const steps = Array.isArray(entry.instructions) ? instructions : getStringArray(entry.steps);

  return {
    moduleName: getString(entry.moduleName),
    category: getCategory(entry.category),
    subModules,
    fileName: getString(entry.fileName),
    pageURL: getString(entry.pageURL),
    steps,
    filePath: getString(entry.filePath),
    suitName: getString(entry.suitName),
    jiraURL: getString(entry.jiraURL) || getString(entry.jira) || getNestedJiraUrl(entry.inputs),
    explore: entry.explore === true,
    runExploredCases: entry.runExploredCases === true,
    runGeneratedCases: entry.runGeneratedCases === true,
    autoApprove: entry.autoApprove === true,
  };
}

function quoteJsString(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

export function parseInstructionCards(raw: string): InstructionCard[] {
  const arraySource = extractExportedArraySource(raw);
  if (!arraySource) {
    return [];
  }

  const evaluated = evaluateArraySource(arraySource);
  const cards: InstructionCard[] = [];

  for (const entry of evaluated) {
    if (isInstructionEntry(entry)) {
      cards.push(mapInstructionEntry(entry));
    }
  }

  return cards;
}

export function cardsToJsSource(cards: InstructionCard[]): string {
  if (cards.length === 0) {
    return "[]";
  }

  const entries = cards.map((card) => {
    const lines: string[] = [];
    lines.push(`  {`);
    lines.push(`    moduleName: ${quoteJsString(canonicalModuleName(card.moduleName))},`);
    lines.push(`    category: ${quoteJsString(card.category)},`);
    lines.push(`    subModuleName: [${card.subModules.map((subModule) => quoteJsString(subModule)).join(", ")}],`);
    lines.push(`    fileName: ${quoteJsString(card.fileName)},`);
    if (card.pageURL) {
      lines.push(`    pageURL: ${quoteJsString(card.pageURL)},`);
    }
    if (card.filePath) {
      lines.push(`    filePath: ${quoteJsString(card.filePath)},`);
    }
    if (card.suitName) {
      lines.push(`    suitName: ${quoteJsString(card.suitName)},`);
    }
    lines.push(`    inputs: {},`);
    if (card.steps.length > 0) {
      lines.push(`    instructions: [`);
      for (const step of card.steps) {
        lines.push(`      ${quoteJsString(step)},`);
      }
      lines.push(`    ],`);
    }
    lines.push(`    explore: ${card.explore},`);
    lines.push(`    runExploredCases: ${card.runExploredCases},`);
    lines.push(`    runGeneratedCases: ${card.runGeneratedCases},`);
    lines.push(`    autoApprove: ${card.autoApprove ?? false},`);
    lines.push(`  }`);
    return lines.join("\n");
  });

  return `[\n${entries.join(",\n")}\n]`;
}
