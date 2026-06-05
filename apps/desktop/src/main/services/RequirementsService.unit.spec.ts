import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

import { RequirementsService } from "./RequirementsService";

interface SpawnResponse {
  code?: number;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

function createProject({ nodeModules = true }: { nodeModules?: boolean } = {}): string {
  const projectPath = path.join(tmpdir(), `specwright-requirements-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(path.join(projectPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  if (nodeModules) {
    mkdirSync(path.join(projectPath, "node_modules"), { recursive: true });
  }
  return projectPath;
}

function createService(bootstrapped = true): RequirementsService {
  return new RequirementsService({
    isBootstrapped: () => bootstrapped,
  } as never);
}

function mockSpawnWith(resolveResponse: (command: string, args: string[]) => SpawnResponse): void {
  spawnMock.mockImplementation((command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    const response = resolveResponse(command, args);
    queueMicrotask(() => {
      if (response.stdout) child.stdout.emit("data", Buffer.from(response.stdout));
      if (response.stderr) child.stderr.emit("data", Buffer.from(response.stderr));
      if (response.error) child.emit("error", response.error);
      else child.emit("close", response.code ?? 0);
    });

    return child;
  });
}

function passingCommandsExceptOpenCode(command: string, args: string[]): SpawnResponse {
  if (path.basename(command).replace(/\.cmd$/i, "") === "opencode") {
    return { error: new Error("not found") };
  }
  if (command === "node" && args[0] === "-e") {
    return { stdout: "/mock/chromium\n" };
  }
  return { stdout: "1.0.0\n" };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("server unavailable")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  spawnMock.mockReset();
});

test("treats missing OpenCode CLI as warning and non-blocking", async () => {
  mockSpawnWith(passingCommandsExceptOpenCode);

  const result = await createService().check(createProject());
  const opencodeCli = result.checks.find((check) => check.key === "opencode-cli");

  expect(opencodeCli).toMatchObject({
    status: "warning",
    blocksRun: false,
  });
  expect(result.ready).toBe(true);
});

test("keeps missing project dependencies blocking", async () => {
  mockSpawnWith(passingCommandsExceptOpenCode);

  const result = await createService().check(createProject({ nodeModules: false }));
  const nodeModules = result.checks.find((check) => check.key === "node-modules");

  expect(nodeModules).toMatchObject({
    status: "fail",
    blocksRun: true,
    installAction: "project-dependencies",
  });
  expect(result.ready).toBe(false);
});

test("does not throw when requirement commands fail", async () => {
  mockSpawnWith(() => ({ error: new Error("spawn failed") }));

  await expect(createService().check(createProject())).resolves.toMatchObject({
    ready: false,
  });
});
