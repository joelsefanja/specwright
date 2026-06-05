import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePipelineStore, type ChatMessage } from "@renderer/store/pipeline.store";
import { useConfigStore } from "@renderer/store/config.store";
import PermissionPrompt from "./PermissionPrompt";
import { StreamingCursor, StreamingDots } from "./StreamingIndicators";

// --- Individual message bubble ---
function MessageBubble({ msg }: { msg: ChatMessage }): React.JSX.Element {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {/* Avatar for assistant */}
      {!isUser && (
        <div className="operator-label text-brand-400 mr-2 mt-1">
          SW
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "order-1" : ""}`}>
        <div
          className={`border px-4 py-2 text-[13.5px] leading-relaxed ${
            isUser
              ? "bg-brand-950/40 text-brand-100 border-brand-800"
              : "bg-operator-field text-stone-100 border-operator-line"
          }`}
        >
          {msg.content ? (
            <pre className="whitespace-pre-wrap break-words font-sans m-0">
              {msg.content}
            </pre>
          ) : (
            <StreamingDots className="h-4" />
          )}

          {/* Blinking cursor while streaming */}
          {msg.isStreaming && msg.content && (
            <StreamingCursor className="h-3.5" />
          )}
        </div>
      </div>

      {/* Avatar for user */}
      {isUser && (
        <div className="operator-label text-stone-400 ml-2 mt-1">
          U
        </div>
      )}
    </div>
  );
}

// --- Chat input bar ---
function ChatInput(): React.JSX.Element {
  const { status, startRun, pendingPermission } = usePipelineStore();
  const { claudeAuth, apiKey, selectedPreset } = useConfigStore();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = status === "running";
  const isWaitingPermission = pendingPermission !== null;
  const hasClaudeCode = claudeAuth?.loggedIn === true;
  const canRun = hasClaudeCode || Boolean(apiKey);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isRunning || !canRun) return;

    const runMode: "claude-code" | "api-key" = hasClaudeCode ? "claude-code" : "api-key";
    startRun(msg);
    setInput("");

    const { skipPermissions } = useConfigStore.getState();
    await window.specwright.pipeline.start({
      systemPromptPath: selectedPreset || undefined,
      systemPrompt: selectedPreset
        ? undefined
        : "You are a helpful AI assistant.",
      userMessage: msg,
      mode: runMode,
      skipPermissions,
    });
  }, [input, isRunning, canRun, hasClaudeCode, selectedPreset, startRun]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleAbort = () => {
    window.specwright.pipeline.abort();
  };

  return (
    <div className="operator-toolbar">
      {!canRun && (
        <p className="operator-danger text-xs mb-2">
          Add an API key or log in with Claude Code to start chatting.
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning || !canRun}
          placeholder={
            isWaitingPermission
              ? "Waiting for permission response…"
              : !canRun
                ? "Configure API key or Claude Code auth in the left panel…"
                : "Message Specwright… (Enter to send, Shift+Enter for newline)"
          }
          rows={1}
          className="operator-field flex-1 min-w-0 px-3 py-2 resize-none placeholder-stone-500 disabled:opacity-40 scrollable"
          style={{ maxHeight: "160px", overflowY: "auto" }}
        />

        {isRunning ? (
          <button
            onClick={handleAbort}
            className="operator-button flex-shrink-0 operator-danger hover:border-[var(--sw-danger)] px-4 py-2"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() || !canRun}
            className="operator-button-primary flex-shrink-0 px-4 py-2 disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
      <p className="operator-muted text-xs mt-1.5">
        {hasClaudeCode ? "Using Claude Code CLI" : "Using API key"} · Shift+Enter for new line
      </p>
    </div>
  );
}

// --- Main ChatPanel ---
export default function ChatPanel(): React.JSX.Element {
  const { messages, status, clearFeed, pendingPermission } = usePipelineStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages or permission changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingPermission]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="operator-toolbar-compact flex items-center justify-end">
        {messages.length > 0 && (
          <button
            onClick={clearFeed}
            disabled={status === "running"}
            className="operator-muted hover:text-stone-300 disabled:opacity-30 text-xs transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollable px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <span className="text-5xl">◈</span>
            <p className="text-sm text-center">
              Start a conversation.<br />
              <span className="text-xs">Specwright will answer in this panel.</span>
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Permission prompt — shown inline in the chat flow */}
        <PermissionPrompt />

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <ChatInput />
    </div>
  );
}
