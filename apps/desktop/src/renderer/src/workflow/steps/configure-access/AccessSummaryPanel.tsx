import React from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { ReadinessList, type ReadinessItem } from "../../../components/common/workflow-ui";
import { Button, Surface } from "../../../components/ui";
import type { FriendlyAccessText } from "./accessLabels";

interface AccessSummaryPanelProps {
  accessReady: boolean;
  appUrlConfigured: boolean;
  friendlyText: FriendlyAccessText;
  items: ReadinessItem[];
  onNext: () => void;
  showAction?: boolean;
}

export function AccessSummaryPanel({ accessReady, appUrlConfigured, friendlyText, items, onNext, showAction = true }: AccessSummaryPanelProps): React.JSX.Element {
  return (
    <Surface variant={accessReady ? "success" : "accent"} padding="lg" className="operator-access-summary-card" data-ready={accessReady}>
      <p className="operator-access-summary-kicker">{accessReady ? friendlyText.nextReadyKicker : friendlyText.nextBlockedKicker}</p>
      <div className="operator-access-summary-action">
        <h3 className="operator-access-summary-heading">{accessReady ? friendlyText.readyTitle : friendlyText.notReadyTitle}</h3>
        <p className="operator-section-help">{accessReady ? friendlyText.readyDescription : friendlyText.notReadyDescription}</p>
        <ReadinessList items={items} doneLabel={friendlyText.readyToEdit} pendingLabel={friendlyText.clickToFix} />
        {showAction && <Button type="button" variant="default" className="operator-access-next-button" disabled={!accessReady} onClick={onNext}>
          {friendlyText.nextButton}
          <ArrowRight size={15} weight="bold" />
        </Button>}
        {!accessReady && <p className="operator-access-next-help">{!appUrlConfigured ? friendlyText.addAppLinkFirst : friendlyText.addLoginFirst}</p>}
      </div>
    </Surface>
  );
}
