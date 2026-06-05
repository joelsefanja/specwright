export type ActivityTone = "info" | "success" | "warning" | "error" | "muted";

export interface ActivityEvent {
  id: string;
  title: string;
  detail?: string;
  tone: ActivityTone;
  raw: string;
}

export function normalizeActivityLines(lines: string[], isEnglish: boolean): { events: ActivityEvent[]; technicalLines: string[]; rawLines: string[] } {
  const events: ActivityEvent[] = [];
  const technicalLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    const event = normalizeLine(clean, isEnglish);
    if (event) {
      const key = `${event.title}:${event.detail ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        events.push({ ...event, id: `${events.length}-${key}`, raw: clean });
      }
    }

    if (isTechnicalLine(clean)) {
      technicalLines.push(clean);
    }
  }

  return { events, technicalLines, rawLines: lines };
}

function normalizeLine(line: string, isEnglish: boolean): Omit<ActivityEvent, "id" | "raw"> | null {
  const lower = line.toLowerCase();

  if (lower.includes("abort requested")) {
    return { title: isEnglish ? "Run is stopping" : "Run wordt gestopt", tone: "warning" };
  }

  if (lower.includes("run_") && lower.includes("registered in .specwright/runs")) {
    return { title: isEnglish ? "Run saved" : "Run opgeslagen", detail: isEnglish ? "Visible in .specwright/runs" : "Zichtbaar in .specwright/runs", tone: "info" };
  }

  if (lower.includes("opencode attach")) {
    return { title: isEnglish ? "OpenCode session ready" : "OpenCode-sessie klaar", detail: isEnglish ? "Use the attach command to continue in OpenCode" : "Gebruik het command om door te gaan in OpenCode", tone: "success" };
  }

  if (lower.includes("[opencode] session:")) {
    return { title: isEnglish ? "OpenCode session started" : "OpenCode-sessie gestart", tone: "success" };
  }

  if (lower.includes("child sessions:")) {
    return { title: isEnglish ? "Subagents detected" : "Subagents gevonden", detail: line.replace(/^.*child sessions:\s*/i, ""), tone: "info" };
  }

  if (lower.includes("seed") || lower.includes("selector")) {
    return { title: isEnglish ? "App evidence checked" : "App-bewijs gecontroleerd", detail: stripPrefix(line), tone: "info" };
  }

  if (lower.includes("feature") || lower.includes("step definition") || lower.includes("generated")) {
    return { title: isEnglish ? "Test files updated" : "Testbestanden bijgewerkt", detail: stripPrefix(line), tone: "success" };
  }

  if (lower.includes("detected model:") || lower.includes("provider: opencode")) {
    return { title: isEnglish ? "Model selected" : "Model gekozen", detail: readableModelDetail(line), tone: "muted" };
  }

  if (lower.includes("loading vercel ai sdk")) {
    return { title: isEnglish ? "AI runner prepared" : "Testrunner voorbereid", tone: "muted" };
  }

  if (lower.includes("running model inference")) {
    return { title: isEnglish ? "OpenCode is working" : "OpenCode is bezig", tone: "info" };
  }

  if (lower.includes("permission") && lower.includes("requested")) {
    return { title: isEnglish ? "Permission needed" : "Toestemming nodig", detail: line, tone: "warning" };
  }

  if (lower.includes("error") || lower.includes("failed") || lower.includes("timed out")) {
    return { title: isEnglish ? "Something went wrong" : "Dat ging mis", detail: stripPrefix(line), tone: "error" };
  }

  if (lower.includes("done") || lower.includes("completed") || lower.includes("ready")) {
    return { title: stripPrefix(line), tone: "success" };
  }

  if (lower.startsWith("[tool]")) {
    return { title: isEnglish ? "Tool activity" : "Toolactiviteit", detail: stripPrefix(line), tone: "info" };
  }

  return null;
}

function isTechnicalLine(line: string): boolean {
  return /^\[[^\]]+\]/.test(line) || line.includes("opencode attach") || line.includes(".specwright/runs");
}

function readableModelDetail(line: string): string {
  return stripPrefix(line).replace(/^Detected model:\s*/i, "").replace(/^Provider:\s*/i, "");
}

function stripPrefix(line: string): string {
  return line.replace(/^\[[^\]]+\]\s*/, "").trim();
}
