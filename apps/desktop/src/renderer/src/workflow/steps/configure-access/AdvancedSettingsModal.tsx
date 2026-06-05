import React from "react";
import { GearSix } from "@phosphor-icons/react";
import { Button, ModalShell } from "../../../components/ui";
import { AiSettings } from "./AiSettings";
import { ApprovalSettings } from "./ApprovalSettings";
import { ExtraEnvVars } from "./ExtraEnvVars";
import { TestRunSettings } from "./TestRunSettings";
import type { AdvancedSettingsActions, AdvancedSettingsState } from "./types";

interface AdvancedSettingsModalProps extends AdvancedSettingsState, AdvancedSettingsActions {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AdvancedSettingsModal(props: AdvancedSettingsModalProps): React.JSX.Element {
  const { advancedText, onOpenChange, open, text } = props;
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={advancedText.title}
      description={advancedText.description}
      icon={<GearSix size={18} weight="duotone" />}
      size="lg"
      className="operator-run-preferences-modal"
      closeLabel={text.authModal.close}
      footer={(
        <>
          <p className="operator-field-help m-0 flex-1">{advancedText.autosaveHelp}</p>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>{text.authModal.close}</Button>
        </>
      )}
    >
      <div className="operator-run-preferences-layout">
        <TestRunSettings advancedText={props.advancedText} envVars={props.envVars} saveEnv={props.saveEnv} setEnvVar={props.setEnvVar} />
        <div className="operator-run-preferences-secondary">
          <AiSettings advancedText={props.advancedText} envVars={props.envVars} friendlyText={props.friendlyText} onProviderChange={props.onProviderChange} provider={props.provider} saveEnv={props.saveEnv} setEnvVar={props.setEnvVar} text={props.text} />
          <ApprovalSettings advancedText={props.advancedText} setSkipPermissions={props.setSkipPermissions} skipPermissions={props.skipPermissions} />
          <ExtraEnvVars {...props} />
        </div>
      </div>
    </ModalShell>
  );
}
