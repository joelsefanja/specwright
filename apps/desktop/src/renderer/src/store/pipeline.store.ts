import { create } from "zustand";

export type PhaseStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface Phase {
  id: number;
  label: string;
  agentName: string | null;
  status: PhaseStatus;
  startedAt: number | null;
  durationMs: number | null;
}

export type PipelineStatus = "idle" | "running" | "done" | "error" | "aborted";

export interface DirectRunMeta {
  isDirectRun: boolean;
  command: string | null;
  cwd: string | null;
  browserUrl: string | null;
  localApps: "pending" | "running" | "done" | "error";
  auth: "pending" | "running" | "done" | "error";
  tests: "pending" | "running" | "done" | "error";
}

export interface ExploreResult {
  url: string;
  title: string;
  summary: string;
  pageCount: number;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "explore";
  content: string;
  isStreaming: boolean;
  /** Portion of content already shown without animation — advances via advanceStableLength */
  stableLength: number;
  /** Phase this message belongs to — set when a new phase starts via splitForPhase */
  phaseId?: number;
  exploreResult?: ExploreResult;
}

export interface PendingPermission {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  timestamp: number;
}

interface PipelineState {
  status: PipelineStatus;
  messages: ChatMessage[];
  logLines: string[];
  directRun: DirectRunMeta;
  activePhase: number;
  /** Monotonic counter incremented every fresh startRun. Consumers use this
   * to reset per-run refs (e.g. CenterPanel's lastPhaseRef) on a new run. */
  runId: number;
  phases: Phase[];
  errorMessage: string | null;
  pendingPermission: PendingPermission | null;
  /** Currently running tool name (shown in chat while streaming pauses) */
  activeTool: string | null;
  /** Session ID from the last completed run — used for resume */
  lastSessionId: string | null;
  /** User's auth response that unblocked the first run (e.g., ticket ID). Prepended to resume messages so managed hooks don't block again. */
  hookPassphrase: string | null;
  /** Atlassian MCP connection status — updated from pipeline:mcp-status events */
  atlassianStatus: "idle" | "connected" | "needs-auth" | "failed";
  setMcpStatus: (server: string, status: string) => void;

  startRun: (userMessage: string) => void;
  /** Resume after an approval checkpoint — preserves phases, logs, and activePhase. */
  resumeRun: (userMessage: string) => void;
  injectUserMessage: (text: string) => void;
  appendToken: (token: string) => void;
  appendLog: (line: string) => void;
  updateDirectRun: (patch: Partial<DirectRunMeta>) => void;
  finishRun: (fullText: string, sessionId?: string, userMessage?: string) => void;
  setError: (msg: string) => void;
  abortRun: (msg?: string) => void;
  clearFeed: () => void;
  setActivePhase: (id: number) => void;
  setPhaseStatus: (id: number, status: PhaseStatus, durationMs?: number) => void;
  /** Seal the current streaming message and start a new one tagged with the given phaseId */
  splitForPhase: (phaseId: number) => void;
  showPermission: (request: PendingPermission) => void;
  clearPermission: () => void;
  setActiveTool: (toolName: string | null) => void;
  appendExploreResult: (data: ExploreResult) => void;
  advanceStableLength: (messageId: string, length: number) => void;
}

// Phases match SKILL.md /e2e-automate pipeline exactly
// Single source of truth for pipeline phases — update this array when phases change.
const PHASES: Phase[] = [
  { id: 1,  label: "Initialization",           agentName: null,                        status: "pending", startedAt: null, durationMs: null },
  { id: 2,  label: "Detection & Routing",      agentName: null,                        status: "pending", startedAt: null, durationMs: null },
  { id: 3,  label: "Input Processing",          agentName: "input-processor",           status: "pending", startedAt: null, durationMs: null },
  { id: 4,  label: "Exploration & Planning",   agentName: "playwright-test-planner",   status: "pending", startedAt: null, durationMs: null },
  { id: 5,  label: "Exploration Validation",   agentName: "execution-manager",         status: "pending", startedAt: null, durationMs: null },
  { id: 6,  label: "User Approval",            agentName: null,                        status: "pending", startedAt: null, durationMs: null },
  { id: 7,  label: "BDD Generation",           agentName: "bdd-generator",             status: "pending", startedAt: null, durationMs: null },
  { id: 8,  label: "Test Execution & Healing", agentName: "execution-manager",         status: "pending", startedAt: null, durationMs: null },
  { id: 9,  label: "Cleanup",                  agentName: null,                        status: "pending", startedAt: null, durationMs: null },
  { id: 10, label: "Final Review",             agentName: null,                        status: "pending", startedAt: null, durationMs: null },
];

/** Derived constants — all phase logic should reference these, not hardcoded numbers. */
export const PHASE_COUNT = PHASES.length;
export const MAX_PHASE_ID = PHASES[PHASES.length - 1].id;
/** The phase where BDD generation starts — "Run Tests" is available once this phase is done. */
export const BDD_GENERATION_PHASE_ID = PHASES.find((p) => p.label === "BDD Generation")!.id;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeLogLine(line: string): string {
  return line
    // ANSI CSI/OSC/control sequences from Playwright, Angular dev server, npm, etc.
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][A-Z0-9]/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trimEnd();
}

export const usePipelineStore = create<PipelineState>((set) => ({
  status: "idle",
  messages: [],
  logLines: [],
  directRun: {
    isDirectRun: false,
    command: null,
    cwd: null,
    browserUrl: null,
    localApps: "pending",
    auth: "pending",
    tests: "pending",
  },
  activePhase: 0,
  runId: 0,
  phases: PHASES.map((p) => ({ ...p })),
  errorMessage: null,
  pendingPermission: null,
  activeTool: null,
  lastSessionId: null,
  hookPassphrase: null,
  atlassianStatus: "idle",

  setMcpStatus: (server, status) =>
    set((s) => {
      if (server !== "atlassian") return s;
      const mapped =
        status === "connected" ? "connected" :
        status === "failed" ? "failed" :
        status === "needs-auth" ? "needs-auth" : "idle";
      return { atlassianStatus: mapped };
    }),

  startRun: (userMessage) =>
    set((s) => ({
      status: "running",
      logLines: [],
      directRun: {
        isDirectRun: userMessage.trim().startsWith("/e2e-run"),
        command: null,
        cwd: null,
        browserUrl: null,
        localApps: "pending",
        auth: "pending",
        tests: "pending",
      },
      activePhase: 1,
      runId: s.runId + 1,
      errorMessage: null,
      pendingPermission: null,
      phases: PHASES.map((p) => ({ ...p })),
      messages: [
        ...s.messages.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m),
        { id: makeId(), role: "user",      content: userMessage, isStreaming: false, stableLength: 0 },
        { id: makeId(), role: "assistant", content: "",          isStreaming: true,  stableLength: 0 },
      ],
    })),

  resumeRun: (userMessage) =>
    set((s) => ({
      status: "running",
      errorMessage: null,
      pendingPermission: null,
      // Preserve phases, logLines, and activePhase — only add new message bubbles
      messages: [
        ...s.messages.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m),
        { id: makeId(), role: "user" as const,      content: userMessage, isStreaming: false, stableLength: 0 },
        { id: makeId(), role: "assistant" as const, content: "",          isStreaming: true,  stableLength: 0, phaseId: s.activePhase || undefined },
      ],
    })),

  injectUserMessage: (text) =>
    set((s) => ({
      messages: [
        // Clear isStreaming on all previous messages
        ...s.messages.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m),
        { id: makeId(), role: "user",      content: text, isStreaming: false, stableLength: 0 },
        { id: makeId(), role: "assistant", content: "",   isStreaming: true,  stableLength: 0, phaseId: s.activePhase || undefined },
      ],
    })),

  appendToken: (token) =>
    set((s) => {
      const messages = [...s.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content + token,
        };
      }
      return { messages };
    }),

  appendLog: (line) =>
    set((s) => {
      const clean = sanitizeLogLine(line);
      if (!clean.trim()) return s;
      return { logLines: [...s.logLines, clean] };
    }),

  updateDirectRun: (patch) =>
    set((s) => ({ directRun: { ...s.directRun, ...patch } })),

  finishRun: (_fullText, sessionId, userMessage) =>
    set((s) => {
      const messages = [...s.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        const finalContent = messages[lastIdx].content;
        messages[lastIdx] = { ...messages[lastIdx], isStreaming: false, stableLength: finalContent.length };
      }
      // Save the first line of the userMessage that passed the managed hook.
      // On resume, this gets prepended so the hook sees the passphrase (e.g., Jira ticket ID).
      // We take only the first line to avoid bloating resume messages with the full prompt.
      let passphrase = s.hookPassphrase;
      if (sessionId && !passphrase && userMessage) {
        const firstLine = userMessage.split("\n")[0].trim();
        passphrase = firstLine.slice(0, 200); // cap at 200 chars
      }
      return { messages, status: "done", pendingPermission: null, lastSessionId: sessionId ?? null, hookPassphrase: passphrase };
    }),

  setError: (msg) =>
    set((s) => {
      const messages = [...s.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content || `Error: ${msg}`,
          isStreaming: false,
        };
      }
      return { messages, status: "error", errorMessage: msg, pendingPermission: null };
    }),

  abortRun: (msg = "Aborted by user") =>
    set((s) => {
      const messages = [...s.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        const current = messages[lastIdx].content;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: current || msg,
          isStreaming: false,
          stableLength: (current || msg).length,
        };
      }
      return { messages, status: "aborted", errorMessage: null, pendingPermission: null, activeTool: null };
    }),

  clearFeed: () =>
    set({
      status: "idle",
      messages: [],
      logLines: [],
      directRun: {
        isDirectRun: false,
        command: null,
        cwd: null,
        browserUrl: null,
        localApps: "pending",
        auth: "pending",
        tests: "pending",
      },
      activePhase: 0,
      errorMessage: null,
      pendingPermission: null,
      phases: PHASES.map((p) => ({ ...p })),
    }),

  setActivePhase: (id) =>
    set((s) => ({
      activePhase: id,
      phases: s.phases.map((p) =>
        p.id === id
          ? { ...p, status: "running", startedAt: Date.now() }
          : p
      ),
    })),

  setPhaseStatus: (id, status, durationMs) =>
    set((s) => ({
      phases: s.phases.map((p) =>
        p.id === id ? { ...p, status, durationMs: durationMs ?? p.durationMs } : p
      ),
    })),

  splitForPhase: (phaseId) =>
    set((s) => {
      const messages = [...s.messages];
      const lastIdx = messages.length - 1;
      let leadContent = "";

      if (lastIdx >= 0 && messages[lastIdx].isStreaming) {
        const raw = messages[lastIdx].content;

        // Find the "### Phase {phaseId}" header specifically — NOT just the last "###".
        // If Claude writes multiple phase headers in one message chunk (e.g. Phase 8
        // then Phase 9), we must split on the header matching the target phase, so
        // each card gets its own content. Falls back to last-header logic if the
        // specific header isn't found.
        const phaseHeaderRe = new RegExp(`###\\s*Phase\\s+${phaseId}\\b`, "i");
        const phaseMatch = raw.match(phaseHeaderRe);
        let splitIdx = phaseMatch?.index;

        if (splitIdx === undefined) {
          // Fallback: any "### Phase N" that appears after lastPhase content.
          // Prefer the EARLIEST phase header we haven't already committed to, so
          // content doesn't get swallowed by a later phase written in the same burst.
          const anyPhase = raw.match(/###\s*Phase\s+\d+/i);
          if (anyPhase) splitIdx = anyPhase.index;
        }

        if (splitIdx !== undefined && splitIdx >= 0) {
          const before = raw.slice(0, splitIdx).trimEnd();
          const fromHeader = raw.slice(splitIdx);
          // Skip the header line itself — only carry over the content that follows it
          const lineEnd = fromHeader.indexOf("\n");
          leadContent = lineEnd >= 0 ? fromHeader.slice(lineEnd + 1).trimStart() : "";

          // Note: if leadContent contains MORE phase headers (e.g. "### Phase 9"
          // appeared in the same burst), the caller (CenterPanel.handleToken loop)
          // will detect them on the NEXT iteration and call splitForPhase again.
          // Do NOT trim them out here — we'd lose the content.

          messages[lastIdx] = {
            ...messages[lastIdx],
            content: before,
            isStreaming: false,
            stableLength: before.length,
          };
        } else {
          // No phase header found — just seal as-is
          const sealedContent = messages[lastIdx].content;
          messages[lastIdx] = { ...messages[lastIdx], isStreaming: false, stableLength: sealedContent.length };
        }
      }

      // Open a new message for this phase, pre-populated with any content that
      // came after the header line in the previous message
      messages.push({ id: makeId(), role: "assistant", content: leadContent, isStreaming: true, stableLength: 0, phaseId });
      return { messages };
    }),

  showPermission: (request) =>
    set({ pendingPermission: request }),

  clearPermission: () =>
    set({ pendingPermission: null }),

  setActiveTool: (toolName) =>
    set({ activeTool: toolName }),

  appendExploreResult: (data) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: makeId(),
          role: "explore" as const,
          content: "",
          isStreaming: false,
          stableLength: 0,
          exploreResult: data,
        },
      ],
    })),

  advanceStableLength: (messageId, length) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, stableLength: length } : m
      ),
    })),
}));
