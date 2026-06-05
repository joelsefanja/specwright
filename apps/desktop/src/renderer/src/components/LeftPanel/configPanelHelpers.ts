import type { EnvVars } from "@renderer/store/config.store";

export const ENVIRONMENT_LABELS = ["qat", "dev", "staging", "prod", "local"];
export const OPENCODE_DEFAULT_URL = "http://127.0.0.1:18789";
export const OPENCODE_DEFAULT_MODEL = "gpt-5.5-fast";
export const OPENCODE_DEFAULT_VARIANT = "low";

const MANAGED_ENV_KEYS = new Set([
  "BASE_URL", "TEST_ENV", "AUTH_STRATEGY",
  "TEST_USERNAME", "TEST_PASSWORD", "TEST_USER_EMAIL", "TEST_USER_PASSWORD",
  "TEST_USER_NAME", "TEST_USER_PICTURE",
  "OAUTH_STORAGE_KEY", "OAUTH_SIGNIN_PATH", "OAUTH_BUTTON_TEST_ID", "OAUTH_POST_LOGIN_URL",
  "HEADLESS", "TEST_TIMEOUT", "ENABLE_SCREENSHOTS", "ENABLE_VIDEO_RECORDING", "ENABLE_TRACING",
  "BASE_ENV", "NODE_ENV", "BROWSER", "CHROME_ARGS",
  "CUCUMBER_REPORT_PATH", "CODEGEN_OUTPUT_PATH",
  "RETAIN_VIDEO_ON_SUCCESS", "VITE_BUILD_ENVIRONMENT",
  "SPECWRIGHT_LLM_PROVIDER", "SPECWRIGHT_LLM_BASE_URL", "SPECWRIGHT_MODEL", "SPECWRIGHT_LLM_API_KEY",
  "SPECWRIGHT_OPENCODE_URL", "SPECWRIGHT_OPENCODE_VARIANT",
]);

export function normalizeOpenCodeModel(model?: string | null): string {
  if (!model || model === "big-pickle") {
    return OPENCODE_DEFAULT_MODEL;
  }

  return model;
}

export function getPreferredAuthStrategy(strategies: string[]): string {
  return strategies.find((strategy) => strategy.toLowerCase() === "backoffice")
    ?? strategies.find((strategy) => strategy !== "none")
    ?? "oauth";
}

export function isSensitiveEnvironmentKey(key: string): boolean {
  return /password|secret|token|api.?key|access.?code/i.test(key);
}

export function getProjectBasename(projectPath: string): string {
  return projectPath.replace(/\\/g, "/").split("/").pop() ?? projectPath;
}

export function getCustomEnvVars(envVars: EnvVars): Array<[string, string | undefined]> {
  return Object.entries(envVars).filter(([key]) => !MANAGED_ENV_KEYS.has(key));
}
