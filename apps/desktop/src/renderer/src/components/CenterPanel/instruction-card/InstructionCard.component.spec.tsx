import React from "react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLanguageStore } from "../../../i18n/localeStore";
import { useConfigStore } from "../../../store/config.store";
import { useInstructionStore, type InstructionCard as ICard } from "../../../store/instruction.store";
import InstructionCard from "./InstructionCard";

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
    useLanguageStore.setState({ language: "en" });
    useConfigStore.setState({ projectPath: "C:/project" });
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
