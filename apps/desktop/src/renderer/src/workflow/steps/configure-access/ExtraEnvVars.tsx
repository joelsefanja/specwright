import React from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button, FieldLabelText, Input } from "../../../components/ui";
import { isSensitiveEnvironmentKey } from "../../../components/LeftPanel/configPanelHelpers";
import type { AdvancedSettingsActions, AdvancedSettingsState } from "./types";

type Props = Pick<AdvancedSettingsState, "advancedText" | "customVarKey" | "customVarVal" | "customVars" | "visibleSecrets"> & AdvancedSettingsActions;

export function ExtraEnvVars(props: Props): React.JSX.Element {
  const { addCustomVar, advancedText, customVarKey, customVarVal, customVars, removeEnvVar, saveEnv, setCustomVarKey, setCustomVarVal, setEnvVar, toggleSecretVisibility, visibleSecrets } = props;
  return (
    <details className="operator-run-pref-section operator-run-pref-details">
      <summary>
        <FieldLabelText>{advancedText.extraValues}</FieldLabelText>
        <span>{advancedText.extraValuesHelp}</span>
      </summary>
      {customVars.map(([key, value]) => {
        const sensitive = isSensitiveEnvironmentKey(key);
        const visible = visibleSecrets.has(key);
        return (
          <div key={key} className="operator-stack-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="operator-muted break-all font-mono text-[11px]">{key}</span>
              <button type="button" onClick={() => { removeEnvVar(key); saveEnv(); }} className="operator-icon-button hover:text-[var(--sw-danger)]" aria-label={`Remove ${key}`}><Trash size={13} weight="bold" /></button>
            </div>
            <div className="relative">
              <Input type={sensitive && !visible ? "password" : "text"} value={value ?? ""} onChange={(event) => setEnvVar(key, event.target.value)} onBlur={saveEnv} className="w-full font-mono" />
              {sensitive && <button type="button" onClick={() => toggleSecretVisibility(key)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-operator-muted">{visible ? advancedText.hide : advancedText.show}</button>}
            </div>
          </div>
        );
      })}
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Input type="text" value={customVarKey} onChange={(event) => setCustomVarKey(event.target.value.toUpperCase())} placeholder="VAR_NAME" className="font-mono" />
        <Input type="text" value={customVarVal} onChange={(event) => setCustomVarVal(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCustomVar(); }} placeholder={advancedText.valuePlaceholder} />
        <Button type="button" variant="secondary" onClick={addCustomVar}><Plus size={14} weight="bold" />{advancedText.add}</Button>
      </div>
    </details>
  );
}
