import { fetchOpenCodeProviderEndpoint, type OpenCodeProviderEndpointResponse } from "./opencode-http";

let cachedProviderMap: Record<string, string> | undefined;
let cachedProviderModels: Record<string, string[]> | undefined;
let cachedConnectedProviders: string[] | undefined;
let cachedBaseUrl: string | undefined;

export function normalizeModelId(modelId: string | undefined): string | undefined {
  if (!modelId) {
    return undefined;
  }

  const normalized = modelId.trim().toLowerCase().replace(/\s+/g, "-");
  if (normalized === "gpt-5.5-fast") {
    return "gpt-5.5-fast";
  }

  if (normalized === "gpt-5.5") {
    return "gpt-5.5";
  }

  return modelId;
}

export function pickPreferredProvider(data: OpenCodeProviderEndpointResponse): string | undefined {
  return (
    data.connected.find((providerId) => isPreferredGptProvider(providerId) && data.default[providerId]) ??
    data.connected.find((providerId) => data.default[providerId]) ??
    data.connected[0]
  );
}

export async function resolveProviderId(baseUrl: string, modelId?: string): Promise<string> {
  if (!cachedProviderMap || cachedBaseUrl !== baseUrl) {
    await refreshProviderCache(baseUrl);
  }

  if (!cachedProviderMap) {
    return "";
  }

  const connectedProviders = cachedConnectedProviders ?? [];

  if (modelId) {
    const matchedProviderId = findConnectedProviderForModel(
      modelId,
      cachedProviderMap,
      cachedProviderModels ?? {},
      connectedProviders,
    );

    if (matchedProviderId) {
      return matchedProviderId;
    }

    const existsButDisconnected = Object.values(cachedProviderModels ?? {}).some((models) => models.includes(modelId));
    if (existsButDisconnected) {
      throw new Error(
        `OpenCode model "${modelId}" is not available on a connected provider. Connected providers: ${connectedProviders.join(", ") || "none"}.`,
      );
    }
  }

  const connectedDefaults = Object.entries(cachedProviderMap).filter(([providerId]) => connectedProviders.includes(providerId));
  const openAiEntry = connectedDefaults.find(([providerId]) => isPreferredGptProvider(providerId));
  if (openAiEntry) {
    return openAiEntry[0];
  }

  const firstProviderEntry = connectedDefaults[0] ?? Object.entries(cachedProviderMap)[0];
  return firstProviderEntry?.[0] ?? "";
}

function isPreferredGptProvider(providerId: string): boolean {
  const id = providerId.toLowerCase();
  return id.includes("opencode") || id.includes("openai") || id.includes("chatgpt");
}

async function refreshProviderCache(baseUrl: string): Promise<void> {
  try {
    const data = await fetchOpenCodeProviderEndpoint(baseUrl);
    if (!data) {
      return;
    }

    cachedProviderMap = data.default;
    cachedConnectedProviders = data.connected;
    cachedProviderModels = Object.fromEntries(
      (data.all ?? []).map((provider) => [provider.id, Object.keys(provider.models ?? {})]),
    );
    cachedBaseUrl = baseUrl;
  } catch {
    // Preserve existing behavior: provider resolution falls back when discovery fails.
  }
}

function findConnectedProviderForModel(
  modelId: string,
  providerMap: Record<string, string>,
  providerModels: Record<string, string[]>,
  connectedProviders: string[],
): string | undefined {
  for (const [providerId, defaultModel] of Object.entries(providerMap).filter(([providerId]) => connectedProviders.includes(providerId))) {
    if (defaultModel === modelId) {
      return providerId;
    }
  }

  for (const [providerId, models] of Object.entries(providerModels).filter(([providerId]) => connectedProviders.includes(providerId))) {
    if (models.includes(modelId)) {
      return providerId;
    }
  }

  return undefined;
}
