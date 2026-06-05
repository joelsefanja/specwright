import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { OpenCodeService, normalizeOpenCodeUrl, opencodeCommand } from "./OpenCodeService";

function healthyResponse(healthy: boolean): Response {
  return {
    ok: true,
    json: async () => ({ healthy }),
  } as Response;
}

function unreachableFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("connect ECONNREFUSED");
  }) as unknown as typeof fetch;
}

function idleChild(pid = 1234): EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn> } {
  return Object.assign(new EventEmitter(), { pid, kill: vi.fn() });
}

test("invalid URL falls back to default OpenCode URL", () => {
  expect(normalizeOpenCodeUrl("not a url")).toEqual({
    baseUrl: "http://127.0.0.1:18789",
    port: 18789,
  });
});

test("Windows command shim uses opencode.cmd", () => {
  expect(opencodeCommand("win32")).toBe("opencode.cmd");
});

test("start returns clear error when process spawn errors", async () => {
  const child = idleChild();
  const spawn = vi.fn(() => {
    queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
    return child;
  });
  const service = new OpenCodeService({
    fetch: unreachableFetch(),
    spawn,
    pollIntervalMs: 1,
    startupTimeoutMs: 20,
  });

  await expect(service.start({ projectPath: "C:\\project" })).rejects.toThrow("OpenCode could not start: spawn ENOENT");
});

test("unhealthy server returns clear error", async () => {
  const fetch = vi.fn(async () => healthyResponse(false)) as unknown as typeof fetch;
  const spawn = vi.fn(() => idleChild());
  const service = new OpenCodeService({ fetch, spawn });

  await expect(service.start()).rejects.toThrow("OpenCode server is running but not healthy");
  expect(spawn).not.toHaveBeenCalled();
});

test("already healthy does not spawn", async () => {
  const fetch = vi.fn(async () => healthyResponse(true)) as unknown as typeof fetch;
  const spawn = vi.fn(() => idleChild());
  const service = new OpenCodeService({ fetch, spawn });

  await expect(service.start()).resolves.toMatchObject({
    baseUrl: "http://127.0.0.1:18789",
    port: 18789,
    status: "healthy",
  });
  expect(spawn).not.toHaveBeenCalled();
});
