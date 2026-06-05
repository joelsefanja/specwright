import React from "react";
import { FieldLabelText } from "../../../components/ui";
import type { AdvancedSettingsActions, AdvancedSettingsState } from "./types";

type Props = Pick<AdvancedSettingsState, "advancedText" | "skipPermissions"> & Pick<AdvancedSettingsActions, "setSkipPermissions">;

export function ApprovalSettings({ advancedText, setSkipPermissions, skipPermissions }: Props): React.JSX.Element {
  return (
    <div className="operator-run-pref-section">
      <FieldLabelText>{advancedText.sourcesAndApprovals}</FieldLabelText>
      <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
        <span className="operator-setting-copy"><span>{advancedText.autoContinue}</span><span>{advancedText.autoContinueHelp}</span></span>
        <button type="button" onClick={() => setSkipPermissions(!skipPermissions)} className="operator-toggle" data-active={skipPermissions}>
          <span className="operator-toggle-knob" />
        </button>
      </label>
    </div>
  );
}
