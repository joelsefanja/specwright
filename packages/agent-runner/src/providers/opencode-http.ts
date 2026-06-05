const OPENCODE_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

export interface OpenCodeProviderEndpointResponse {
  all?: Array<{ id: string; models?: Record<string, unknown> }>;
  default: Record<string, string>;
  connected: string[];
}

export interface OpenCodeMessagePart {
  type: string;
  text?: string;
}

export interface OpenCodeMessageResponse {
  info: {
    modelID: string;
    tokens: { total: number; input: number; output: number };
    finish: string;
  };
  parts: OpenCodeMessagePart[];
}

export async function fetchOpenCodeApi(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(OPENCODE_REQUEST_TIMEOUT_MS),
    ...init,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`opencode API ${response.status} ${path}: ${text}`);
  }

  return response;
}

export async function fetchOpenCodeProviderEndpoint(baseUrl: string): Promise<OpenCodeProviderEndpointResponse | undefined> {
  const response = await fetch(`${baseUrl}/provider`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as OpenCodeProviderEndpointResponse;
}

export async function isOpenCodeHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

export function extractOpenCodeText(parts: OpenCodeMessagePart[]): string {
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}
