export interface OpenCodeSseEvent {
  event?: string;
  data: unknown;
}

export async function* streamOpenCodeSseEvents(
  url: string,
  signal?: AbortSignal,
): AsyncGenerator<OpenCodeSseEvent> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`SSE ${response.status}: ${response.statusText}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error("SSE response has no body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const block of parts) {
      const event = parseOpenCodeSseBlock(block);
      if (event) {
        yield event;
      }
    }
  }
}

function parseOpenCodeSseBlock(block: string): OpenCodeSseEvent | undefined {
  if (!block.trim()) {
    return undefined;
  }

  const lines = block.split("\n");
  let event: string | undefined;
  let dataText = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
      continue;
    }

    if (line.startsWith("data: ")) {
      dataText = line.slice(6);
    }
  }

  if (!dataText) {
    return undefined;
  }

  try {
    const data: unknown = JSON.parse(dataText);
    return { event, data };
  } catch {
    return undefined;
  }
}
