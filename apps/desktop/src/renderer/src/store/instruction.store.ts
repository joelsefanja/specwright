import { create } from "zustand";

export type InstructionCategory = "@Modules" | "@Workflows";

export interface InstructionCard {
  id: string;
  moduleName: string;
  category: InstructionCategory;
  subModules: string[];
  fileName: string;
  pageURL: string;
  steps: string[];
  filePath: string;
  gitlabSource?: {
    filePath: string;
    iid: string;
    ref: string;
    repo?: string;
    title: string;
    updatedAt?: string;
  };
  suitName: string;
  jiraURL: string;
  explore: boolean;
  runExploredCases: boolean;
  runGeneratedCases: boolean;
  autoApprove: boolean;
}

export type SerializedInstruction = Omit<InstructionCard, "id">;

interface InstructionState {
  cards: InstructionCard[];
  addCard: () => string;
  removeCard: (id: string) => void;
  updateCard: (id: string, patch: Partial<InstructionCard>) => void;
  addStep: (id: string) => void;
  removeStep: (id: string, index: number) => void;
  updateStep: (id: string, index: number, value: string) => void;
  addSubModule: (id: string, tag: string) => void;
  removeSubModule: (id: string, index: number) => void;
  clearAll: () => void;
  loadCards: (cards: SerializedInstruction[]) => void;
  serialize: () => SerializedInstruction[];
}

function makeId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultCard(): InstructionCard {
  return {
    id: makeId(),
    moduleName: "",
    category: "@Modules",
    subModules: [],
    fileName: "",
    pageURL: "",
    steps: [""],
    filePath: "",
    suitName: "",
    jiraURL: "",
    explore: true,
    runExploredCases: false,
    runGeneratedCases: false,
    autoApprove: false,
  };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/^@+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "test-goal";
}

export const useInstructionStore = create<InstructionState>((set, get) => ({
  cards: [],

  addCard: () => {
    const card = defaultCard();
    set((s) => ({ cards: [...s.cards, card] }));
    return card.id;
  },

  removeCard: (id) => {
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },

  updateCard: (id, patch) => {
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  },

  addStep: (id) => {
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, steps: [...c.steps, ""] } : c
      ),
    }));
  },

  removeStep: (id, index) => {
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id
          ? { ...c, steps: c.steps.filter((_, i) => i !== index) }
          : c
      ),
    }));
  },

  updateStep: (id, index, value) => {
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        const steps = [...c.steps];
        steps[index] = value;
        return { ...c, steps };
      }),
    }));
  },

  addSubModule: (id, tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, subModules: [...c.subModules, trimmed] } : c
      ),
    }));
  },

  removeSubModule: (id, index) => {
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id
          ? { ...c, subModules: c.subModules.filter((_, i) => i !== index) }
          : c
      ),
    }));
  },

  clearAll: () => set({ cards: [] }),

  loadCards: (cards) => {
    set({
      cards: cards.map((c) => ({ ...c, id: makeId() })),
    });
  },

  serialize: () => {
    return get().cards
      .map(({ id: _id, ...card }, index) => {
        const rawModuleName = card.moduleName.trim().replace(/^@+/, "") || `TestGoal${index + 1}`;
        const moduleName = `@${rawModuleName}`;
        const steps = card.steps.map((step) => step.trim()).filter(Boolean);
        return {
          ...card,
          moduleName,
          fileName: card.fileName.trim() || slugify(rawModuleName),
          pageURL: card.pageURL.trim(),
          subModules: card.subModules.map((tag) => tag.trim()).filter(Boolean),
          steps,
          filePath: card.filePath.trim(),
          suitName: card.suitName.trim(),
          jiraURL: "",
        };
      })
      .filter((card) => card.steps.length > 0 || Boolean(card.filePath));
  },
}));
