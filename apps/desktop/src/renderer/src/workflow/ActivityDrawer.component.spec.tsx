import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityDrawer } from "./ActivityDrawer";
import { useConfigStore } from "../store/config.store";
import { usePipelineStore } from "../store/pipeline.store";
import { useRunsStore, type RunRecord } from "../store/runs.store";

vi.mock("../i18n/localeStore", () => ({
  useLanguageStore: Object.assign(
    (selector?: (s: { language: string }) => string) => selector?.({ language: "en" }) ?? { language: "en" },
    { getState: () => ({ language: "en" }), setState: () => {} },
  ),
  useTranslations: () => ({
    activity: {
      title: "Progress",
      empty: "No run started yet.",
      statuses: { idle: "Waiting", running: "Running", done: "Done", error: "Failed", aborted: "Stopped" },
    },
  }),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    clear(): void {}
    dispose(): void {}
    loadAddon(): void {}
    onData(): void {}
    open(): void {}
    scrollToBottom(): void {}
    write(): void {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit(): void {}
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {},
}));

const baseRun: RunRecord = {
  id: "run-1234567890",
  kind: "e2e",
  status: "running",
  title: "Run tests",
  projectPath: "C:/project",
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ActivityDrawer OpenCode attach", () => {
  beforeEach(() => {
    useConfigStore.setState({ projectPath: "C:/project" });
    usePipelineStore.setState({ status: "running", logLines: [] });
    useRunsStore.setState({ runs: [] });

    Object.defineProperty(window, "specwright", {
      configurable: true,
      value: {
        runs: {
          diff: vi.fn().mockResolvedValue({ diff: "", changedFiles: [] }),
        },
        opencode: {
          openAttachTerminal: vi.fn().mockResolvedValue({ ok: true }),
          startAttachStream: vi.fn().mockResolvedValue({ ok: true }),
          stopAttachStream: vi.fn().mockResolvedValue({ ok: true }),
          sendAttachInput: vi.fn().mockResolvedValue({ ok: true }),
          resizeAttachStream: vi.fn().mockResolvedValue({ ok: true }),
          onAttachOutput: vi.fn(() => vi.fn()),
          onAttachExit: vi.fn(() => vi.fn()),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps a visible fallback when OpenCode metadata is missing", () => {
    useRunsStore.setState({ runs: [baseRun] });

    render(<ActivityDrawer />);

    expect(screen.getByText("OpenCode terminal")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(screen.getByText(/did not report both a server URL and session id/i)).toBeInTheDocument();
  });

  it("shows attach start failures as retryable status", async () => {
    vi.mocked(window.specwright.opencode.startAttachStream).mockResolvedValue({ ok: false, error: "session gone" });
    useRunsStore.setState({ runs: [{ ...baseRun, opencodeBaseUrl: "http://127.0.0.1:4096", opencodeSessionId: "ses_1234567890" }] });

    render(<ActivityDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /show terminal here/i }));

    expect(await screen.findByText("session gone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show terminal here/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy attach/i })).toBeInTheDocument();
  });

  it("shows send failures without detaching the session", async () => {
    vi.mocked(window.specwright.opencode.sendAttachInput).mockResolvedValue({ ok: false, error: "stdin closed" });
    useRunsStore.setState({ runs: [{ ...baseRun, opencodeBaseUrl: "http://127.0.0.1:4096", opencodeSessionId: "ses_1234567890" }] });

    render(<ActivityDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /show terminal here/i }));
    await waitFor(() => expect(screen.getByText("attached")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/send input to opencode/i), { target: { value: "continue" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("stdin closed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop live view/i })).toBeInTheDocument();
  });
});
