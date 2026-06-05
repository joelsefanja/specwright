import React, { useEffect, useRef, useState, useCallback, useReducer } from "react";
import { Pause, PaperPlaneTilt } from "@phosphor-icons/react";
import PermissionPrompt from "./PermissionPrompt";
import { RunConsolePanel } from "./RunConsolePanel";
import { MessageGroup } from "./MessageGroup";
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
        ? "Test wordt gemaakt"
        : status === "done"
          ? "Klaar"
          : status === "aborted"
            ? "Gestopt"
            : status === "error"
              ? "Niet gelukt"
              : "Status";
  const runStatusDetail = abortRequested
    ? "Specwright stopt. Dit kan een paar seconden duren."
    : activeTool
      ? "Specwright is bezig. Details staan bij Uitvoer."
      : isRunning
        ? "Specwright werkt aan je test."
      : status === "done"
          ? "Bekijk het resultaat of pas je test aan."
        : status === "aborted"
            ? "De run is gestopt. Je kunt later verdergaan."
          : status === "error"
              ? errorMessage ?? "Bekijk de uitvoer voor wat misging."
              : "Nog niets gestart.";

  const requestAbort = useCallback(async (): Promise<boolean> => {
    setAbortRequested(true);
    setControlFeedback("Stoppen aangevraagd...");
    const result = await window.specwright.pipeline.abort() as unknown as { ok?: boolean };
    setControlFeedback(result.ok ? "Run stoppen..." : "Er draait niets");
    if (!result.ok) setAbortRequested(false);
    return Boolean(result.ok);
  }, []);

  const abortAndBack = useCallback(async () => {
    abortBackRequestedRef.current = true;
    const requested = await requestAbort();
    if (requested) {
      setControlFeedback("Run stoppen en terug naar test maken...");
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

  const onCopyMessage = useCallback((id: string, text: string) => {
    if (!text) {
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const onSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) {
      return;
    }

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

  const onComposerKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

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
                  ? "Volg hier wat Specwright doet. Details staan bij Uitvoer."
                  : "Bekijk het resultaat of pas je test aan."}
            </p>
          </div>
        )}
        {isRunning && messages.length === 0 && (
          <div className="flex items-center gap-3 text-stone-500 text-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Specwright wordt gestart...
          </div>
        )}

        {groupMessagesByPhase(messages).map((group, groupIndex) => (
          <MessageGroup
            key={group.phaseId ? `phase-group-${group.phaseId}-${groupIndex}` : `unphased-${groupIndex}`}
            activeTool={activeTool}
            copiedMessageId={copied}
            displayedText={displayedText.current}
            group={group}
            groupIndex={groupIndex}
            onCopyMessage={onCopyMessage}
            phases={phases}
          />
        ))}

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
            onKeyDown={onComposerKeyDown}
            placeholder="Geef extra aanwijzingen..."
            rows={2}
            className="operator-field flex-1 resize-none px-3 py-2 text-[13.5px] placeholder-stone-600"
          />
          <button
            onClick={onSend}
            disabled={!inputText.trim()}
            className="operator-button-primary flex-shrink-0"
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
