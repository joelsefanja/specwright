import type { LanguageModel } from "ai";
import { spawn } from "child_process";
import { createOpenCodeAcpJsonRpcWriter } from "./opencode-acp-json-rpc";
import {
  extractOpenCodeText,
  fetchOpenCodeApi,
  fetchOpenCodeProviderEndpoint,
  isOpenCodeHealthy,
  type OpenCodeMessageResponse,
} from "./opencode-http";
import {
  normalizeModelId,
  pickPreferredProvider,
  resolveProviderId,
} from "./opencode-model-selection";
import {
  clearCachedOpenCodeSession,
  ensureOpenCodeSession,
  getCachedOpenCodeSession,
} from "./opencode-session-cache";
import { streamOpenCodeSseEvents } from "./opencode-sse-events";
import type { LLMProvider, ProviderConfig, DirectGenerateResult, AbortHandle, GenerateCallbacks } from "./types";

/* ------------------------------------------------------------------ */
/*  Session lifecycle — reused across pipeline steps                   */
/* ------------------------------------------------------------------ */

let _activeSseController: AbortController | null = null;

/** Abort any in-flight SSE stream immediately. */
export function abortStream(): void {
  if (_activeSseController) {
    _activeSseController.abort();
    _activeSseController = null;
  }
}

/** Send an interrupt message to the current session (for interrupt button). */
export async function interruptSession(message: string): Promise<void> {
  const session = getCachedOpenCodeSession();
  if (session) {
    try {
      await fetchOpenCodeApi(session.baseUrl, `/session/${session.id}/prompt_async`, {
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
  const session = getCachedOpenCodeSession();
  if (session) {
    try {
      await fetchOpenCodeApi(session.baseUrl, `/session/${session.id}`, {
        method: "DELETE",
      });
    } catch { /* ignore */ }
    clearCachedOpenCodeSession();
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers — opencode server HTTP API                        */
/* ------------------------------------------------------------------ */

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Public helpers used by the UI layer                                */
/* ------------------------------------------------------------------ */

/** Check if an opencode server is healthy. */
export async function healthCheck(baseUrl: string): Promise<boolean> {
  return isOpenCodeHealthy(baseUrl);
}

/** Detect the default model from a running opencode server. */
export async function detectModel(baseUrl: string): Promise<{
  modelId: string;
  providerId: string;
} | null> {
  try {
    const data = await fetchOpenCodeProviderEndpoint(baseUrl);
    if (!data) {
      return null;
    }

    const pid = pickPreferredProvider(data);
    if (!pid) {
      return null;
    }

    return { modelId: data.default[pid], providerId: pid };
  } catch {
    return null;
  }
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
  const sessionId = await ensureOpenCodeSession(baseUrl, providerID, modelId, variant, directory);

  const body: Record<string, unknown> = {
    messageID: createMessageId(),
    agent: "build",
    parts: [{ type: "text", text: userMessage }],
    variant: variant || "low",
  };
  if (system) body.system = system;
  const messagePath = directory
    ? `/session/${sessionId}/message?directory=${encodeURIComponent(directory)}`
    : `/session/${sessionId}/message`;

  const msgRes = await fetchOpenCodeApi(baseUrl, messagePath, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const result = (await msgRes.json()) as OpenCodeMessageResponse;

  return {
    text: extractOpenCodeText(result.parts),
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

  const eventIter = streamOpenCodeSseEvents(`${baseUrl}/event`, sseAbortController.signal);
  const iter = eventIter[Symbol.asyncIterator]();

  // Wait for initial server.connected event (confirms SSE is up)
  await iter.next();

  // Create or reuse session in the correct project directory
  const sessionId = await ensureOpenCodeSession(baseUrl, providerID, modelId, variant, directory);

  // Send message asynchronously — returns 204 immediately
  const messageID = createMessageId();
  const body: Record<string, unknown> = {
    messageID,
    agent: "build",
    model: modelId ? { modelID: modelId, providerID } : undefined,
    parts: [{ type: "text", text: userMessage }],
    variant: variant || "low",
  };
  if (system) body.system = system;
  const promptPath = directory
    ? `/session/${sessionId}/prompt_async?directory=${encodeURIComponent(directory)}`
    : `/session/${sessionId}/prompt_async`;
  await fetchOpenCodeApi(baseUrl, promptPath, {
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

          // Skip setup/heartbeat events
          if (
            eventType === "server.connected" ||
            eventType === "server.heartbeat" ||
            eventType === "session.next.agent.switched" ||
            eventType === "session.next.model.switched" ||
            eventType === "session.updated" ||
            eventType === "session.diff"
          ) continue;

          sawMessageEvent = true;

          if (eventType === "message.part.updated") {
            // Incremental text delta from the model
            const delta = props.delta as string | undefined;
            const part = props.part as Record<string, unknown> | undefined;
            if (part?.type === "text" && delta) {
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

async function generateWithOpenCodeEvents(
  baseUrl: string,
  providerID: string,
  modelId: string | undefined,
  systemPrompt: string,
  userMessage: string,
  variant: string | undefined,
  directory: string | undefined,
  abortHandle: AbortHandle | undefined,
  callbacks: GenerateCallbacks,
): Promise<DirectGenerateResult> {
  const sseAbortController = new AbortController();
  _activeSseController = sseAbortController;

  const eventIter = streamOpenCodeSseEvents(`${baseUrl}/event`, sseAbortController.signal);
  const iter = eventIter[Symbol.asyncIterator]();

  try {
    // First event is server.connected; subscribing before prompt_async avoids missing early deltas.
    await iter.next();

    const sessionId = await ensureOpenCodeSession(baseUrl, providerID, modelId, variant, directory);
    callbacks.onOpenCodeSession?.({ sessionId, baseUrl });
    callbacks.onLog?.(`[opencode] Session: ${sessionId}`);
    const body: Record<string, unknown> = {
      messageID: createMessageId(),
      agent: "build",
      model: modelId ? { modelID: modelId, providerID } : undefined,
      parts: [{ type: "text", text: userMessage }],
      variant: variant || "low",
    };
    if (systemPrompt) body.system = systemPrompt;

    const promptPath = directory
      ? `/session/${sessionId}/prompt_async?directory=${encodeURIComponent(directory)}`
      : `/session/${sessionId}/prompt_async`;
    await fetchOpenCodeApi(baseUrl, promptPath, {
      method: "POST",
      body: JSON.stringify(body),
    });

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let sawSessionEvent = false;

    while (!abortHandle?.aborted) {
      const { done, value } = await iter.next();
      if (done) break;

      const event = value?.data as {
        type?: string;
        properties?: Record<string, unknown>;
      } | undefined;
      if (!event?.type || !event?.properties) continue;

      const props = event.properties;
      const eventSid = props.sessionID as string | undefined;
      if (eventSid !== undefined && eventSid !== sessionId) continue;
      if (eventSid === sessionId) sawSessionEvent = true;

      if (event.type === "message.part.updated") {
        const delta = props.delta as string | undefined;
        const part = props.part as Record<string, unknown> | undefined;
        if (part?.type === "text" && delta) {
          text += delta;
          callbacks.onToken(delta);
        }
      } else if (event.type === "session.error") {
        const error = props.error as { data?: { message?: string }; message?: string; name?: string } | undefined;
        throw new Error(error?.data?.message ?? error?.message ?? error?.name ?? "OpenCode session error");
      } else if (event.type === "message.part.updated") {
        const part = props.part as Record<string, unknown> | undefined;
        if (part?.type === "step-finish") {
          const tokens = part.tokens as Record<string, unknown> | undefined;
          inputTokens = (tokens?.input as number) ?? inputTokens;
          outputTokens = (tokens?.output as number) ?? outputTokens;
        }
      } else if (event.type === "message.updated") {
        const info = props.info as Record<string, unknown> | undefined;
        const tokens = info?.tokens as Record<string, unknown> | undefined;
        inputTokens = (tokens?.input as number) ?? inputTokens;
        outputTokens = (tokens?.output as number) ?? outputTokens;
      } else if (event.type === "session.status") {
        const status = props.status as { type?: string } | undefined;
        if (status?.type === "idle" && sawSessionEvent) break;
      } else if (event.type === "session.idle" && sawSessionEvent) {
        break;
      }
    }

    return { text, inputTokens, outputTokens, streamed: true };
  } finally {
    _activeSseController = null;
    sseAbortController.abort();
  }
}

async function generateWithOpenCodeCli(
  baseUrl: string,
  providerID: string,
  modelId: string | undefined,
  systemPrompt: string,
  userMessage: string,
  variant: string | undefined,
  directory: string | undefined,
  abortHandle: AbortHandle | undefined,
  callbacks: GenerateCallbacks,
): Promise<DirectGenerateResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--attach",
      baseUrl,
      "--agent",
      "build",
      "--format",
      "json",
    ];
    if (directory) args.push("--dir", directory);
    if (modelId) args.push("--model", `${providerID}/${modelId}`);
    if (variant) args.push("--variant", variant);

    const child = spawn("opencode", args, {
      cwd: directory,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(abortTimer);
      if (err) reject(err);
      else resolve({ text, inputTokens, outputTokens, streamed: true });
    };

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let event: {
        type?: string;
        part?: { type?: string; text?: string; tokens?: { input?: number; output?: number; total?: number } };
      };
      try {
        event = JSON.parse(line);
      } catch {
        callbacks.onLog?.(`[opencode] ${line}`);
        return;
      }

      if (event.type === "text" && event.part?.text) {
        text += event.part.text;
        callbacks.onToken(event.part.text);
      } else if (event.type === "step_finish" && event.part?.tokens) {
        inputTokens = event.part.tokens.input ?? inputTokens;
        outputTokens = event.part.tokens.output ?? outputTokens;
      } else if (event.type === "tool") {
        callbacks.onLog?.(`[opencode] tool event`);
      }
    };

    const abortTimer = setInterval(() => {
      if (abortHandle?.aborted) child.kill();
    }, 250);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const textChunk = chunk.toString("utf8");
      stderrBuffer += textChunk;
      for (const line of textChunk.split(/\r?\n/)) {
        if (line.trim()) callbacks.onLog?.(`[opencode] ${line}`);
      }
    });

    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
      if (abortHandle?.aborted) {
        finish();
      } else if (code === 0) {
        finish();
      } else {
        finish(new Error(`opencode run exited with code ${code}: ${stderrBuffer.trim()}`));
      }
    });

    child.stdin.end(`${systemPrompt}\n\n${userMessage}`);
  });
}

async function generateWithOpenCodeAcp(
  providerID: string,
  modelId: string | undefined,
  systemPrompt: string,
  userMessage: string,
  variant: string | undefined,
  directory: string | undefined,
  abortHandle: AbortHandle | undefined,
  callbacks: GenerateCallbacks,
): Promise<DirectGenerateResult> {
  return new Promise((resolve, reject) => {
    const args = ["acp"];
    if (directory) args.push("--cwd", directory);

    const child = spawn("opencode", args, {
      cwd: directory,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let sessionId: string | null = null;
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let settled = false;
    const jsonRpc = createOpenCodeAcpJsonRpcWriter((line) => {
      child.stdin.write(`${line}\n`);
    });

    const finish = (err?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(abortTimer);
      if (!child.killed) {
        child.kill();
      }
      if (err) {
        reject(err);
      }
      else {
        resolve({ text, inputTokens, outputTokens, streamed: true });
      }
    };

    const firstPermissionOption = (message: Record<string, unknown>): string => {
      const options = ((message.params as Record<string, unknown> | undefined)?.options ?? []) as Array<{ optionId?: string }>;
      return options[0]?.optionId ?? "allow_once";
    };

    const handleUpdate = (update: Record<string, unknown>): void => {
      const updateType = update.sessionUpdate as string | undefined;
      const content = update.content as { type?: string; text?: string } | undefined;

      if (updateType === "agent_message_chunk" && content?.type === "text" && content.text) {
        text += content.text;
        callbacks.onToken(content.text);
      } else if (updateType === "usage_update") {
        const used = update.used as number | undefined;
        if (used) {
          inputTokens = used;
        }
      } else if (updateType === "tool_call") {
        callbacks.onLog?.("[opencode] tool call");
      } else if (updateType && updateType !== "agent_thought_chunk" && updateType !== "available_commands_update") {
        callbacks.onLog?.(`[opencode] ${updateType}`);
      }
    };

    const handleMessage = (message: Record<string, unknown>): void => {
      const id = message.id as number | undefined;
      const method = message.method as string | undefined;

      if (id !== undefined && method) {
        if (method === "session/request_permission") {
          jsonRpc.sendResponse(id, { outcome: { outcome: "selected", optionId: firstPermissionOption(message) } });
        } else {
          jsonRpc.sendResponse(id, {});
        }
        return;
      }

      if (method === "session/update") {
        const params = message.params as { update?: Record<string, unknown> } | undefined;
        if (params?.update) {
          handleUpdate(params.update);
        }
        return;
      }

      if (id === undefined) {
        return;
      }
      const pendingMethod = jsonRpc.takePendingMethod(id);

      if (message.error) {
        const error = message.error as { message?: string };
        finish(new Error(error.message ?? `OpenCode ACP ${pendingMethod ?? "request"} failed`));
        return;
      }

      const result = message.result as Record<string, unknown> | undefined;
      if (pendingMethod === "initialize") {
        jsonRpc.sendRequest("session/new", { cwd: directory ?? process.cwd(), mcpServers: [] });
      } else if (pendingMethod === "session/new") {
        sessionId = result?.sessionId as string | null;
        if (!sessionId) {
          finish(new Error("OpenCode ACP did not return a sessionId"));
          return;
        }
        if (modelId) {
          jsonRpc.sendRequest("session/set_config_option", {
            sessionId,
            configId: "model",
            value: `${providerID}/${modelId}`,
          });
        } else {
          jsonRpc.sendRequest("session/prompt", {
            sessionId,
            prompt: [{ type: "text", text: `${systemPrompt}\n\n${userMessage}` }],
          });
        }
      } else if (pendingMethod === "session/set_config_option") {
        if (sessionId) {
          jsonRpc.sendRequest("session/prompt", {
            sessionId,
            prompt: [{ type: "text", text: `${systemPrompt}\n\n${userMessage}` }],
          });
        }
      } else if (pendingMethod === "session/prompt") {
        const usage = result?.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        inputTokens = usage?.inputTokens ?? inputTokens;
        outputTokens = usage?.outputTokens ?? outputTokens;
        finish();
      }
    };

    const handleLine = (line: string): void => {
      if (!line.trim()) {
        return;
      }
      try {
        handleMessage(JSON.parse(line) as Record<string, unknown>);
      } catch {
        callbacks.onLog?.(`[opencode] ${line}`);
      }
    };

    const abortTimer = setInterval(() => {
      if (abortHandle?.aborted) {
        finish();
      }
    }, 250);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleLine(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const textChunk = chunk.toString("utf8");
      stderrBuffer += textChunk;
      for (const line of textChunk.split(/\r?\n/)) {
        if (line.trim()) {
          callbacks.onLog?.(`[opencode] ${line}`);
        }
      }
    });

    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }
      if (abortHandle?.aborted) {
        finish();
      }
      else {
        finish(new Error(`opencode acp exited with code ${code}: ${stderrBuffer.trim()}`));
      }
    });

    jsonRpc.sendRequest("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "specwright-desktop", version: "0.2.0" },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  The opencode provider strategy                                     */
/* ------------------------------------------------------------------ */

export const opencodeProvider: LLMProvider = {
  name: "opencode",
  supportsTools: false,

  async createModel(config: ProviderConfig): Promise<LanguageModel> {
    const baseUrl = config.opencodeUrl ?? "http://127.0.0.1:18789";
    const modelId = normalizeModelId(config.modelName);
    const variant = config.opencodeVariant || "low";
    const directory = config.projectPath;
    const providerID = config.opencodeProviderId || await resolveProviderId(baseUrl, modelId || undefined);

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
    abortHandle?: AbortHandle,
    callbacks?: GenerateCallbacks
  ): Promise<DirectGenerateResult> {
    const baseUrl = config.opencodeUrl ?? "http://127.0.0.1:18789";
    const modelId = normalizeModelId(config.modelName);
    const variant = config.opencodeVariant || "low";
    const directory = config.projectPath;

    if (abortHandle?.aborted) return { text: "", inputTokens: 0, outputTokens: 0 };

    const providerID = config.opencodeProviderId || await resolveProviderId(baseUrl, modelId || undefined);

    if (callbacks) {
      if (process.env.SPECWRIGHT_OPENCODE_TRANSPORT === "acp") {
        return generateWithOpenCodeAcp(
          providerID,
          modelId || undefined,
          systemPrompt,
          userMessage,
          variant,
          directory,
          abortHandle,
          callbacks,
        );
      }

      return generateWithOpenCodeEvents(
        baseUrl,
        providerID,
        modelId || undefined,
        systemPrompt,
        userMessage,
        variant,
        directory,
        abortHandle,
        callbacks,
      );
    }

    const sessionId = await ensureOpenCodeSession(baseUrl, providerID, modelId || undefined, variant, directory);

    const body: Record<string, unknown> = {
      messageID: createMessageId(),
      agent: "build",
      parts: [{ type: "text", text: userMessage }],
      variant,
    };
    if (systemPrompt) body.system = systemPrompt;
    const messagePath = directory
      ? `/session/${sessionId}/message?directory=${encodeURIComponent(directory)}`
      : `/session/${sessionId}/message`;

    const msgRes = await fetchOpenCodeApi(baseUrl, messagePath, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const result = (await msgRes.json()) as OpenCodeMessageResponse;

    return {
      text: extractOpenCodeText(result.parts),
      inputTokens: result.info.tokens.input,
      outputTokens: result.info.tokens.output,
    };
  },
};
