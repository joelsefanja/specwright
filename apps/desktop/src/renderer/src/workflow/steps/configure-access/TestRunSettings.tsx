import React from "react";
import { Bug, Clock, ImageSquare, MonitorPlay, VideoCamera } from "@phosphor-icons/react";
import { FieldHelp, FieldLabelText, Input } from "../../../components/ui";
import { ThemeSelect } from "../../../components/LeftPanel/ThemeSelect";
import type { AdvancedSettingsActions, AdvancedSettingsState } from "./types";

type Props = Pick<AdvancedSettingsState, "advancedText" | "envVars"> & Pick<AdvancedSettingsActions, "saveEnv" | "setEnvVar">;

export function TestRunSettings({ advancedText, envVars, saveEnv, setEnvVar }: Props): React.JSX.Element {
  const browserVisible = envVars.HEADLESS === "false";

  return (
    <div className="operator-run-pref-section operator-run-pref-section-primary">
      <div className="operator-run-pref-section-head">
        <FieldLabelText>{advancedText.testRun}</FieldLabelText>
        <span>{advancedText.browserHidden}</span>
      </div>

      <label className="operator-run-pref-hero cursor-pointer" data-active={browserVisible}>
        <span className="operator-run-pref-icon"><MonitorPlay size={19} weight="duotone" /></span>
        <span className="operator-setting-copy">
          <span>{advancedText.showBrowser}</span>
          <span>{browserVisible ? advancedText.browserVisible : advancedText.browserHidden}</span>
        </span>
        <button type="button" onClick={() => { setEnvVar("HEADLESS", browserVisible ? "true" : "false"); saveEnv(); }} className="operator-toggle" data-active={browserVisible}>
          <span className="operator-toggle-knob" />
        </button>
      </label>

      <div className="operator-run-pref-grid">
        <div className="operator-run-pref-card">
          <span className="operator-run-pref-icon"><Clock size={17} weight="duotone" /></span>
          <div className="min-w-0">
            <FieldLabelText>{advancedText.timeout}</FieldLabelText>
            <Input type="number" value={envVars.TEST_TIMEOUT ?? "120000"} onChange={(event) => setEnvVar("TEST_TIMEOUT", event.target.value)} onBlur={saveEnv} className="w-full" />
            <FieldHelp>{advancedText.timeoutHelp}</FieldHelp>
          </div>
        </div>
        <div className="operator-run-pref-card">
          <span className="operator-run-pref-icon"><ImageSquare size={17} weight="duotone" /></span>
          <span className="operator-setting-copy"><span>{advancedText.screenshots}</span><span>{advancedText.screenshotsHelp}</span></span>
          <ThemeSelect value={envVars.ENABLE_SCREENSHOTS === "true" ? "failure" : "off"} onChange={(value) => { setEnvVar("ENABLE_SCREENSHOTS", value === "off" ? "false" : "true"); saveEnv(); }} options={[{ value: "failure", label: advancedText.onFailure }, { value: "off", label: advancedText.off }]} className="operator-select-compact" />
        </div>
        <div className="operator-run-pref-card">
          <span className="operator-run-pref-icon"><VideoCamera size={17} weight="duotone" /></span>
          <span className="operator-setting-copy"><span>{advancedText.video}</span><span>{advancedText.videoHelp}</span></span>
          <ThemeSelect value={envVars.ENABLE_VIDEO_RECORDING !== "true" ? "off" : envVars.RETAIN_VIDEO_ON_SUCCESS === "true" ? "always" : "failure"} onChange={(value) => { setEnvVar("ENABLE_VIDEO_RECORDING", value === "off" ? "false" : "true"); setEnvVar("RETAIN_VIDEO_ON_SUCCESS", value === "always" ? "true" : "false"); saveEnv(); }} options={[{ value: "failure", label: advancedText.onFailure }, { value: "always", label: advancedText.always }, { value: "off", label: advancedText.off }]} className="operator-select-compact" />
        </div>
        <label className="operator-run-pref-card cursor-pointer">
          <span className="operator-run-pref-icon"><Bug size={17} weight="duotone" /></span>
          <span className="operator-setting-copy"><span>{advancedText.tracing}</span><span>{advancedText.tracingHelp}</span></span>
          <button type="button" onClick={() => { setEnvVar("ENABLE_TRACING", envVars.ENABLE_TRACING === "true" ? "false" : "true"); saveEnv(); }} className="operator-toggle" data-active={envVars.ENABLE_TRACING === "true"}>
            <span className="operator-toggle-knob" />
          </button>
        </label>
      </div>
    </div>
  );
}
