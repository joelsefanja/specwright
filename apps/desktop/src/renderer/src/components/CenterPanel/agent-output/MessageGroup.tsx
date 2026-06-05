import React from "react";
import { Copy } from "@phosphor-icons/react";
import { type ChatMessage, type Phase } from "@renderer/store/pipeline.store";
import { PhaseHeader } from "./PhaseHeader";
import { StreamingCursor, StreamingDots } from "./StreamingIndicators";

interface MessageGroupData {
  phaseId: number | undefined;
  messages: ChatMessage[];
}

interface MessageGroupProps {
  activeTool: string | null;
  copiedMessageId: string | null;
  displayedText: Map<string, string>;
  group: MessageGroupData;
  groupIndex: number;
  onCopyMessage: (id: string, text: string) => void;
  phases: Phase[];
}

const URL_REGEX = /https?:\/\/[^\s)>\]'"\\]+/g;

function renderWithLinks(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[0];
    const onLinkClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      window.specwright.shell.openUrl(url);
    };

    parts.push(
      <a
        key={match.index}
        href="#"
        onClick={onLinkClick}
        className="text-brand-400 hover:text-brand-300 underline decoration-brand-700 hover:decoration-brand-400 cursor-pointer transition-colors"
        title={`Open ${url}`}
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

export function MessageGroup({
  activeTool,
  copiedMessageId,
  displayedText,
  group,
  groupIndex,
  onCopyMessage,
  phases,
}: MessageGroupProps): React.JSX.Element {
  const phase = group.phaseId ? phases.find((phaseItem) => phaseItem.id === group.phaseId) ?? null : null;
  const isActivePhase = phase?.status === "running";

  const messageBubbles = group.messages.map((message) => {
    if (message.role === "user") {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="border border-[color-mix(in_srgb,var(--sw-accent)_36%,transparent)] bg-[var(--sw-accent-soft)] px-4 py-2 max-w-[85%]">
            <p className="operator-message-user-text whitespace-pre-wrap select-text cursor-text">{message.content}</p>
          </div>
        </div>
      );
    }

    return (
      <div key={message.id} className="group/msg relative">
        {message.content ? (
          <pre className="operator-message-text whitespace-pre-wrap break-words font-sans m-0 select-text cursor-text">
            {renderWithLinks(displayedText.get(message.id) ?? message.content)}
            {message.isStreaming && !activeTool && (
              <StreamingCursor />
            )}
          </pre>
        ) : message.isStreaming ? (
          <StreamingDots />
        ) : null}
        {message.isStreaming && activeTool && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-operator-line">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--sw-accent)] border-t-transparent" />
            <span className="operator-text-accent text-xs font-mono">{activeTool}</span>
            <span className="operator-text-subtle text-xs">running</span>
          </div>
        )}
        {message.content && (
          <button
            onClick={() => onCopyMessage(message.id, message.content)}
            className="absolute top-0 right-0 opacity-0 group-hover/msg:opacity-100 operator-muted hover:text-operator-ink text-xs border border-operator-line hover:border-operator-line-strong px-2 py-1 bg-operator-canvas transition-all"
          >
            {copiedMessageId === message.id ? "Copied" : <><Copy className="operator-icon" weight="bold" /> Copy</>}
          </button>
        )}
      </div>
    );
  });

  if (phase) {
    return (
      <div
        key={`phase-group-${group.phaseId}-${groupIndex}`}
        className={`border overflow-hidden ${
          isActivePhase ? "border-brand-700/70" : "border-stone-800"
        }`}
      >
        <PhaseHeader phase={phase} isActive={isActivePhase} />
        {group.messages.some((message) => message.content || message.isStreaming) && (
          <div className="px-5 py-4 space-y-3 bg-operator-panel/70">
            {messageBubbles}
          </div>
        )}
      </div>
    );
  }

  return (
    <div key={`unphased-${groupIndex}`} className="space-y-3">
      {messageBubbles}
    </div>
  );
}
