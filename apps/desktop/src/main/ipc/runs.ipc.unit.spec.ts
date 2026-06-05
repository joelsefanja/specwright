import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type IpcHandler = (_event: unknown, ...args: unknown[]) => unknown;

const handlers = vi.hoisted(() => new Map<string, IpcHandler>());

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
  },
}));

import { __setRunRegistryLoaderForTests, registerRunRegistryBridgeHandlers } from "./runs.ipc";

function handler(channel: string): IpcHandler {
  const registeredHandler = handlers.get(channel);
  if (!registeredHandler) throw new Error(`No handler registered for ${channel}`);
  return registeredHandler;
}

describe("run registry IPC safe read handlers", () => {
  beforeEach(() => {
    handlers.clear();
    __setRunRegistryLoaderForTests(null);
  });

  afterEach(() => {
    __setRunRegistryLoaderForTests(null);
  });

  test("return safe fallbacks when no project path is available", async () => {
    registerRunRegistryBridgeHandlers(() => undefined);

    await expect(handler("runs:list")(null)).resolves.toEqual([]);
    await expect(handler("runs:inspect")(null, "run-1")).resolves.toBeNull();
    await expect(handler("runs:logs")(null, "run-1")).resolves.toBe("");
    await expect(handler("runs:diff")(null, "run-1")).resolves.toEqual({ diff: "", changedFiles: [] });
  });

  test("return safe fallbacks when the registry import fails", async () => {
    __setRunRegistryLoaderForTests(async () => {
      throw new Error("registry unavailable");
    });
    registerRunRegistryBridgeHandlers(() => "C:/project");

    await expect(handler("runs:list")(null)).resolves.toEqual([]);
    await expect(handler("runs:inspect")(null, "run-1")).resolves.toBeNull();
    await expect(handler("runs:logs")(null, "run-1")).resolves.toBe("");
    await expect(handler("runs:diff")(null, "run-1")).resolves.toEqual({ diff: "", changedFiles: [] });
  });

  test("return safe fallbacks when registry reads fail", async () => {
    __setRunRegistryLoaderForTests(async () => ({
      listSpecwrightRuns: () => {
        throw new Error("list failed");
      },
      getSpecwrightRun: () => {
        throw new Error("inspect failed");
      },
      readSpecwrightRunLog: () => {
        throw new Error("logs failed");
      },
      readSpecwrightRunDiff: () => {
        throw new Error("diff failed");
      },
    }));
    registerRunRegistryBridgeHandlers(() => "C:/project");

    await expect(handler("runs:list")(null)).resolves.toEqual([]);
    await expect(handler("runs:inspect")(null, "run-1")).resolves.toBeNull();
    await expect(handler("runs:logs")(null, "run-1")).resolves.toBe("");
    await expect(handler("runs:diff")(null, "run-1")).resolves.toEqual({ diff: "", changedFiles: [] });
  });
});
