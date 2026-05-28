import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderConfig, DirectGenerateResult, AbortHandle } from "./types";

/* ------------------------------------------------------------------ */
/*  Session lifecycle — reused across pipeline steps                   */
/* ------------------------------------------------------------------ */

let _sessionId: string | null = null;
let _sessionBaseUrl: string | null = null;
let _sessionProviderId: string | null = null;
let _sessionModelId: string | null = null;
let _activeSseController: AbortController | null = null;

/**
 * Ensure a session exists for the given server/project.
 * Reuses the existing session if one is still alive, avoiding
 * create/delete overhead between tool-call steps and keeping
 * the model's conversation context intact.
 */
async function ensureSession(
  baseUrl: string,
  providerID: string,
  modelId: string | undefined,
  directory?: string,
): Promise<string> {
  if (
    _sessionId &&
    _sessionBaseUrl === baseUrl &&
    _sessionProviderId === providerID &&
    _sessionModelId === (modelId ?? null)
  ) {
    return _sessionId;
  }

  const sessionPath = directory
    ? `/session?directory=${encodeURIComponent(directory)}`
    : "/session";
  const sessionRes = await apiFetch(baseUrl, sessionPath, {
    method: "POST",
    body: JSON.stringify({ title: "sw-opencode" }),
  });
  _sessionId = ((await sessionRes.json()) as { id: string }).id;
  _sessionBaseUrl = baseUrl;
  _sessionProviderId = providerID;
  _sessionModelId = modelId ?? null;

  return _sessionId;
}

/** Abort any in-flight SSE stream immediately. */
export function abortStream(): void {
  if (_activeSseController) {
    _activeSseController.abort();
    _activeSseController = null;
  }
}

/** Send an interrupt message to the current session (for interrupt button). */
export async function interruptSession(message: string): Promise<void> {
  if (_sessionId && _sessionBaseUrl) {
    try {
      await apiFetch(_sessionBaseUrl, `/session/${_sessionId}/prompt_async`, {
        method: "POST",
        body: JSON.stringify({
          parts: [{ type: "text", text: message }],
        }),
      });
    } catch { /* session may already be deleted */ }
  }
}

/** Delete the cached session if one exists. */
export async function cleanupSession(): Promise<void> {
  abortStream();
  if (_sessionId && _sessionBaseUrl) {
    try {
      await apiFetch(_sessionBaseUrl, `/session/${_sessionId}`, {
        method: "DELETE",
      });
    } catch { /* ignore */ }
    _sessionId = null;
    _sessionBaseUrl = null;
    _sessionProviderId = null;
    _sessionModelId = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers — opencode server HTTP API                        */
/* ------------------------------------------------------------------ */

interface Part {
  type: string;
  text?: string;
}

interface MessageResponse {
  info: {
    modelID: string;
    tokens: { total: number; input: number; output: number };
    finish: string;
  };
  parts: Part[];
}

interface ProviderEndpointResponse {
  all?: Array<{ id: string; models?: Record<string, unknown> }>;
  default: Record<string, string>;
  connected: string[];
}

function isPreferredGptProvider(providerId: string): boolean {
  const id = providerId.toLowerCase();
  return id.includes("opencode") || id.includes("openai") || id.includes("chatgpt");
}

function pickPreferredProvider(data: ProviderEndpointResponse): string | undefined {
  return (
    data.connected.find((providerId) => isPreferredGptProvider(providerId) && data.default[providerId]) ??
    data.connected.find((providerId) => data.default[providerId]) ??
    data.connected[0]
  );
}

function createMessageId(): string {
  return `sw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function apiFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) },
    signal: AbortSignal.timeout(180_000),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`opencode API ${res.status} ${path}: ${text}`);
  }
  return res;
}

function extractText(parts: Part[]): string {
  return parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
}

/* ------------------------------------------------------------------ */
/*  SSE event stream — parse Server-Sent Events from /global/event    */
/* ------------------------------------------------------------------ */

async function* sseEventStream(
  url: string,
  signal?: AbortSignal
): AsyncGenerator<{ event?: string; data: unknown }> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`SSE ${response.status}: ${response.statusText}`);
  const body = response.body;
  if (!body) throw new Error("SSE response has no body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const block of parts) {
      if (!block.trim()) continue;
      const lines = block.split("\n");
      let event: string | undefined;
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }

      if (dataStr) {
        try {
          yield { event, data: JSON.parse(dataStr) };
        } catch { /* skip malformed JSON */ }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public helpers used by the UI layer                                */
/* ------------------------------------------------------------------ */

/** Check if an opencode server is healthy. */
export async function healthCheck(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Detect the default model from a running opencode server. */
export async function detectModel(baseUrl: string): Promise<{
  modelId: string;
  providerId: string;
} | null> {
  try {
    const res = await fetch(`${baseUrl}/provider`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as ProviderEndpointResponse;
    const pid = pickPreferredProvider(data);
    if (!pid) return null;
    return { modelId: data.default[pid], providerId: pid };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider model→ID mapping — discover from /provider once per base  */
/* ------------------------------------------------------------------ */

let _cachedProviderMap: Record<string, string> | null = null;
let _cachedProviderModels: Record<string, string[]> | null = null;
let _cachedBaseUrl: string | null = null;

async function resolveProviderId(baseUrl: string, modelId?: string): Promise<string> {
  if (!_cachedProviderMap || _cachedBaseUrl !== baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/provider`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = (await res.json()) as ProviderEndpointResponse;
        _cachedProviderMap = data.default;
        _cachedProviderModels = Object.fromEntries(
          (data.all ?? []).map((provider) => [provider.id, Object.keys(provider.models ?? {})])
        );
        _cachedBaseUrl = baseUrl;
      }
    } catch { /* fall through */ }
  }
  if (!_cachedProviderMap) return "";

  // If a specific model was requested, find the provider that has it as default
  if (modelId) {
    for (const [pid, model] of Object.entries(_cachedProviderMap)) {
      if (model === modelId) return pid;
    }
    for (const [pid, models] of Object.entries(_cachedProviderModels ?? {})) {
      if (models.includes(modelId)) return pid;
    }
  }

  // Prefer OpenCode Zen/OpenAI/ChatGPT when no exact model/provider match is available.
  const openAiEntry = Object.entries(_cachedProviderMap).find(([pid]) => isPreferredGptProvider(pid));
  if (openAiEntry) return openAiEntry[0];

  const first = Object.entries(_cachedProviderMap)[0];
  return first?.[0] ?? "";
}

/* ------------------------------------------------------------------ */
/*  Prompt conversion — AI SDK V3 format → opencode text               */
/* ------------------------------------------------------------------ */

/**
 * Convert AI SDK LanguageModelV3Prompt + tools into a system prompt
 * and user message for the OpenCode API.
 */
function convertPrompt(
  prompt: unknown[],
  tools?: { name: string; description?: string; inputSchema?: unknown }[],
): { system: string; userMessage: string } {
  let systemParts: string[] = [];
  const userParts: string[] = [];

  // Describe available tools
  if (tools && tools.length > 0) {
    const toolLines: string[] = ["Available tools:"];
    for (const t of tools) {
      const desc = t.description ? `— ${t.description}` : "";
      toolLines.push(`- ${t.name}${desc ? " " + desc : ""}`);
    }
    systemParts.push(toolLines.join("\n"));
  }

  for (const msg of prompt) {
    const m = msg as { role: string; content: unknown };
    if (m.role === "system") {
      systemParts.push(m.content as string);
    } else if (m.role === "user") {
      const content = (m.content as { type: string; text?: string }[]) ?? [];
      const text = content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
      if (text) userParts.push(text);
    } else if (m.role === "assistant") {
      const content = (m.content as { type: string; text?: string }[]) ?? [];
      const text = content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
      if (text) userParts.push(`[Previous response: ${text}]`);
    }
  }

  return {
    system: systemParts.join("\n\n").trim(),
    userMessage: userParts.join("\n") || "Continue",
  };
}

/* ------------------------------------------------------------------ */
/*  Shared message-sending logic (used by both doGenerate & doStream)  */
/* ------------------------------------------------------------------ */

async function sendToOpenCode(
  baseUrl: string,
  providerID: string,
  modelId: string | undefined,
  system: string,
  userMessage: string,
  variant: string | undefined,
  directory?: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const sessionId = await ensureSession(baseUrl, providerID, modelId, directory);

  const body: Record<string, unknown> = {
    messageID: createMessageId(),
    parts: [{ type: "text", text: userMessage }],
    model: modelId ? { modelID: modelId, providerID } : null,
    variant: variant || "low",
  };
  if (system) body.system = system;

  const msgRes = await apiFetch(baseUrl, `/session/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const result = (await msgRes.json()) as MessageResponse;

  return {
    text: extractText(result.parts),
    inputTokens: result.info.tokens.input,
    outputTokens: result.info.tokens.output,
  };
}

/* ------------------------------------------------------------------ */
/*  Streaming via SSE — send prompt_async, stream back events         */
/* ------------------------------------------------------------------ */

async function openCodeStreamFromEvents(
  baseUrl: string,
  providerID: string,
  modelId: string | undefined,
  system: string,
  userMessage: string,
  variant: string | undefined,
  directory?: string,
): Promise<ReadableStream> {
  const sseAbortController = new AbortController();
  _activeSseController = sseAbortController;

  const eventIter = sseEventStream(`${baseUrl}/event`, sseAbortController.signal);
  const iter = eventIter[Symbol.asyncIterator]();

  // Wait for initial server.connected event (confirms SSE is up)
  await iter.next();

  // Create or reuse session in the correct project directory
  const sessionId = await ensureSession(baseUrl, providerID, modelId, directory);

  // Send message asynchronously — returns 204 immediately
  const messageID = createMessageId();
  const body: Record<string, unknown> = {
    messageID,
    parts: [{ type: "text", text: userMessage }],
    model: modelId ? { modelID: modelId, providerID } : null,
    variant: variant || "low",
  };
  if (system) body.system = system;
  await apiFetch(baseUrl, `/session/${sessionId}/prompt_async`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return new ReadableStream({
    async start(controller) {
      const ctrl = controller as unknown as {
        enqueue: (part: Record<string, unknown>) => void;
        close: () => void;
      };

      let textStarted = false;
      const textId = "1";
      let inputTokens = 0;
      let outputTokens = 0;
      let sawMessageEvent = false;

      try {
        ctrl.enqueue({ type: "stream-start", warnings: [] });

        while (true) {
          const { done, value } = await iter.next();
          if (done) break;

          const event = value?.data as {
            type?: string;
            properties?: Record<string, unknown>;
          } | undefined;
          if (!event?.type || !event?.properties) continue;

          // Filter events by session ID
          const props = event.properties;
          const eventSid = props.sessionID as string | undefined;
          if (eventSid !== undefined && eventSid !== sessionId) continue;

          const eventType = event.type;

          const eventMessageID =
            (props.messageID as string | undefined) ??
            ((props.info as Record<string, unknown> | undefined)?.id as string | undefined) ??
            ((props.part as Record<string, unknown> | undefined)?.messageID as string | undefined);
          if (eventMessageID && eventMessageID !== messageID) continue;
          if (eventMessageID === messageID) sawMessageEvent = true;

          // Skip setup/heartbeat events
          if (
            eventType === "server.connected" ||
            eventType === "server.heartbeat" ||
            eventType === "session.next.agent.switched" ||
            eventType === "session.next.model.switched" ||
            eventType === "session.updated" ||
            eventType === "session.diff"
          ) continue;

          if (eventType === "message.part.delta") {
            // Incremental text delta from the model
            const field = props.field as string | undefined;
            const delta = props.delta as string | undefined;
            if (field === "text" && delta) {
              if (!textStarted) {
                ctrl.enqueue({ type: "text-start", id: textId });
                textStarted = true;
              }
              ctrl.enqueue({ type: "text-delta", id: textId, delta });
            }
          } else if (eventType === "session.error") {
            const error = props.error as { data?: { message?: string }; message?: string; name?: string } | undefined;
            throw new Error(error?.data?.message ?? error?.message ?? error?.name ?? "OpenCode session error");
          } else if (eventType === "message.part.updated") {
            const part = props.part as Record<string, unknown> | undefined;
            if (part?.type === "step-finish") {
              const tokens = part.tokens as Record<string, unknown> | undefined;
              if (tokens) {
                inputTokens = (tokens.input as number) ?? inputTokens;
                outputTokens = (tokens.output as number) ?? outputTokens;
              }
            }
          } else if (eventType === "message.updated") {
            const info = props.info as Record<string, unknown> | undefined;
            if (info?.tokens) {
              const t = info.tokens as Record<string, unknown>;
              inputTokens = (t.input as number) ?? inputTokens;
              outputTokens = (t.output as number) ?? outputTokens;
            }
          } else if (eventType === "session.status") {
            const status = props.status as { type?: string } | undefined;
            if (status?.type === "idle" && sawMessageEvent) break;
          } else if (eventType === "session.idle") {
            if (sawMessageEvent) break;
          }
        }

        if (textStarted) {
          ctrl.enqueue({ type: "text-end", id: textId });
        }

        ctrl.enqueue({
          type: "finish",
          usage: {
            inputTokens: { total: inputTokens },
            outputTokens: { total: outputTokens },
          },
          finishReason: { unified: "stop", raw: "stop" },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (textStarted) ctrl.enqueue({ type: "text-end", id: textId });
        ctrl.enqueue({
          type: "finish",
          usage: { inputTokens: { total: 0 }, outputTokens: { total: 0 } },
          finishReason: { unified: "error", raw: msg },
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      _activeSseController = null;
      sseAbortController.abort();
    },
  });
}

/* ------------------------------------------------------------------ */
/*  The opencode provider strategy                                     */
/* ------------------------------------------------------------------ */

export const opencodeProvider: LLMProvider = {
  name: "opencode",
  supportsTools: true,

  async createModel(config: ProviderConfig): Promise<LanguageModel> {
    const baseUrl = config.opencodeUrl ?? "http://127.0.0.1:18789";
    const modelId = config.modelName;
    const variant = config.opencodeVariant || "low";
    const directory = config.projectPath;
    const providerID = await resolveProviderId(baseUrl, modelId || undefined);

    const model: Record<string, unknown> = {
      specificationVersion: "v3",
      provider: "opencode",
      modelId: modelId || "default",
      supportedUrls: {},

      doGenerate: async (options: {
        prompt: unknown[];
        tools?: { name: string; description?: string; inputSchema?: unknown }[];
      }) => {
        const { system, userMessage } = convertPrompt(options.prompt, options.tools);
        const result = await sendToOpenCode(baseUrl, providerID, modelId, system, userMessage, variant, directory);
        return {
          content: result.text
            ? [{ type: "text", text: result.text }]
            : [],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: result.inputTokens },
            outputTokens: { total: result.outputTokens },
          },
          warnings: [],
        };
      },

      doStream: async (options: {
        prompt: unknown[];
        tools?: { name: string; description?: string; inputSchema?: unknown }[];
      }) => {
        const { system, userMessage } = convertPrompt(options.prompt, options.tools);
        const stream = await openCodeStreamFromEvents(baseUrl, providerID, modelId, system, userMessage, variant, directory);
        return { stream };
      },
    };
    return model as unknown as LanguageModel;
  },

  async generate(
    config: ProviderConfig,
    systemPrompt: string,
    userMessage: string,
    abortHandle?: AbortHandle
  ): Promise<DirectGenerateResult> {
    const baseUrl = config.opencodeUrl ?? "http://127.0.0.1:18789";
    const modelId = config.modelName;
    const variant = config.opencodeVariant || "low";
    const directory = config.projectPath;

    if (abortHandle?.aborted) return { text: "", inputTokens: 0, outputTokens: 0 };

    const providerID = await resolveProviderId(baseUrl, modelId || undefined);

    const sessionId = await ensureSession(baseUrl, providerID, modelId || undefined, directory);

    const body: Record<string, unknown> = {
      messageID: createMessageId(),
      parts: [{ type: "text", text: userMessage }],
      model: modelId ? { modelID: modelId, providerID } : null,
      variant,
    };
    if (systemPrompt) body.system = systemPrompt;

    const msgRes = await apiFetch(baseUrl, `/session/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const result = (await msgRes.json()) as MessageResponse;

    return {
      text: extractText(result.parts),
      inputTokens: result.info.tokens.input,
      outputTokens: result.info.tokens.output,
    };
  },
};
