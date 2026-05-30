import React, { useEffect, useRef, useState, useCallback, useReducer } from "react";
import { Copy, Pause, PaperPlaneTilt } from "@phosphor-icons/react";
import PermissionPrompt from "./PermissionPrompt";
import { PhaseHeader } from "./PhaseHeader";
import { RunConsolePanel } from "./RunConsolePanel";
import { usePipelineStore, type ChatMessage } from "@renderer/store/pipeline.store";
import { useConfigStore } from "@renderer/store/config.store";

// ── Phase grouping ─────────────────────────────────────────────────────────────
interface PhaseGroup {
  phaseId: number | undefined;
  messages: ChatMessage[];
}

function groupMessagesByPhase(messages: ChatMessage[]): PhaseGroup[] {
  const body = messages.length > 0 && messages[0].role === "user" ? messages.slice(1) : messages;
  const groups: PhaseGroup[] = [];
  for (const msg of body) {
    const lastGroup = groups[groups.length - 1];
    if (msg.role === "assistant" && msg.phaseId !== undefined) {
      if (!lastGroup || msg.phaseId !== lastGroup.phaseId) {
        groups.push({ phaseId: msg.phaseId, messages: [msg] });
      } else {
        lastGroup.messages.push(msg);
      }
    } else {
      if (!lastGroup) {
        groups.push({ phaseId: undefined, messages: [msg] });
      } else {
        lastGroup.messages.push(msg);
      }
    }
  }
  return groups;
}

// ── URL-aware text renderer ────────────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s)>\]'"\\]+/g;

function renderWithLinks(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href="#"
        onClick={(e) => { e.preventDefault(); window.specwright.shell.openUrl(url); }}
        className="text-brand-400 hover:text-brand-300 underline decoration-brand-700 hover:decoration-brand-400 cursor-pointer transition-colors"
        title={`Open ${url}`}
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Agent output panel ────────────────────────────────────────────────────────
export function AgentOutputPanel({ onOpenRunPicker }: { onOpenRunPicker: () => void }): React.JSX.Element {
  const { messages, logLines, status, errorMessage, clearFeed, injectUserMessage, startRun, resumeRun, phases } = usePipelineStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputText, setInputText] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [controlFeedback, setControlFeedback] = useState<string | null>(null);
  const [abortRequested, setAbortRequested] = useState(false);
  const abortBackRequestedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Typing effect — reveals content at ~500 chars/sec via requestAnimationFrame
  const displayedText = useRef<Map<string, string>>(new Map());
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    const CHARS_PER_MS = 0.2;

    const animate = (ts: number) => {
      const elapsed = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;
      const charsToReveal = Math.max(1, Math.round(elapsed * CHARS_PER_MS));

      const msgs = usePipelineStore.getState().messages;
      let changed = false;
      for (const msg of msgs) {
        if (msg.role !== "assistant") continue;
        const shown = displayedText.current.get(msg.id) ?? "";
        if (shown.length < msg.content.length) {
          const next = msg.isStreaming
            ? msg.content.slice(0, shown.length + charsToReveal)
            : msg.content;
          displayedText.current.set(msg.id, next);
          changed = true;
        }
      }
      if (changed) repaint();
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const isRunning = status === "running";
  const isDirectTestRun = [...messages].reverse().some((message) => message.role === "user" && message.content.trim().startsWith("/e2e-run"));
  const activeTool = (() => {
    for (let i = logLines.length - 1; i >= 0; i--) {
      const line = logLines[i];
      if (line.startsWith("[tool]") && line.includes("— started")) {
        const name = line.replace("[tool]", "").replace("— started", "").trim();
        const completedLater = logLines.slice(i + 1).some(
          (l) => l.startsWith("[tool]") && l.includes(name) && l.includes("— done")
        );
        if (!completedLater) return name;
      }
    }
    return null;
  })();
  const runStatusTitle = abortRequested
    ? "Stopping run"
    : activeTool
      ? activeTool
      : isRunning
        ? "Run in progress"
        : status === "done"
          ? "Run complete"
          : status === "aborted"
            ? "Run aborted"
            : status === "error"
              ? "Run failed"
              : "Session";
  const runStatusDetail = abortRequested
    ? "Specwright is stopping the active process. This can take a few seconds."
    : activeTool
      ? "A tool or command is active. Raw output appears in Run output."
      : isRunning
        ? "Specwright is generating, running, or waiting for the current command."
        : status === "done"
          ? "Review the result, run tests, or return to Explorer."
          : status === "aborted"
            ? "The run was stopped. Return to Create Tests when you want to continue."
            : status === "error"
              ? errorMessage ?? "Check Run output for the failing command."
              : "No active run.";

  const requestAbort = useCallback(async (): Promise<boolean> => {
    setAbortRequested(true);
    setControlFeedback("Abort requested...");
    const result = await window.specwright.pipeline.abort() as unknown as { ok?: boolean };
    setControlFeedback(result.ok ? "Stopping run..." : "Nothing to abort");
    if (!result.ok) setAbortRequested(false);
    return Boolean(result.ok);
  }, []);

  const abortAndBack = useCallback(async () => {
    abortBackRequestedRef.current = true;
    const requested = await requestAbort();
    if (requested) {
      setControlFeedback("Stopping run, then returning to Create Tests...");
      return;
    }
    abortBackRequestedRef.current = false;
  }, [requestAbort]);

  useEffect(() => {
    if (isRunning) return;
    setAbortRequested(false);
    if (abortBackRequestedRef.current) {
      abortBackRequestedRef.current = false;
      clearFeed();
    }
  }, [clearFeed, isRunning]);

  useEffect(() => {
    if (!controlFeedback) return;
    const timer = window.setTimeout(() => setControlFeedback(null), 3500);
    return () => window.clearTimeout(timer);
  }, [controlFeedback]);

  const handleCopy = useCallback((id: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    inputRef.current?.focus();

    if (isRunning) {
      const delivered = await window.specwright.pipeline.sendMessage(text);
      if (delivered) {
        injectUserMessage(text);
        return;
      }
    }
    {
      const { startRun, resumeRun, lastSessionId, hookPassphrase, status: pipelineStatus, phases } = usePipelineStore.getState();
      const { skipPermissions } = useConfigStore.getState();
      const hasProgress = phases.some(p => p.status === "done" || p.status === "running");
      const isResuming = pipelineStatus !== "idle" && hasProgress;

      const messageForHook = hookPassphrase && text !== hookPassphrase
        ? `${hookPassphrase}: ${text}`
        : text;

      if (lastSessionId && isResuming) {
        resumeRun(text);
        await window.specwright.pipeline.start({
          userMessage: messageForHook,
          skipPermissions,
          resumeSessionId: lastSessionId,
        });
      } else if (isResuming) {
        resumeRun(text);
        const { phases, messages } = usePipelineStore.getState();
        const ctx = await window.specwright.pipeline.readContextFiles();
        const completedPhases = phases
          .filter(p => p.status === "done")
          .map(p => `${p.id}. ${p.label}`)
          .join(", ");
        const nextPhase = phases.find(p => p.status === "pending");
        const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant" && m.content);
        const sessionOutput = lastAssistantMsg?.content.slice(-3000) ?? "";

        const continuationPrompt = [
          hookPassphrase ? `${hookPassphrase}: User response: ${text}` : `User response: ${text}`,
          ``,
          completedPhases ? `Completed phases: ${completedPhases}` : ``,
          nextPhase ? `Next phase to execute: ${nextPhase.id}. ${nextPhase.label}` : `Continue with remaining phases.`,
          ``,
          `## CONTEXT FROM PREVIOUS SESSION`,
          ctx.plan ? `### Test Plan\n\`\`\`\n${ctx.plan}\n\`\`\`\n` : ``,
          ctx.seed ? `### Seed File\n\`\`\`javascript\n${ctx.seed}\n\`\`\`\n` : ``,
          ctx.conventions,
          `### Previous Session Output (last 3000 chars)`,
          sessionOutput,
        ].filter(Boolean).join("\n");

        await window.specwright.pipeline.start({
          userMessage: continuationPrompt,
          skipPermissions,
        });
      } else {
        startRun(text);
        await window.specwright.pipeline.start({
          userMessage: messageForHook,
          skipPermissions,
        });
      }
    }
  }, [inputText, isRunning, injectUserMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="operator-run-view flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="operator-runbar">
        <div className="operator-run-status">
          <span
            className={`operator-run-dot ${
              abortRequested ? "operator-run-dot-warning" :
              isRunning ? "operator-run-dot-active" :
              status === "error" ? "operator-run-dot-danger" :
              status === "done" ? "operator-run-dot-success" :
              status === "aborted" ? "operator-run-dot-warning" : ""
            }`}
          />
          <div className="min-w-0">
            <p className="operator-run-title">{runStatusTitle}</p>
            <p className="operator-run-detail">{controlFeedback ?? runStatusDetail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <>
              {!isDirectTestRun && (
                <button
                  onClick={async () => {
                    setControlFeedback("Interrupt requested...");
                    const result = await window.specwright.pipeline.interrupt() as unknown as { ok?: boolean; reason?: string };
                    setControlFeedback(result.ok ? "Interrupt sent" : result.reason === "test-process" ? "Tests cannot pause; use Abort" : "Nothing to interrupt");
                  }}
                  disabled={abortRequested}
                  className="operator-button operator-button-compact text-[var(--sw-accent-strong)] hover:border-[var(--sw-accent)] hover:text-[var(--sw-accent-strong)]"
                  title="Pause Claude — stops current turn, you can type new instructions"
                >
                  <Pause className="operator-icon" weight="bold" /> Interrupt
                </button>
              )}
              <button
                onClick={requestAbort}
                disabled={abortRequested}
                className="operator-button operator-button-compact operator-danger hover:border-[var(--sw-danger)] disabled:opacity-60"
                title="Stop the current generation or test process"
              >
                {abortRequested ? "Stopping" : "Abort run"}
              </button>
              <button
                onClick={abortAndBack}
                disabled={abortRequested}
                className="operator-button operator-button-compact operator-danger hover:border-[var(--sw-danger)] disabled:opacity-40"
                title="Stop the run and return to Create Tests"
              >
                Abort and back
              </button>
            </>
          )}
          {!isRunning && (
            <>
              <button
                onClick={onOpenRunPicker}
                className="operator-button operator-button-compact operator-toolbar-action-primary text-[var(--sw-accent-strong)] hover:border-[var(--sw-accent)] hover:text-[var(--sw-accent-strong)]"
              >
                Run Tests
              </button>
              <button
                onClick={clearFeed}
                className="operator-button operator-button-compact"
              >
                Back to Create Tests
              </button>
            </>
          )}
        </div>
      </div>

      {isDirectTestRun ? (
        <div className="operator-run-stage flex-1 min-h-0 overflow-hidden bg-operator-canvas p-5">
          <RunConsolePanel logLines={logLines} status={status} errorMessage={errorMessage} />
        </div>
      ) : (
      <div className="operator-run-stage flex-1 min-h-0 overflow-y-auto scrollable px-5 pt-5 pb-4 space-y-3 bg-operator-canvas" data-tab-staging="true">
        {messages.length > 0 && (
          <div className="operator-inline-panel">
            <p className="operator-label operator-text-accent">Session</p>
              <p className="operator-field-help">
                {isRunning
                  ? "Follow the active phase here. If a browser/test command is running, the right Run output panel shows the raw command stream."
                  : "Review the generated summary here, then run tests or go back to Create Tests to adjust the instructions."}
            </p>
          </div>
        )}
        {isRunning && messages.length === 0 && (
          <div className="flex items-center gap-3 text-stone-500 text-sm">
            <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent animate-spin" />
            Establishing session… (may take 15–20s with a large system prompt)
          </div>
        )}

        {groupMessagesByPhase(messages).map((group, groupIdx) => {
          const phase = group.phaseId ? phases.find((p) => p.id === group.phaseId) ?? null : null;
          const isActivePhase = phase?.status === "running";

          const messageBubbles = group.messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="border border-[color-mix(in_srgb,var(--sw-accent)_36%,transparent)] bg-[var(--sw-accent-soft)] px-4 py-2 max-w-[85%]">
                    <p className="operator-message-user-text whitespace-pre-wrap select-text cursor-text">{msg.content}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="group/msg relative">
                {msg.content ? (
                  <pre className="operator-message-text whitespace-pre-wrap break-words font-sans m-0 select-text cursor-text">
                    {renderWithLinks(displayedText.current.get(msg.id) ?? msg.content)}
                    {msg.isStreaming && !activeTool && (
                      <span className="inline-block w-0.5 h-4 bg-brand-400 ml-0.5 align-middle animate-pulse" />
                    )}
                  </pre>
                ) : msg.isStreaming ? (
                  <span className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 bg-stone-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-stone-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-stone-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : null}
                {msg.isStreaming && activeTool && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-operator-line">
                    <span className="w-3 h-3 border-2 border-[var(--sw-accent)] border-t-transparent animate-spin" />
                    <span className="operator-text-accent text-xs font-mono">{activeTool}</span>
                    <span className="operator-text-subtle text-xs">running</span>
                  </div>
                )}
                {msg.content && (
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="absolute top-0 right-0 opacity-0 group-hover/msg:opacity-100 operator-muted hover:text-operator-ink text-xs border border-operator-line hover:border-operator-line-strong px-2 py-1 bg-operator-canvas transition-all"
                  >
                    {copied === msg.id ? "Copied" : <><Copy className="operator-icon" weight="bold" /> Copy</>}
                  </button>
                )}
              </div>
            );
          });

          if (phase) {
            return (
              <div
                key={`phase-group-${group.phaseId}-${groupIdx}`}
                className={`border overflow-hidden ${
                  isActivePhase ? "border-brand-700/70" : "border-stone-800"
                }`}
              >
                <PhaseHeader phase={phase} isActive={isActivePhase} />
                {group.messages.some((m) => m.content || m.isStreaming) && (
                  <div className="px-5 py-4 space-y-3 bg-operator-panel/70">
                    {messageBubbles}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={`unphased-${groupIdx}`} className="space-y-3">
              {messageBubbles}
            </div>
          );
        })}

        <PermissionPrompt />
        <div ref={bottomRef} />
      </div>
      )}

      {/* Input bar */}
      {!isDirectTestRun && <div className="operator-run-composer operator-toolbar bg-operator-panel">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to guide the agent… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="operator-field flex-1 resize-none px-3 py-2 text-[13.5px] placeholder-stone-600"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="operator-button-primary self-stretch flex-shrink-0"
          >
            <PaperPlaneTilt className="operator-icon" weight="fill" /> Send
          </button>
        </div>
        <p className="text-stone-700 text-xs mt-1">
          The agent will receive your message and can respond or adjust its approach.
        </p>
      </div>}
    </div>
  );
}
