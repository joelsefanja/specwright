import * as fs from "fs";
import * as path from "path";

export interface TestingEnvVars {
  BASE_URL: string;
  TEST_ENV: string;
  TEST_USERNAME?: string;
  TEST_PASSWORD?: string;
  [key: string]: string | undefined;
}

const SYSTEM_ENV_KEYS = ["BASE_URL", "TEST_ENV", "TEST_USERNAME", "TEST_PASSWORD"];
const BASE_URL_FALLBACK_KEYS = [
  "APP_URL",
  "APP_LINK",
  "APPLICATION_URL",
  "BACKOFFICE_URL",
  "BACKOFFICE_BASE_URL",
  "MPLUSONLINE_BACKOFFICE_URL",
  "PLAYWRIGHT_BASE_URL",
  "E2E_BASE_URL",
  "CYPRESS_BASE_URL",
  "VITE_APP_URL",
  "VITE_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "PUBLIC_URL",
];

export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    result[key] = unquoteEnvValue(trimmed.slice(equalsIndex + 1).trim());
  }

  return result;
}

export function readTestingEnvVars(projectPath: string): TestingEnvVars {
  const testingEnvPath = path.join(projectPath, "e2e-tests/.env.testing");
  const rootEnvPath = path.join(projectPath, ".env");
  const result: TestingEnvVars = { BASE_URL: "", TEST_ENV: "" };

  const testingVars = parseEnvFile(testingEnvPath);
  for (const [key, value] of Object.entries(testingVars)) {
    result[key] = value;
  }

  const rootVars = parseEnvFile(rootEnvPath);
  for (const key of SYSTEM_ENV_KEYS) {
    if (!result[key] && rootVars[key]) {
      result[key] = rootVars[key];
    }
  }

  if (!result.BASE_URL) {
    result.BASE_URL = findBaseUrlFallback(rootVars);
  }

  return result;
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function findBaseUrlFallback(vars: Record<string, string>): string {
  for (const key of BASE_URL_FALLBACK_KEYS) {
    const value = normalizeBaseUrl(vars[key]);
    if (value) return value;
  }
  return "";
}

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return "";
}

export function writeTestingEnvVars(projectPath: string, vars: TestingEnvVars): void {
  const testingEnvPath = path.join(projectPath, "e2e-tests/.env.testing");
  fs.mkdirSync(path.dirname(testingEnvPath), { recursive: true });

  const lines: string[] = ["# E2E Testing Environment — managed by Specwright"];
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined && value !== null) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(testingEnvPath, `${lines.join("\n")}\n`, "utf-8");
}
