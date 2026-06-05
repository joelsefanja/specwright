export function describeLikelyWait(commandLine: string): string {
  if (commandLine.includes("bddgen")) {
    return "BDD generation can be silent while it scans feature files and writes .features-gen specs.";
  }

  if (commandLine.includes("playwright")) {
    return "Likely stages: webServer startup, auth setup, browser actions, waits, or a dependent local service.";
  }

  if (commandLine.includes("test:e2e") || commandLine.includes("test:bdd")) {
    return "Likely stages: bddgen, Playwright webServer startup, auth setup, then selected tests.";
  }

  return "The process is still alive but has not written output.";
}

export function diagnoseOutput(text: string): string | undefined {
  if (text.includes("spawn EINVAL")) {
    return "[diagnostic] Windows could not start the command process. This is a launcher problem, not a Playwright or BDD failure. Specwright should run .cmd tools through the Windows shell; restart the desktop app so the updated runner is used, then rerun.";
  }

  if (text.includes("ERR_CONNECTION_REFUSED")) {
    return diagnoseConnectionRefused(text);
  }

  if (text.includes("No tests found")) {
    return "[diagnostic] The package script ran, but Playwright found no tests for this selection. This usually means the script's Playwright projects do not include the chosen feature tag. Add or adjust an npm script in this repo for that workflow, then rerun it from Specwright.";
  }

  return undefined;
}

export function shouldShowTestCommandLog(line: string): boolean {
  const clean = line.trim();
  if (!clean) {
    return false;
  }

  if (/^\[\d+\/\d+\]/.test(clean)) {
    return true;
  }

  if (/^\s*\d+\s+(passed|failed|skipped|flaky)/.test(clean)) {
    return true;
  }

  if (isImportantPrefix(clean)) {
    return true;
  }

  if (clean.includes("›") && !clean.startsWith("[")) {
    return false;
  }

  return true;
}

function diagnoseConnectionRefused(text: string): string {
  const target = text.match(/https?:\/\/[^\s,)]+/)?.[0];
  const url = target ? new URL(target) : undefined;
  const serviceHint = url?.port === "4202"
    ? "Start the narrowcasting frontend repo/app locally on port 4202, then rerun this workflow. This value comes from NARROWCASTING_URL."
    : "Start the repo/app that owns this URL locally, then rerun the workflow. If the service should not be local, update the matching URL env var.";

  return `[diagnostic] Connection refused${target ? `: ${target}` : ""}. No service is listening at the URL the test opened. ${serviceHint}`;
}

function isImportantPrefix(clean: string): boolean {
  return clean.startsWith("Running ")
    || clean.startsWith("Error:")
    || clean.startsWith("[global.")
    || clean.startsWith("[auth]")
    || clean.startsWith("[auth:")
    || clean.startsWith("[fixtures]")
    || clean.startsWith("[runner]")
    || clean.startsWith("> ");
}
