import React from "react";
import { PlayCircle } from "@phosphor-icons/react";
import { Button } from "../../../components/ui";
import type { StartActionProps } from "./types";

export function StartButton({ canStart, isRunning, startLabel, text, onStart }: StartActionProps): React.JSX.Element {
  return (
    <Button type="button" variant="default" className="gap-2" disabled={!canStart} onClick={onStart}>
      {isRunning ? <span className="operator-loading-spinner h-4 w-4" /> : <PlayCircle size={17} weight="fill" />}
      {isRunning ? text.running : startLabel ?? text.start}
    </Button>
  );
}
