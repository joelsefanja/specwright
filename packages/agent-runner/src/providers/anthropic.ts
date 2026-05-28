import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderConfig } from "./types";

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  supportsTools: true,

  async createModel(config: ProviderConfig): Promise<LanguageModel> {
    const anthropicMod = (await dynamicImport("@ai-sdk/anthropic")) as {
      anthropic: (model: string) => LanguageModel;
    };
    return anthropicMod.anthropic(config.modelName);
  },
};
