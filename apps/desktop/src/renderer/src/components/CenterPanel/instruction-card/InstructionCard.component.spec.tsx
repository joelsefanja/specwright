import React from "react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstructionStore, type InstructionCard as ICard } from "../../../store/instruction.store";
import InstructionCard from "./InstructionCard";

vi.mock("@renderer/store/config.store", () => ({
  useConfigStore: Object.assign(
    (selector?: (s: { projectPath: string }) => string) => selector?.({ projectPath: "C:/project" }) ?? { projectPath: "C:/project" },
    { getState: () => ({ projectPath: "C:/project" }), setState: () => {} },
  ),
}));

vi.mock("@renderer/i18n/localeStore", () => ({
  useLanguageStore: Object.assign(
    (selector?: (s: { language: string }) => string) => selector?.({ language: "en" }) ?? { language: "en" },
    { getState: () => ({ language: "en" }), setState: () => {} },
  ),
  useTranslations: () => {
    const t: Record<string, string> = {};
    return new Proxy(t, { get: () => "translated" });
  },
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
}));

const baseCard: ICard = {
  id: "card-1",
  moduleName: "",
  category: "@Modules",
  subModules: [],
  fileName: "",
  pageURL: "",
  steps: ["Open the page"],
  filePath: "",
  suitName: "",
  jiraURL: "",
  explore: true,
  runExploredCases: false,
  runGeneratedCases: false,
  autoApprove: false,
};

function InstructionCardHarness(): React.JSX.Element | null {
  const card = useInstructionStore((state) => state.cards[0]);
  return card ? <InstructionCard card={card} index={0} /> : null;
}

function renderCard(): void {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <InstructionCardHarness />
    </QueryClientProvider>,
  );
}

describe("InstructionCard steps", () => {
  beforeEach(() => {
    window.localStorage.setItem("specwright.language", "en");
    useInstructionStore.setState({ cards: [baseCard] });

    Object.defineProperty(window, "specwright", {
      configurable: true,
      value: {
        project: {
          gitLabStatus: vi.fn().mockResolvedValue({ hasGlab: false, authenticated: false }),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useInstructionStore.setState({ cards: [] });
  });

  it("allows removing the last remaining step line", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /remove line 1/i }));

    expect(screen.queryByRole("textbox", { name: /step 1/i })).not.toBeInTheDocument();
    expect(useInstructionStore.getState().cards[0].steps).toEqual([]);
  });
});
