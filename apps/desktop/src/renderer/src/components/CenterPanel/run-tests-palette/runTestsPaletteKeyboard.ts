export type RunTestsPaletteKeyboardAction = "next" | "previous" | "run" | "close" | "none";

export function getRunTestsPaletteKeyboardAction(key: string, canClose: boolean): RunTestsPaletteKeyboardAction {
  if (key === "ArrowDown") {
    return "next";
  }

  if (key === "ArrowUp") {
    return "previous";
  }

  if (key === "Enter") {
    return "run";
  }

  if (key === "Escape" && canClose) {
    return "close";
  }

  return "none";
}

export function getNextRunTestsPaletteIndex(activeIndex: number, itemCount: number): number {
  return Math.min(activeIndex + 1, itemCount - 1);
}

export function getPreviousRunTestsPaletteIndex(activeIndex: number): number {
  return Math.max(activeIndex - 1, 0);
}
