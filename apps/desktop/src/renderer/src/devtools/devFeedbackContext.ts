import type { ContextScope, ElementContext, FeedbackJob, FeedbackRect, HighlightState } from "./devFeedbackTypes";

export const READABLE_TEXT_LIMIT = 700;
export const READABLE_TEXT_CHUNK_LIMIT = 24;
export const VISIBLE_TEXT_SUMMARY_LIMIT = 240;
export const VISIBLE_TEXT_CHIP_LIMIT = 16;
export const SCREENSHOT_PADDING = 8;
export const DOM_PATH_PART_LIMIT = 6;
export const DOM_PATH_CLASS_LIMIT = 3;
export const PAGE_CONTEXT_TEXT_LIMIT = 1600;
export const RETRY_OUTPUT_CONTEXT_LIMIT = 3000;
export const MAX_PROGRESS_LOGS = 12;
export const VISIBLE_PROGRESS_LOGS = 4;

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

export function getElementContext(target: EventTarget | null): ElementContext {
  const element = target instanceof Element ? target : document.body;
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    text: collectReadableText(element).slice(0, READABLE_TEXT_LIMIT),
    ariaLabel: element.getAttribute("aria-label") ?? "",
    className: typeof element.className === "string" ? element.className : "",
    domPath: getDomPath(element),
    rect: `${Math.round(rect.width)}x${Math.round(rect.height)} @ ${Math.round(rect.left)},${Math.round(rect.top)}`,
    captureRect: padRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, SCREENSHOT_PADDING),
  };
}

export function collectReadableText(element: Element): string {
  const chunks: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const value = node.textContent?.trim().replace(/\s+/g, " ") ?? "";
      if (!value) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode() && chunks.length < READABLE_TEXT_CHUNK_LIMIT) {
    const value = walker.currentNode.textContent?.trim().replace(/\s+/g, " ") ?? "";
    if (value && !chunks.includes(value)) chunks.push(value);
  }

  return chunks.join(" · ");
}

export function summarizeVisibleText(value: string): string {
  if (!value) return "";
  return value.length > VISIBLE_TEXT_SUMMARY_LIMIT ? `${value.slice(0, VISIBLE_TEXT_SUMMARY_LIMIT).trim()}...` : value;
}

export function splitReadableText(value: string): string[] {
  return value
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, VISIBLE_TEXT_CHIP_LIMIT);
}

export function describeElement(context: ElementContext, text?: { close: string }): string {
  const isEnglish = text?.close === "Close";
  const className = context.className;
  if (className.includes("operator-titlebar")) return isEnglish ? "Top bar item" : "Onderdeel in de bovenbalk";
  if (context.tag === "textarea") return isEnglish ? "Text area" : "Tekstveld";
  if (context.tag === "select") return isEnglish ? "Select menu" : "Keuzelijst";
  if (className.includes("operator-field") || context.tag === "input") return isEnglish ? "Input field" : "Invoerveld";
  if (className.includes("operator-button-primary")) return isEnglish ? "Primary button" : "Primaire knop";
  if (className.includes("operator-button") || context.tag === "button") return isEnglish ? "Button" : "Knop";
  if (context.ariaLabel) return context.ariaLabel;
  return isEnglish ? "Selected element" : "Geselecteerd onderdeel";
}

export function getAnchoredMenuPosition(rect: HighlightState["rect"]): { left: number; top: number; placement: "above" | "below" } {
  const gutter = 12;
  const gap = 10;
  const estimatedWidth = Math.min(window.innerWidth - gutter * 2, 420 * getUiScale());
  const estimatedHeight = 390 * getUiScale();
  const left = clamp(rect.x + rect.width / 2 - estimatedWidth / 2, gutter, window.innerWidth - estimatedWidth - gutter);
  const canPlaceAbove = rect.y - estimatedHeight - gap > gutter;
  const top = canPlaceAbove
    ? rect.y - estimatedHeight - gap
    : Math.min(rect.y + rect.height + gap, window.innerHeight - estimatedHeight - gutter);
  return { left, top: Math.max(gutter, top), placement: canPlaceAbove ? "above" : "below" };
}

export async function captureElementScreenshot(context: ElementContext): Promise<string | null> {
  const screenshot = await window.specwright.devFeedback?.captureScreenshot(context.captureRect);
  return screenshot?.ok && screenshot.dataUrl ? screenshot.dataUrl : null;
}

export async function capturePageScreenshot(): Promise<string | null> {
  const screenshot = await window.specwright.devFeedback?.captureScreenshot({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return screenshot?.ok && screenshot.dataUrl ? screenshot.dataUrl : null;
}

export function buildPrompt(context: ElementContext, comment: string, scope: ContextScope): string {
  const pageText = scope === "page" ? collectReadableText(document.body).slice(0, PAGE_CONTEXT_TEXT_LIMIT) : "";
  return [
    "Dev UI feedback from Specwright Desktop.",
    "",
    "User feedback:",
    comment,
    "",
    "Clicked element context:",
    `- friendly element: ${describeElement(context)}`,
    `- tag: ${context.tag}`,
    `- dom path: ${context.domPath}`,
    `- text: ${context.text || "-"}`,
    `- aria-label: ${context.ariaLabel || "-"}`,
    `- class: ${context.className || "-"}`,
    `- rect: ${context.rect}`,
    ...(scope === "page" ? ["", "Full page context:", pageText || "-"] : []),
    "",
    "Please locate the relevant React/component/source files, apply the requested UI improvement, keep the change minimal, and report compactly in the same language as the feedback. Do not narrate tool usage or plans.",
  ].join("\n");
}

function getUiScale(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--sw-ui-scale").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function padRect(rect: FeedbackRect, padding: number): FeedbackRect {
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function getDomPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < DOM_PATH_PART_LIMIT) {
    const id = current.id ? `#${current.id}` : "";
    const className = typeof current.className === "string" && current.className
      ? `.${current.className.trim().split(/\s+/).slice(0, DOM_PATH_CLASS_LIMIT).join(".")}`
      : "";
    parts.unshift(`${current.tagName.toLowerCase()}${id}${className}`);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function statusLabel(status: FeedbackJob["status"], text: { close: string; takenOver: string; jobDone: string; jobError: string; jobCancelled: string }): string {
  const isEnglish = text.close === "Close";
  if (status === "applied") return text.takenOver;
  if (status === "done") return text.jobDone;
  if (status === "error") return text.jobError;
  if (status === "cancelled") return text.jobCancelled;
  return isEnglish ? "Improving" : "Wordt verbeterd";
}

export function statusPillTone(status: FeedbackJob["status"]): "success" | "warning" | "running" {
  if (status === "done" || status === "applied") return "success";
  if (status === "error" || status === "cancelled") return "warning";
  return "running";
}

export function appendLog(logs: string[] | undefined, next: string): string[] {
  const current = logs ?? [];
  if (current.at(-1) === next) return current;
  return [...current, next].slice(-MAX_PROGRESS_LOGS);
}

export function appendRawLine(current: string | undefined, next: string): string {
  if (!next.trim()) return current ?? "";
  return `${current ?? ""}${current ? "\n" : ""}${next}`;
}

export function activityFromLog(line: string, text: { preparing: string }): string | null {
  const normalized = line.toLowerCase();
  if (normalized.includes("worktree") || normalized.includes("workspace")) return text.preparing;
  return null;
}

export function isPatchConflictOutput(output: string | undefined): boolean {
  const normalized = (output ?? "").toLowerCase();
  return normalized.includes("patch does not apply") || normalized.includes("patch failed") || normalized.includes("does not match index");
}

export function applyFailedMessage(text: { close: string }): string {
  const nlMessage = "De verbetering is gemaakt, maar kon niet automatisch worden overgenomen omdat bestanden ondertussen zijn gewijzigd. Je werk is bewaard. Probeer opnieuw of open de OpenCode-output voor details.";
  const enMessage = "The improvement was created, but could not be applied automatically because files changed in the meantime. Your work is saved. Try again or open the OpenCode output for details.";
  return text.close === "Close" ? enMessage : nlMessage;
}

export function needsReviewLabel(text: { close: string }): string {
  return text.close === "Close" ? "Needs review" : "Controle nodig";
}

export function isTechnicalFeedbackLog(line: string): boolean {
  const normalized = line.toLowerCase();
  return normalized.startsWith("worktree:")
    || normalized.includes("tool_call")
    || normalized.startsWith("[opencode]");
}

export function compactProgressLogs(logs: string[], fallback: string, text: any): string[] {
  const visible = logs.filter((line) => !isTechnicalFeedbackLog(line));
  const compact = Array.from(new Set(visible.map((line) => displayActivity(line, text))));
  return (compact.length > 0 ? compact : [fallback]).slice(-VISIBLE_PROGRESS_LOGS);
}

export function displayActivity(activity: string, text: any): string {
  const isEnglish = text.close === "Close";
  if (activity === text.starting) return isEnglish ? "Starting the agent" : "Agent wordt gestart";
  if (activity === text.running) return isEnglish ? "Agent is writing live output" : "Agent schrijft live output";
  if (activity === text.preparing) return isEnglish ? "Workspace is ready" : "Werkruimte staat klaar";
  if (activity === text.applying) return isEnglish ? "Change is being applied" : "Wijziging wordt overgenomen";
  if (activity === text.finishing) return isEnglish ? "Build and result are being checked" : "Build en resultaat worden gecontroleerd";
  return activity;
}

export function displayJobOutput(job: FeedbackJob, text: any): string {
  if (job.status === "running" && job.output === text.running) {
    return displayActivity(job.output, text);
  }
  return job.output;
}

export function displayLiveOutput(job: FeedbackJob, text: any): string {
  if (job.status === "running" && job.rawOutput.trim()) {
    return job.rawOutput;
  }
  return job.rawOutput.trim() ? job.rawOutput : displayJobOutput(job, text);
}

export function displayCardDetail(job: FeedbackJob, text: any): string {
  if (isPatchConflictOutput(job.rawOutput || job.output)) return applyFailedMessage(text);
  if (job.status === "running") return displayActivity(job.activity || text.running, text);
  return (job.output || job.activity || statusLabel(job.status, text)).trim();
}

export function displayPrimaryOutput(job: FeedbackJob, text: any): string {
  if (isPatchConflictOutput(job.rawOutput || job.output)) return applyFailedMessage(text);
  return displayLiveOutput(job, text);
}

export function shouldShowRawOutputInline(job: FeedbackJob): boolean {
  return job.status === "running";
}

export function decisionText(job: FeedbackJob, text: any): string {
  const isEnglish = text.close === "Close";
  if (job.status === "running") return isEnglish ? "OpenCode is drafting an improvement. You can keep working while it runs." : "OpenCode maakt een voorstel. Je kunt ondertussen doorwerken.";
  if (job.status === "done" && job.worktreePath) return isEnglish ? "A change is ready in a safe worktree. Review it before applying." : "Er staat een wijziging klaar in een veilige worktree. Controleer die voor je hem gebruikt.";
  if (job.status === "applied") return isEnglish ? "The improvement has been applied to this app." : "De verbetering is toegepast in deze app.";
  if (job.status === "error") return isEnglish ? "This attempt failed. The request is saved so you can retry." : "Deze poging lukte niet. De vraag is bewaard zodat je opnieuw kunt proberen.";
  if (job.status === "cancelled") return isEnglish ? "This attempt was stopped. Retry when you want OpenCode to continue." : "Deze poging is gestopt. Probeer opnieuw als OpenCode verder mag.";
  return isEnglish ? "Review the result and decide what to do next." : "Bekijk het resultaat en kies wat je daarna doet.";
}

export function agentOutputTitle(text: { close: string }): string {
  return text.close === "Close" ? "What OpenCode changed" : "Wat OpenCode aanpaste";
}

export function normalizeRestoredJob(job: FeedbackJob, text: any): FeedbackJob {
  const rawOutput = job.rawOutput ?? job.output ?? "";
  if (job.status === "running") {
    return { ...job, status: "cancelled", output: text.jobCancelled, rawOutput, activity: text.jobCancelled, logs: job.logs ?? [] };
  }
  if (job.status === "error" && isPatchConflictOutput(rawOutput || job.output)) {
    const needsReview = needsReviewLabel(text);
    return { ...job, status: "done", output: applyFailedMessage(text), rawOutput, activity: needsReview, logs: appendLog(job.logs ?? [], needsReview) };
  }
  return { ...job, rawOutput, activity: job.activity ?? statusLabel(job.status, text), logs: job.logs ?? [] };
}

export function buildRetryPromptFromJob(job: FeedbackJob): string {
  return [
    buildPrompt(job.context, job.comment, job.contextScope ?? "page"),
    "",
    "Retry context:",
    "The previous attempt did not make it into the real app successfully. Do not start from scratch; use the same requested UI change and the context below to fix or re-apply the change with the smallest safe edit.",
    `Previous status: ${job.status}`,
    `Previous visible result: ${job.output || "-"}`,
    `Previous OpenCode output: ${(job.rawOutput || "-").slice(-RETRY_OUTPUT_CONTEXT_LIMIT)}`,
    "If the previous patch conflicted, inspect the current files and re-create the intended change against the current source instead of applying the old patch blindly.",
  ].join("\n");
}
