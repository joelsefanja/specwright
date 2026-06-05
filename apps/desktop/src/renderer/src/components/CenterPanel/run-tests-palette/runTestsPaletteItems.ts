export type RunTestsPaletteItem =
  | { kind: "module"; label: string; arg: string }
  | { kind: "workflow"; label: string; arg: string }
  | { kind: "script"; label: string; arg: string }
  | { kind: "custom"; label: string; arg: string };

export type RunTestsFeatureModules = {
  modules: string[];
  workflows: string[];
};

type BuildRunTestsPaletteItemsOptions = {
  testScripts: Record<string, string>;
  featureModules: RunTestsFeatureModules;
};

export function buildRunTestsPaletteItems({
  testScripts,
  featureModules,
}: BuildRunTestsPaletteItemsOptions): RunTestsPaletteItem[] {
  const items: RunTestsPaletteItem[] = [];
  const testScriptNames = Object.keys(testScripts);
  const allScript = testScriptNames.find((name) => name === "test:bdd" || name === "test:e2e") ?? "test:e2e";
  const workflowScript = testScriptNames.find((name) => name === "test:bdd:workflows" || name === "test:e2e:workflows") ?? allScript;

  items.push({ kind: "script", label: "All Tests", arg: allScript });

  for (const directory of featureModules.modules) {
    const label = directory.replace(/^@/, "");
    items.push({ kind: "module", label, arg: `${allScript} --grep @${label}` });
  }

  for (const directory of featureModules.workflows) {
    const label = directory.replace(/^@/, "");
    items.push({ kind: "workflow", label, arg: `${workflowScript} --grep @${label}` });
  }

  for (const [name, command] of Object.entries(testScripts)) {
    if (name === "test:bdd") {
      continue;
    }

    if (command.includes("--grep")) {
      items.push({ kind: "script", label: name, arg: name });
    }
  }

  return items;
}

export function filterRunTestsPaletteItems(items: RunTestsPaletteItem[], query: string): RunTestsPaletteItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return items;
  }

  return items.filter(
    (item) => item.label.toLowerCase().includes(normalizedQuery) || item.arg.toLowerCase().includes(normalizedQuery)
  );
}

export function addCustomRunTestsPaletteItem(items: RunTestsPaletteItem[], query: string): RunTestsPaletteItem[] {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return items;
  }

  const isFilterQuery = trimmedQuery.startsWith("@") || trimmedQuery.startsWith("--");

  if (!isFilterQuery) {
    return items;
  }

  const hasExactMatch = items.some((item) => item.arg === trimmedQuery);

  if (hasExactMatch) {
    return items;
  }

  return [...items, { kind: "custom", label: `Run "${trimmedQuery}"`, arg: trimmedQuery }];
}
