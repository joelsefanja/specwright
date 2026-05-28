import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderConfig } from "./types";

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

interface OpenAIFactory {
  (model: string, opts?: Record<string, unknown>): LanguageModel;
}

async function loadOpenAIFactory(): Promise<OpenAIFactory | null> {
  try {
    const mod = (await dynamicImport("@ai-sdk/openai")) as {
      openai?: OpenAIFactory;
      default?: OpenAIFactory;
    };
    return mod.openai ?? mod.default ?? null;
  } catch {
    return null;
  }
}

async function createOpenAIModel(
  modelName: string,
  baseURL?: string,
  apiKey?: string
): Promise<LanguageModel> {
  const factory = await loadOpenAIFactory();
  const opts: Record<string, string> = {};
  if (baseURL) opts.baseURL = baseURL;
  if (apiKey) opts.apiKey = apiKey;
  if (factory) return factory(modelName, opts);

  // Fallback: load from ai package
  const aiMod = (await dynamicImport("ai")) as {
    openai?: OpenAIFactory;
  };
  if (aiMod.openai) return aiMod.openai(modelName, opts);

  throw new Error("No OpenAI factory available — install @ai-sdk/openai");
}

export const openaiProvider: LLMProvider = {
  name: "openai",
  supportsTools: true,

  async createModel(config: ProviderConfig): Promise<LanguageModel> {
    return createOpenAIModel(config.modelName, config.baseURL, config.apiKey);
  },
};

export const ollamaProvider: LLMProvider = {
  name: "ollama",
  supportsTools: true,

  async createModel(config: ProviderConfig): Promise<LanguageModel> {
    return createOpenAIModel(
      config.modelName,
      config.baseURL ?? "http://localhost:11434/v1",
      config.apiKey ?? "ollama"
    );
  },
};
