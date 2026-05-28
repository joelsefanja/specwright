import React, { useEffect, useState } from "react";
import { useConfigStore } from "@renderer/store/config.store";
import { AuthSettingsModal, EMPTY_AUTH, isOAuthConfigured, isEmailPasswordConfigured } from "./AuthSettingsModal";
import type { AuthFields } from "./AuthSettingsModal";
import { PluginPickerModal } from "./PluginPickerModal";
import { OpenCodeConfigModal } from "./OpenCodeConfigModal";

const ENVS = ["qat", "dev", "staging", "prod", "local"];

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

  useEffect(() => {
    if (!projectPath || !loaded) return;
    window.specwright.project.detectPlugin(projectPath).then(setPluginInfo).catch(() => null);
    window.specwright.project.listAuthStrategies(projectPath).then(setAuthStrategies).catch(() => null);
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
      setEnvVar("AUTH_STRATEGY", "oauth");
      saveEnv();
      if (!isOAuthConfigured(authFields) && !isEmailPasswordConfigured(authFields)) {
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
    /password|secret|token|api.?key/i.test(key);

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
          initialUrl={(envVars.SPECWRIGHT_OPENCODE_URL as string) || "http://127.0.0.1:18789"}
          initialModel={(envVars.SPECWRIGHT_MODEL as string) || ""}
          initialVariant={(envVars.SPECWRIGHT_OPENCODE_VARIANT as string) || "low"}
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

      <div className="flex flex-col h-full px-4 py-3 gap-4 overflow-y-auto scrollable">

        <div>
          <div className="flex items-baseline justify-between">
            <h1 className="text-brand-400 font-semibold text-base tracking-tight">Specwright</h1>
            <div className="flex items-center gap-1.5">
              {appVersion && (
                <span className="text-slate-600 text-xs font-mono">v{appVersion}</span>
              )}
              {updateVersion && (
                <button
                  onClick={() => window.specwright.app.installUpdate()}
                  title={`v${updateVersion} available — click to download`}
                  className="flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs transition-colors"
                >
                  <svg width="7" height="7" viewBox="0 0 7 7" fill="currentColor" className="shrink-0">
                    <circle cx="3.5" cy="3.5" r="3.5" />
                  </svg>
                  Update
                </button>
              )}
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">AI Test Generation</p>
        </div>

        <hr className="border-slate-700" />

        {/* Project section */}
        <section className="space-y-2">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Project</p>

          {isReady ? (
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <p className="text-green-400 text-xs font-medium flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    Ready
                  </p>
                  <button
                    onClick={() => loadExistingProject(projectPath)}
                    className="text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                    title="Sync project — reload .env.testing from disk"
                  >
                    <SyncButtonIcon />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {confirmReset ? (
                    <>
                      <span className="text-slate-500 text-xs">Close?</span>
                      <button
                        onClick={() => { resetProject(); setConfirmReset(false); }}
                        className="text-red-400 hover:text-red-300 text-xs border border-red-800 hover:border-red-600 rounded px-1.5 py-0.5 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmReset(true)}
                        title="Close project"
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </button>
                      <button
                        onClick={pickAndBootstrap}
                        className="text-slate-500 hover:text-brand-400 text-xs transition-colors"
                        title="Change project"
                      >
                        Change
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-slate-300 text-xs truncate font-mono" title={projectPath}>
                {basename(projectPath)}
              </p>
              <p className="text-slate-600 text-xs truncate" title={projectPath}>
                {projectPath}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                <div className="min-w-0">
                  <p className="text-slate-500 text-xs uppercase tracking-wider font-medium">Plugin</p>
                  {applyingPlugin ? (
                    <p className="text-slate-400 text-xs flex items-center gap-1.5 mt-0.5">
                      <span className="w-2.5 h-2.5 border border-brand-400 border-t-transparent rounded-full animate-spin inline-block" />
                      Installing…
                    </p>
                  ) : pluginInfo && pluginInfo.name !== "none" ? (
                    <div className="mt-0.5 min-w-0">
                      <p
                        className="text-slate-300 text-xs font-mono truncate"
                        title={`${pluginInfo.name}${pluginInfo.version && pluginInfo.version !== "unknown" ? ` v${pluginInfo.version}` : ""}`}
                      >
                        {shortName(pluginInfo.name)}
                        {pluginInfo.version && pluginInfo.version !== "unknown" && (
                          <span className="text-slate-500 ml-1">v{pluginInfo.version}</span>
                        )}
                      </p>
                      {pluginInfo.hasOverlay && pluginInfo.overlayName && (
                        <p
                          className="text-brand-400 text-xs font-mono truncate flex items-center gap-1 mt-0.5"
                          title={pluginInfo.overlayName}
                        >
                          <span className="text-slate-500">↳</span>
                          {shortName(pluginInfo.overlayName)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs font-mono mt-0.5">plugin</p>
                  )}
                </div>
                <button
                  onClick={() => setShowPluginModal(true)}
                  disabled={applyingPlugin}
                  className="text-slate-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0 ml-2 disabled:opacity-40"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-slate-500 text-xs uppercase tracking-wider font-medium">Plugin</p>
                  {pendingPlugin ? (
                    <p
                      className="text-brand-400 text-xs font-mono truncate mt-0.5"
                      title={pendingPlugin.type === "local" ? pendingPlugin.dirPath : pendingPlugin.packageName}
                    >
                      {pendingPlugin.type === "local"
                        ? pendingPlugin.dirPath.split("/").pop()
                        : shortName(pendingPlugin.packageName)}
                    </p>
                  ) : (
                    <p className="text-slate-400 text-xs font-mono mt-0.5">plugin</p>
                  )}
                </div>
                <button
                  onClick={() => setShowPluginModal(true)}
                  className="text-slate-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0 ml-2"
                >
                  Change
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Settings — only shown when project is ready */}
        {isReady && (
          <>
            <hr className="border-slate-700" />

            <section className="space-y-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Settings</p>

              <div>
                <label className="block text-slate-300 text-xs mb-1">App URL</label>
                <input
                  type="text"
                  value={envVars.BASE_URL ?? ""}
                  onChange={(e) => setEnvVar("BASE_URL", e.target.value)}
                  onBlur={saveEnv}
                  placeholder="https://app.example.com"
                  className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
                />
              </div>

              {envVars.TEST_ENV && (
                <div>
                  <label className="block text-slate-300 text-xs mb-1">Environment</label>
                  <select
                    value={envVars.TEST_ENV ?? "qat"}
                    onChange={(e) => { setEnvVar("TEST_ENV", e.target.value); saveEnv(); }}
                    className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                  >
                    {ENVS.map((env) => (
                      <option key={env} value={env}>{env}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Auth */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={authRequired}
                      onChange={(e) => handleAuthToggle(e.target.checked)}
                      className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-brand-500"
                    />
                    <span className="text-slate-300 text-xs">Auth Required</span>
                  </label>
                </div>

                {authRequired && (
                  <div className="space-y-2 pl-5">
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">Strategy</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={authStrategy}
                          onChange={(e) => handleAuthStrategyChange(e.target.value)}
                          className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                        >
                          {authStrategies.map((strategy) => (
                            <option key={strategy} value={strategy}>{strategy}</option>
                          ))}
                        </select>

                        {usesBuiltInAuthSettings && (
                          <button
                            onClick={() => setShowAuthModal(true)}
                            title="Configure auth settings"
                            className="relative flex-shrink-0 w-7 h-7 flex items-center justify-center rounded bg-slate-700 border border-slate-600 hover:border-brand-500 text-slate-400 hover:text-brand-400 transition-colors"
                          >
                            ⚙
                            <span
                              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-slate-800 ${isConfigured ? "bg-green-400" : "bg-red-400 animate-pulse"
                                }`}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    {!usesBuiltInAuthSettings ? (
                      <p className="text-slate-500 text-xs">
                        ● Custom strategy from auth-strategies/{authStrategy}.js
                      </p>
                    ) : isConfigured ? (
                      <p className="text-slate-500 text-xs">
                        ● Configured as <span className="text-slate-300">{authFields.userEmail}</span>
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-amber-400 text-xs hover:text-amber-300 transition-colors text-left"
                      >
                        ⚠ Auth not configured — click ⚙ to set up
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* LLM Provider settings */}
              <div className="space-y-2">
                <label className="block text-slate-300 text-xs mb-1">LLM Provider</label>
                <div className="flex items-center gap-2">
                  <select
                    value={(envVars.SPECWRIGHT_LLM_PROVIDER as string) ?? "anthropic"}
                    onChange={async (e) => {
                      const provider = e.target.value;
                      setEnvVar("SPECWRIGHT_LLM_PROVIDER", provider);
                      if (provider === "opencode") {
                        if (!envVars.SPECWRIGHT_OPENCODE_URL) setEnvVar("SPECWRIGHT_OPENCODE_URL", "http://127.0.0.1:18789");
                        if (!envVars.SPECWRIGHT_OPENCODE_VARIANT) setEnvVar("SPECWRIGHT_OPENCODE_VARIANT", "low");
                        setEnvVar("SPECWRIGHT_MODEL", "gpt-5.5");
                        saveEnv();
                        setOcStatus("checking");
                        setOcStarting(true);
                        const url = (envVars.SPECWRIGHT_OPENCODE_URL as string) || "http://127.0.0.1:18789";
                        const sr = await window.specwright.opencode.startServer();
                        setOcServerRunning(sr.ok);
                        if (sr.ok) {
                          await new Promise((r) => setTimeout(r, 1500));
                          const health = await window.specwright.opencode.health(url);
                          if (health.ok) {
                            const detected = await window.specwright.opencode.detectModel(url);
                            if (detected) {
                              setOcModel(detected.modelId);
                              setEnvVar("SPECWRIGHT_MODEL", detected.modelId);
                              saveEnv();
                            }
                            setOcStatus("connected");
                          } else {
                            setOcStatus("idle");
                          }
                        } else {
                          setOcStatus("error");
                        }
                        setOcStarting(false);
                      } else {
                        saveEnv();
                      }
                    }}
                    className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                  >
                    <option value="anthropic">Anthropic (claude)</option>
                    <option value="openai">OpenAI / OpenAI-compatible</option>
                    <option value="ollama">Ollama (local)</option>
                    <option value="opencode">OpenCode</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-1">Model</label>
                  <input
                    type="text"
                    value={envVars.SPECWRIGHT_MODEL ?? ""}
                    onChange={(e) => setEnvVar("SPECWRIGHT_MODEL", e.target.value)}
                    onBlur={saveEnv}
                    placeholder="e.g. claude-sonnet-4-6 or gpt-4o"
                    className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* OpenCode — compact card */}
                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) === "opencode" && (
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      ocStatus === "connected" ? "bg-green-400" :
                      ocStatus === "error" ? "bg-red-400" :
                      "bg-slate-500"
                    }`} />
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setShowOcModal(true)}
                    >
                      <p className="text-slate-200 text-xs font-medium">OpenCode</p>
                      <p className="text-slate-500 text-xxs font-mono truncate">
                        {ocModel || (envVars.SPECWRIGHT_MODEL as string) || "gpt-5.5"}
                      </p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (ocServerRunning) {
                          await window.specwright.opencode.stopServer();
                          setOcServerRunning(false);
                          setOcStatus("idle");
                        } else {
                          setOcStarting(true);
                          const sr = await window.specwright.opencode.startServer();
                          setOcServerRunning(sr.ok);
                          if (sr.ok) {
                            setOcStatus("checking");
                            await new Promise((r) => setTimeout(r, 1500));
                            const url = (envVars.SPECWRIGHT_OPENCODE_URL as string) || "http://127.0.0.1:18789";
                            const health = await window.specwright.opencode.health(url);
                            if (health.ok) {
                              const detected = await window.specwright.opencode.detectModel(url);
                              if (detected) {
                                setOcModel(detected.modelId);
                                setEnvVar("SPECWRIGHT_MODEL", detected.modelId);
                                saveEnv();
                              }
                              setOcStatus("connected");
                            } else {
                              setOcStatus("idle");
                            }
                          }
                          setOcStarting(false);
                        }
                      }}
                      className="text-slate-500 hover:text-brand-400 text-xs shrink-0 transition-colors"
                      title={ocServerRunning ? "Stop server" : "Start server"}
                    >
                      {ocStarting ? (
                        <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                      ) : ocServerRunning ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowOcModal(true)}
                      className="text-slate-500 hover:text-brand-400 text-xs shrink-0 transition-colors"
                      title="Configure model"
                    >
                      ⚙
                    </button>
                  </div>
                )}

                {(envVars.SPECWRIGHT_LLM_PROVIDER as string) !== "opencode" && (
                <>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Base URL (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={envVars.SPECWRIGHT_LLM_BASE_URL ?? ""}
                      onChange={(e) => setEnvVar("SPECWRIGHT_LLM_BASE_URL", e.target.value)}
                      onBlur={saveEnv}
                      placeholder="http://localhost:11434/v1"
                      className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
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
                      className="px-2 py-1.5 text-slate-200 bg-slate-700 border border-slate-600 hover:border-brand-500 rounded text-xs"
                    >
                      {verifyStatus === "verifying" ? "Verifying..." : "Verify"}
                    </button>
                  </div>
                  {verifyStatus === "ok" && (
                    <p className="text-green-400 text-xxs mt-1">{verifyMessage}</p>
                  )}
                  {verifyStatus === "error" && (
                    <p className="text-red-400 text-xxs mt-1">{verifyMessage}</p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-1">API Key (optional)</label>
                  <input
                    type="password"
                    value={envVars.SPECWRIGHT_LLM_API_KEY ?? ""}
                    onChange={(e) => setEnvVar("SPECWRIGHT_LLM_API_KEY", e.target.value)}
                    onBlur={saveEnv}
                    placeholder="API key for provider (if required)"
                    className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <p className="text-slate-500 text-xxs mt-1">Tip: "Ollama" gebruikt <span className="font-mono">http://localhost:11434/v1</span>. "OpenCode" start je met <span className="font-mono">opencode serve --port 18789</span> — klik de kaart om het model te selecteren.</p>
                </>
                )}
              </div>

              {/* Test Execution Settings */}
              <div className="space-y-2.5">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Test Execution</p>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300 text-xs">Headless Mode</span>
                  <button
                    onClick={() => { setEnvVar("HEADLESS", envVars.HEADLESS === "true" ? "false" : "true"); saveEnv(); }}
                    className={`w-8 h-4 rounded-full transition-colors relative ${envVars.HEADLESS === "true" ? "bg-brand-600" : "bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${envVars.HEADLESS === "true" ? "left-4" : "left-0.5"}`} />
                  </button>
                </label>

                <div>
                  <label className="block text-slate-300 text-xs mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    value={envVars.TEST_TIMEOUT ?? "120000"}
                    onChange={(e) => setEnvVar("TEST_TIMEOUT", e.target.value)}
                    onBlur={saveEnv}
                    className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-xs">Screenshots</span>
                  <select
                    value={envVars.ENABLE_SCREENSHOTS === "true" ? "failure" : "off"}
                    onChange={(e) => { setEnvVar("ENABLE_SCREENSHOTS", e.target.value === "off" ? "false" : "true"); saveEnv(); }}
                    className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-brand-500"
                  >
                    <option value="failure">On Failure</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-xs">Video Recording</span>
                  <select
                    value={
                      envVars.ENABLE_VIDEO_RECORDING !== "true" ? "off" :
                        envVars.RETAIN_VIDEO_ON_SUCCESS === "true" ? "always" : "failure"
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setEnvVar("ENABLE_VIDEO_RECORDING", val === "off" ? "false" : "true");
                      setEnvVar("RETAIN_VIDEO_ON_SUCCESS", val === "always" ? "true" : "false");
                      saveEnv();
                    }}
                    className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-brand-500"
                  >
                    <option value="failure">On Failure</option>
                    <option value="always">Always</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300 text-xs">Tracing</span>
                  <button
                    onClick={() => { setEnvVar("ENABLE_TRACING", envVars.ENABLE_TRACING === "true" ? "false" : "true"); saveEnv(); }}
                    className={`w-8 h-4 rounded-full transition-colors relative ${envVars.ENABLE_TRACING === "true" ? "bg-brand-600" : "bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${envVars.ENABLE_TRACING === "true" ? "left-4" : "left-0.5"}`} />
                  </button>
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300 text-xs">Show Jira Source</span>
                  <button
                    onClick={() => { setEnvVar("SPECWRIGHT_SHOW_JIRA_SOURCE", envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true" ? "false" : "true"); saveEnv(); }}
                    className={`w-8 h-4 rounded-full transition-colors relative ${envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true" ? "bg-brand-600" : "bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${envVars.SPECWRIGHT_SHOW_JIRA_SOURCE === "true" ? "left-4" : "left-0.5"}`} />
                  </button>
                </label>

                <hr className="border-slate-700 my-1" />

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-slate-300 text-xs">Auto-Approve All</span>
                    <p className="text-slate-600 text-xs mt-0.5">Skip permission prompts</p>
                  </div>
                  <button
                    onClick={() => setSkipPermissions(!skipPermissions)}
                    className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${skipPermissions ? "bg-amber-500" : "bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${skipPermissions ? "left-4" : "left-0.5"}`} />
                  </button>
                </label>
                {skipPermissions && (
                  <p className="text-amber-400/80 text-xs pl-1">
                    ⚠ All tool calls (Bash, Write, etc.) will run without asking
                  </p>
                )}
              </div>

              {/* Custom vars */}
              {customVars.length > 0 && (
                <div className="space-y-1.5">
                  {customVars.map(([key, val]) => {
                    const sensitive = isSensitiveKey(key);
                    const isVisible = visibleSecrets.has(key);
                    return (
                      <div key={key} className="flex gap-1 items-center">
                        <span className="text-slate-500 text-xs font-mono flex-shrink-0 w-20 truncate" title={key}>{key}</span>
                        <div className="flex-1 min-w-0 relative">
                          <input
                            type={sensitive && !isVisible ? "password" : "text"}
                            value={val ?? ""}
                            onChange={(e) => setEnvVar(key, e.target.value)}
                            onBlur={saveEnv}
                            className="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 pr-6 border border-slate-600 focus:outline-none focus:border-brand-500"
                          />
                          {sensitive && (
                            <button
                              type="button"
                              onClick={() => toggleSecretVisibility(key)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                              title={isVisible ? "Hide value" : "Show value"}
                            >
                              {isVisible ? "🙈" : "👁"}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => { removeEnvVar(key); saveEnv(); }}
                          className="text-slate-600 hover:text-red-400 text-xs flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add custom var */}
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={customVarKey}
                    onChange={(e) => setCustomVarKey(e.target.value)}
                    placeholder="VAR_NAME"
                    className="flex-1 min-w-0 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600 font-mono"
                  />
                  <input
                    type="text"
                    value={customVarVal}
                    onChange={(e) => setCustomVarVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomVar(); }}
                    placeholder="value"
                    className="flex-1 min-w-0 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-brand-500 placeholder-slate-600"
                  />
                </div>
                <button
                  onClick={handleAddCustomVar}
                  className="text-slate-400 hover:text-brand-400 text-xs transition-colors"
                >
                  + Add var
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
