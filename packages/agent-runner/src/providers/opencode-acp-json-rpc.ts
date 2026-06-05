export interface OpenCodeAcpJsonRpcWriter {
  sendRequest(method: string, params: Record<string, unknown>): number;
  sendResponse(id: number, result: Record<string, unknown>): void;
  takePendingMethod(id: number): string | undefined;
}

interface OpenCodeAcpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface OpenCodeAcpJsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result: Record<string, unknown>;
}

export function createOpenCodeAcpJsonRpcWriter(
  writeLine: (line: string) => void,
): OpenCodeAcpJsonRpcWriter {
  let nextId = 1;
  const pendingMethods = new Map<number, string>();

  return {
    sendRequest(method: string, params: Record<string, unknown>): number {
      const id = nextId;
      nextId += 1;
      pendingMethods.set(id, method);

      const request: OpenCodeAcpJsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };
      writeLine(JSON.stringify(request));

      return id;
    },

    sendResponse(id: number, result: Record<string, unknown>): void {
      const response: OpenCodeAcpJsonRpcResponse = {
        jsonrpc: "2.0",
        id,
        result,
      };
      writeLine(JSON.stringify(response));
    },

    takePendingMethod(id: number): string | undefined {
      const method = pendingMethods.get(id);
      pendingMethods.delete(id);

      return method;
    },
  };
}
