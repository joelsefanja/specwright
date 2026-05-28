import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { app } from "electron";

export interface EnvVars {
  BASE_URL: string;
  TEST_ENV: string;
  TEST_USERNAME?: string;
  TEST_PASSWORD?: string;
  [key: string]: string | undefined;
}

export interface InstructionStep {
  action: string;
}

export interface InstructionCard {
  moduleName: string;
  category: "@Modules" | "@Workflows";
  subModules: string[];
  fileName: string;
  pageURL?: string;
  steps: string[];
  filePath?: string;
  suitName?: string;
  jiraURL?: string;
  explore: boolean;
  runExploredCases: boolean;
  runGeneratedCases: boolean;
  autoApprove: boolean;
}

export type ProjectState = "none" | "bootstrapping" | "ready" | "error";

export type AuthStrategy = "email-password" | "oauth" | "keycloak" | "none" | string;

export interface PluginInfo {
  /** Base plugin name (e.g., "@specwright/plugin") */
  name: string;
  /** Plugin version */
  version: string;
  /** Detected auth strategy */
  authStrategy: AuthStrategy;
  /** Whether an org overlay is applied */
  hasOverlay: boolean;
  /** Overlay plugin name (e.g., "@your-org/e2e-plugin") */
  overlayName?: string;
}

/** Describes where to load an overlay plugin from. */
export type PluginSource =
  | { type: "local"; dirPath: string }
  | { type: "npm"; packageName: string; registry?: string };

/** Result of validating a local plugin directory. */
export interface PluginValidationResult {
  valid: boolean;
  pluginName?: string;
  error?: string;
}

interface BootstrapResult {
  success: boolean;
  error?: string;
}

export class ProjectService {
  constructor() {}

  /**
   * Run a shell command and stream each line of output to onLog as it arrives.
   *
   * Uses a login shell (`/bin/zsh -l -c` → `/bin/bash -l -c`) so that the
   * user's full PATH is available even when launched from a packaged .app
   * (which inherits only the minimal /usr/bin:/bin system PATH and would
   * otherwise fail to find node, npx, pnpm, etc.).
   */
  private runStreamed(cmd: string, cwd: string, onLog?: (line: string) => void): Promise<number> {
    return new Promise((resolve) => {
      // Prefer zsh (macOS default since Catalina); fall back to bash.
      const shell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
      const child = spawn(shell, ["-l", "-c", cmd], { cwd, detached: false });
      let settled = false;

      const done = (code: number): void => {
        if (settled) return;
        settled = true;
        resolve(code);
      };

      // Safety timeout — 3 minutes; resolves so bootstrap never hangs indefinitely
      const timer = setTimeout(() => {
        onLog?.("[bootstrap] WARNING: command timed out");
        child.kill("SIGTERM");
        done(1);
      }, 180_000);

      const handle = (chunk: Buffer): void => {
        chunk
          .toString()
          .split("\n")
          .forEach((line) => {
            const trimmed = line.trim();
            if (trimmed && onLog) onLog(trimmed);
          });
      };

      child.stdout?.on("data", handle);
      child.stderr?.on("data", handle);
      child.on("close", (code) => { clearTimeout(timer); done(code ?? 0); });
      child.on("exit",  (code) => { clearTimeout(timer); done(code ?? 0); });
      child.on("error", (err)  => { clearTimeout(timer); onLog?.(`[bootstrap] spawn error: ${err.message}`); done(1); });
    });
  }

  async bootstrap(
    projectPath: string,
    options: { skipAuth?: boolean; authStrategy?: AuthStrategy; overlay?: PluginSource } = {},
    onLog?: (line: string) => void
  ): Promise<BootstrapResult> {
    const sentinelPath = path.join(projectPath, ".bootstrapping");
    try {
      // Ensure directory exists
      fs.mkdirSync(projectPath, { recursive: true });

      // Write sentinel BEFORE any files are copied. isBootstrapped() returns false
      // while this file exists, so reopening the app mid-install won't skip setup.
      fs.writeFileSync(sentinelPath, new Date().toISOString(), "utf-8");

      // Ensure a package.json exists (the plugin merges into it, doesn't create from scratch)
      const pkgPath = path.join(projectPath, "package.json");
      if (!fs.existsSync(pkgPath)) {
        fs.writeFileSync(
          pkgPath,
          JSON.stringify(
            {
              name: path.basename(projectPath),
              version: "1.0.0",
              description: "Playwright BDD E2E test suite (scaffolded by Specwright)",
            },
            null,
            2
          ),
          "utf-8"
        );
      }

      // Read .specwright.json if it exists — single source of truth for project config
      const specwrightConfigPath = path.join(projectPath, ".specwright.json");
      let projectConfig: { plugin?: string; authStrategy?: string; overlay?: string } = {};
      if (fs.existsSync(specwrightConfigPath)) {
        try {
          projectConfig = JSON.parse(fs.readFileSync(specwrightConfigPath, "utf-8"));
        } catch { /* malformed — use defaults */ }
      }

      // .specwright.json takes precedence over options passed by caller
      const authStrategy = projectConfig.authStrategy ?? options.authStrategy ?? "email-password";
      const skipAuth = options.skipAuth || authStrategy === "none";
      const authFlag = skipAuth ? "--skip-auth" : "";
      const strategyFlag = `--auth-strategy=${authStrategy}`;

      // Step 1: Build the base-plugin install command.
      //
      // In a packaged .app, @specwright/plugin lives inside the .asar virtual
      // filesystem. Executing a path inside .asar with `node` fails because
      // asar is not a real directory — Node can require() from it but cannot
      // exec shell scripts or spawn processes rooted there.
      //
      // Solution: packaged builds always use `npx` (downloads/runs from the
      // npm registry using real files). The workspace `require.resolve` path
      // is only used during local development where the package is a real dir.
      let pluginCmd: string;
      if (app.isPackaged) {
        // Packaged app — always fetch from registry; avoids asar path issues.
        pluginCmd = `npx --yes @specwright/plugin init "${projectPath}" ${authFlag} ${strategyFlag} --non-interactive`;
      } else {
        try {
          // Dev mode — prefer the local workspace copy (faster, no network).
          const pluginDir = path.dirname(require.resolve("@specwright/plugin/cli.js"));
          pluginCmd = `node "${path.join(pluginDir, "cli.js")}" init "${projectPath}" ${authFlag} ${strategyFlag} --non-interactive`;
        } catch {
          pluginCmd = `npx --yes @specwright/plugin init "${projectPath}" ${authFlag} ${strategyFlag} --non-interactive`;
        }
      }

      onLog?.("[bootstrap] Installing base plugin...");
      const pluginExit = await this.runStreamed(pluginCmd, projectPath, onLog);
      if (pluginExit !== 0) {
        return { success: false, error: "Base plugin install failed" };
      }

      // Step 2: Install overlay if provided or if .specwright.json specifies one.
      const overlaySource = options.overlay;
      const overlayDir = overlaySource
        ? await this.resolveOverlaySourceDir(projectPath, overlaySource)
        : (projectConfig.overlay ? this.resolveOverlayPath(projectPath, projectConfig) : null);

      if (overlayDir) {
        const installScript = path.join(overlayDir, "install.sh");
        if (fs.existsSync(installScript)) {
          onLog?.("[bootstrap] Installing overlay...");
          // --skip-install: Desktop already ran dependency install via base plugin step
          await this.runStreamed(`bash "${installScript}" "${projectPath}" --skip-install`, projectPath, onLog);
          // Persist overlay info to .specwright.json for future boots.
          // Re-read the file so we merge with whatever cli.js wrote (e.g. plugin field).
          if (overlaySource) {
            const overlayManifestPath = path.join(overlayDir, "specwright.plugin.json");
            let overlayName = path.basename(overlayDir);
            if (fs.existsSync(overlayManifestPath)) {
              try {
                const m = JSON.parse(fs.readFileSync(overlayManifestPath, "utf-8")) as Record<string, unknown>;
                overlayName = (m.name as string) ?? overlayName;
              } catch { /* use dir name */ }
            }
            let currentConfig: Record<string, unknown> = {};
            if (fs.existsSync(specwrightConfigPath)) {
              try { currentConfig = JSON.parse(fs.readFileSync(specwrightConfigPath, "utf-8")); } catch { /* ignore */ }
            }
            const specwrightJson = {
              ...currentConfig,
              overlay: overlayName,
              overlayPath: path.relative(projectPath, overlayDir),
            };
            fs.writeFileSync(specwrightConfigPath, JSON.stringify(specwrightJson, null, 2), "utf-8");
          }
        } else {
          onLog?.(`[bootstrap] WARNING: overlay install.sh not found at ${overlayDir}`);
        }
        // Clean up tmp dir used to download npm overlay package
        const tmpDir = path.join(projectPath, ".specwright-overlay-tmp");
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      }

      // Step 3: Install dependencies — runs always (overlay uses --skip-install so Desktop owns this).
      {
        const hasPnpmLock = fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"));
        const hasYarnLock = fs.existsSync(path.join(projectPath, "yarn.lock"));
        const installCmd = hasPnpmLock
          ? "pnpm install --ignore-scripts --yes"
          : hasYarnLock
          ? "yarn install --ignore-scripts --non-interactive"
          : "npm install --ignore-scripts";
        const pm = hasPnpmLock ? "pnpm" : hasYarnLock ? "yarn" : "npm";
        onLog?.(`[bootstrap] Installing dependencies (${pm})...`);
        await this.runStreamed(installCmd, projectPath, onLog);
      }

      // Remove sentinel — bootstrap complete. isBootstrapped() will now return true.
      fs.rmSync(sentinelPath, { force: true });
      return { success: true };
    } catch (err: unknown) {
      // Also remove sentinel on failure so the user can retry without getting stuck.
      fs.rmSync(sentinelPath, { force: true });
      return { success: false, error: String(err) };
    }
  }

  /**
   * Parse a .env file into key-value pairs.
   * Skips comments and empty lines.
   */
  private parseEnvFile(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8");
    const result: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return result;
  }

  /**
   * Read testing-related env vars only.
   * Primary source: e2e-tests/.env.testing (plugin-installed template)
   * Fallback: .env for system keys (BASE_URL, TEST_ENV, TEST_USERNAME, TEST_PASSWORD)
   * Never exposes app-specific vars (VITE_*, API keys, etc.)
   */
  readEnv(projectPath: string): EnvVars {
    const testingEnvPath = path.join(projectPath, "e2e-tests/.env.testing");
    const rootEnvPath = path.join(projectPath, ".env");

    // Start with minimal defaults — only BASE_URL is always needed
    const result: EnvVars = { BASE_URL: "", TEST_ENV: "" };

    // Read from .env.testing (primary — all testing vars)
    const testingVars = this.parseEnvFile(testingEnvPath);
    for (const [key, val] of Object.entries(testingVars)) {
      result[key] = val;
    }

    // Fall back to .env ONLY for the 4 system keys if not already set from .env.testing
    const systemKeys = ["BASE_URL", "TEST_ENV", "TEST_USERNAME", "TEST_PASSWORD"];
    const rootVars = this.parseEnvFile(rootEnvPath);
    for (const key of systemKeys) {
      if (!result[key] && rootVars[key]) {
        result[key] = rootVars[key];
      }
    }

    return result;
  }

  /**
   * Write testing env vars to e2e-tests/.env.testing.
   * Never modifies the project's root .env (protects app secrets).
   */
  writeEnv(projectPath: string, vars: EnvVars): void {
    const testingEnvPath = path.join(projectPath, "e2e-tests/.env.testing");
    fs.mkdirSync(path.dirname(testingEnvPath), { recursive: true });

    const lines: string[] = ["# E2E Testing Environment — managed by Specwright"];
    for (const [key, val] of Object.entries(vars)) {
      if (val !== undefined && val !== null) {
        lines.push(`${key}=${val}`);
      }
    }
    fs.writeFileSync(testingEnvPath, lines.join("\n") + "\n", "utf-8");
  }

  /** Resolve the instructions.js path for a project. */
  private resolveInstructionsPath(projectPath: string): string {
    return path.join(projectPath, "e2e-tests/instructions.js");
  }

  readInstructions(projectPath: string): InstructionCard[] {
    const filePath = this.resolveInstructionsPath(projectPath);
    if (!fs.existsSync(filePath)) return [];

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      // Extract the array from ESM or CJS export (greedy match for full array)
      const esmMatch = raw.match(/export\s+default\s+(\[[\s\S]*\]);?\s*$/m);
      const cjsMatch = raw.match(/module\.exports\s*=\s*(\[[\s\S]*\]);?\s*$/m);
      const match = esmMatch || cjsMatch;
      if (!match) return [];

      // The file uses JS syntax (single quotes, unquoted keys) — not valid JSON.
      // Convert to valid JSON: replace single quotes with double quotes, add quotes to keys.
      let jsArray = match[1].trim();
      // Remove trailing semicolon if present
      if (jsArray.endsWith(";")) jsArray = jsArray.slice(0, -1);

      // Use Function() to safely evaluate the JS array literal
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const evaluated = new Function(`return ${jsArray}`)() as Record<string, unknown>[];

      // Map the pipeline format to InstructionCard format
      return evaluated.map((entry) => ({
        moduleName: (entry.moduleName as string) || "",
        category: ((entry.category as string) || "@Modules") as "@Modules" | "@Workflows",
        subModules: (entry.subModuleName as string[]) || (entry.subModules as string[]) || [],
        fileName: (entry.fileName as string) || "",
        pageURL: (entry.pageURL as string) || "",
        steps: (entry.instructions as string[]) || (entry.steps as string[]) || [],
        filePath: (entry.filePath as string) || "",
        suitName: (entry.suitName as string) || "",
        jiraURL: (entry.jiraURL as string) || (entry.jira as string) || ((entry.inputs as Record<string, Record<string, string>>)?.jira?.url) || "",
        explore: entry.explore === true,
        runExploredCases: entry.runExploredCases === true,
        runGeneratedCases: entry.runGeneratedCases === true,
        autoApprove: entry.autoApprove === true,
      }));
    } catch (err) {
      console.error("[ProjectService] Failed to read instructions:", err);
      return [];
    }
  }

  writeInstructions(projectPath: string, cards: InstructionCard[]): void {
    const filePath = this.resolveInstructionsPath(projectPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Write as proper JS object syntax (unquoted keys) instead of JSON
    const jsArray = this.cardsToJsSource(cards);

    // Detect if the existing file uses ESM or CJS, default to ESM
    let useEsm = true;
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      useEsm = !existing.includes("module.exports");
    }
    const content = useEsm
      ? `// Auto-generated by Specwright — edit or regenerate via the UI\nexport default ${jsArray};\n`
      : `// Auto-generated by Specwright — edit or regenerate via the UI\nmodule.exports = ${jsArray};\n`;
    fs.writeFileSync(filePath, content, "utf-8");
  }

  /** Convert InstructionCard[] to a JS source string with unquoted keys and single quotes. */
  private cardsToJsSource(cards: InstructionCard[]): string {
    if (cards.length === 0) return "[]";

    const q = (val: string): string => `'${val.replace(/'/g, "\\'")}'`;

    const entries = cards.map((card) => {
      const lines: string[] = [];
      lines.push(`  {`);
      lines.push(`    moduleName: ${q(card.moduleName)},`);
      lines.push(`    category: ${q(card.category)},`);
      lines.push(`    subModuleName: [${card.subModules.map(s => q(s)).join(", ")}],`);
      lines.push(`    fileName: ${q(card.fileName)},`);
      if (card.pageURL) lines.push(`    pageURL: ${q(card.pageURL)},`);
      if (card.filePath) lines.push(`    filePath: ${q(card.filePath)},`);
      if (card.suitName) lines.push(`    suitName: ${q(card.suitName)},`);
      // Write inputs block — jiraURL maps to inputs.jira.url (canonical format)
      if (card.jiraURL) {
        lines.push(`    inputs: { jira: { url: ${q(card.jiraURL)} } },`);
      } else {
        lines.push(`    inputs: {},`);
      }
      if (card.steps.length > 0) {
        lines.push(`    instructions: [`);
        for (const step of card.steps) {
          lines.push(`      ${q(step)},`);
        }
        lines.push(`    ],`);
      }
      lines.push(`    explore: ${card.explore},`);
      lines.push(`    runExploredCases: ${card.runExploredCases},`);
      lines.push(`    runGeneratedCases: ${card.runGeneratedCases},`);
      lines.push(`    autoApprove: ${card.autoApprove ?? false},`);
      lines.push(`  }`);
      return lines.join("\n");
    });

    return `[\n${entries.join(",\n")}\n]`;
  }

  /**
   * Validate a local directory as a Specwright plugin (3-level check).
   * Level 1: specwright.plugin.json exists + valid JSON + required fields
   * Level 2: install.sh exists
   * Level 3: all paths in overrides[] exist inside the overrides/ directory
   */
  validateLocalPlugin(dirPath: string): PluginValidationResult {
    // Level 1: manifest
    const manifestPath = path.join(dirPath, "specwright.plugin.json");
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, error: "Not a Specwright plugin — specwright.plugin.json not found" };
    }
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    } catch {
      return { valid: false, error: "specwright.plugin.json is not valid JSON" };
    }
    if (!manifest.name || !manifest.version || !manifest.type) {
      return { valid: false, error: "specwright.plugin.json missing required fields: name, version, type" };
    }

    // Level 2: install script
    const installScript = path.join(dirPath, "install.sh");
    if (!fs.existsSync(installScript)) {
      return { valid: false, error: "Plugin is missing install.sh" };
    }

    // Level 3: override files exist
    const overrides = (manifest.overrides as string[]) ?? [];
    const missing = overrides.filter((rel) => !fs.existsSync(path.join(dirPath, "overrides", rel)));
    if (missing.length > 0) {
      return { valid: false, error: `Plugin overrides missing: ${missing.join(", ")}` };
    }

    return { valid: true, pluginName: manifest.name as string };
  }

  /**
   * Resolve the overlay directory from .specwright.json config fields.
   * Returns null if overlay is not configured or cannot be found.
   * Resolution order:
   *   1. Explicit overlayPath in config (relative to projectPath)
   *   2. Sibling scan: ../../{overlayName}/
   *   3. npm package resolution: require.resolve('{overlayName}/install.sh')
   */
  private resolveOverlayPath(
    projectPath: string,
    config: { overlay?: string; overlayPath?: string }
  ): string | null {
    if (!config.overlay) return null;

    // 1. Explicit overlayPath
    if (config.overlayPath) {
      const resolved = path.resolve(projectPath, config.overlayPath);
      if (fs.existsSync(path.join(resolved, "install.sh"))) return resolved;
    }

    // 2. Sibling scan (covers monorepo layout: ../../overlay-plugins/{name})
    const sibling = path.resolve(projectPath, "..", "..", config.overlay);
    if (fs.existsSync(path.join(sibling, "install.sh"))) return sibling;

    // 3. npm package resolution
    try {
      const pkg = require.resolve(`${config.overlay}/install.sh`);
      return path.dirname(pkg);
    } catch { /* not installed as npm package */ }

    console.warn(`[bootstrap] overlay '${config.overlay}' not found — skipping`);
    return null;
  }

  /**
   * Resolve a PluginSource to a local directory path.
   * For npm sources, installs the package to a temp location first.
   */
  private async resolveOverlaySourceDir(projectPath: string, source: PluginSource): Promise<string | null> {
    if (source.type === "local") {
      const validation = this.validateLocalPlugin(source.dirPath);
      if (!validation.valid) {
        console.warn(`[bootstrap] overlay validation failed: ${validation.error}`);
        return null;
      }
      return source.dirPath;
    }

    if (source.type === "npm") {
      // Install the npm package to get the overlay directory
      const registryFlag = source.registry ? ` --registry ${source.registry}` : "";
      const tmpDir = path.join(projectPath, ".specwright-overlay-tmp");
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "overlay-install", version: "1.0.0" }));
        // Use a login shell so node/npm are on PATH in packaged .app builds.
        const loginShell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
        execSync(`${loginShell} -l -c 'npm install ${source.packageName}${registryFlag} --no-save --ignore-scripts'`, {
          cwd: tmpDir, stdio: "pipe", timeout: 60_000,
        });
        const overlayDir = path.join(tmpDir, "node_modules", source.packageName);
        const validation = this.validateLocalPlugin(overlayDir);
        if (!validation.valid) {
          console.warn(`[bootstrap] npm overlay validation failed: ${validation.error}`);
          fs.rmSync(tmpDir, { recursive: true, force: true });
          return null;
        }
        return overlayDir;
      } catch (err) {
        console.warn(`[bootstrap] npm overlay install failed: ${String(err)}`);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return null;
      }
    }

    return null;
  }

  isBootstrapped(projectPath: string): boolean {
    // Sentinel file written at bootstrap start, deleted on success.
    // If it exists, a previous bootstrap was interrupted mid-flight.
    const bootstrapping = fs.existsSync(path.join(projectPath, ".bootstrapping"));
    if (bootstrapping) return false;

    return (
      fs.existsSync(path.join(projectPath, "package.json")) &&
      fs.existsSync(path.join(projectPath, "playwright.config.ts")) &&
      fs.existsSync(path.join(projectPath, "e2e-tests/playwright/fixtures.js"))
    );
  }

  /**
   * Detect which plugin and auth strategy are active for a project.
   *
   * Detection order:
   * 1. specwright.plugin.json — overlay manifest with explicit authStrategy
   * 2. .env.testing AUTH_STRATEGY — explicit env var
   * 3. .claude/agents/ exists — base plugin installed, default auth
   * 4. None found — no plugin
   */
  detectPlugin(projectPath: string): PluginInfo {
    // 1. Check .specwright.json — single source of truth
    const configPath = path.join(projectPath, ".specwright.json");
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        return {
          name: (config.plugin as string) ?? "@specwright/plugin",
          version: (config.version as string) ?? "unknown",
          authStrategy: (config.authStrategy as AuthStrategy) ?? "email-password",
          hasOverlay: !!config.overlay,
          overlayName: (config.overlay as string) ?? undefined,
        };
      } catch { /* malformed — fall through */ }
    }

    // 2. Check for overlay manifest (specwright.plugin.json from org overlay)
    const manifestPath = path.join(projectPath, "specwright.plugin.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
        return {
          name: (manifest.extends as string) ?? "@specwright/plugin",
          version: (manifest.version as string) ?? "unknown",
          authStrategy: (manifest.authStrategy as AuthStrategy) ?? "email-password",
          hasOverlay: true,
          overlayName: (manifest.name as string) ?? undefined,
        };
      } catch { /* malformed — fall through */ }
    }

    // 3. Check .env.testing for AUTH_STRATEGY
    const envPath = path.join(projectPath, "e2e-tests/.env.testing");
    let authStrategy: AuthStrategy = "email-password";
    if (fs.existsSync(envPath)) {
      const envVars = this.parseEnvFile(envPath);
      if (envVars.AUTH_STRATEGY) {
        authStrategy = envVars.AUTH_STRATEGY as AuthStrategy;
      }
    }

    // 4. Check for base plugin (agents directory)
    if (fs.existsSync(path.join(projectPath, ".claude/agents"))) {
      return {
        name: "@specwright/plugin",
        version: "unknown",
        authStrategy,
        hasOverlay: false,
      };
    }

    // 5. No plugin detected
    return {
      name: "none",
      version: "",
      authStrategy: "none",
      hasOverlay: false,
    };
  }

  listAuthStrategies(projectPath: string): string[] {
    const strategies = new Set(["oauth", "email-password"]);
    const dir = path.join(projectPath, "e2e-tests/playwright/auth-strategies");

    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
        strategies.add(path.basename(entry.name, ".js"));
      }
    }

    strategies.delete("none");
    return Array.from(strategies).sort((a, b) => {
      const order = ["oauth", "email-password"];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      return a.localeCompare(b);
    });
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /** Read example templates from instructions.example.js */
  readExampleTemplates(projectPath: string): (InstructionCard & { templateName: string })[] {
    const filePath = path.join(projectPath, "e2e-tests/instructions.example.js");
    return this.parseTemplateFile(filePath);
  }

  /** Read custom user templates from instructions.custom-templates.js */
  readCustomTemplates(projectPath: string): (InstructionCard & { templateName: string })[] {
    const filePath = path.join(projectPath, "e2e-tests/instructions.custom-templates.js");
    return this.parseTemplateFile(filePath);
  }

  /** Write custom templates to instructions.custom-templates.js */
  writeCustomTemplates(projectPath: string, templates: (InstructionCard & { templateName: string })[]): void {
    const filePath = path.join(projectPath, "e2e-tests/instructions.custom-templates.js");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (templates.length === 0) {
      fs.writeFileSync(filePath, "// Custom templates saved by Specwright\nexport default [];\n", "utf-8");
      return;
    }

    const q = (val: string): string => `'${val.replace(/'/g, "\\'")}'`;
    const entries = templates.map((tmpl) => {
      const lines: string[] = [];
      lines.push(`  {`);
      lines.push(`    templateName: ${q(tmpl.templateName)},`);
      lines.push(`    moduleName: ${q(tmpl.moduleName)},`);
      lines.push(`    category: ${q(tmpl.category)},`);
      lines.push(`    subModuleName: [${tmpl.subModules.map(s => q(s)).join(", ")}],`);
      lines.push(`    fileName: ${q(tmpl.fileName)},`);
      if (tmpl.pageURL) lines.push(`    pageURL: ${q(tmpl.pageURL)},`);
      if (tmpl.jiraURL) {
        lines.push(`    inputs: { jira: { url: ${q(tmpl.jiraURL)} } },`);
      } else {
        lines.push(`    inputs: {},`);
      }
      if (tmpl.steps.length > 0) {
        lines.push(`    instructions: [`);
        for (const step of tmpl.steps) {
          lines.push(`      ${q(step)},`);
        }
        lines.push(`    ],`);
      }
      lines.push(`    explore: ${tmpl.explore},`);
      lines.push(`    runExploredCases: ${tmpl.runExploredCases},`);
      lines.push(`    runGeneratedCases: ${tmpl.runGeneratedCases},`);
      lines.push(`    autoApprove: ${tmpl.autoApprove ?? false},`);
      lines.push(`  }`);
      return lines.join("\n");
    });

    const content = `// Custom templates saved by Specwright\nexport default [\n${entries.join(",\n")}\n];\n`;
    fs.writeFileSync(filePath, content, "utf-8");
  }

  /** Parse a JS file that exports an array of instruction configs (example or custom templates) */
  private parseTemplateFile(filePath: string): (InstructionCard & { templateName: string })[] {
    if (!fs.existsSync(filePath)) return [];

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const esmMatch = raw.match(/export\s+default\s+(\[[\s\S]*\]);?\s*$/m);
      const cjsMatch = raw.match(/module\.exports\s*=\s*(\[[\s\S]*\]);?\s*$/m);
      const match = esmMatch || cjsMatch;
      if (!match) return [];

      let jsArray = match[1].trim();
      if (jsArray.endsWith(";")) jsArray = jsArray.slice(0, -1);

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const evaluated = new Function(`return ${jsArray}`)() as Record<string, unknown>[];

      return evaluated.map((entry) => ({
        templateName: (entry.templateName as string) || (entry.moduleName as string) || "Untitled",
        moduleName: (entry.moduleName as string) || "",
        category: ((entry.category as string) || "@Modules") as "@Modules" | "@Workflows",
        subModules: (entry.subModuleName as string[]) || (entry.subModules as string[]) || [],
        fileName: (entry.fileName as string) || "",
        pageURL: (entry.pageURL as string) || "",
        steps: (entry.instructions as string[]) || (entry.steps as string[]) || [],
        filePath: (entry.filePath as string) || "",
        suitName: (entry.suitName as string) || "",
        jiraURL: (entry.jiraURL as string) || ((entry.inputs as Record<string, Record<string, string>>)?.jira?.url) || "",
        explore: entry.explore === true,
        runExploredCases: entry.runExploredCases === true,
        runGeneratedCases: entry.runGeneratedCases === true,
        autoApprove: entry.autoApprove === true,
      }));
    } catch (err) {
      console.error(`[ProjectService] Failed to parse template file ${filePath}:`, err);
      return [];
    }
  }

  /**
   * Load a specific skill's prompt for direct invocations (e.g. /e2e-heal, /e2e-generate).
   * Used when the user explicitly invokes a skill by name — bypasses the full pipeline
   * orchestrator so the skill runs cleanly without pipeline phase framing.
   *
   * Returns null if the skill is not found (caller falls back to orchestrator prompt).
   */
  loadSkillPrompt(projectPath: string, skillName: string): string | null {
    const skillPaths = [
      path.join(projectPath, `.claude/skills/${skillName}/SKILL.md`),
      path.join(projectPath, `.claude_skills/${skillName}/SKILL.md`),
    ];
    for (const p of skillPaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const body = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
        return `You are running inside Specwright, an E2E test automation desktop app.\n\n${body}`;
      }
    }
    return null;
  }

  /**
   * Load the orchestrator system prompt for the pipeline.
   * Priority:
   *   1. Target project's .claude/skills/e2e-automate/SKILL.md (the full pipeline instructions)
   *   2. Target project's .claude/agents/orchestrator.md
   *   3. Bundled resources/agents/orchestrator.md
   *   4. Fallback
   */
  loadOrchestratorPrompt(projectPath?: string): string {
    if (projectPath) {
      // Priority 1: The e2e-automate skill IS the orchestrator
      const skillPaths = [
        path.join(projectPath, ".claude/skills/e2e-automate/SKILL.md"),
        path.join(projectPath, ".claude_skills/e2e-automate/SKILL.md"),
      ];
      for (const p of skillPaths) {
        if (fs.existsSync(p)) {
          const skillDir = path.dirname(p);
          const projectSkillsDir = path.dirname(skillDir);
          const raw = fs.readFileSync(p, "utf-8");
          const body = raw.replace(/^---[\s\S]*?---\n?/, "").trim();

          // Inline all other skills from the project's skills directory.
          // In the Desktop app context, context:fork sub-skill invocations don't work
          // (Agent SDK subprocess can't fork). Inline every skill so Claude follows
          // them directly — no Skill tool needed.
          const inlinedSubSkills: string[] = [];
          if (fs.existsSync(projectSkillsDir)) {
            const entries = fs.readdirSync(projectSkillsDir, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory() || entry.name === "e2e-automate") continue;
              const subPath = path.join(projectSkillsDir, entry.name, "SKILL.md");
              if (fs.existsSync(subPath)) {
                const subRaw = fs.readFileSync(subPath, "utf-8");
                const subBody = subRaw.replace(/^---[\s\S]*?---\n?/, "").trim();
                inlinedSubSkills.push(`### /${entry.name}\n\n${subBody}`);
              }
            }
          }

          // Also inline agents from .claude/agents/ so @agent-name references work inline.
          const agentsDir = path.join(projectPath, ".claude/agents");
          if (fs.existsSync(agentsDir)) {
            const agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
            for (const entry of agentEntries) {
              if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
              const agentPath = path.join(agentsDir, entry.name);
              const agentRaw = fs.readFileSync(agentPath, "utf-8");
              const agentBody = agentRaw.replace(/^---[\s\S]*?---\n?/, "").trim();
              const agentName = entry.name.replace(".md", "");
              inlinedSubSkills.push(`### @${agentName}\n\n${agentBody}`);
            }
          }

          const subSkillSection = inlinedSubSkills.length > 0
            ? `\n\n---\n\n## Sub-Skill & Agent Reference (Inline)\n\n` +
              `When pipeline phases instruct you to invoke a sub-skill (/e2e-process, /e2e-plan, etc.) or an agent (@explorer, etc.), ` +
              `execute the matching instructions below directly — do NOT use the Skill or Agent tool in this environment.\n\n` +
              inlinedSubSkills.join("\n\n---\n\n")
            : "";

          return `You are running inside Specwright, an E2E test automation desktop app. The user has configured test instructions via the UI. Execute the pipeline below.\n\n${body}${subSkillSection}`;
        }
      }

      // Priority 2: Agent file
      const agentPaths = [
        path.join(projectPath, ".claude/agents/orchestrator.md"),
        path.join(projectPath, ".claude_agents/orchestrator.md"),
      ];
      for (const p of agentPaths) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf-8");
          return raw.replace(/^---[\s\S]*?---\n?/, "").trim();
        }
      }
    }

    return "You are a helpful test automation assistant. Read e2e-tests/instructions.js and execute the E2E test automation pipeline.";
  }

  // ── Scaffold templates ─────────────────────────────────────────────────────

  private writeTemplate(base: string, relPath: string, content: string): void {
    const fullPath = path.join(base, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, "utf-8");
    }
  }

  private packageJsonTemplate(): string {
    return JSON.stringify(
      {
        name: "e2e-tests",
        version: "1.0.0",
        description: "Playwright BDD E2E test suite (scaffolded by Specwright)",
        scripts: {
          "test:bdd": "bddgen && playwright test",
          "test:playwright": "playwright test",
          "report:playwright": "playwright show-report",
        },
        devDependencies: {
          "@playwright/test": "^1.49.0",
          "@faker-js/faker": "^9.0.0",
          "playwright-bdd": "^8.4.2",
          dotenv: "^16.4.7",
        },
      },
      null,
      2
    );
  }

  private playwrightConfigTemplate(): string {
    return `import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import * as dotenv from "dotenv";

dotenv.config();

const bddConfig = defineBddConfig({
  features: "e2e-tests/features/playwright-bdd/**/*.feature",
  steps: [
    "e2e-tests/features/playwright-bdd/**/*.steps.js",
    "e2e-tests/features/playwright-bdd/shared/*.js",
  ],
  outputDir: ".features-gen",
});

export default defineConfig({
  testDir: ".features-gen",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "**/global.setup.js" },
    {
      name: "e2e",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    { name: "teardown", testMatch: "**/global.teardown.js" },
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
});
`;
  }

  private envTemplate(): string {
    return `BASE_URL=https://app.example.com
TEST_ENV=qat
`;
  }

  private gitignoreTemplate(): string {
    return `node_modules/
.features-gen/
playwright-report/
test-results/
e2e-tests/playwright/auth-storage/.auth/
e2e-tests/playwright/test-data/globalTestData.json
.cleanup-done
`;
  }

  private fixturesTemplate(): string {
    return `import { test as base, createBdd } from "playwright-bdd";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Extended test fixtures for Specwright E2E tests.
 * Import { Given, When, Then, Before, After, expect } from this file in all step definitions.
 */
export const test = base.extend({
  testData: async ({}, use) => {
    const data = {};
    await use(data);
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect } from "@playwright/test";
`;
  }

  private globalSetupTemplate(): string {
    return `import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const MARKER = path.resolve(".cleanup-done");
const DATA_FILE = path.resolve("e2e-tests/playwright/test-data/globalTestData.json");

test("global setup", async () => {
  if (!fs.existsSync(MARKER)) {
    // New run — clean up leftover test data
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(MARKER, new Date().toISOString(), "utf-8");
  }
  // If marker exists, a run is already in progress — preserve data
});
`;
  }

  private globalTeardownTemplate(): string {
    return `import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const MARKER = path.resolve(".cleanup-done");

test("global teardown", async () => {
  if (fs.existsSync(MARKER)) fs.unlinkSync(MARKER);
});
`;
  }

  private navigationStepsTemplate(): string {
    return `import { Given, When, Then } from "e2e-tests/playwright/fixtures.js";

Given("I navigate to {string}", async ({ page }, url) => {
  await page.goto(url);
});

Given("I am on the {string} page", async ({ page }, pageName) => {
  const baseUrl = process.env.BASE_URL ?? "";
  const routes = {
    home: "/",
    dashboard: "/dashboard",
    login: "/login",
  };
  const route = routes[pageName.toLowerCase()] ?? \`/\${pageName.toLowerCase()}\`;
  await page.goto(\`\${baseUrl}\${route}\`);
});

Then("I should see the page title {string}", async ({ page }, title) => {
  await page.waitForSelector(\`text=\${title}\`, { timeout: 10000 });
});
`;
  }

  private commonStepsTemplate(): string {
    return `import { Given, When, Then, expect } from "e2e-tests/playwright/fixtures.js";

When("I click {string}", async ({ page }, text) => {
  await page.getByText(text, { exact: false }).first().click();
});

When("I fill {string} with {string}", async ({ page }, label, value) => {
  await page.getByLabel(label).fill(value);
});

Then("I should see {string}", async ({ page }, text) => {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
});

Then("I should not see {string}", async ({ page }, text) => {
  await expect(page.getByText(text, { exact: false }).first()).not.toBeVisible();
});
`;
  }

  private globalHooksTemplate(): string {
    return `import { Before, After } from "e2e-tests/playwright/fixtures.js";

// Clear per-scenario test data before each scenario
Before(async ({ testData }) => {
  Object.keys(testData).forEach((k) => delete testData[k]);
});
`;
  }

  private instructionsTemplate(): string {
    return `// Auto-generated by Specwright — edit or regenerate via the UI\nmodule.exports = [];\n`;
  }
}
