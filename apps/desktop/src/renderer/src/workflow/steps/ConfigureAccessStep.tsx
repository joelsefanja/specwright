import React from "react";
import { ArrowLeft, ArrowRight, GearSix, SignIn } from "@phosphor-icons/react";
import { Button } from "../../components/ui";
import { AuthSettingsModal } from "../../components/LeftPanel/AuthSettingsModal";
import { ThemeSelect } from "../../components/LeftPanel/ThemeSelect";
import type { WorkflowStepId } from "../workflowSteps";
import { AccessStepCard, AdvancedSettingsModal } from "./configure-access";
import { useConfigureAccessStep } from "./configure-access/useConfigureAccessStep";
import { StudioStep } from "./StudioStep";

export function ConfigureAccessStep({ onSelectStep }: { onSelectStep: (stepId: WorkflowStepId) => void }): React.JSX.Element {
  const state = useConfigureAccessStep();
  const { accessReady, advancedOpen, advancedText, appLinkStatus, appUrlConfigured, appUrlInputRef, authConfigured, authFields, authRequired, authStrategies, authStrategy, customVarKey, customVarVal, customVars, envVars, friendlyText, loginStatus, provider, setAdvancedOpen, setCustomVarKey, setCustomVarVal, setEnvVar, removeEnvVar, saveEnv, showAuthModal, setShowAuthModal, skipPermissions, setSkipPermissions, text, usesBuiltInAuthSettings, visibleSecrets, addCustomVar, onAuthToggle, onProviderChange, onSaveAuth, toggleSecretVisibility } = state;
  const backLabel = text.step.startsWith("Stap") ? "Terug" : "Back";

  const accessItems = [
    {
      label: friendlyText.appLink,
      description: appLinkStatus,
      ready: appUrlConfigured,
      action: () => appUrlInputRef.current?.focus(),
    },
    {
      label: friendlyText.loginChoice,
      description: loginStatus,
      ready: authConfigured,
      action: usesBuiltInAuthSettings ? () => setShowAuthModal(true) : undefined,
    },
  ];

  return (
    <StudioStep
      stepId="configure-access"
      stepLabel={text.step}
      title={friendlyText.frameTitle}
      description={friendlyText.frameDescription}
      actionBar={{
        title: accessReady ? friendlyText.nextReadyKicker : friendlyText.nextBlockedKicker,
        helper: accessReady ? friendlyText.readyDescription : friendlyText.notReadyDescription,
        secondary: (
          <Button type="button" variant="secondary" onClick={() => onSelectStep("connect-project")}>
            <ArrowLeft size={14} weight="bold" />
            {backLabel}
          </Button>
        ),
        primary: (
          <Button type="button" variant="default" disabled={!accessReady} onClick={() => onSelectStep("describe-test")}>
            {friendlyText.nextButton}
            <ArrowRight size={15} weight="bold" />
          </Button>
        ),
      }}
    >
      <div className="operator-access-layout">
        <div className="operator-access-primary-flow">
          <AccessStepCard number={1} title={friendlyText.websiteTitle} status={appLinkStatus} ready={appUrlConfigured} primary>
            <p className="operator-access-copy">{friendlyText.websiteDescription}</p>
            <div className="operator-access-form-grid">
              <label className="operator-access-field operator-access-field-wide">
                <span className="operator-control-label">{friendlyText.appLink}</span>
                <input
                  ref={appUrlInputRef}
                  type="text"
                  value={envVars.BASE_URL ?? ""}
                  onChange={(event) => setEnvVar("BASE_URL", event.target.value)}
                  onBlur={saveEnv}
                  placeholder="https://app.example.com"
                  className="operator-field w-full px-3 py-3"
                />
                <span className="operator-field-help">{friendlyText.appLinkHelp}</span>
              </label>
            </div>
          </AccessStepCard>

          <AccessStepCard number={2} title={friendlyText.signInTitle} status={loginStatus} ready={!authRequired || authConfigured}>
            <div className="operator-access-login-group" data-active={authRequired}>
              <div className="operator-access-login-row">
                <div>
                  <p className="operator-access-copy">{friendlyText.signInDescription}</p>
                  <p className="operator-field-help">{authRequired ? friendlyText.loginOn : friendlyText.loginOff}</p>
                </div>
                <button type="button" role="switch" aria-checked={authRequired} onClick={() => onAuthToggle(!authRequired)} className="operator-toggle" data-active={authRequired}>
                  <span className="operator-toggle-knob" />
                </button>
              </div>

              {authRequired && (
                <div className="operator-access-login-controls">
                  <label className="operator-access-field">
                    <span className="operator-control-label">{text.authModal.authMechanism}</span>
                    <ThemeSelect
                      value={authStrategy}
                      onChange={(strategy) => {
                        setEnvVar("AUTH_STRATEGY", strategy);
                        void saveEnv();
                        if (strategy === "oauth" || strategy === "email-password") setShowAuthModal(true);
                      }}
                      options={authStrategies.map((strategy) => ({ value: strategy, label: strategy }))}
                    />
                  </label>
                  {usesBuiltInAuthSettings && (
                    <Button type="button" variant="secondary" onClick={() => setShowAuthModal(true)}>
                      <SignIn size={15} weight="bold" />
                      {friendlyText.loginDetails}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </AccessStepCard>

        </div>

        <aside className="operator-access-summary operator-access-side-panel">
          <div className="operator-access-checklist" data-ready={accessReady} data-testid="access-checklist">
            <p className="operator-access-summary-kicker">{friendlyText.nextReadyKicker}</p>
            <h3 className="operator-access-summary-heading">{accessReady ? friendlyText.readyTitle : friendlyText.notReadyTitle}</h3>
            <div className="operator-access-checklist-items">
              {accessItems.map((item) => (
                <button key={item.label} type="button" className="operator-access-checklist-item" data-ready={item.ready} onClick={item.action} disabled={!item.action}>
                  <span className="operator-access-check-dot" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="operator-access-preferences-card" data-testid="advanced-settings" onClick={() => setAdvancedOpen(true)}>
            <span className="operator-access-preferences-icon"><GearSix size={16} weight="duotone" /></span>
            <span>
              <strong>{advancedText.openButton}</strong>
              <small>{advancedText.openDescription}</small>
            </span>
          </button>
          <AdvancedSettingsModal
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            advancedText={advancedText}
            customVarKey={customVarKey}
            customVarVal={customVarVal}
            customVars={customVars}
            envVars={envVars}
            friendlyText={friendlyText}
            provider={provider}
            skipPermissions={skipPermissions}
            text={text}
            visibleSecrets={visibleSecrets}
            addCustomVar={addCustomVar}
            onProviderChange={onProviderChange}
            removeEnvVar={removeEnvVar}
            saveEnv={saveEnv}
            setCustomVarKey={setCustomVarKey}
            setCustomVarVal={setCustomVarVal}
            setEnvVar={setEnvVar}
            setSkipPermissions={setSkipPermissions}
            toggleSecretVisibility={toggleSecretVisibility}
          />
        </aside>
      </div>

      {showAuthModal && (
        <AuthSettingsModal
          initial={authFields}
          strategy={authStrategy as "oauth" | "email-password"}
          onSave={onSaveAuth}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </StudioStep>
  );
}
