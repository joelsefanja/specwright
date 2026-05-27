/**
 * ClaudeAgentRunner — wraps @anthropic-ai/claude-agent-sdk for Specwright.
 *
 * Uses the official Agent SDK for native streaming, permission handling,
 * and tool call events — no stdout JSON parsing needed.
 */
// Dynamic import — Claude Agent SDK is ESM-only, but agent-runner compiles to CJS for Electron main process.
// We use new Function("specifier", "return import(specifier)") to prevent tsc from converting
// the dynamic import() into require() when compiling to CommonJS.
type QueryFn = typeof import("@anthropic-ai/claude-agent-sdk")["query"];
type PermissionResult = import("@anthropic-ai/claude-agent-sdk").PermissionResult;

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

async function loadSDK(): Promise<{ query: QueryFn }> {
  const sdk = await dynamicImport("@anthropic-ai/claude-agent-sdk") as typeof import("@anthropic-ai/claude-agent-sdk");
  return { query: sdk.query };
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  title?: string;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentRunOptions {
  systemPrompt: string;
  userMessage: string;
  cwd?: string;
  model?: string;
  allowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  /** Skip all permission prompts — auto-approve every tool call. Use with caution. */
  skipPermissions?: boolean;
  /** Resume a previous session instead of starting fresh. Pass the session ID from getLastSessionId(). */
  resumeSessionId?: string;
  onToken: (token: string) => void;
  onLog?: (line: string) => void;
  onToolStart?: (toolName: string, toolId: string) => void;
  onToolEnd?: (toolName: string, toolId: string, durationMs: number) => void;
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>;
  /**
   * Called when Phase 4 exploration is detected in Claude's output.
   * Receives the target URL. Return formatted snapshot data to inject
   * into the conversation, or null to skip.
   */
  onExplore?: (url: string) => Promise<string | null>;
}

/** Build a human-readable description of what a tool call wants to do. */
function buildDescription(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash") return `Run command: ${input["command"] ?? ""}`;
  if (toolName === "Write") return `Write file: ${input["file_path"] ?? ""}`;
  if (toolName === "Edit") return `Edit file: ${input["file_path"] ?? ""}`;
  if (toolName === "Read") return `Read file: ${input["file_path"] ?? ""}`;
  if (toolName === "Glob") return `Search files: ${input["pattern"] ?? ""}`;
  if (toolName === "Grep") return `Search content: ${input["pattern"] ?? ""}`;
  if (toolName === "Agent") return `Launch agent: ${input["description"] ?? ""}`;
  return `Use tool: ${toolName}`;
}

/**
 * Simple async queue — push messages in, the SDK pulls them out via async iteration.
 * This keeps the session alive across multiple user/assistant turns.
 */
class MessageQueue {
  private queue: Array<{ type: "user"; message: { role: "user"; content: string }; parent_tool_use_id: null; priority?: "now" | "next" }> = [];
  private resolve: (() => void) | null = null;
  private closed = false;

  push(text: string, priority: "now" | "next" = "now"): void {
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      priority,
    });
    this.resolve?.();
    this.resolve = null;
  }

  close(): void {
    this.closed = true;
    this.resolve?.();
    this.resolve = null;
  }

  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        await new Promise<void>((r) => { this.resolve = r; });
      }
    }
    // Drain remaining
    while (this.queue.length > 0) {
      yield this.queue.shift()!;
    }
  }
}

type QueryFnReturn = ReturnType<QueryFn>;

export class ClaudeAgentRunner {
  private abortCtrl: AbortController | null = null;
  private activeQuery: QueryFnReturn | null = null;
  private messageQueue: MessageQueue | null = null;
  /** Session ID from the last completed run — used for resumption. */
  private lastSessionId: string | null = null;
  /** Last run options — needed for session resumption with same config. */
  private lastRunOptions: AgentRunOptions | null = null;

  async run(options: AgentRunOptions): Promise<string> {
    const {
      systemPrompt,
      userMessage,
      cwd,
      model,
      allowedTools,
      mcpServers,
      skipPermissions,
      resumeSessionId,
      onToken,
      onLog,
      onToolStart,
      onToolEnd,
      onPermissionRequest,
      onExplore,
    } = options;

    // Respect the same env-based overrides as AiSdkRunner so both runners
    // can be configured from the desktop UI. This will prefer an explicit
    // SPECWRIGHT_MODEL env var and logs the provider selection.
    const envProvider = (process.env.SPECWRIGHT_LLM_PROVIDER ?? "anthropic").toLowerCase();
    const envModel = process.env.SPECWRIGHT_MODEL ?? model;
    const envBaseUrl = process.env.SPECWRIGHT_LLM_BASE_URL;
    if (envProvider !== "anthropic") {
      onLog?.(`[claude-runner] SPECWRIGHT_LLM_PROVIDER=${envProvider} — running ClaudeAgentRunner but provider differs`);
    }
    if (envModel && envModel !== model) {
      onLog?.(`[claude-runner] Overriding model: ${model} -> ${envModel}`);
    }

    this.abortCtrl = new AbortController();
    this.lastRunOptions = options;
    let fullText = "";
    let explorationTriggered = false;
    const loggedSessions = new Set<string>();
    let hookBlockReason: string | null = null;

    // Track tool call timings and input details
    const toolTimings = new Map<string, {
      name: string;
      startMs: number;
      partialInput?: string;
      inputLogged?: boolean;
    }>();

    onLog?.(`[pipeline] Starting Claude Agent SDK…`);

    // Create message queue for follow-up messages (user responses during the session).
    // The initial message goes as a string prompt; follow-up messages stream in via streamInput().
    this.messageQueue = new MessageQueue();

    try {
      const { query: sdkQuery } = await loadSDK();
      this.activeQuery = sdkQuery({
        prompt: userMessage,
        options: {
          systemPrompt,
          cwd: cwd ?? process.cwd(),
          model: envModel,
          abortController: this.abortCtrl,
          includePartialMessages: true,
          includeHookEvents: true,
          // Resume a previous session — keeps full conversation history
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          // Don't load filesystem settings — MCP servers are passed explicitly via mcpServers.
          // Loading ["project"] would also load .mcp.json which can crash if servers need auth.
          // Loading ["user"] pulls in 20+ claude.ai MCP servers causing slow startup.

          // Skip all permission prompts when enabled — needs both flags for Agent SDK v0.1.0+
          ...(skipPermissions ? {
            permissionMode: "bypassPermissions" as const,
            allowDangerouslySkipPermissions: true,
          } : {}),

          // MCP servers (Playwright, e2e-automation, etc.)
          mcpServers: mcpServers ?? {},

          // Auto-allow safe tools; Bash still goes through canUseTool for approval
          allowedTools: skipPermissions
            ? undefined  // all tools auto-approved when skip permissions is on
            : (allowedTools ?? [
              "Read", "Glob", "Grep", "Agent", "Skill", "ToolSearch",
              "Write", "Edit",
            ]),

          // Permission callback — ALWAYS provide to handle MCP consent flows.
          // When skipPermissions is on, auto-approve everything including MCP tools.
          // When off, route through the UI permission prompt.
          canUseTool: async (
            toolName: string,
            input: Record<string, unknown>,
            opts
          ): Promise<PermissionResult> => {
            // Auto-approve everything when skip permissions is enabled
            if (skipPermissions) {
              onLog?.(`[permission] Auto-approved: ${toolName}`);
              return { behavior: "allow", updatedInput: input };
            }

            const title = opts.title ?? buildDescription(toolName, input);
            const description = opts.description ?? buildDescription(toolName, input);

            // If no permission handler provided, auto-allow
            if (!onPermissionRequest) {
              onLog?.(`[permission] Auto-allowing ${toolName} (no handler)`);
              return { behavior: "allow", updatedInput: input };
            }

            onLog?.(`[permission] ${toolName} — awaiting approval`);

            const allowed = await onPermissionRequest({
              id: opts.toolUseID,
              toolName,
              toolInput: input,
              description,
              title,
            });

            if (allowed) {
              onLog?.(`[permission] ${toolName} — allowed`);
              return { behavior: "allow", updatedInput: input };
            } else {
              onLog?.(`[permission] ${toolName} — denied`);
              return { behavior: "deny", message: "User denied this tool use" };
            }
          },
        },
      });

      onLog?.(`[pipeline] Session starting…`);

      // Wire the message queue for multi-turn conversation.
      // streamInput() lets the SDK pull follow-up user messages without closing the session.
      this.activeQuery.streamInput(
        this.messageQueue as unknown as AsyncIterable<{ type: "user"; message: { role: "user"; content: string }; parent_tool_use_id: null }>
      );

      for await (const message of this.activeQuery) {
        const type = (message as Record<string, unknown>).type as string;

        // Streaming text deltas
        if (type === "stream_event") {
          const event = (message as Record<string, unknown>).event as Record<string, unknown>;
          const eventType = event?.type as string;

          // Tool call started
          if (eventType === "content_block_start") {
            const block = event.content_block as Record<string, unknown>;
            if (block?.type === "tool_use") {
              const toolId = (block.id as string) ?? "";
              const toolName = (block.name as string) ?? "unknown";
              toolTimings.set(toolId, { name: toolName, startMs: Date.now() });
              onToolStart?.(toolName, toolId);
              onLog?.(`[tool] ${toolName} — started`);
            }
          }

          // Tool input streaming — capture input to show meaningful details
          if (eventType === "content_block_delta") {
            const delta = event.delta as Record<string, unknown>;
            if (delta?.type === "input_json_delta") {
              const chunk = (delta.partial_json as string) ?? "";
              if (chunk) {
                // Find the most recent un-logged tool
                for (const [, entry] of toolTimings) {
                  if (!entry.inputLogged) {
                    entry.partialInput = (entry.partialInput ?? "") + chunk;
                    // Extract summary from accumulated JSON fragments
                    const input = entry.partialInput;
                    let summary = "";
                    if (entry.name === "Bash") {
                      const m = input.match(/"command"\s*:\s*"([^"]{1,120})/);
                      if (m) summary = m[1];
                    } else if (entry.name === "Read" || entry.name === "Write" || entry.name === "Edit") {
                      const m = input.match(/"file_path"\s*:\s*"([^"]+)"/);
                      if (m) summary = m[1].split("/").slice(-2).join("/");
                    } else if (entry.name === "Glob") {
                      const m = input.match(/"pattern"\s*:\s*"([^"]+)"/);
                      if (m) summary = m[1];
                    } else if (entry.name === "Grep") {
                      const m = input.match(/"pattern"\s*:\s*"([^"]+)"/);
                      if (m) summary = m[1];
                    } else if (entry.name === "Agent") {
                      const m = input.match(/"description"\s*:\s*"([^"]{1,80})/);
                      if (m) summary = m[1];
                    } else if (entry.name === "Skill") {
                      const m = input.match(/"skill"\s*:\s*"([^"]+)"/);
                      if (m) summary = m[1];
                    }
                    if (summary && !entry.inputLogged) {
                      entry.inputLogged = true;
                      onLog?.(`[tool] ${entry.name}: ${summary}`);
                    }
                    break;
                  }
                }
              }
            }
          }

          // Text streaming
          if (eventType === "content_block_delta") {
            const delta = event.delta as Record<string, unknown>;
            if (delta?.type === "text_delta") {
              const token = (delta.text as string) ?? "";
              if (token) {
                fullText += token;
                onToken(token);

                // Phase 4 detection: when Claude outputs the Phase 4 heading + a URL,
                // trigger code-driven browser exploration and inject results.
                // Must match the actual "## Phase 4" heading, NOT checklist items like "- □ Phase 4:".
                // Uses a 500-char window after the heading to find the URL.
                if (!explorationTriggered && onExplore) {
                  const phase4Match = fullText.match(/##\s*Phase\s*4[^\n]*\n([\s\S]{0,500}?)(https?:\/\/[^\s"'`\)]+)/i);
                  if (phase4Match) {
                    explorationTriggered = true;
                    const targetUrl = phase4Match[2];
                    onLog?.(`[explorer] Phase 4 detected — exploring ${targetUrl}`);
                    onExplore(targetUrl).then((snapshot) => {
                      if (snapshot && this.messageQueue) {
                        this.messageQueue.push(snapshot, "next");
                        onLog?.("[explorer] Snapshot injected into conversation");
                      }
                    }).catch((err) => {
                      onLog?.(`[explorer] Exploration failed: ${String(err)}`);
                    });
                  }
                }
              }
            }
          }

          continue;
        }

        // Tool result — match by tool_use_id to log completion
        if (type === "user") {
          const msg = message as Record<string, unknown>;
          const msgContent = (msg.message as Record<string, unknown>);
          const content = (msgContent?.content as Array<Record<string, unknown>>) ?? [];
          for (const block of content) {
            if (block.type === "tool_result") {
              const toolUseId = (block.tool_use_id as string) ?? "";
              const entry = toolTimings.get(toolUseId);
              if (entry) {
                const elapsed = Date.now() - entry.startMs;
                toolTimings.delete(toolUseId);
                onToolEnd?.(entry.name, toolUseId, elapsed);
                onLog?.(`[tool] ${entry.name} — done (${(elapsed / 1000).toFixed(1)}s)`);
              }
            }
          }
          continue;
        }

        // Complete assistant message (non-streaming fallback)
        if (type === "assistant") {
          const msg = message as Record<string, unknown>;
          const msgContent = (msg.message as Record<string, unknown>);
          const content = (msgContent?.content as Array<Record<string, unknown>>) ?? [];
          for (const block of content) {
            if (block.type === "text") {
              const text = block.text as string;
              if (text && !fullText) {
                fullText += text;
                onToken(text);
              }
            }
          }
          continue;
        }

        // Result
        if (type === "result") {
          const result = message as Record<string, unknown>;
          const cost = (result.total_cost_usd as number) ?? 0;
          const ms = (result.duration_ms as number) ?? 0;
          const usage = result.usage as Record<string, unknown> | undefined;
          const inputTokens = (usage?.input_tokens as number) ?? 0;
          const outputTokens = (usage?.output_tokens as number) ?? 0;
          onLog?.(`[pipeline] Done — ${ms}ms, cost $${cost.toFixed(4)}, tokens: ${inputTokens}in/${outputTokens}out`);

          // Detect hook-blocked scenario: 0 API tokens + hook returned "block".
          // The block reason was already emitted as visible text in the hook_response handler.
          if (inputTokens === 0 && outputTokens === 0 && hookBlockReason) {
            throw new Error(hookBlockReason);
          }

          // Detect silent failure: 0 tokens but no known block reason
          if (inputTokens === 0 && outputTokens === 0 && !fullText) {
            onLog?.(`[pipeline] WARNING: 0 API tokens — prompt may have been blocked by a policy`);
          }

          if (!fullText && result.result) {
            fullText = result.result as string;
            onToken(fullText);
          }
          continue;
        }

        // System messages — init, hooks, state changes
        if (type === "system") {
          const sys = message as Record<string, unknown>;
          const subtype = (sys.subtype as string) ?? "";
          const sessionId = (sys.session_id as string) ?? "";
          const model = (sys.model as string) ?? "";

          // Detect hook blocking — managed policies can silently block prompts
          // by returning {"decision": "block", "reason": "..."} from UserPromptSubmit hooks.
          if (subtype === "hook_response") {
            const hookEvent = (sys.hook_event as string) ?? "";
            const output = (sys.output as string) ?? "";
            try {
              const parsed = JSON.parse(output) as Record<string, unknown>;
              if (parsed.decision === "block") {
                const reason = (parsed.reason as string) ?? "Prompt blocked by a policy";
                hookBlockReason = reason;
                onLog?.(`[hook] BLOCKED by ${hookEvent}: ${reason}`);
                // Emit block reason as visible text so the user sees it in the chat immediately
                const blockMsg = `\n\n**Blocked by policy:** ${reason}\n`;
                fullText += blockMsg;
                onToken(blockMsg);
              }
            } catch { /* output isn't JSON — safe to ignore */ }
          }

          // Only log session info once per session, and only when model is known
          if (model && !loggedSessions.has(sessionId)) {
            loggedSessions.add(sessionId);
            // Track primary session ID for resumption
            if (loggedSessions.size === 1) this.lastSessionId = sessionId;
            onLog?.(`[pipeline] Session ${sessionId} model=${model}`);

            // Log MCP server status only for the primary session (first one)
            if (loggedSessions.size === 1) {
              const mcpStatus = sys.mcp_servers as Array<Record<string, unknown>> ?? [];
              for (const server of mcpStatus) {
                const name = server.name as string;
                const status = server.status as string;
                if (status === "connected") {
                  onLog?.(`[mcp] ✓ ${name}`);
                } else if (status === "failed") {
                  onLog?.(`[mcp] ✕ ${name} — FAILED`);
                } else if (status === "needs-auth") {
                  onLog?.(`[mcp] ⚠ ${name} — needs auth`);
                }
              }
            }
          }
          continue;
        }
      }
    } catch (err) {
      if (this.abortCtrl?.signal.aborted) {
        onLog?.(`[pipeline] Aborted by user`);
      } else {
        throw err;
      }
    } finally {
      this.messageQueue?.close();
      this.activeQuery = null;
      this.abortCtrl = null;
      this.messageQueue = null;
    }

    return fullText;
  }

  /**
   * Send a message to the running session.
   * If the session is still alive, pushes to the message queue.
   * Returns true if the message was delivered or will be delivered via resume.
   */
  sendMessage(text: string, _priority: "now" | "next" = "now"): boolean {
    if (this.messageQueue) {
      this.messageQueue.push(text, _priority);
      return true;
    }
    // Session ended — return false so caller can resume via run() with lastSessionId
    return false;
  }

  /** Session ID from the last completed run. Use to resume with `run()`. */
  getLastSessionId(): string | null {
    return this.lastSessionId;
  }

  /** Last run options — needed for session resumption with same config. */
  getLastRunOptions(): AgentRunOptions | null {
    return this.lastRunOptions;
  }

  /**
   * Interrupt the current turn — Claude stops and waits for new input.
   * Softer than abort — the session stays alive.
   */
  async interrupt(): Promise<void> {
    if (!this.activeQuery) return;
    try {
      await this.activeQuery.interrupt();
    } catch {
      // ignore if already stopped
    }
  }

  /**
   * Abort the session completely — kills the process.
   * Wrapped in try-catch to suppress EPIPE errors from broken pipes.
   */
  abort(): void {
    try { this.messageQueue?.close(); } catch { /* ignore */ }
    try { this.abortCtrl?.abort(); } catch { /* ignore */ }
    try { this.activeQuery?.close(); } catch { /* ignore */ }
    this.activeQuery = null;
    this.abortCtrl = null;
    this.messageQueue = null;
  }
}
