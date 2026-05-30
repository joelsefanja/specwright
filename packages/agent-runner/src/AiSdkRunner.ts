/**
 * AiSdkRunner — Vercel AI SDK v6 runner for Specwright.
 *
 * Uses `ai` + `@ai-sdk/anthropic` + `@ai-sdk/mcp` for:
 *   - Native MCP tool discovery (Playwright browser tools auto-discovered)
 *   - Prompt caching via Anthropic provider (90% cost reduction on stable prefixes)
 *   - Structured output via Zod schemas
 *   - Token-by-token streaming via streamText
 *   - Step-level callbacks for tool tracking and logging
 *
 * Coexists with ClaudeAgentRunner — desktop app can choose which runner to use.
 * Uses claude-sonnet-4-6 for all phases.
 */

// Dynamic import — AI SDK packages are ESM-only, agent-runner compiles to CJS.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

// Type-only import for the Vercel AI SDK — erased at compile time, no ESM issue.
import type { LanguageModel } from "ai";
import {
  getProvider,
  buildConfig,
  resolveProvider,
  generateDirect,
  opencodeHealth,
  opencodeDetectModel,
  opencodeCleanupSession,
  opencodeInterruptSession,
  type EnvVars,
  type ProviderSetup,
} from "./providers/registry";

export interface AiSdkRunOptions {
  /** System prompt for the pipeline */
  systemPrompt: string;
  /** User message (instructions + env vars) */
  userMessage: string;
  /** Model override (default: claude-sonnet-4-6) */
  model?: string;
  /** Additional MCP server configs (e.g., project-specific servers from .mcp.json) */
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  /** Include Playwright MCP for browser tools (default: true) */
  includePlaywrightMcp?: boolean;
  /** Playwright MCP args (e.g., --output-dir) */
  playwrightMcpArgs?: string[];
  /** Max agent loop steps (default: 50) */
  maxSteps?: number;
  /** Called for each streamed text token */
  onToken: (token: string) => void;
  /** Called for log messages */
  onLog?: (line: string) => void;
  /** Called when a tool ends */
  onToolEnd?: (toolName: string, durationMs: number) => void;
  /** Called when a step (LLM turn) finishes, with token usage */
  onStepFinish?: (info: { stepNumber: number; totalTokens: number; toolCalls: string[] }) => void;
  /** Project root directory (for opencode session context) */
  projectPath?: string;
}

/** MCP client handle for cleanup */
interface McpClientHandle {
  tools: () => Promise<Record<string, unknown>>;
  close: () => Promise<void>;
}

export class AiSdkRunner {
  private mcpClients: McpClientHandle[] = [];
  private aborted = false;

  async run(options: AiSdkRunOptions): Promise<string> {
    const {
      systemPrompt,
      userMessage,
      model = "claude-sonnet-4-6",
      mcpServers = {},
      includePlaywrightMcp = true,
      playwrightMcpArgs = [],
      maxSteps = 50,
      onToken,
      onLog,
      onToolEnd,
      onStepFinish,
      projectPath,
    } = options;

    this.aborted = false;
    this.mcpClients = [];

    onLog?.("[ai-sdk] Loading Vercel AI SDK…");

    /* ---- Dynamic imports (ESM → CJS bridge) ---- */
    const [aiMod, mcpMod, mcpSdkMod] = await Promise.all([
      dynamicImport("ai") as Promise<typeof import("ai") & { stepCountIs: (n: number) => unknown }>,
      dynamicImport("@ai-sdk/mcp") as Promise<typeof import("@ai-sdk/mcp")>,
      dynamicImport("@modelcontextprotocol/sdk/client/stdio.js") as Promise<{
        StdioClientTransport: new (opts: {
          command: string;
          args?: string[];
          stderr?: string;
        }) => { stderr: unknown; start: () => Promise<void>; close: () => Promise<void>; send: (m: unknown) => Promise<void> };
      }>,
    ]);

    const { streamText, stepCountIs } = aiMod;
    const { createMCPClient } = mcpMod;
    const { StdioClientTransport } = mcpSdkMod;

    /* ---- Resolve provider via registry (Strategy pattern) ---- */
    const providerName = (process.env.SPECWRIGHT_LLM_PROVIDER ?? "anthropic").toLowerCase();
    const defaultModel = model;
    const env: EnvVars = process.env as unknown as EnvVars;
    const config = buildConfig(env, defaultModel, projectPath);

    // Special case: opencode needs a running server — detect model early
    if (providerName === "opencode") {
      const ocUrl = config.opencodeUrl || "http://127.0.0.1:18789";
      const healthy = await opencodeHealth(ocUrl);
      if (!healthy) {
        onLog?.("[ai-sdk] OpenCode server not reachable at " + ocUrl);
        onLog?.("[ai-sdk] Start it manually: opencode serve --port 18789");
        throw new Error(
          `OpenCode server not running at ${ocUrl}. Start with: opencode serve --port 18789`
        );
      }

      if (!config.modelName) {
        const detected = await opencodeDetectModel(ocUrl);
        if (detected) {
          config.modelName = detected.modelId;
          onLog?.(`[ai-sdk] Detected opencode model: ${config.modelName} (provider: ${detected.providerId})`);
        }
      }
    }

    const setup: ProviderSetup = await resolveProvider(providerName, config);
    onLog?.(`[ai-sdk] Provider: ${providerName}, model: ${config.modelName}`);

    /* ---- OpenCode direct path (no AI SDK tool loop) ---- */
    if (!setup.supportsTools) {
      const self = this;
      const abortHandle = { get aborted() { return self.aborted; } };

      try {
        onLog?.("[ai-sdk] Running model inference…");
        const result = await generateDirect(
          setup.provider,
          setup.config,
          systemPrompt,
          userMessage,
          abortHandle as { aborted: boolean },
          { onToken, onLog, onToolEnd, onStepFinish }
        );

        // Blocking direct providers return final text only; streaming providers emit tokens themselves.
        if (!result.streamed) onToken(result.text);

        onLog?.(
          `[ai-sdk] Pipeline complete — ${result.inputTokens + result.outputTokens} total tokens`
        );
        return result.text;
      } catch (err) {
        if (this.aborted) {
          onLog?.("[ai-sdk] Aborted by user");
          return "";
        }
        throw err;
      } finally {
        await this.cleanup();
      }
    }

    /* ---- AI SDK path (anthropic / openai / ollama) ---- */
    // Collect all tools from MCP servers
    let allTools: Record<string, unknown> = {};

    if (includePlaywrightMcp) {
      onLog?.("[ai-sdk] Connecting to Playwright MCP…");
      try {
        const playwrightMcp = await createMCPClient({
          transport: new StdioClientTransport({
            command: "npx",
            args: ["@playwright/mcp@latest", ...playwrightMcpArgs],
          }) as unknown as Parameters<typeof createMCPClient>[0]["transport"],
        }) as McpClientHandle;
        this.mcpClients.push(playwrightMcp);
        const browserTools = await playwrightMcp.tools();
        allTools = { ...allTools, ...browserTools };
        onLog?.(`[ai-sdk] Playwright MCP connected — ${Object.keys(browserTools).length} tools`);
      } catch (err) {
        onLog?.(`[ai-sdk] Playwright MCP failed: ${String(err)}`);
      }
    }

    for (const [name, cfg] of Object.entries(mcpServers)) {
      onLog?.(`[ai-sdk] Connecting to MCP server: ${name}…`);
      try {
        const transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
          stderr: "pipe",
        });
        // Consume stderr silently — MCP SDK default is "inherit" which
        // leaks child process stderr directly to the parent console.
        // Piping + draining prevents both the leak and backpressure.
        const stderrStream = transport.stderr;
        if (stderrStream && typeof (stderrStream as any).on === "function") {
          (stderrStream as any).on("data", () => {});
          (stderrStream as any).on("error", () => {});
        }
        const client = await createMCPClient({
          transport: transport as unknown as Parameters<typeof createMCPClient>[0]["transport"],
        }) as McpClientHandle;
        this.mcpClients.push(client);
        const tools = await client.tools();
        allTools = { ...allTools, ...tools };
        onLog?.(`[ai-sdk] ${name} connected — ${Object.keys(tools).length} tools`);
      } catch (err) {
        onLog?.(`[ai-sdk] ${name} failed: ${String(err)}`);
      }
    }

    onLog?.(`[ai-sdk] Total tools available: ${Object.keys(allTools).length}`);
    onLog?.(`[ai-sdk] Starting pipeline with ${config.modelName}…`);

    try {
      const result = streamText({
        model: setup.model!,
        system: systemPrompt,
        messages: [{ role: "user" as const, content: userMessage }],
        tools: allTools as Parameters<typeof streamText>[0]["tools"],
        stopWhen: stepCountIs(maxSteps) as Parameters<typeof streamText>[0]["stopWhen"],
        providerOptions: setup.providerOptions as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onStepFinish: async (event: any) => {
          const toolCalls = (event.toolCalls as Array<{ toolName: string }>) ?? [];
          const usage = (event.usage as { totalTokens?: number }) ?? {};
          const stepNumber = (event.stepNumber as number) ?? 0;
          const totalTokens = usage.totalTokens ?? 0;
          const toolNames = toolCalls.map((tc) => tc.toolName);
          for (const name of toolNames) {
            onToolEnd?.(name, 0);
          }
          onStepFinish?.({
            stepNumber,
            totalTokens,
            toolCalls: toolNames,
          });
          onLog?.(
            `[ai-sdk] Step ${stepNumber} — ${totalTokens} tokens${toolNames.length ? `, tools: ${toolNames.join(", ")}` : ""}`
          );
        },
      });

      onLog?.("[ai-sdk] Running model inference…");

      let fullText = "";
      for await (const chunk of result.textStream) {
        if (this.aborted) break;
        fullText += chunk;
        onToken(chunk);
      }

      const finalResult = await result;
      const usage = await finalResult.usage;
      onLog?.(
        `[ai-sdk] Pipeline complete — ${usage.totalTokens} total tokens`
      );

      return fullText;
    } catch (err) {
      if (this.aborted) {
        onLog?.("[ai-sdk] Aborted by user");
        return "";
      }
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  /** Abort the running pipeline */
  abort(): void {
    this.aborted = true;
    this.cleanup().catch(() => {});
  }

  /** Interrupt the running model — sends a pause message to the current session */
  interrupt(): void {
    opencodeInterruptSession(
      "\n\n[User interrupted. Pause what you're doing and wait for instructions.]"
    ).catch(() => {});
  }

  /** Disconnect all MCP clients and clean up any OpenCode session */
  private async cleanup(): Promise<void> {
    for (const client of this.mcpClients) {
      try {
        await client.close();
      } catch {
        // ignore cleanup errors
      }
    }
    this.mcpClients = [];
    await opencodeCleanupSession();
  }
}
