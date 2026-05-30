import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GearSix, Trash } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { AuthSettingsModal, EMPTY_AUTH, isOAuthConfigured, isEmailPasswordConfigured } from "./AuthSettingsModal";
import type { AuthFields } from "./AuthSettingsModal";
import { PluginPickerModal } from "./PluginPickerModal";
import { OpenCodeConfigModal } from "./OpenCodeConfigModal";
import { ReadinessChecklist } from "../common/Discoverability";
import { presenceTransition, presenceVariants } from "@renderer/motion/presets";

const ENVS = ["qat", "dev", "staging", "prod", "local"];
const OPENCODE_DEFAULT_URL = "http://127.0.0.1:18789";
const OPENCODE_DEFAULT_MODEL = "gpt-5.5-fast";
const OPENCODE_DEFAULT_VARIANT = "low";

function normalizeOpenCodeModel(model?: string | null): string {
  return !model || model === "big-pickle" ? OPENCODE_DEFAULT_MODEL : model;
}

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
  const projectOptions = recentProjects.filter((project) => project !== projectPath).slice(0, 5);

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
  const appUrlConfigured = Boolean((envVars.BASE_URL as string | undefined)?.trim());
  const loginConfigured = !authRequired || isConfigured;
  const aiConfigured = Boolean((envVars.SPECWRIGHT_MODEL as string | undefined)?.trim()) || (envVars.SPECWRIGHT_LLM_PROVIDER as string) === "opencode";
  const focusAppUrl = (): void => appUrlInputRef.current?.focus();
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
      label: "Project folder",
      description: isReady ? `Tests will be created in ${basename(projectPath || "")}.` : "Open the repository where Specwright should create tests.",
      complete: isReady,
      actionLabel: "Open",
      onAction: isReady ? undefined : pickAndBootstrap,
    },
    {
      label: "Website URL",
      description: appUrlConfigured ? "Browser exploration has a starting address." : "Tell Specwright where the app runs, for example http://localhost:5173.",
      complete: appUrlConfigured,
      actionLabel: "Add URL",
      onAction: isReady ? focusAppUrl : undefined,
    },
    {
      label: "Login choice",
      description: loginConfigured ? "Specwright knows whether to sign in before testing." : "Add credentials, choose a login script, or turn login off.",
      complete: loginConfigured,
      actionLabel: authRequired ? "Configure" : "Choose",
      onAction: isReady ? openLoginSettings : undefined,
    },
    {
      label: "AI model",
      description: aiConfigured ? "Specwright has a model for writing tests." : "Choose the model that writes the feature and step files.",
      complete: aiConfigured,
      actionLabel: "Choose model",
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
          <p>Workspace</p>
          <span>Project setup and run configuration</span>
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
                className="operator-button-primary w-full"
              >
                Install update v{updateVersion}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project */}
        <section className="operator-sidebar-section operator-sidebar-section-first">
          <SidebarHeading
            title="Project"
            description={isReady ? undefined : "Open the repository where Specwright should create tests."}
          />

          {isReady ? (
            <div className="operator-project-summary">
              <div className="operator-project-row">
                <div className="min-w-0 flex-1 operator-stack-sm">
                  <p className="operator-control-label">Current project</p>
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
                      <span className="operator-project-name">{basename(projectPath)}</span>
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
                            <span>{basename(project)}</span>
                            <small>{project}</small>
                          </button>
                        )) : (
                          <p className="operator-project-empty">No recent projects yet.</p>
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
                          Open another project
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="operator-project-actions" aria-hidden={projectDropdownOpen}>
                  {confirmReset ? (
                    <>
                        <span className="operator-field-help">Close project?</span>
                      <button
                        onClick={() => { resetProject(); setConfirmReset(false); }}
                        className="operator-button operator-button-compact operator-danger hover:border-[var(--sw-danger)]"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="operator-button operator-button-compact"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => loadExistingProject(projectPath)}
                        className="operator-icon-button"
                        title="Reload project settings"
                      >
                        <SyncButtonIcon />
                      </button>
                      <button
                        onClick={() => setConfirmReset(true)}
                        title="Close project"
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
                        title="Switch workspace"
                      >
                        Switch
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="operator-text-subtle">Open or bootstrap a project to manage this workspace.</p>
          )}
        </section>

        <section className="operator-sidebar-section">
          <div className="flex items-center justify-between gap-3">
            <SidebarHeading
              title="Testing adapter"
              description="Playwright BDD scaffold, shared steps, and field helpers."
            />
            {isReady && (
              <button
                onClick={() => setShowPluginModal(true)}
                disabled={applyingPlugin}
                className="operator-button-quiet px-2 py-1 disabled:opacity-40"
              >
                Change
              </button>
            )}
          </div>

          {isReady ? (
            <div className="min-w-0">
              {applyingPlugin ? (
                <p className="operator-text-subtle flex items-center gap-1 mt-1">
                  <span className="w-2.5 h-2.5 border border-brand-400 border-t-transparent animate-spin inline-block" />
                  Installing...
                </p>
              ) : pluginInfo && pluginInfo.name !== "none" ? (
                <div className="mt-1 min-w-0">
                  <p
                    className="operator-text truncate"
                    title={`${pluginInfo.name}${pluginInfo.version && pluginInfo.version !== "unknown" ? ` v${pluginInfo.version}` : ""}`}
                  >
                    {shortName(pluginInfo.name)}
                    {pluginInfo.version && pluginInfo.version !== "unknown" && (
                      <span className="operator-text-subtle ml-1">v{pluginInfo.version}</span>
                    )}
                  </p>
                  {pluginInfo.hasOverlay && pluginInfo.overlayName && (
                    <p
                      className="operator-text-accent font-mono truncate flex items-center gap-1 mt-1"
                      title={pluginInfo.overlayName}
                    >
                      <span className="text-stone-500">↳</span>
                      {shortName(pluginInfo.overlayName)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="operator-text-subtle mt-1">Using the default Specwright adapter</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {pendingPlugin ? (
                  <p
                    className="operator-text-accent font-mono truncate mt-1"
                    title={pendingPlugin.type === "local" ? pendingPlugin.dirPath : pendingPlugin.packageName}
                  >
                    {pendingPlugin.type === "local"
                      ? pendingPlugin.dirPath.split("/").pop()
                      : shortName(pendingPlugin.packageName)}
                  </p>
                ) : (
                  <p className="operator-text-subtle mt-1">Choose a plugin before bootstrap</p>
                )}
              </div>
              <button
                onClick={() => setShowPluginModal(true)}
                className="text-stone-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0"
              >
                Change plugin
              </button>
            </div>
          )}
        </section>

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
                title="Needs attention"
                description="Fix these items before generating tests."
                steps={setupSteps}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings — only shown when project is ready */}
        {isReady && (
          <>
            <section className="operator-form">
              <div className="operator-config-section">
                <div className="flex items-center justify-between gap-3">
                  <SidebarHeading
                    title="Website to test"
                    description={appUrlConfigured ? undefined : "The running app Specwright opens in a browser."}
                  />
                  <span className={appUrlConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>{appUrlConfigured ? "Set" : "Needed"}</span>
                </div>

              <div>
                <label className="operator-control-label">App URL</label>
                <input
                  ref={appUrlInputRef}
                  type="text"
                  value={envVars.BASE_URL ?? ""}
                  onChange={(e) => setEnvVar("BASE_URL", e.target.value)}
                  onBlur={saveEnv}
                  placeholder="https://app.example.com"
                  className="operator-field w-full px-2 py-2"
                />
                <p className="operator-field-help">Specwright opens this app during exploration. Relative page paths such as <span className="font-mono">/dashboard</span> start from here.</p>
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
                <div className="flex items-center justify-between gap-3">
                  <SidebarHeading
                    title="Sign in before exploring"
                    description={loginConfigured ? undefined : "Choose whether browser exploration must sign in."}
                  />
                  <span className={loginConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>{loginConfigured ? authRequired ? "Configured" : "Not needed" : "Needed"}</span>
              </div>
              <div className="operator-stack-sm">
                <div className="operator-setting-row operator-setting-row-explained">
                  <div className="operator-setting-copy">
                    <span>Use a login flow</span>
                    <span>{authRequired ? "Specwright signs in before it explores the app." : "Specwright explores without signing in."}</span>
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
                      <label className="operator-control-label">How to sign in</label>
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
                      <p className="operator-field-help">
                        Uses <span className="font-mono">auth-strategies/{authStrategy}.js</span> in this project.
                      </p>
                    ) : isConfigured ? (
                      <p className="operator-field-help">
                        Login details are saved for <span className="operator-text-muted">{authFields.userEmail}</span>.
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="operator-link text-xs text-left"
                      >
                         Add login details
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
                    title="Test writer"
                    description={aiConfigured ? undefined : "Choose the model that writes feature files and Playwright steps."}
                  />
                  <span className={aiConfigured ? "operator-readiness-ok" : "operator-readiness-warn"}>{aiConfigured ? "Selected" : "Needed"}</span>
                </div>
              <div className="space-y-2">
                <div>
                  <label className="operator-control-label">Model source</label>
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
                      { value: "opencode", label: "OpenCode local (default)" },
                      { value: "anthropic", label: "Anthropic Claude" },
                      { value: "openai", label: "OpenAI compatible" },
                      { value: "ollama", label: "Ollama local" },
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
                  <div className="operator-inline-row">
                    <span className={`operator-status-dot ${
                      ocStatus === "connected" ? "bg-[var(--sw-success)]" :
                      ocStatus === "error" ? "bg-[var(--sw-danger)]" :
                      "bg-stone-600"
                    }`} />
                    <span className="operator-text-subtle flex-1">
                      {ocStatus === "error"
                        ? "Local model is not reachable. Check OpenCode."
                        : `${normalizeOpenCodeModel(ocModel || (envVars.SPECWRIGHT_MODEL as string))} selected`}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await startAndDetectOpenCode();
                      }}
                      className="operator-button-quiet px-2 py-1 shrink-0"
                      title="Check local model"
                    >
                      {ocStarting ? (
                        <span className="w-3 h-3 border border-[var(--sw-accent)] border-t-transparent animate-spin inline-block" />
                      ) : (
                        "Check"
                      )}
                    </button>
                    <button
                      onClick={() => setShowOcModal(true)}
                      className="operator-button-quiet px-2 py-1 shrink-0"
                      title="Choose model"
                    >
                      Model
                    </button>
                  </div>
                )}

              </div>
              </div>

              <div className="operator-config-section">
                <SidebarHeading
                  title="Settings"
                  description="Run behavior, issue sources, safety, and extra environment values."
                />

                <div className="operator-stack-md">
                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && (
                <div className="operator-advanced-group">
                  <p className="operator-control-label">AI connection details</p>
                  <div>
                    <label className="operator-field-help">Provider URL</label>
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
                    {verifyStatus === "ok" && <p className="operator-text-success mt-1">{verifyMessage}</p>}
                    {verifyStatus === "error" && <p className="operator-danger mt-1">{verifyMessage}</p>}
                  </div>
                  <div>
                    <label className="operator-field-help">API key</label>
                    <input
                      type="password"
                      value={envVars.SPECWRIGHT_LLM_API_KEY ?? ""}
                      onChange={(e) => setEnvVar("SPECWRIGHT_LLM_API_KEY", e.target.value)}
                      onBlur={saveEnv}
                      placeholder="Optional provider key"
                      className="operator-field w-full px-2 py-2"
                    />
                  </div>
                  <p className="operator-section-help">Only needed for local or compatible providers. Ollama usually uses <span className="font-mono">http://localhost:11434/v1</span>.</p>
                </div>
                )}
                <div className="operator-advanced-group">
                  <p className="operator-control-label">Run defaults</p>

                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <span className="operator-setting-copy">
                    <span>Browser visibility</span>
                    <span>{envVars.HEADLESS === "true" ? "Hidden during runs." : "Visible for debugging."}</span>
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
                  <label className="operator-control-label">Max wait per step</label>
                  <input
                    type="number"
                    value={envVars.TEST_TIMEOUT ?? "120000"}
                    onChange={(e) => setEnvVar("TEST_TIMEOUT", e.target.value)}
                    onBlur={saveEnv}
                    className="operator-field w-full px-2 py-2"
                  />
                  <p className="operator-field-help">How long Playwright waits before a step is marked failed.</p>
                </div>

                <div className="operator-setting-row operator-setting-row-explained">
                  <span className="operator-setting-copy">
                    <span>Screenshots</span>
                    <span>Capture visual evidence when a run fails.</span>
                  </span>
                  <ThemeSelect
                    value={envVars.ENABLE_SCREENSHOTS === "true" ? "failure" : "off"}
                    onChange={(value) => { setEnvVar("ENABLE_SCREENSHOTS", value === "off" ? "false" : "true"); saveEnv(); }}
                    options={[{ value: "failure", label: "On Failure" }, { value: "off", label: "Off" }]}
                    className="operator-select-compact"
                  />
                </div>

                <div className="operator-setting-row operator-setting-row-explained">
                  <span className="operator-setting-copy">
                    <span>Video</span>
                    <span>Keep recordings for failed runs or every run.</span>
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
                    options={[{ value: "failure", label: "On Failure" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }]}
                    className="operator-select-compact"
                  />
                </div>

                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <span className="operator-setting-copy">
                    <span>Trace data</span>
                    <span>Record Playwright traces for deeper debugging.</span>
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
                <p className="operator-control-label">Issue sources</p>
                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <span className="operator-setting-copy">
                    <span>Show Jira source</span>
                    <span>Show Jira next to GitLab and uploaded files in Explorer.</span>
                  </span>
                  <button
                    onClick={() => { setEnvVar("SPECWRIGHT_SHOW_JIRA_SOURCE", envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true" ? "false" : "true"); saveEnv(); }}
                    className="operator-toggle"
                    data-active={envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true"}
                  >
                    <span className="operator-toggle-knob" />
                  </button>
                </label>
                </div>

                <div className="operator-advanced-group">
                <p className="operator-control-label">Agent safety</p>
                <label className="operator-setting-row operator-setting-row-explained cursor-pointer">
                  <div>
                    <span className="operator-setting-copy">
                      <span>Auto-approve tools</span>
                      <span>Let the agent run tools without stopping for confirmation.</span>
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
                    Tool calls can run without confirmation in this workspace.
                  </p>
                )}
                </div>

                <div className="operator-advanced-group">
                <p className="operator-control-label">Extra environment variables</p>
                <p className="operator-section-help">Custom values written to the project env file. Main Specwright settings are managed in the sections above.</p>
              {customVars.length > 0 && (
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
