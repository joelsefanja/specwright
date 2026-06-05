import type { useTranslations } from "../../../i18n/localeStore";
import type { AdvancedAccessText, FriendlyAccessText } from "./accessLabels";

export type AccessEnvVars = Record<string, string | undefined>;
export type ConfigureAccessText = ReturnType<typeof useTranslations>["configureAccess"];

export interface AdvancedSettingsState {
  advancedText: AdvancedAccessText;
  customVarKey: string;
  customVarVal: string;
  customVars: Array<[string, string | undefined]>;
  envVars: AccessEnvVars;
  friendlyText: FriendlyAccessText;
  provider: string;
  skipPermissions: boolean;
  text: ConfigureAccessText;
  visibleSecrets: Set<string>;
}

export interface AdvancedSettingsActions {
  addCustomVar: () => void;
  onProviderChange: (provider: string) => void;
  removeEnvVar: (key: string) => void;
  saveEnv: () => void;
  setCustomVarKey: (value: string) => void;
  setCustomVarVal: (value: string) => void;
  setEnvVar: (key: string, value: string) => void;
  setSkipPermissions: (value: boolean) => void;
  toggleSecretVisibility: (key: string) => void;
}
