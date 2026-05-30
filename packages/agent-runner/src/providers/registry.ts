import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderConfig, DirectGenerateResult, GenerateCallbacks, AbortHandle } from "./types";
import { anthropicProvider } from "./anthropic";
import { openaiProvider, ollamaProvider } from "./openai";
import { opencodeProvider, healthCheck, detectModel, cleanupSession, interruptSession } from "./opencode";

/* ------------------------------------------------------------------ */
/*  Registry — maps provider names → strategy instances                */
/* ------------------------------------------------------------------ */

const PROVIDERS: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  ollama: ollamaProvider,
  opencode: opencodeProvider,
};

/** All supported provider names (for UI dropdowns, validation, etc.). */
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS);

/** Resolve a provider by name. Throws if unknown. */
export function getProvider(name: string): LLMProvider {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown provider "${name}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
  return p;
}

/** Register a custom / third-party provider (plugin-style). */
export function registerProvider(provider: LLMProvider): void {
  PROVIDERS[provider.name] = provider;
}

/* ------------------------------------------------------------------ */
/*  Config builder — normalises env vars into ProviderConfig           */
/* ------------------------------------------------------------------ */

export interface EnvVars {
  SPECWRIGHT_LLM_PROVIDER?: string;
  SPECWRIGHT_LLM_BASE_URL?: string;
  SPECWRIGHT_LLM_API_KEY?: string;
  SPECWRIGHT_MODEL?: string;
  SPECWRIGHT_OPENCODE_URL?: string;
  SPECWRIGHT_OPENCODE_PROVIDER_ID?: string;
  SPECWRIGHT_OPENCODE_VARIANT?: string;
}

export function buildConfig(env: EnvVars, defaultModel: string, projectPath?: string): ProviderConfig {
  return {
    modelName: env.SPECWRIGHT_MODEL || defaultModel,
    baseURL: env.SPECWRIGHT_LLM_BASE_URL,
    apiKey: env.SPECWRIGHT_LLM_API_KEY,
    opencodeUrl: env.SPECWRIGHT_OPENCODE_URL,
    opencodeProviderId: env.SPECWRIGHT_OPENCODE_PROVIDER_ID,
    opencodeVariant: env.SPECWRIGHT_OPENCODE_VARIANT,
    projectPath,
  };
}

/* ------------------------------------------------------------------ */
/*  ProviderOptions builder — returns AI SDK provider-specific opts   */
/* ------------------------------------------------------------------ */

export function buildProviderOptions(
  provider: string,
  config: ProviderConfig
): Record<string, unknown> {
  switch (provider) {
    case "anthropic":
      return { anthropic: { cacheControl: { type: "ephemeral" } } };
    case "openai":
    case "ollama":
      return { openai: { baseURL: config.baseURL, apiKey: config.apiKey } };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ */
/*  High-level helpers for AiSdkRunner                                 */
/* ------------------------------------------------------------------ */

export interface ProviderSetup {
  provider: LLMProvider;
  config: ProviderConfig;
  model?: LanguageModel;
  providerOptions: Record<string, unknown>;
  supportsTools: boolean;
}

/** Resolve provider + config + model in one call. */
export async function resolveProvider(
  providerName: string,
  config: ProviderConfig
): Promise<ProviderSetup> {
  const provider = getProvider(providerName);
  const providerOptions = buildProviderOptions(providerName, config);
  const supportsTools = provider.supportsTools;

  let model: LanguageModel | undefined;
  if (supportsTools && provider.createModel) {
    model = await provider.createModel(config);
  }

  return { provider, config, model, providerOptions, supportsTools };
}

/** Run generation on a non-AI-SDK provider (e.g. opencode). */
export async function generateDirect(
  provider: LLMProvider,
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  abortHandle?: AbortHandle,
  callbacks?: GenerateCallbacks
): Promise<DirectGenerateResult> {
  if (!provider.generate) {
    throw new Error(`Provider "${provider.name}" does not support direct generation`);
  }
  return provider.generate(config, systemPrompt, userMessage, abortHandle, callbacks);
}

/** Re-export opencode helpers for UI layer. */
export { healthCheck as opencodeHealth, detectModel as opencodeDetectModel, cleanupSession as opencodeCleanupSession, interruptSession as opencodeInterruptSession };
