import React, { useEffect, useState } from "react";
import { GearSix, Pause, Play, Trash } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { AuthSettingsModal, EMPTY_AUTH, isOAuthConfigured, isEmailPasswordConfigured } from "./AuthSettingsModal";
import type { AuthFields } from "./AuthSettingsModal";
import { PluginPickerModal } from "./PluginPickerModal";
import { OpenCodeConfigModal } from "./OpenCodeConfigModal";

const ENVS = ["qat", "dev", "staging", "prod", "local"];
const OPENCODE_DEFAULT_URL = "http://127.0.0.1:18789";
const OPENCODE_DEFAULT_MODEL = "gpt-5.5";
const OPENCODE_DEFAULT_VARIANT = "low";

// Strip @scope/ prefix for display — full name kept in title tooltip
function shortName(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}

const SyncButtonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

function ThemeSelect({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={`operator-dropdown ${className}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        type="button"
        className="operator-dropdown-trigger"
        data-open={open}
        onClick={() => setOpen((next) => !next)}
      >
        {selected?.label ?? value}
      </button>
      {open && (
        <div className="operator-dropdown-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="operator-dropdown-option"
              data-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConfigPanel(): React.JSX.Element {
  const {
    projectPath, projectState, envVars, loaded,
    pickAndBootstrap, loadExistingProject, setEnvVar, removeEnvVar, saveEnv,
    skipPermissions, setSkipPermissions, pendingPlugin, setPendingPlugin, resetProject,
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
  const [ocStatus, setOcStatus] = useState<"idle" | "checking" | "connected" | "error">("idle");
  const [ocModel, setOcModel] = useState<string | null>(null);
  const [ocServerRunning, setOcServerRunning] = useState(false);
  const [ocStarting, setOcStarting] = useState(false);
  const [authStrategies, setAuthStrategies] = useState<string[]>(["oauth", "email-password"]);
  const [advancedOpen, setAdvancedOpen] = useState(true);


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
    ? "Starting..."
    : ocStatus === "connected"
      ? "Connected"
      : ocStatus === "checking"
        ? "Checking..."
        : ocStatus === "error"
          ? "Not reachable"
          : ocServerRunning ? "Running" : "Stopped";
  const preferredAuthStrategy = (strategies: string[]): string =>
    strategies.find((strategy) => strategy.toLowerCase() === "backoffice")
    ?? strategies.find((strategy) => strategy !== "none")
    ?? "oauth";

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
      if (detected) {
        setOcModel(detected.modelId);
        setEnvVar("SPECWRIGHT_MODEL", detected.modelId);
        saveEnv();
      }
      setOcStatus("connected");
    } finally {
      setOcStarting(false);
    }
  };

  useEffect(() => {
    if (!projectPath || !loaded) return;
    window.specwright.project.detectPlugin(projectPath).then(setPluginInfo).catch(() => null);
    window.specwright.project.listAuthStrategies(projectPath).then((strategies) => {
      setAuthStrategies(strategies);
      if (!envVars.AUTH_STRATEGY) {
        setEnvVar("AUTH_STRATEGY", preferredAuthStrategy(strategies));
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
      const strategy = preferredAuthStrategy(authStrategies);
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

  const isSensitiveKey = (key: string): boolean =>
    /password|secret|token|api.?key|access.?code/i.test(key);

  const toggleSecretVisibility = (key: string): void => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const basename = (p: string): string => p.replace(/\\/g, "/").split("/").pop() ?? p;

  const handleAddCustomVar = (): void => {
    const key = customVarKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (!key) return;
    setEnvVar(key, customVarVal);
    setCustomVarKey("");
    setCustomVarVal("");
  };

  const managedKeys = new Set([
    "BASE_URL", "TEST_ENV", "AUTH_STRATEGY",
    "TEST_USERNAME", "TEST_PASSWORD", "TEST_USER_EMAIL", "TEST_USER_PASSWORD",
    "TEST_USER_NAME", "TEST_USER_PICTURE",
    "OAUTH_STORAGE_KEY", "OAUTH_SIGNIN_PATH", "OAUTH_BUTTON_TEST_ID", "OAUTH_POST_LOGIN_URL",
    "HEADLESS", "TEST_TIMEOUT", "ENABLE_SCREENSHOTS", "ENABLE_VIDEO_RECORDING", "ENABLE_TRACING",
    "BASE_ENV", "NODE_ENV", "BROWSER", "CHROME_ARGS",
    "CUCUMBER_REPORT_PATH", "CODEGEN_OUTPUT_PATH",
    "RETAIN_VIDEO_ON_SUCCESS", "VITE_BUILD_ENVIRONMENT",
    // LLM provider settings
    "SPECWRIGHT_LLM_PROVIDER", "SPECWRIGHT_LLM_BASE_URL", "SPECWRIGHT_MODEL", "SPECWRIGHT_LLM_API_KEY",
    "SPECWRIGHT_OPENCODE_URL", "SPECWRIGHT_OPENCODE_VARIANT",
  ]);

  const customVars = Object.entries(envVars).filter(([k]) => !managedKeys.has(k));
  const isReady = projectState === "ready";

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
          initialModel={(envVars.SPECWRIGHT_MODEL as string) || ""}
          initialVariant={(envVars.SPECWRIGHT_OPENCODE_VARIANT as string) || OPENCODE_DEFAULT_VARIANT}
          onSave={(url, model, variant) => {
            setEnvVar("SPECWRIGHT_OPENCODE_URL", url);
            setEnvVar("SPECWRIGHT_MODEL", model);
            setEnvVar("SPECWRIGHT_OPENCODE_VARIANT", variant);
            saveEnv();
            setOcStatus("connected");
            setOcModel(model);
            setShowOcModal(false);
          }}
          onClose={() => setShowOcModal(false)}
        />
      )}

      <div className="flex flex-col h-full overflow-y-auto scrollable bg-operator-panel" style={{ padding: "0 var(--sw-panel-pad) var(--sw-panel-pad)", gap: "var(--sw-space-3)" }}>

        <div className="operator-panel-brand">
          <div className="flex items-baseline justify-between">
            <h1 className="text-stone-100 font-semibold text-base tracking-[0.08em] uppercase">Specwright</h1>
            <div className="flex items-center gap-2">
              {appVersion && (
                <span className="operator-muted text-xs font-mono">v{appVersion}</span>
              )}
              {updateVersion && (
                <button
                  onClick={() => window.specwright.app.installUpdate()}
                  title={`v${updateVersion} available — click to download`}
                  className="flex items-center gap-1 text-[var(--sw-accent)] hover:text-[var(--sw-accent-strong)] text-xs transition-colors"
                >
                  <svg width="7" height="7" viewBox="0 0 7 7" fill="currentColor" className="shrink-0">
                    <circle cx="3.5" cy="3.5" r="3.5" />
                  </svg>
                  Update
                </button>
              )}
            </div>
          </div>
          <p className="operator-label mt-1">E2E Automation Workbench</p>
        </div>

        {/* Workspace */}
        <section className="space-y-2">
          <p className="operator-label">Workspace</p>

          {isReady ? (
            <div className="bg-operator-field border border-operator-line operator-stack-sm" style={{ padding: "var(--sw-space-3)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-stone-300 text-xs truncate font-mono" title={projectPath}>
                    {basename(projectPath)}
                  </p>
                  <p className="text-stone-600 text-xs truncate" title={projectPath}>
                    {projectPath}
                  </p>
                  <p className="text-[var(--sw-success)] text-xs font-medium flex items-center gap-1 mt-2">
                    <span className="w-2 h-2 bg-[var(--sw-success)]" />
                    Active
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {confirmReset ? (
                    <>
                        <span className="text-stone-500 text-xs">Close workspace?</span>
                      <button
                        onClick={() => { resetProject(); setConfirmReset(false); }}
                        className="operator-danger hover:text-[var(--sw-danger)] text-xs border border-[var(--sw-danger)] px-2 py-1 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="text-stone-500 hover:text-stone-300 text-xs transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => loadExistingProject(projectPath)}
                        className="operator-muted hover:text-[var(--sw-accent)] transition-colors"
                        title="Reload project settings"
                      >
                        <SyncButtonIcon />
                      </button>
                      <button
                        onClick={() => setConfirmReset(true)}
                        title="Close project"
                        className="text-stone-500 hover:text-[var(--sw-danger)] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </button>
                      <button
                        onClick={pickAndBootstrap}
                        className="text-stone-500 hover:text-brand-400 text-xs transition-colors"
                        title="Change project"
                      >
                        Switch
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-operator-line">
                <div className="min-w-0">
                  <p className="operator-label">Test plugin</p>
                  {applyingPlugin ? (
                    <p className="operator-muted text-xs flex items-center gap-1 mt-1">
                      <span className="w-2.5 h-2.5 border border-brand-400 border-t-transparent animate-spin inline-block" />
                      Installing…
                    </p>
                  ) : pluginInfo && pluginInfo.name !== "none" ? (
                    <div className="mt-1 min-w-0">
                      <p
                        className="text-stone-300 text-xs font-mono truncate"
                        title={`${pluginInfo.name}${pluginInfo.version && pluginInfo.version !== "unknown" ? ` v${pluginInfo.version}` : ""}`}
                      >
                        {shortName(pluginInfo.name)}
                        {pluginInfo.version && pluginInfo.version !== "unknown" && (
                           <span className="text-stone-500 ml-1">v{pluginInfo.version}</span>
                        )}
                      </p>
                      {pluginInfo.hasOverlay && pluginInfo.overlayName && (
                        <p
                          className="text-[var(--sw-accent)] text-xs font-mono truncate flex items-center gap-1 mt-1"
                          title={pluginInfo.overlayName}
                        >
                          <span className="text-stone-500">↳</span>
                          {shortName(pluginInfo.overlayName)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="operator-muted text-xs mt-1">No plugin detected</p>
                  )}
                </div>
                <button
                  onClick={() => setShowPluginModal(true)}
                  disabled={applyingPlugin}
                  className="text-stone-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0 ml-2 disabled:opacity-40"
                >
                  Change plugin
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-operator-field border border-operator-line" style={{ padding: "var(--sw-space-3)" }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="operator-label">Test plugin</p>
                  {pendingPlugin ? (
                    <p
                      className="text-[var(--sw-accent)] text-xs font-mono truncate mt-1"
                      title={pendingPlugin.type === "local" ? pendingPlugin.dirPath : pendingPlugin.packageName}
                    >
                      {pendingPlugin.type === "local"
                        ? pendingPlugin.dirPath.split("/").pop()
                        : shortName(pendingPlugin.packageName)}
                    </p>
                  ) : (
                    <p className="operator-muted text-xs mt-1">Choose a plugin before bootstrap</p>
                  )}
                </div>
                <button
                  onClick={() => setShowPluginModal(true)}
                  className="text-stone-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0 ml-2"
                >
                  Change plugin
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Settings — only shown when project is ready */}
        {isReady && (
          <>
            <section className="operator-form">
              <div className="operator-config-section">
                <p className="operator-section-title">App under test</p>

              <div>
                <label className="operator-control-label">App URL</label>
                <input
                  type="text"
                  value={envVars.BASE_URL ?? ""}
                  onChange={(e) => setEnvVar("BASE_URL", e.target.value)}
                  onBlur={saveEnv}
                  placeholder="https://app.example.com"
                  className="operator-field w-full px-2 py-2"
                />
              </div>

              {envVars.TEST_ENV && (
                <div>
                  <label className="operator-control-label">Environment label</label>
                  <ThemeSelect
                    value={envVars.TEST_ENV ?? "qat"}
                    onChange={(value) => { setEnvVar("TEST_ENV", value); saveEnv(); }}
                    options={ENVS.map((env) => ({ value: env, label: env }))}
                  />
                </div>
              )}
              </div>

              {/* Auth */}
              <div className="operator-config-section">
                <p className="operator-section-title">Login</p>
              <div className="operator-stack-sm">
                <div className="operator-setting-row">
                  <label className="operator-checkbox-row">
                    <input
                      type="checkbox"
                      checked={authRequired}
                      onChange={(e) => handleAuthToggle(e.target.checked)}
                      className="operator-checkbox"
                    />
                    <span className="text-operator-ink text-[13px]">App requires login</span>
                  </label>
                </div>

                {authRequired && (
                  <div className="operator-inline-card operator-stack-sm">
                    <div>
                      <label className="operator-control-label">Login method</label>
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
                            title="Configure auth settings"
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
                      <p className="operator-muted text-xs">
                        Custom login script: auth-strategies/{authStrategy}.js
                      </p>
                    ) : isConfigured ? (
                      <p className="operator-muted text-xs">
                        Using <span className="text-stone-300">{authFields.userEmail}</span>
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-[var(--sw-warning)] text-xs hover:text-[var(--sw-accent-strong)] transition-colors text-left"
                      >
                         Login details missing. Open settings.
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>

              {/* LLM Provider settings */}
              <div className="operator-config-section">
                <p className="operator-section-title">AI model</p>
              <div className="space-y-2">
                <label className="operator-control-label">Engine</label>
                <div className="flex items-center gap-2">
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
                      { value: "anthropic", label: "Anthropic Claude" },
                      { value: "openai", label: "OpenAI compatible" },
                      { value: "ollama", label: "Ollama local" },
                      { value: "opencode", label: "OpenCode" },
                    ]}
                  />
                </div>

                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && <div>
                  <label className="operator-control-label">Model</label>
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
                  <div className="operator-inline-card flex items-center gap-2">
                    <span className={`operator-status-dot ${
                      ocStatus === "connected" ? "bg-[var(--sw-success)]" :
                      ocStatus === "error" ? "bg-[var(--sw-danger)]" :
                      "bg-stone-600"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-stone-200 text-[13px] font-medium">OpenCode</p>
                      <p className="operator-muted text-xs font-mono truncate">
                        {ocModel || (envVars.SPECWRIGHT_MODEL as string) || OPENCODE_DEFAULT_MODEL}
                      </p>
                      <p className="operator-muted text-xs">{ocStatusLabel}</p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (ocServerRunning) {
                          await window.specwright.opencode.stopServer();
                          setOcServerRunning(false);
                          setOcStatus("idle");
                        } else {
                          await startAndDetectOpenCode();
                        }
                      }}
                      className="operator-muted hover:text-[var(--sw-accent)] text-xs shrink-0 transition-colors"
                      title={ocServerRunning ? "Stop server" : "Start server"}
                    >
                      {ocStarting ? (
                        <span className="w-3 h-3 border border-[var(--sw-accent)] border-t-transparent animate-spin inline-block" />
                      ) : ocServerRunning ? (
                        <Pause className="operator-icon" weight="fill" />
                      ) : (
                        <Play className="operator-icon" weight="fill" />
                      )}
                    </button>
                    <button
                      onClick={() => setShowOcModal(true)}
                      className="operator-muted hover:text-[var(--sw-accent)] text-xs shrink-0 transition-colors"
                      title="Configure model"
                    >
                      <GearSix className="operator-icon" weight="bold" />
                    </button>
                  </div>
                )}

                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && (
                <>
                <div>
                  <label className="operator-control-label">Provider URL</label>
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
                          setVerifyMessage("Base URL empty");
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
                      {verifyStatus === "verifying" ? "Checking..." : "Check"}
                    </button>
                  </div>
                  {verifyStatus === "ok" && (
                    <p className="text-[var(--sw-success)] text-xs mt-1">{verifyMessage}</p>
                  )}
                  {verifyStatus === "error" && (
                    <p className="operator-danger text-xs mt-1">{verifyMessage}</p>
                  )}
                </div>

                <div>
                  <label className="operator-control-label">API key</label>
                  <input
                    type="password"
                    value={envVars.SPECWRIGHT_LLM_API_KEY ?? ""}
                    onChange={(e) => setEnvVar("SPECWRIGHT_LLM_API_KEY", e.target.value)}
                    onBlur={saveEnv}
                    placeholder="Optional provider key"
                    className="operator-field w-full px-2 py-2"
                  />
                </div>
                <p className="operator-muted text-xs mt-1">Ollama usually uses <span className="font-mono">http://localhost:11434/v1</span>. For OpenCode, use the card settings.</p>
                </>
                )}
              </div>
              </div>

              {/* Test Execution Settings */}
              <div className="operator-config-section">
                <p className="operator-section-title">Browser run</p>
                <div className="space-y-2">

                <label className="operator-setting-row cursor-pointer">
                  <span className="text-operator-ink text-[13px]">Hide browser window</span>
                  <button
                    onClick={() => { setEnvVar("HEADLESS", envVars.HEADLESS === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.HEADLESS === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>

                <div>
                  <label className="operator-control-label">Step timeout</label>
                  <input
                    type="number"
                    value={envVars.TEST_TIMEOUT ?? "120000"}
                    onChange={(e) => setEnvVar("TEST_TIMEOUT", e.target.value)}
                    onBlur={saveEnv}
                    className="operator-field w-full px-2 py-2"
                  />
                </div>

                <div className="operator-setting-row">
                  <span className="text-operator-ink text-[13px]">Screenshots</span>
                  <ThemeSelect
                    value={envVars.ENABLE_SCREENSHOTS === "true" ? "failure" : "off"}
                    onChange={(value) => { setEnvVar("ENABLE_SCREENSHOTS", value === "off" ? "false" : "true"); saveEnv(); }}
                    options={[{ value: "failure", label: "On Failure" }, { value: "off", label: "Off" }]}
                    className="operator-select-compact"
                  />
                </div>

                <div className="operator-setting-row">
                  <span className="text-operator-ink text-[13px]">Video</span>
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
                    options={[{ value: "failure", label: "On Failure" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }]}
                    className="operator-select-compact"
                  />
                </div>

                <label className="operator-setting-row cursor-pointer">
                  <span className="text-operator-ink text-[13px]">Tracing</span>
                  <button
                    onClick={() => { setEnvVar("ENABLE_TRACING", envVars.ENABLE_TRACING === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.ENABLE_TRACING === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>

                </div>
              </div>

              <div className="operator-config-section">
                <p className="operator-section-title">Integrations</p>
                <label className="operator-setting-row cursor-pointer">
                  <span className="text-operator-ink text-[13px]">Show Jira source</span>
                  <button
                    onClick={() => { setEnvVar("SPECWRIGHT_SHOW_JIRA_SOURCE", envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>
              </div>

              <div className="operator-config-section">
                <p className="operator-section-title">Safety</p>

                <label className="operator-setting-row cursor-pointer">
                  <div>
                    <span className="text-operator-ink text-[13px]">Auto-approve tools</span>
                    <p className="operator-muted text-xs mt-1">Skip permission prompts for agent tools.</p>
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
                  <p className="text-amber-400/80 text-xs pl-1">
                    Tool calls can run without confirmation in this workspace.
                  </p>
                )}

              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="operator-button justify-between"
              >
                <span>Environment variables</span>
                <span className="operator-muted">{advancedOpen ? "Hide" : `${customVars.length} vars`}</span>
              </button>
              {advancedOpen && customVars.length > 0 && (
                <div className="space-y-3">
                  {customVars.map(([key, val]) => {
                    const sensitive = isSensitiveKey(key);
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

              {advancedOpen && <div className="operator-stack-sm">
                <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2">
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
              </div>}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
