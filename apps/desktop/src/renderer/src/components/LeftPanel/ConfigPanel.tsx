import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GearSix, Trash } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { AuthSettingsModal, EMPTY_AUTH, isOAuthConfigured, isEmailPasswordConfigured } from "./AuthSettingsModal";
import type { AuthFields } from "./AuthSettingsModal";
import { PluginPickerModal } from "./PluginPickerModal";
import { OpenCodeConfigModal } from "./OpenCodeConfigModal";
import { TestingAdapterSection } from "./TestingAdapterSection";
import { ThemeSelect } from "./ThemeSelect";
import { WebsiteToTestSection } from "./WebsiteToTestSection";
import {
  ENVIRONMENT_LABELS,
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_DEFAULT_URL,
  OPENCODE_DEFAULT_VARIANT,
  getCustomEnvVars,
  getPreferredAuthStrategy,
  getProjectBasename,
  isSensitiveEnvironmentKey,
  normalizeOpenCodeModel,
} from "./configPanelHelpers";
import { ReadinessChecklist } from "../common/Discoverability";
import { presenceTransition, presenceVariants } from "@renderer/motion/presets";

const SyncButtonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

function SidebarHeading({ title, description }: { title: string; description?: string }): React.JSX.Element {
  return (
    <div className="operator-sidebar-heading">
      <p className="operator-section-title">{title}</p>
      {description && <p>{description}</p>}
    </div>
  );
}

export default function ConfigPanel(): React.JSX.Element {
  const {
    projectPath, projectState, envVars, loaded,
    pickAndBootstrap, loadExistingProject, setEnvVar, removeEnvVar, saveEnv,
    skipPermissions, setSkipPermissions, pendingPlugin, setPendingPlugin, resetProject, recentProjects,
  } = useConfigStore();

  const [customVarKey, setCustomVarKey] = useState("");
  const [customVarVal, setCustomVarVal] = useState("");
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [authFields, setAuthFields] = useState<AuthFields>(EMPTY_AUTH);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPluginModal, setShowPluginModal] = useState(false);
  const [pluginInfo, setPluginInfo] = useState<PluginInfo | null>(null);
  const [applyingPlugin, setApplyingPlugin] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "ok" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [showOcModal, setShowOcModal] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [ocStatus, setOcStatus] = useState<"idle" | "checking" | "connected" | "error">("idle");
  const [ocModel, setOcModel] = useState<string | null>(null);
  const [ocServerRunning, setOcServerRunning] = useState(false);
  const [ocStarting, setOcStarting] = useState(false);
  const [authStrategies, setAuthStrategies] = useState<string[]>(["oauth", "email-password"]);
  const appUrlInputRef = useRef<HTMLInputElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const opencodeAutoStartRef = useRef(false);


  useEffect(() => {
    window.specwright.app.getVersion().then(setAppVersion).catch(() => null);
    const off = window.specwright.app.onUpdateDownloaded(({ version }) => setUpdateVersion(version));
    return off;
  }, []);

  useEffect(() => {
    if ((envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode") return;
    window.specwright.opencode.serverStatus().then((s) => setOcServerRunning(s.running));
  }, [envVars.SPECWRIGHT_LLM_PROVIDER]);

  const authStrategy = (envVars.AUTH_STRATEGY || "none") as string;
  const authRequired = authStrategy !== "none";
  const usesBuiltInAuthSettings = authStrategy === "oauth" || authStrategy === "email-password";
  const ocStatusLabel = ocStarting
    ? "Preparing..."
    : ocStatus === "connected"
      ? "Connected"
      : ocStatus === "checking"
        ? "Checking..."
        : ocStatus === "error"
          ? "Not reachable"
          : ocServerRunning ? "Connected" : "Preparing";
  const getOpenCodeUrl = (): string => (envVars.SPECWRIGHT_OPENCODE_URL as string) || OPENCODE_DEFAULT_URL;

  const startAndDetectOpenCode = async (): Promise<void> => {
    setOcStarting(true);
    setOcStatus("checking");
    try {
      const sr = await window.specwright.opencode.startServer();
      setOcServerRunning(sr.ok);
      if (!sr.ok) {
        setOcStatus("error");
        return;
      }
      const detected = await window.specwright.opencode.detectModel(getOpenCodeUrl());
      const model = normalizeOpenCodeModel(detected?.modelId);
      setOcModel(model);
      setEnvVar("SPECWRIGHT_MODEL", model);
      saveEnv();
      setOcStatus("connected");
    } finally {
      setOcStarting(false);
    }
  };

  useEffect(() => {
    if ((envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode") return;
    if (ocServerRunning || ocStarting || opencodeAutoStartRef.current) return;
    opencodeAutoStartRef.current = true;
    void startAndDetectOpenCode();
  }, [envVars.SPECWRIGHT_LLM_PROVIDER, ocServerRunning, ocStarting]);

  useEffect(() => {
    if (!projectPath || !loaded) return;
    window.specwright.project.detectPlugin(projectPath).then(setPluginInfo).catch(() => null);
    window.specwright.project.listAuthStrategies(projectPath).then((strategies) => {
      setAuthStrategies(strategies);
      if (!envVars.AUTH_STRATEGY) {
        setEnvVar("AUTH_STRATEGY", getPreferredAuthStrategy(strategies));
        saveEnv();
      }
    }).catch(() => null);
  }, [projectPath, loaded]);

  useEffect(() => {
    if (!projectPath || !loaded) return;
    setAuthFields({
      userEmail: (envVars.TEST_USER_EMAIL as string) ?? "",
      userName: (envVars.TEST_USER_NAME as string) ?? "",
      userPicture: (envVars.TEST_USER_PICTURE as string) ?? "",
      storageKey: (envVars.OAUTH_STORAGE_KEY as string) ?? "",
      signinPath: (envVars.OAUTH_SIGNIN_PATH as string) ?? "",
      buttonTestId: (envVars.OAUTH_BUTTON_TEST_ID as string) ?? "",
      postLoginUrl: (envVars.OAUTH_POST_LOGIN_URL as string) ?? "",
      password: (envVars.TEST_USER_PASSWORD as string) ?? "",
    });
  }, [projectPath, loaded, envVars]);

  const isConfigured = !authRequired
    ? true
    : authStrategy === "oauth"
      ? isOAuthConfigured(authFields)
      : authStrategy === "email-password"
        ? isEmailPasswordConfigured(authFields)
        : true;

  const handleAuthToggle = (checked: boolean): void => {
    if (!checked) {
      setEnvVar("AUTH_STRATEGY", "none");
      saveEnv();
    } else {
      const strategy = getPreferredAuthStrategy(authStrategies);
      setEnvVar("AUTH_STRATEGY", strategy);
      saveEnv();
      if ((strategy === "oauth" || strategy === "email-password") && !isOAuthConfigured(authFields) && !isEmailPasswordConfigured(authFields)) {
        setShowAuthModal(true);
      }
    }
  };

  const handleAuthStrategyChange = (strategy: string): void => {
    setEnvVar("AUTH_STRATEGY", strategy);
    saveEnv();
    if (strategy === "oauth" || strategy === "email-password") {
      setShowAuthModal(true);
    }
  };

  const handleSaveAuth = (fields: AuthFields): void => {
    const set = (k: string, v: string): void => { if (v) setEnvVar(k, v); else removeEnvVar(k); };
    set("TEST_USER_EMAIL", fields.userEmail);
    set("TEST_USER_PASSWORD", fields.password);
    set("TEST_USER_NAME", fields.userName);
    set("TEST_USER_PICTURE", fields.userPicture);
    set("OAUTH_STORAGE_KEY", fields.storageKey);
    set("OAUTH_SIGNIN_PATH", fields.signinPath);
    set("OAUTH_BUTTON_TEST_ID", fields.buttonTestId);
    set("OAUTH_POST_LOGIN_URL", fields.postLoginUrl);
    saveEnv();
    setAuthFields(fields);
    setShowAuthModal(false);
  };

  const handleApplyPlugin = async (source: PluginSource): Promise<void> => {
    setShowPluginModal(false);
    if (!isReady) {
      setPendingPlugin(source);
      return;
    }
    setApplyingPlugin(true);
    try {
      await window.specwright.project.bootstrap(projectPath, { overlay: source });
      const updated = await window.specwright.project.detectPlugin(projectPath);
      setPluginInfo(updated);
    } finally {
      setApplyingPlugin(false);
    }
  };

  const toggleSecretVisibility = (key: string): void => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const projectOptions = recentProjects.filter((project) => project !== projectPath).slice(0, 5);

  const handleAddCustomVar = (): void => {
    const key = customVarKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (!key) return;
    setEnvVar(key, customVarVal);
    setCustomVarKey("");
    setCustomVarVal("");
  };

  const customVars = getCustomEnvVars(envVars);
  const isReady = projectState === "ready";
  const appUrlConfigured = Boolean((envVars.BASE_URL as string | undefined)?.trim());
  const loginConfigured = !authRequired || isConfigured;
  const aiConfigured = Boolean((envVars.SPECWRIGHT_MODEL as string | undefined)?.trim()) || (envVars.SPECWRIGHT_LLM_PROVIDER as string) === "opencode";
  const focusAppUrl = (): void => appUrlInputRef.current?.focus();
  const onOpenPluginPicker = (): void => {
    setShowPluginModal(true);
  };
  const openLoginSettings = (): void => {
    if (!authRequired) handleAuthToggle(true);
    else if (usesBuiltInAuthSettings) setShowAuthModal(true);
  };
  const focusAiModel = (): void => {
    aiSectionRef.current?.scrollIntoView({ block: "nearest" });
    if ((envVars.SPECWRIGHT_LLM_PROVIDER as string) === "opencode") setShowOcModal(true);
  };
  const setupSteps = [
    {
      label: "Projectmap",
      description: isReady ? `Tests komen in ${getProjectBasename(projectPath || "")}.` : "Kies de map van je app.",
      complete: isReady,
      actionLabel: "Kiezen",
      onAction: isReady ? undefined : pickAndBootstrap,
    },
    {
      label: "URL van je app",
      description: appUrlConfigured ? "Specwright weet welke app open moet." : "Vul de URL van je draaiende app in.",
      complete: appUrlConfigured,
      actionLabel: "URL invullen",
      onAction: isReady ? focusAppUrl : undefined,
    },
    {
      label: "Login",
      description: loginConfigured ? "Login-keuze is ingesteld." : "Kies of Specwright moet inloggen.",
      complete: loginConfigured,
      actionLabel: authRequired ? "Invullen" : "Kiezen",
      onAction: isReady ? openLoginSettings : undefined,
    },
    {
      label: "AI",
      description: aiConfigured ? "Test-AI is gekozen." : "Kies waarmee Specwright de test maakt.",
      complete: aiConfigured,
      actionLabel: "Test-AI kiezen",
      onAction: isReady ? focusAiModel : undefined,
    },
  ];
  const hasMissingSetup = setupSteps.some((step) => !step.complete);

  return (
    <>
      {showAuthModal && (
        <AuthSettingsModal
          strategy={authStrategy}
          initial={authFields}
          onSave={handleSaveAuth}
          onClose={() => setShowAuthModal(false)}
        />
      )}
      {showPluginModal && (
        <PluginPickerModal
          onClose={() => setShowPluginModal(false)}
          onApply={handleApplyPlugin}
          onReset={() => setPendingPlugin(null)}
        />
      )}
      {showOcModal && (
        <OpenCodeConfigModal
          initialUrl={getOpenCodeUrl()}
          initialModel={normalizeOpenCodeModel(envVars.SPECWRIGHT_MODEL as string)}
          initialVariant={(envVars.SPECWRIGHT_OPENCODE_VARIANT as string) || OPENCODE_DEFAULT_VARIANT}
          onSave={(url, model, variant) => {
            setEnvVar("SPECWRIGHT_OPENCODE_URL", url);
            setEnvVar("SPECWRIGHT_MODEL", normalizeOpenCodeModel(model));
            setEnvVar("SPECWRIGHT_OPENCODE_VARIANT", variant);
            saveEnv();
            setOcStatus("connected");
            setOcModel(normalizeOpenCodeModel(model));
            setShowOcModal(false);
          }}
          onClose={() => setShowOcModal(false)}
        />
      )}

      <div className="flex flex-col h-full overflow-y-auto scrollable bg-operator-panel" data-tab-staging="true" style={{ padding: "0 var(--sw-panel-pad) var(--sw-panel-pad)", gap: "var(--sw-space-3)" }}>

        <div className="operator-sidebar-title">
          <p>Instellingen</p>
          <span>Wat Specwright nodig heeft om tests te maken</span>
        </div>

        <AnimatePresence initial={false}>
          {updateVersion && (
            <motion.div
              key="update-available"
              className="operator-panel-brand"
              variants={presenceVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={presenceTransition}
            >
              <button
                onClick={() => window.specwright.app.installUpdate()}
                title={`v${updateVersion} available — click to download`}
                className="operator-button-primary"
              >
                  Update v{updateVersion} installeren
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project */}
        <section className="operator-sidebar-section operator-sidebar-section-first">
          <SidebarHeading
            title="Projectmap"
            description={isReady ? undefined : "Kies de map van je app."}
          />

          {isReady ? (
            <div className="operator-project-summary">
              <div className="operator-project-row">
                <div className="min-w-0 flex-1 operator-stack-sm">
                  <p className="operator-control-label">Huidig project</p>
                  <div className="operator-project-dropdown" onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectDropdownOpen(false);
                  }}>
                    <button
                      type="button"
                      className="operator-project-current"
                      onClick={() => setProjectDropdownOpen((open) => !open)}
                      title={projectPath}
                      aria-expanded={projectDropdownOpen}
                    >
                      <span className="operator-project-name">{getProjectBasename(projectPath)}</span>
                      <span className="operator-project-path">{projectPath}</span>
                    </button>
                    {projectDropdownOpen && (
                      <div className="operator-project-menu">
                        {projectOptions.length > 0 ? projectOptions.map((project) => (
                          <button
                            key={project}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setProjectDropdownOpen(false);
                              loadExistingProject(project);
                            }}
                            className="operator-project-option"
                            title={project}
                          >
                            <span>{getProjectBasename(project)}</span>
                            <small>{project}</small>
                          </button>
                        )) : (
                          <p className="operator-project-empty">Nog geen eerdere projecten.</p>
                        )}
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setProjectDropdownOpen(false);
                            pickAndBootstrap();
                          }}
                          className="operator-project-option operator-project-option-action"
                        >
                          Ander project kiezen
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="operator-project-actions" aria-hidden={projectDropdownOpen}>
                  {confirmReset ? (
                    <>
                        <span className="operator-field-help">Project loskoppelen?</span>
                      <button
                        onClick={() => { resetProject(); setConfirmReset(false); }}
                        className="operator-button operator-button-compact operator-danger hover:border-[var(--sw-danger)]"
                      >
                        Ja
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="operator-button operator-button-compact"
                      >
                        Nee
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => loadExistingProject(projectPath)}
                        className="operator-icon-button"
                        title="Project opnieuw laden"
                      >
                        <SyncButtonIcon />
                      </button>
                      <button
                        onClick={() => setConfirmReset(true)}
                        title="Project loskoppelen"
                        className="operator-icon-button hover:text-[var(--sw-danger)]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </button>
                      <button
                        onClick={pickAndBootstrap}
                        className="operator-button operator-button-compact"
                        title="Ander project kiezen"
                      >
                        Wisselen
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="operator-text-subtle">Kies een projectmap om te starten.</p>
          )}
        </section>

        <TestingAdapterSection
          isReady={isReady}
          isApplyingPlugin={applyingPlugin}
          pluginInfo={pluginInfo}
          pendingPlugin={pendingPlugin}
          onOpenPluginPicker={onOpenPluginPicker}
        />

        <AnimatePresence initial={false}>
          {hasMissingSetup && (
            <motion.div
              key="needs-attention"
              variants={presenceVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={presenceTransition}
            >
              <ReadinessChecklist
                title="Nog nodig"
                description="Vul dit aan voordat je tests maakt."
                steps={setupSteps}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings — only shown when project is ready */}
        {isReady && (
          <>
            <section className="operator-form">
              <WebsiteToTestSection
                appUrlInputRef={appUrlInputRef}
                appUrlValue={envVars.BASE_URL ?? ""}
                environmentLabel={envVars.TEST_ENV}
                environmentLabels={ENVIRONMENT_LABELS}
                isAppUrlConfigured={appUrlConfigured}
                onAppUrlChange={(value) => setEnvVar("BASE_URL", value)}
                onEnvironmentLabelChange={(value) => setEnvVar("TEST_ENV", value)}
                onSaveEnvironment={saveEnv}
              />

              {/* Auth */}
              <div className="operator-config-section">
                <div className="flex items-center justify-between gap-3">
                  <SidebarHeading
                    title="Login"
                    description={loginConfigured ? undefined : "Choose whether Specwright must sign in before testing."}
                  />
                   <span className={loginConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>{loginConfigured ? authRequired ? "Ingevuld" : "Niet nodig" : "Nog nodig"}</span>
              </div>
              <div className="operator-stack-sm">
                <div className="operator-setting-row operator-setting-row-explained">
                  <div className="operator-setting-copy">
                    <span>Login gebruiken</span>
                    <span>{authRequired ? "Specwright logt eerst in." : "Specwright opent de app zonder login."}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAuthToggle(!authRequired)}
                    className="operator-toggle"
                    data-active={authRequired}
                    aria-label="Toggle login requirement"
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </div>
                {authRequired && (
                  <div className="operator-stack-sm">
                    <div>
                          <label className="operator-control-label">Loginmethode</label>
                      <div className="flex items-center gap-2">
                        <ThemeSelect
                          value={authStrategy}
                          onChange={handleAuthStrategyChange}
                          options={authStrategies.map((strategy) => ({ value: strategy, label: strategy }))}
                          className="flex-1"
                        />

                        {usesBuiltInAuthSettings && (
                          <button
                            onClick={() => setShowAuthModal(true)}
                            title="Login invullen"
                            className="operator-icon-button relative"
                          >
                            <GearSix className="operator-icon" weight="bold" />
                            <span
                                className={`absolute -top-1 -right-1 operator-status-dot border border-operator-panel ${isConfigured ? "bg-[var(--sw-success)]" : "bg-[var(--sw-danger)] animate-pulse"
                                }`}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    {!usesBuiltInAuthSettings ? (
                      <p className="operator-field-help">
                        Gebruikt de loginmethode <span className="font-mono">{authStrategy}</span>.
                      </p>
                    ) : isConfigured ? (
                      <p className="operator-field-help">
                        Login is opgeslagen voor <span className="operator-text-muted">{authFields.userEmail}</span>.
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="operator-link text-xs text-left"
                      >
                         Login invullen
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>

              {/* LLM Provider settings */}
              <div className="operator-config-section" ref={aiSectionRef}>
                <div className="flex items-center justify-between gap-3">
                  <SidebarHeading
                    title="Test-AI"
                    description={aiConfigured ? undefined : "Kies waarmee Specwright je app bekijkt en de test schrijft."}
                  />
                  <span className={aiConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>{aiConfigured ? "Gekozen" : "Nog nodig"}</span>
                </div>
              <div className="space-y-2">
                <div>
                  <label className="operator-control-label">Test-AI</label>
                  <ThemeSelect
                    value={(envVars.SPECWRIGHT_LLM_PROVIDER as string) ?? "anthropic"}
                    onChange={async (provider) => {
                      setEnvVar("SPECWRIGHT_LLM_PROVIDER", provider);
                      if (provider === "opencode") {
                        if (!envVars.SPECWRIGHT_OPENCODE_URL) setEnvVar("SPECWRIGHT_OPENCODE_URL", OPENCODE_DEFAULT_URL);
                        if (!envVars.SPECWRIGHT_OPENCODE_VARIANT) setEnvVar("SPECWRIGHT_OPENCODE_VARIANT", OPENCODE_DEFAULT_VARIANT);
                        setEnvVar("SPECWRIGHT_MODEL", OPENCODE_DEFAULT_MODEL);
                        saveEnv();
                        await startAndDetectOpenCode();
                      } else {
                        saveEnv();
                      }
                    }}
                    options={[
                      { value: "opencode", label: "OpenCode lokaal (aanbevolen)" },
                      { value: "anthropic", label: "Anthropic Claude" },
                      { value: "openai", label: "OpenAI-compatible" },
                      { value: "ollama", label: "Ollama lokaal" },
                    ]}
                  />
                </div>

                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && <div>
                  <label className="operator-control-label">Modelnaam</label>
                  <input
                    type="text"
                    value={envVars.SPECWRIGHT_MODEL ?? ""}
                    onChange={(e) => setEnvVar("SPECWRIGHT_MODEL", e.target.value)}
                    onBlur={saveEnv}
                    placeholder="e.g. claude-sonnet-4-6 or gpt-4o"
                    className="operator-field w-full px-2 py-2"
                  />
                </div>}

                {/* OpenCode — compact card */}
                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) === "opencode" && (
                  <div className="operator-inline-row">
                    <span className={`operator-status-dot ${
                      ocStatus === "connected" ? "bg-[var(--sw-success)]" :
                      ocStatus === "error" ? "bg-[var(--sw-danger)]" :
                      "bg-stone-600"
                    }`} />
                    <span className="operator-text-subtle flex-1">
                      {ocStatus === "error"
                        ? "OpenCode is niet bereikbaar. Controleer de verbinding."
                        : `${normalizeOpenCodeModel(ocModel || (envVars.SPECWRIGHT_MODEL as string))} gekozen`}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await startAndDetectOpenCode();
                      }}
                      className="operator-button-quiet px-2 py-1 shrink-0"
                      title="Verbinding controleren"
                    >
                      {ocStarting ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-[var(--sw-accent)] border-t-transparent" />
                      ) : (
                        "Controleer"
                      )}
                    </button>
                    <button
                      onClick={() => setShowOcModal(true)}
                      className="operator-button-quiet px-2 py-1 shrink-0"
                      title="Model kiezen"
                    >
                      Model
                    </button>
                  </div>
                )}

              </div>
              </div>

              <div className="operator-config-section">
                <SidebarHeading
                  title="Geavanceerd"
                  description="Alleen nodig als je afwijkende testinstellingen gebruikt."
                />

                <div className="operator-stack-md">
                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && (
                <div className="operator-advanced-group">
                  <p className="operator-control-label">AI-verbinding</p>
                  <div>
                    <label className="operator-field-help">AI-serverlink</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={envVars.SPECWRIGHT_LLM_BASE_URL ?? ""}
                        onChange={(e) => setEnvVar("SPECWRIGHT_LLM_BASE_URL", e.target.value)}
                        onBlur={saveEnv}
                        placeholder="Optional, e.g. http://localhost:11434/v1"
                        className="operator-field flex-1 px-2 py-2"
                      />
                      <button
                        onClick={async () => {
                          const base = (envVars.SPECWRIGHT_LLM_BASE_URL as string) ?? "";
                          if (!base) {
                            setVerifyStatus("error");
                            setVerifyMessage("Vul eerst de serverlink in.");
                            return;
                          }
                          setVerifyStatus("verifying");
                          setVerifyMessage(null);
                          const result = await window.specwright.network.verifyEndpoint(base);
                          setVerifyStatus(result.ok ? "ok" : "error");
                          setVerifyMessage(result.message);
                        }}
                        className="operator-button"
                      >
                        {verifyStatus === "verifying" ? "Controleren..." : "Controleer"}
                      </button>
                    </div>
                    {verifyStatus === "ok" && <p className="operator-text-success mt-1">{verifyMessage}</p>}
                    {verifyStatus === "error" && <p className="operator-danger mt-1">{verifyMessage}</p>}
                  </div>
                  <div>
                    <label className="operator-field-help">API-sleutel</label>
                    <input
                      type="password"
                      value={envVars.SPECWRIGHT_LLM_API_KEY ?? ""}
                      onChange={(e) => setEnvVar("SPECWRIGHT_LLM_API_KEY", e.target.value)}
                      onBlur={saveEnv}
                      placeholder="Optionele API-sleutel"
                      className="operator-field w-full px-2 py-2"
                    />
                  </div>
                  <p className="operator-section-help">Alleen nodig voor eigen of lokale AI-diensten. Ollama gebruikt meestal <span className="font-mono">http://localhost:11434/v1</span>.</p>
                </div>
                )}
                <div className="operator-advanced-group">
                  <p className="operator-control-label">Testuitvoering</p>

                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <span className="operator-setting-copy">
                    <span>Browser tonen</span>
                    <span>{envVars.HEADLESS === "true" ? "Verborgen tijdens tests." : "Zichtbaar tijdens tests."}</span>
                  </span>
                  <button
                    onClick={() => { setEnvVar("HEADLESS", envVars.HEADLESS === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.HEADLESS === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>

                <div>
                  <label className="operator-control-label">Maximale wachttijd per stap</label>
                  <input
                    type="number"
                    value={envVars.TEST_TIMEOUT ?? "120000"}
                    onChange={(e) => setEnvVar("TEST_TIMEOUT", e.target.value)}
                    onBlur={saveEnv}
                    className="operator-field w-full px-2 py-2"
                  />
                  <p className="operator-field-help">Hoe lang Specwright wacht voordat een stap faalt.</p>
                </div>

                <div className="operator-setting-row operator-setting-row-explained">
                  <span className="operator-setting-copy">
                    <span>Schermafbeeldingen</span>
                    <span>Bewaar beeld als een test faalt.</span>
                  </span>
                  <ThemeSelect
                    value={envVars.ENABLE_SCREENSHOTS === "true" ? "failure" : "off"}
                    onChange={(value) => { setEnvVar("ENABLE_SCREENSHOTS", value === "off" ? "false" : "true"); saveEnv(); }}
                    options={[{ value: "failure", label: "Bij fout" }, { value: "off", label: "Uit" }]}
                    className="operator-select-compact"
                  />
                </div>

                <div className="operator-setting-row operator-setting-row-explained">
                  <span className="operator-setting-copy">
                    <span>Video</span>
                    <span>Bewaar opnames van tests.</span>
                  </span>
                  <ThemeSelect
                    value={
                      envVars.ENABLE_VIDEO_RECORDING !== "true" ? "off" :
                        envVars.RETAIN_VIDEO_ON_SUCCESS === "true" ? "always" : "failure"
                    }
                    onChange={(val) => {
                      setEnvVar("ENABLE_VIDEO_RECORDING", val === "off" ? "false" : "true");
                      setEnvVar("RETAIN_VIDEO_ON_SUCCESS", val === "always" ? "true" : "false");
                      saveEnv();
                    }}
                    options={[{ value: "failure", label: "Bij fout" }, { value: "always", label: "Altijd" }, { value: "off", label: "Uit" }]}
                    className="operator-select-compact"
                  />
                </div>

                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <span className="operator-setting-copy">
                    <span>Diepe foutanalyse</span>
                    <span>Bewaar extra details om fouten te onderzoeken.</span>
                  </span>
                  <button
                    onClick={() => { setEnvVar("ENABLE_TRACING", envVars.ENABLE_TRACING === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.ENABLE_TRACING === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>

                </div>

                <div className="operator-advanced-group">
                <p className="operator-control-label">Goedkeuringen</p>
                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <div>
                    <span className="operator-setting-copy">
                      <span>Automatisch doorgaan</span>
                      <span>Gebruik dit alleen als Specwright niet hoeft te pauzeren.</span>
                    </span>
                  </div>
                  <button
                    onClick={() => setSkipPermissions(!skipPermissions)}
                    className="operator-toggle"
                    data-active={skipPermissions}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>
                {skipPermissions && (
                  <p className="operator-field-help">
                    Specwright gaat door zonder tussentijdse bevestiging.
                  </p>
                )}
                </div>

                <div className="operator-advanced-group">
                <p className="operator-control-label">Extra projectwaarden</p>
                <p className="operator-section-help">Alleen nodig voor projectspecifieke instellingen buiten de standaardvelden.</p>
              {customVars.length > 0 && (
                <div className="space-y-3">
                  {customVars.map(([key, val]) => {
                    const sensitive = isSensitiveEnvironmentKey(key);
                    const isVisible = visibleSecrets.has(key);
                    return (
                      <div key={key} className="operator-stack-sm">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="operator-muted text-[11px] font-mono break-all leading-snug" title={key}>{key}</span>
                          <button
                            onClick={() => { removeEnvVar(key); saveEnv(); }}
                            className="flex h-7 w-7 shrink-0 items-center justify-center operator-muted hover:text-[var(--sw-danger)] transition-colors"
                            title={`Remove ${key}`}
                            aria-label={`Remove ${key}`}
                          >
                            <Trash className="operator-icon" weight="bold" />
                          </button>
                        </div>
                        <div className="relative min-w-0">
                            <input
                              type={sensitive && !isVisible ? "password" : "text"}
                              value={val ?? ""}
                              onChange={(e) => setEnvVar(key, e.target.value)}
                              onBlur={saveEnv}
                              className={`operator-field h-9 w-full px-2 py-2 font-mono ${sensitive ? "pr-12" : "pr-2"}`}
                            />
                            {sensitive && (
                              <button
                                type="button"
                                onClick={() => toggleSecretVisibility(key)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs transition-colors"
                                title={isVisible ? "Hide value" : "Show value"}
                              >
                                {isVisible ? "Hide" : "Show"}
                              </button>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="operator-stack-sm">
                <div className="operator-stack-sm">
                  <input
                    type="text"
                    value={customVarKey}
                    onChange={(e) => setCustomVarKey(e.target.value.toUpperCase())}
                    placeholder="VAR_NAME"
                    className="operator-field w-full px-2 py-2 font-mono"
                  />
                  <input
                    type="text"
                    value={customVarVal}
                    onChange={(e) => setCustomVarVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomVar(); }}
                    placeholder="value"
                    className="operator-field w-full px-2 py-2"
                  />
                </div>
                <button
                  onClick={handleAddCustomVar}
                  className="operator-button self-start"
                >
                  + Add var
                </button>
              </div>
              </div>

              </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
