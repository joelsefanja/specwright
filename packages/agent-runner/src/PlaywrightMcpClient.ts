/**
 * PlaywrightMcpClient — programmatic MCP client for Playwright browser automation.
 *
 * Connects to @playwright/mcp server via stdio transport and calls browser tools
 * directly from code. No prompt engineering needed — the app controls the browser.
 */

import {
  summarizeAccessibilityTree,
  type AccessibilityTreeSummary,
  type DiscoveredElementGroup,
} from "./accessibilitySnapshotSummary";

export type { DiscoveredElementGroup } from "./accessibilitySnapshotSummary";

// Dynamic import — MCP SDK is ESM-only, agent-runner compiles to CJS.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

/** Result from an MCP tool call */
export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

/** Snapshot element from browser_snapshot */
export interface SnapshotElement {
  role: string;
  name: string;
  ref?: string;
  children?: SnapshotElement[];
}

/** Result of a pre-exploration run */
export interface ExplorationResult {
  /** URL that was navigated to */
  url: string;
  /** Page title */
  title: string;
  /** Accessibility snapshot text (full page structure) */
  snapshot: string;
  /** Human-readable summary of discovered elements, built from the accessibility tree */
  summary: string;
  /** Discovered element groups by role */
  discoveredElements: DiscoveredElementGroup[];
  /** Base64 screenshot data (if captured) */
  screenshot?: string;
  /** Additional page snapshots from navigation clicks */
  pageSnapshots: Array<{ url: string; snapshot: string }>;
  /** Error if exploration failed */
  error?: string;
}

export interface PlaywrightMcpOptions {
  /** Additional args for @playwright/mcp (e.g., --headless) */
  mcpArgs?: string[];
  /** Directory for screenshots */
  outputDir?: string;
  /** Callback for progress logging */
  onLog?: (line: string) => void;
}

export class PlaywrightMcpClient {
  private client: unknown = null;
  private transport: unknown = null;
  private onLog?: (line: string) => void;

  /**
   * Connect to the Playwright MCP server.
   */
  async connect(options: PlaywrightMcpOptions = {}): Promise<void> {
    this.onLog = options.onLog;
    this.onLog?.("[mcp-client] Connecting to Playwright MCP server…");

    // Load MCP SDK modules — the SDK is ESM-only and subpath exports don't
    // include ./client/stdio. Walk up from any resolved file to find the SDK root,
    // then construct file:// URLs to the ESM dist files.
    const { createRequire } = await dynamicImport("module") as typeof import("module");
    const { pathToFileURL } = await dynamicImport("url") as typeof import("url");
    const nodePath = await dynamicImport("path") as typeof import("path");
    const nodeFs = await dynamicImport("fs") as typeof import("fs");

    // Find SDK root: resolve package.json, then walk up to find the one with "exports"
    const esmRequire = createRequire(__filename);
    let pkgJsonPath = esmRequire.resolve("@modelcontextprotocol/sdk/package.json");
    // The resolve may land in dist/cjs/package.json — walk up to find root package.json
    let sdkDir = nodePath.dirname(pkgJsonPath);
    for (let i = 0; i < 5; i++) {
      const rootPkg = nodePath.join(sdkDir, "package.json");
      if (nodeFs.existsSync(rootPkg)) {
        const content = JSON.parse(nodeFs.readFileSync(rootPkg, "utf-8"));
        if (content.name === "@modelcontextprotocol/sdk" && content.exports) {
          break; // Found the real root
        }
      }
      sdkDir = nodePath.dirname(sdkDir);
    }
    const sdkEsm = nodePath.join(sdkDir, "dist", "esm");

    const clientMod = (await dynamicImport(pathToFileURL(nodePath.join(sdkEsm, "client", "index.js")).href)) as {
      Client: new (opts: { name: string; version: string }) => McpClientInstance;
    };
    const transportMod = (await dynamicImport(pathToFileURL(nodePath.join(sdkEsm, "client", "stdio.js")).href)) as {
      StdioClientTransport: new (opts: {
        command: string;
        args: string[];
      }) => McpTransportInstance;
    };

    // Resolve local @playwright/mcp binary (avoids npx overhead of 300ms-3s)
    let mcpCommand = "npx";
    let mcpArgs = ["@playwright/mcp@latest"];
    try {
      const { createRequire: cr } = await dynamicImport("module") as { createRequire: (url: string) => NodeRequire };
      const localRequire = cr(__filename);
      const pkgPath = localRequire.resolve("@playwright/mcp/package.json");
      const pathMod = await dynamicImport("path") as { dirname: (p: string) => string; join: (...args: string[]) => string };
      const localBin = pathMod.join(pathMod.dirname(pkgPath), "cli.js");
      mcpCommand = "node";
      mcpArgs = [localBin];
    } catch {
      // Fallback to npx if local package not installed
    }

    if (options.outputDir) {
      mcpArgs.push("--output-dir", options.outputDir);
    }
    if (options.mcpArgs) {
      mcpArgs.push(...options.mcpArgs);
    }

    this.transport = new transportMod.StdioClientTransport({
      command: mcpCommand,
      args: mcpArgs,
    });

    this.client = new clientMod.Client({
      name: "specwright-explorer",
      version: "1.0.0",
    });

    await (this.client as McpClientInstance).connect(
      this.transport as McpTransportInstance
    );
    this.onLog?.("[mcp-client] Connected to Playwright MCP server");
  }

  /**
   * Call a Playwright MCP tool directly.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<McpToolResult> {
    if (!this.client) throw new Error("MCP client not connected");
    const result = await (this.client as McpClientInstance).callTool({
      name,
      arguments: args,
    });
    return result as McpToolResult;
  }

  /**
   * Navigate to a URL and return the text result.
   */
  async navigate(url: string): Promise<string> {
    this.onLog?.(`[mcp-client] Navigating to ${url}`);
    const result = await this.callTool("browser_navigate", { url });
    const text = this.extractText(result);
    this.onLog?.(`[mcp-client] Navigation complete`);
    return text;
  }

  /**
   * Take an accessibility snapshot of the current page.
   */
  async snapshot(): Promise<string> {
    this.onLog?.("[mcp-client] Taking page snapshot…");
    const result = await this.callTool("browser_snapshot");
    const text = this.extractText(result);
    this.onLog?.(
      `[mcp-client] Snapshot captured (${text.length} chars)`
    );
    return text;
  }

  /**
   * Take a screenshot and return base64 data.
   */
  async screenshot(): Promise<string | undefined> {
    this.onLog?.("[mcp-client] Taking screenshot…");
    const result = await this.callTool("browser_take_screenshot");
    const imageContent = result.content?.find((c) => c.type === "image");
    if (imageContent?.data) {
      this.onLog?.("[mcp-client] Screenshot captured");
      return imageContent.data;
    }
    // Fall back to text content
    const text = this.extractText(result);
    this.onLog?.("[mcp-client] Screenshot result (text)");
    return text || undefined;
  }

  /**
   * Click an element by ref (from snapshot).
   */
  async click(ref: string): Promise<string> {
    this.onLog?.(`[mcp-client] Clicking element ref=${ref}`);
    const result = await this.callTool("browser_click", { element: ref, ref });
    return this.extractText(result);
  }

  /**
   * Type text into an element.
   */
  async type(ref: string, text: string): Promise<string> {
    this.onLog?.(`[mcp-client] Typing into ref=${ref}`);
    const result = await this.callTool("browser_type", {
      element: ref,
      ref,
      text,
    });
    return this.extractText(result);
  }

  /**
   * Handle a browser dialog (accept/dismiss).
   */
  async handleDialog(accept: boolean = true): Promise<string> {
    this.onLog?.(`[mcp-client] Handling dialog (accept=${accept})`);
    const result = await this.callTool("browser_handle_dialog", { accept });
    return this.extractText(result);
  }

  /**
   * Wait for the page to stabilize after navigation or click.
   * Uses browser_wait_for when available, falls back to a brief delay.
   */
  async waitForPageStable(): Promise<void> {
    try {
      await this.callTool("browser_wait_for", {
        state: "load",
        timeout: 2000,
      });
    } catch {
      // Fallback if browser_wait_for is not supported
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Close the browser.
   */
  async closeBrowser(): Promise<void> {
    try {
      await this.callTool("browser_close");
      this.onLog?.("[mcp-client] Browser closed");
    } catch {
      // ignore — browser may already be closed
    }
  }

  /**
   * Run a full exploration: navigate → snapshot → screenshot.
   * Returns structured results ready to inject into Claude's context.
   */
  async explore(
    url: string,
    navRefs?: string[],
    onProgress?: (step: string) => void,
  ): Promise<ExplorationResult> {
    const result: ExplorationResult = {
      url,
      title: "",
      snapshot: "",
      summary: "",
      discoveredElements: [],
      pageSnapshots: [],
    };

    try {
      // Step 1: Navigate
      onProgress?.(`🌐 Navigating to ${url}...`);
      const navResult = await this.navigate(url);
      // Extract clean page title from raw MCP output (contains "Page Title: ..." line)
      const titleMatch = navResult.match(/Page Title:\s*(.+)/);
      result.title = titleMatch?.[1]?.trim() || url;
      onProgress?.(`📄 Page loaded: ${result.title}`);

      // Step 2: Snapshot the landing page (must be sequential — MCP server
      // can't handle concurrent tool calls on the same connection)
      onProgress?.("🔍 Scanning page elements...");
      result.snapshot = await this.snapshot();

      // Step 2b: Build summary from the accessibility tree returned by browser_snapshot.
      const { groups, summary } = PlaywrightMcpClient.summarizeAccessibilityTree(result.snapshot);
      result.discoveredElements = groups;
      result.summary = summary;
      this.onLog?.(`[mcp-client] Summary: ${groups.length} element groups discovered`);
      onProgress?.(`✅ ${summary}`);

      // Step 3: Screenshot (best-effort, after snapshot completes)
      onProgress?.("📸 Taking screenshot...");
      try {
        result.screenshot = await this.screenshot();
      } catch {
        this.onLog?.("[mcp-client] Screenshot failed (non-fatal)");
      }

      // Step 4: If nav refs provided, click each and snapshot
      if (navRefs && navRefs.length > 0) {
        onProgress?.(`🔗 Exploring ${navRefs.length} additional pages...`);
        for (const ref of navRefs) {
          try {
            await this.click(ref);
            // Wait for page to stabilize after click
            await this.waitForPageStable();
            const pageSnapshot = await this.snapshot();
            result.pageSnapshots.push({
              url: ref,
              snapshot: pageSnapshot,
            });
          } catch (err) {
            this.onLog?.(
              `[mcp-client] Failed to explore ref=${ref}: ${String(err)}`
            );
          }
        }
      }
    } catch (err) {
      result.error = String(err);
      this.onLog?.(`[mcp-client] Exploration error: ${result.error}`);
    }

    return result;
  }

  /**
   * Parse an accessibility snapshot (from browser_snapshot) into element groups and a summary.
   *
   * browser_snapshot returns lines like:
   *   - heading "Top TV Shows" [ref=s4e]
   *   - button "2026" [ref=s12]
   *   - link "Home" [ref=s2]
   *   - textbox "Search..." [ref=s8]
   *
   * We extract role + name directly from these lines. The roles are whatever
   * the Playwright MCP accessibility tree reports — we don't hardcode role names.
   * We group elements by role and build a human-readable summary.
   */
  static summarizeAccessibilityTree(snapshot: string): AccessibilityTreeSummary {
    return summarizeAccessibilityTree(snapshot);
  }

  /**
   * Disconnect from the MCP server and clean up.
   */
  async disconnect(): Promise<void> {
    try {
      await this.closeBrowser();
    } catch {
      /* ignore */
    }
    try {
      await (this.client as McpClientInstance)?.close?.();
    } catch {
      /* ignore */
    }
    try {
      await (this.transport as McpTransportInstance)?.close?.();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
    this.onLog?.("[mcp-client] Disconnected");
  }

  private extractText(result: McpToolResult): string {
    if (!result.content) return "";
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n");
  }
}

// Internal type helpers for the dynamically imported MCP SDK
interface McpClientInstance {
  connect(transport: McpTransportInstance): Promise<void>;
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
  close?(): Promise<void>;
}

interface McpTransportInstance {
  close?(): Promise<void>;
}
