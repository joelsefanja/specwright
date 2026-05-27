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
    } = options;

    this.aborted = false;
    this.mcpClients = [];

    onLog?.("[ai-sdk] Loading Vercel AI SDK…");

    // Dynamic imports for ESM packages
    const [aiMod, anthropicMod, mcpMod, mcpSdkMod] = await Promise.all([
      dynamicImport("ai") as Promise<typeof import("ai") & { stepCountIs: (n: number) => unknown }>,
      dynamicImport("@ai-sdk/anthropic") as Promise<typeof import("@ai-sdk/anthropic")>,
      dynamicImport("@ai-sdk/mcp") as Promise<typeof import("@ai-sdk/mcp")>,
      dynamicImport("@modelcontextprotocol/sdk/client/stdio.js") as Promise<{
        StdioClientTransport: new (opts: { command: string; args: string[] }) => unknown;
      }>,
    ]);

    const { streamText, stepCountIs } = aiMod;
    const { anthropic } = anthropicMod;
    const { createMCPClient } = mcpMod;
    const { StdioClientTransport } = mcpSdkMod;

    // Provider factory: allow switching LLM backend via env
    const provider = (process.env.SPECWRIGHT_LLM_PROVIDER ?? "anthropic").toLowerCase();
    const baseURL = process.env.SPECWRIGHT_LLM_BASE_URL;
    const modelName = process.env.SPECWRIGHT_MODEL ?? model;

    let aiModel: LanguageModel;
    const providerOptions: Record<string, any> = {};

    if (provider === "openai" || provider === "ollama") {
      let openaiMod: any = null;
      try {
        openaiMod = await dynamicImport("@ai-sdk/openai");
      } catch {
        // some installs may not include the provider package; fall back to ai runtime
      }

      const openaiFactory = (openaiMod && (openaiMod.openai ?? openaiMod.default)) || (aiMod as any).openai;

      const opts: any = {};
      if (baseURL) opts.baseURL = baseURL;
      if (process.env.SPECWRIGHT_LLM_API_KEY) opts.apiKey = process.env.SPECWRIGHT_LLM_API_KEY;
      if (provider === "ollama") {
        opts.baseURL = opts.baseURL ?? "http://localhost:11434/v1";
        opts.apiKey = opts.apiKey ?? "ollama";
      }

      if (openaiFactory) {
        try {
          aiModel = openaiFactory(modelName, opts);
        } catch {
          aiModel = openaiFactory(modelName);
        }
      } else {
        aiModel = anthropic(modelName);
      }

      providerOptions.openai = { baseURL: opts.baseURL, apiKey: opts.apiKey };
    } else {
      aiModel = anthropic(modelName);
      providerOptions.anthropic = { cacheControl: { type: "ephemeral" } };
    }

    // Collect all tools from MCP servers
    let allTools: Record<string, unknown> = {};

    // Connect to Playwright MCP (auto-discovers browser tools)
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

    // Connect to additional MCP servers (from .mcp.json)
    for (const [name, config] of Object.entries(mcpServers)) {
      onLog?.(`[ai-sdk] Connecting to MCP server: ${name}…`);
      try {
        const client = await createMCPClient({
          transport: new StdioClientTransport({
            command: config.command,
            args: config.args ?? [],
          }) as unknown as Parameters<typeof createMCPClient>[0]["transport"],
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
    onLog?.(`[ai-sdk] Starting pipeline with ${modelName}…`);

    try {
      const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: [{ role: "user" as const, content: userMessage }],
        tools: allTools as Parameters<typeof streamText>[0]["tools"],
        stopWhen: stepCountIs(maxSteps) as Parameters<typeof streamText>[0]["stopWhen"],
        providerOptions: providerOptions,
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

      // Stream tokens to UI
      let fullText = "";
      for await (const chunk of result.textStream) {
        if (this.aborted) break;
        fullText += chunk;
        onToken(chunk);
      }

      // Wait for all steps to complete
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

  /** Disconnect all MCP clients */
  private async cleanup(): Promise<void> {
    for (const client of this.mcpClients) {
      try {
        await client.close();
      } catch {
        // ignore cleanup errors
      }
    }
    this.mcpClients = [];
  }
}
