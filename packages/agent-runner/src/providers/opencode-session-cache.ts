import { fetchOpenCodeApi } from "./opencode-http";

interface OpenCodeSessionCacheKey {
  baseUrl: string;
  providerId: string;
  modelId: string | undefined;
}

interface CachedOpenCodeSession {
  id: string;
  baseUrl: string;
  providerId: string;
  modelId: string | undefined;
}

interface OpenCodeSessionResponse {
  id: string;
}

let cachedSession: CachedOpenCodeSession | undefined;

export async function ensureOpenCodeSession(
  baseUrl: string,
  providerId: string,
  modelId: string | undefined,
  variant: string | undefined,
  directory?: string,
): Promise<string> {
  const cacheKey: OpenCodeSessionCacheKey = { baseUrl, providerId, modelId };
  if (cachedSession && isCachedSessionForKey(cachedSession, cacheKey)) {
    return cachedSession.id;
  }

  const sessionPath = directory
    ? `/session?directory=${encodeURIComponent(directory)}`
    : "/session";
  const sessionResponse = await fetchOpenCodeApi(baseUrl, sessionPath, {
    method: "POST",
    body: JSON.stringify({
      title: "sw-opencode",
      agent: "build",
      model: modelId ? { id: modelId, providerID: providerId, variant: variant || "low" } : undefined,
    }),
  });
  const session = parseOpenCodeSessionResponse(await sessionResponse.json());
  cachedSession = { ...cacheKey, id: session.id };

  return cachedSession.id;
}

export function getCachedOpenCodeSession(): CachedOpenCodeSession | undefined {
  return cachedSession;
}

export function clearCachedOpenCodeSession(): void {
  cachedSession = undefined;
}

function isCachedSessionForKey(
  session: CachedOpenCodeSession,
  cacheKey: OpenCodeSessionCacheKey,
): boolean {
  return (
    session.baseUrl === cacheKey.baseUrl &&
    session.providerId === cacheKey.providerId &&
    session.modelId === cacheKey.modelId
  );
}

function parseOpenCodeSessionResponse(value: unknown): OpenCodeSessionResponse {
  if (!isObject(value) || typeof value.id !== "string") {
    throw new Error("OpenCode session response did not include an id");
  }

  return { id: value.id };
}

function isObject(value: unknown): value is { id?: unknown } {
  return typeof value === "object" && value !== null;
}
