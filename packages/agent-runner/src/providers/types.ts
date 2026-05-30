import type { LanguageModel } from "ai";

/**
 * Resolved configuration for any LLM provider.
 * Raw env vars are normalised into this shape by the registry.
 */
export interface ProviderConfig {
  /** The model identifier (e.g. "claude-sonnet-4-6", "gpt-5.5") */
  modelName: string;
  /** Base URL for OpenAI-compatible providers */
  baseURL?: string;
  /** API key for the provider */
  apiKey?: string;
  /** OpenCode server URL (only for opencode provider) */
  opencodeUrl?: string;
  /** Explicit OpenCode provider ID, e.g. "openai" */
  opencodeProviderId?: string;
  /** OpenCode model variant (e.g. low, medium, high) */
  opencodeVariant?: string;
  /** Project root directory (for setting opencode session context) */
  projectPath?: string;
}

/**
 * Result from a non-AI-SDK generation (e.g. opencode).
 */
export interface DirectGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  streamed?: boolean;
}

/**
 * Abort signal checked during generation.
 */
export interface AbortHandle {
  readonly aborted: boolean;
}

/**
 * Callbacks emitted during generation.
 */
export interface GenerateCallbacks {
  onToken: (token: string) => void;
  onLog?: (line: string) => void;
  onToolEnd?: (toolName: string, durationMs: number) => void;
  onStepFinish?: (info: { stepNumber: number; totalTokens: number; toolCalls: string[] }) => void;
}

/**
 * Every provider implements this interface (Strategy pattern).
 * - AI-SDK providers implement only `createModel`.
 * - Direct providers (opencode) implement only `generate`.
 *
 * The registry (ProviderRegistry) picks the right method at runtime.
 */
export interface LLMProvider {
  /** Unique provider identifier (matches env var values) */
  readonly name: string;
  /** Whether this provider supports MCP tool loops */
  readonly supportsTools: boolean;

  /**
   * Create a LanguageModel for use with the Vercel AI SDK.
   * Only called when `supportsTools` is true.
   */
  createModel?(config: ProviderConfig): Promise<LanguageModel>;

  /**
   * Generate text directly without the AI SDK tool loop.
   * Only called when `supportsTools` is false.
   */
  generate?(
    config: ProviderConfig,
    systemPrompt: string,
    userMessage: string,
    abortHandle?: AbortHandle,
    callbacks?: GenerateCallbacks
  ): Promise<DirectGenerateResult>;
}
