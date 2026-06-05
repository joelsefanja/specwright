import { useEffect, useRef, useState } from "react";
import { EMPTY_AUTH, isEmailPasswordConfigured, isOAuthConfigured, type AuthFields } from "../../../components/LeftPanel/AuthSettingsModal";
import {
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_DEFAULT_URL,
  OPENCODE_DEFAULT_VARIANT,
  getCustomEnvVars,
  getPreferredAuthStrategy,
} from "../../../components/LeftPanel/configPanelHelpers";
import { useTranslations } from "../../../i18n/localeStore";
import { useConfigStore } from "../../../store/config.store";
import { advancedLabels, friendlyAccessLabels } from "./accessLabels";

export function useConfigureAccessStep() {
  const translations = useTranslations();
  const text = translations.configureAccess;
  const friendlyText = text.step.startsWith("Stap") ? friendlyAccessLabels.nl : friendlyAccessLabels.en;
  const advancedText = text.step.startsWith("Stap") ? advancedLabels.nl : advancedLabels.en;
  const projectPath = useConfigStore((state) => state.projectPath);
  const envVars = useConfigStore((state) => state.envVars);
  const setEnvVar = useConfigStore((state) => state.setEnvVar);
  const removeEnvVar = useConfigStore((state) => state.removeEnvVar);
  const saveEnv = useConfigStore((state) => state.saveEnv);
  const skipPermissions = useConfigStore((state) => state.skipPermissions);
  const setSkipPermissions = useConfigStore((state) => state.setSkipPermissions);

  const [authFields, setAuthFields] = useState<AuthFields>(EMPTY_AUTH);
  const [authStrategies, setAuthStrategies] = useState<string[]>(["oauth", "email-password"]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [customVarKey, setCustomVarKey] = useState("");
  const [customVarVal, setCustomVarVal] = useState("");
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const appUrlInputRef = useRef<HTMLInputElement>(null);

  const authStrategy = envVars.AUTH_STRATEGY || "none";
  const authRequired = authStrategy !== "none";
  const usesBuiltInAuthSettings = authStrategy === "oauth" || authStrategy === "email-password";
  const authConfigured = !authRequired
    || (authStrategy === "oauth" && isOAuthConfigured(authFields))
    || (authStrategy === "email-password" && isEmailPasswordConfigured(authFields))
    || !usesBuiltInAuthSettings;
  const provider = envVars.SPECWRIGHT_LLM_PROVIDER || "opencode";
  const appUrlConfigured = Boolean(envVars.BASE_URL?.trim());
  const customVars = getCustomEnvVars(envVars);
  const accessReady = appUrlConfigured && authConfigured;
  const appLinkStatus = appUrlConfigured ? friendlyText.appLinkAdded : friendlyText.appLinkMissing;
  const loginStatus = !authRequired ? friendlyText.noLoginNeeded : authConfigured ? friendlyText.loginReady : friendlyText.loginMissing;

  useEffect(() => {
    if (!projectPath) return;
    window.specwright.project.listAuthStrategies(projectPath).then((strategies) => {
      setAuthStrategies(strategies);
      if (!envVars.AUTH_STRATEGY) {
        setEnvVar("AUTH_STRATEGY", "none");
        void saveEnv();
      }
    }).catch(() => null);
  }, [projectPath]);

  useEffect(() => {
    setAuthFields({
      userEmail: envVars.TEST_USER_EMAIL ?? "",
      userName: envVars.TEST_USER_NAME ?? "",
      userPicture: envVars.TEST_USER_PICTURE ?? "",
      storageKey: envVars.OAUTH_STORAGE_KEY ?? "",
      signinPath: envVars.OAUTH_SIGNIN_PATH ?? "",
      buttonTestId: envVars.OAUTH_BUTTON_TEST_ID ?? "",
      postLoginUrl: envVars.OAUTH_POST_LOGIN_URL ?? "",
      password: envVars.TEST_USER_PASSWORD ?? "",
    });
  }, [envVars]);

  const onAuthToggle = (checked: boolean): void => {
    if (!checked) {
      setEnvVar("AUTH_STRATEGY", "none");
      void saveEnv();
      return;
    }
    const nextStrategy = getPreferredAuthStrategy(authStrategies);
    setEnvVar("AUTH_STRATEGY", nextStrategy);
    void saveEnv();
    if (nextStrategy === "oauth" || nextStrategy === "email-password") setShowAuthModal(true);
  };

  const onProviderChange = (nextProvider: string): void => {
    setEnvVar("SPECWRIGHT_LLM_PROVIDER", nextProvider);
    if (nextProvider === "opencode") {
      setEnvVar("SPECWRIGHT_OPENCODE_URL", envVars.SPECWRIGHT_OPENCODE_URL || OPENCODE_DEFAULT_URL);
      setEnvVar("SPECWRIGHT_OPENCODE_VARIANT", envVars.SPECWRIGHT_OPENCODE_VARIANT || OPENCODE_DEFAULT_VARIANT);
      setEnvVar("SPECWRIGHT_MODEL", OPENCODE_DEFAULT_MODEL);
    }
    void saveEnv();
  };

  const onSaveAuth = (fields: AuthFields): void => {
    for (const [key, value] of Object.entries({ TEST_USER_EMAIL: fields.userEmail, TEST_USER_PASSWORD: fields.password, TEST_USER_NAME: fields.userName, TEST_USER_PICTURE: fields.userPicture, OAUTH_STORAGE_KEY: fields.storageKey, OAUTH_SIGNIN_PATH: fields.signinPath, OAUTH_BUTTON_TEST_ID: fields.buttonTestId, OAUTH_POST_LOGIN_URL: fields.postLoginUrl })) {
      if (value) setEnvVar(key, value);
      else removeEnvVar(key);
    }
    setAuthFields(fields);
    setShowAuthModal(false);
    void saveEnv();
  };

  const addCustomVar = (): void => {
    const key = customVarKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (!key) return;
    setEnvVar(key, customVarVal);
    setCustomVarKey("");
    setCustomVarVal("");
    void saveEnv();
  };

  const toggleSecretVisibility = (key: string): void => setVisibleSecrets((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return { accessReady, advancedOpen, advancedText, appLinkStatus, appUrlConfigured, appUrlInputRef, authConfigured, authFields, authRequired, authStrategies, authStrategy, customVarKey, customVarVal, customVars, envVars, friendlyText, loginStatus, provider, setAdvancedOpen, setCustomVarKey, setCustomVarVal, setEnvVar, removeEnvVar, saveEnv, showAuthModal, setShowAuthModal, skipPermissions, setSkipPermissions, text, translations, usesBuiltInAuthSettings, visibleSecrets, addCustomVar, onAuthToggle, onProviderChange, onSaveAuth, toggleSecretVisibility };
}
