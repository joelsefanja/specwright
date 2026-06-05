import type React from "react";
import type { RunTestsPaletteItem as RunTestsPaletteItemData } from "./runTestsPaletteItems";

const kindMeta: Record<RunTestsPaletteItemData["kind"], { code: string }> = {
  module: { code: "Module" },
  workflow: { code: "Workflow" },
  script: { code: "Script" },
  custom: { code: "Custom" },
};

type RunTestsPaletteItemProps = {
  item: RunTestsPaletteItemData;
  index: number;
  isActive: boolean;
  isLaunching: boolean;
  isDisabled: boolean;
  onRunItem: (arg: string) => void;
  onActivateItem: (index: number) => void;
};

export function RunTestsPaletteItem({
  item,
  index,
  isActive,
  isLaunching,
  isDisabled,
  onRunItem,
  onActivateItem,
}: RunTestsPaletteItemProps): React.JSX.Element {
  const meta = kindMeta[item.kind];

  function onItemClick(): void {
    onRunItem(item.arg);
  }

  function onItemMouseEnter(): void {
    onActivateItem(index);
  }

  return (
    <button
      data-idx={index}
      onClick={onItemClick}
      onMouseEnter={onItemMouseEnter}
      className="operator-command-item"
      data-active={isActive}
      data-launching={isLaunching}
      disabled={isDisabled}
    >
      <span className="operator-command-kind">
        {meta.code}
      </span>
      <span className="operator-command-name">
        {item.label}
      </span>
      <span className="operator-command-arg">
        {item.arg}
      </span>
      {isLaunching ? (
        <span className="operator-command-launching"><span /> Preparing</span>
      ) : isActive && (
        <kbd className="operator-command-enter">Enter</kbd>
      )}
    </button>
  );
}
