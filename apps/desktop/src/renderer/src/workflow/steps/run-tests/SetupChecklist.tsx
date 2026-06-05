import React from "react";
import { ReadinessList } from "../../../components/common/workflow-ui";
import { CardTitle, Surface } from "../../../components/ui";
import type { SetupChecklistProps } from "./types";

export function SetupChecklist({ isDutch, isRunning, readinessItems, text }: SetupChecklistProps): React.JSX.Element {
  return (
    <Surface variant="default" padding="lg" className="flex flex-col gap-4">
      <CardTitle>{isDutch ? "Controle voor start" : "Pre-start check"}</CardTitle>
      <p className="text-sm leading-6 text-operator-muted">
        {isDutch ? "Dit is het bewijs dat Specwright genoeg context heeft voordat de run start." : "This proves Specwright has enough context before the run starts."}
      </p>
      <ReadinessList items={readinessItems} doneLabel={text.phaseStatusLabels.done} pendingLabel={isDutch ? "Vul aan" : "Complete"} disabled={isRunning} />
    </Surface>
  );
}
