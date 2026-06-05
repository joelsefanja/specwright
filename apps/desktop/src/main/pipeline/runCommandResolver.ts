import fs from "fs";
import path from "path";

export interface TestRunCommand {
  command: string;
  args: string[];
  label: string;
  reason: string;
}

interface TestRunContext {
  projectPath: string;
  input: string;
  scripts: Record<string, string>;
  packageManager: string;
}

interface TestRunStrategy {
  matches(context: TestRunContext): boolean;
  resolve(context: TestRunContext): TestRunCommand;
}

function parseScriptInvocation(input: string, scripts: Record<string, string>): { scriptName: string; extraArgs: string[] } | null {
  const [scriptName, ...extraArgs] = input.trim().split(/\s+/);

  if (!scriptName || !scripts[scriptName]) {
    return null;
  }

  return { scriptName, extraArgs };
}

function scriptArgs(scriptName: string, extraArgs: string[]): string[] {
  return ["run", scriptName, ...(extraArgs.length ? ["--", ...extraArgs] : [])];
}

function createScriptCommand(packageManager: string, scriptName: string, extraArgs: string[] = []): TestRunCommand {
  return {
    command: packageManager,
    args: scriptArgs(scriptName, extraArgs),
    label: extraArgs.length ? `${scriptName} ${extraArgs.join(" ")}` : scriptName,
    reason: extraArgs.length ? "npm run script with forwarded args" : "npm run script",
  };
}

function createPlaywrightCommand(packageManager: string, args: string[], label: string): TestRunCommand {
  return {
    command: packageManager,
    args: ["exec", "playwright", "test", ...args],
    label,
    reason: "direct Playwright command",
  };
}

function readPackageScripts(projectPath: string): Record<string, string> {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  return (JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).scripts ?? {}) as Record<string, string>;
}

export function detectPackageManager(projectPath: string): string {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const lockfiles: Array<[string, string]> = [
    ["pnpm-lock.yaml", `pnpm${extension}`],
    ["yarn.lock", `yarn${extension}`],
    ["package-lock.json", `npm${extension}`],
  ];

  return lockfiles.find(([fileName]) => fs.existsSync(path.join(projectPath, fileName)))?.[1] ?? `pnpm${extension}`;
}

function hasRunnableFeatureDir(projectPath: string, bucket: "@Modules" | "@Workflows", tag: string): boolean {
  const directoryName = tag.startsWith("@") ? tag : `@${tag}`;
  return fs.existsSync(path.join(projectPath, "e2e-tests/features/playwright-bdd", bucket, directoryName));
}

function scriptFor(scripts: Record<string, string>, kind: "all" | "workflows" | "auth"): string | null {
  const candidates = kind === "all"
    ? ["test:bdd", "test:e2e"]
    : kind === "workflows"
      ? ["test:bdd:workflows", "test:e2e:workflows"]
      : ["test:bdd:auth", "test:e2e:auth"];

  return candidates.find((script) => scripts[script]) ?? null;
}

function readPrimaryFeatureTag(projectPath: string, bucket: "@Modules" | "@Workflows", folderTag: string): string {
  const directoryName = folderTag.startsWith("@") ? folderTag : `@${folderTag}`;
  const featureDirectory = path.join(projectPath, "e2e-tests/features/playwright-bdd", bucket, directoryName);

  if (!fs.existsSync(featureDirectory)) {
    return folderTag;
  }

  const featureFile = fs.readdirSync(featureDirectory).find((fileName) => fileName.endsWith(".feature"));
  if (!featureFile) {
    return folderTag;
  }

  const firstLine = fs.readFileSync(path.join(featureDirectory, featureFile), "utf-8").split(/\r?\n/)[0] ?? "";
  const primaryTag = firstLine
    .match(/@[\w-]+/g)
    ?.find((tag) => tag.toLowerCase() !== "@workflows" && tag.toLowerCase() !== "@modules");

  return primaryTag ?? folderTag;
}

function normalizeKnownFeatureTag(projectPath: string, scriptName: string, tag: string): string {
  const bucket = scriptName.includes("workflow") ? "@Workflows" : "@Modules";
  return hasRunnableFeatureDir(projectPath, bucket, tag) ? readPrimaryFeatureTag(projectPath, bucket, tag) : tag;
}

function normalizeScriptExtraArgs(projectPath: string, scriptName: string, extraArgs: string[]): string[] {
  const grepIndex = extraArgs.findIndex((arg) => arg === "--grep");
  const tagArgument = extraArgs[grepIndex + 1];

  if (grepIndex < 0 || !tagArgument?.startsWith("@")) {
    return extraArgs;
  }

  const normalizedArgs = [...extraArgs];
  normalizedArgs[grepIndex + 1] = normalizeKnownFeatureTag(projectPath, scriptName, tagArgument);
  return normalizedArgs;
}

const testRunStrategies: TestRunStrategy[] = [
  {
    matches: ({ scripts, input }) => Boolean(parseScriptInvocation(input || "test:bdd", scripts)),
    resolve: ({ projectPath, scripts, input, packageManager }) => {
      const parsed = parseScriptInvocation(input || "test:bdd", scripts)!;
      const extraArgs = normalizeScriptExtraArgs(projectPath, parsed.scriptName, parsed.extraArgs);
      return createScriptCommand(packageManager, parsed.scriptName, extraArgs);
    },
  },
  {
    matches: ({ scripts, input }) => Boolean(scripts[input || "test:bdd"]),
    resolve: ({ scripts, input, packageManager }) => createScriptCommand(packageManager, scripts[input || "test:bdd"] ? input || "test:bdd" : "test:bdd"),
  },
  {
    matches: ({ input }) => input.startsWith("@"),
    resolve: ({ projectPath, scripts, input, packageManager }) => {
      const matchingScript = Object.entries(scripts).find(([name, command]) => name.startsWith("test:bdd") && command.includes(input))?.[0];

      if (matchingScript) {
        return createScriptCommand(packageManager, matchingScript);
      }

      const workflowScript = scriptFor(scripts, "workflows");
      if (hasRunnableFeatureDir(projectPath, "@Workflows", input) && workflowScript) {
        return createScriptCommand(packageManager, workflowScript, ["--grep", readPrimaryFeatureTag(projectPath, "@Workflows", input)]);
      }

      const allScript = scriptFor(scripts, "all");
      if (hasRunnableFeatureDir(projectPath, "@Modules", input) && allScript) {
        return createScriptCommand(packageManager, allScript, ["--grep", readPrimaryFeatureTag(projectPath, "@Modules", input)]);
      }

      const lower = input.toLowerCase();
      const authScript = scriptFor(scripts, "auth");
      if (lower.includes("auth") && authScript) {
        return createScriptCommand(packageManager, authScript, ["--grep", input]);
      }

      if (lower.includes("workflow") && workflowScript) {
        return createScriptCommand(packageManager, workflowScript, ["--grep", input]);
      }

      return createScriptCommand(packageManager, allScript ?? workflowScript ?? "test:e2e", ["--grep", input]);
    },
  },
  {
    matches: ({ input }) => input.startsWith("--"),
    resolve: ({ input, packageManager }) => createPlaywrightCommand(packageManager, input.split(/\s+/), input),
  },
  {
    matches: () => true,
    resolve: ({ input, packageManager }) => createScriptCommand(packageManager, input || "test:bdd"),
  },
];

export function resolveE2eRunCommand(projectPath: string, rawArgs: string): TestRunCommand {
  const context: TestRunContext = {
    projectPath,
    input: rawArgs.trim(),
    scripts: readPackageScripts(projectPath),
    packageManager: detectPackageManager(projectPath),
  };

  const strategy = testRunStrategies.find((candidateStrategy) => candidateStrategy.matches(context));
  if (!strategy) {
    throw new Error("No test run strategy matched the requested command.");
  }

  return strategy.resolve(context);
}
