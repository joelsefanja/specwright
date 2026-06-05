import React from "react";
import { FieldLabelText, Input } from "../../../components/ui";
import { ThemeSelect } from "../../../components/LeftPanel/ThemeSelect";
import type { AdvancedSettingsActions, AdvancedSettingsState } from "./types";

type Props = Pick<AdvancedSettingsState, "advancedText" | "envVars" | "friendlyText" | "provider" | "text"> & Pick<AdvancedSettingsActions, "onProviderChange" | "saveEnv" | "setEnvVar">;

export function AiSettings({ advancedText, envVars, friendlyText, onProviderChange, provider, saveEnv, setEnvVar, text }: Props): React.JSX.Element {
  return (
    <div className="operator-run-pref-section">
      <FieldLabelText>{friendlyText.testWriter}</FieldLabelText>
      <p className="operator-section-help">{friendlyText.testWriterDescription}</p>
      <ThemeSelect
        value={provider}
        onChange={onProviderChange}
        options={[{ value: "opencode", label: text.opencode }, { value: "anthropic", label: text.anthropic }, { value: "openai", label: text.openai }, { value: "ollama", label: text.ollama }]}
      />
      {provider !== "opencode" && (
        <>
          <FieldLabelText>{text.model}</FieldLabelText>
          <Input type="text" value={envVars.SPECWRIGHT_MODEL ?? ""} onChange={(event) => setEnvVar("SPECWRIGHT_MODEL", event.target.value)} onBlur={saveEnv} placeholder={text.modelPlaceholder} className="w-full" />
        </>
      )}
      {provider !== "opencode" && (
        <>
          <FieldLabelText>{advancedText.aiConnection}</FieldLabelText>
          <Input type="text" value={envVars.SPECWRIGHT_LLM_BASE_URL ?? ""} onChange={(event) => setEnvVar("SPECWRIGHT_LLM_BASE_URL", event.target.value)} onBlur={saveEnv} placeholder={advancedText.baseUrlPlaceholder} className="w-full" />
          <Input type="password" value={envVars.SPECWRIGHT_LLM_API_KEY ?? ""} onChange={(event) => setEnvVar("SPECWRIGHT_LLM_API_KEY", event.target.value)} onBlur={saveEnv} placeholder={advancedText.apiKeyPlaceholder} className="w-full" />
        </>
      )}
    </div>
  );
}
