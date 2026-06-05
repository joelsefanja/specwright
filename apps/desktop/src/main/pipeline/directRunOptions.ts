export interface DirectRunOptions {
  headed: boolean;
  integrated: boolean;
  targetUrl?: string;
}

export function parseDirectRunOptions(rawArgs: string): { args: string; options: DirectRunOptions } {
  const parts = rawArgs.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let headed = false;
  let integrated = false;

  for (const part of parts) {
    if (part === "--headed" || part === "--visible-browser") {
      headed = true;
      continue;
    }

    if (part === "--integrated-browser" || part === "--cdp-browser") {
      integrated = true;
      headed = false;
      continue;
    }

    kept.push(part);
  }

  return { args: kept.join(" "), options: { headed, integrated } };
}

export function withIntegratedBrowserArgs(args: string[], options: DirectRunOptions): string[] {
  const hasWorkerArg = args.includes("--workers") || args.some((arg) => arg.startsWith("--workers="));
  if (!options.integrated || hasWorkerArg) {
    return args;
  }

  return [...args, "--workers=1"];
}

export function normalizePackageRunArgs(args: string[]): string[] {
  if (args[0] !== "run" || args.length <= 2 || args[2] === "--") {
    return args;
  }

  return [args[0], args[1], "--", ...args.slice(2)];
}
