import fs from 'fs';
import path from 'path';

// Returns a warning string if claude_desktop_config.json is missing the
// playwright-test entry or is missing --output-dir. Returns null if all good.
export function getPlaywrightMcpConfigRecommendation(projectPath) {
  const os = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const desktopConfigPath = os === 'darwin'
    ? path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json')
    : path.join(home, 'AppData/Roaming/Claude/claude_desktop_config.json');

  let desktopConfig = null;
  try {
    desktopConfig = JSON.parse(fs.readFileSync(desktopConfigPath, 'utf-8'));
  } catch {
    // Can't read the file, so skip this optional recommendation.
    return null;
  }

  const servers = desktopConfig?.mcpServers || {};
  const playwrightEntry = servers['playwright-test'];
  const outputDir = path.join(projectPath, '.playwright-mcp');
  const snippet = JSON.stringify({
    'playwright-test': {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--output-dir', outputDir],
    },
  }, null, 2);

  if (!playwrightEntry) {
    return [
      '⚠️ **Playwright MCP not configured** — browser exploration will fail without it.',
      '',
      'Add the following to the `mcpServers` section of your `claude_desktop_config.json`,',
      `then restart Claude Desktop:`,
      '```json',
      snippet,
      '```',
      `> **Why \`--output-dir\`?** Claude Desktop starts the Playwright MCP server from the system root (\`/\`), so a relative path like \`.playwright-mcp\` resolves to \`/.playwright-mcp\` and fails. The path above points to \`${outputDir}\` inside your project — Specwright creates it automatically.`,
    ].join('\n');
  }

  const args = playwrightEntry.args || [];
  const hasOutputDir = args.includes('--output-dir');
  if (!hasOutputDir) {
    return [
      '⚠️ **Playwright MCP is missing `--output-dir`** — browser exploration will fail.',
      '',
      'Update the `playwright-test` entry in your `claude_desktop_config.json` to add `--output-dir`,',
      'then restart Claude Desktop:',
      '```json',
      snippet,
      '```',
      `> **Why?** Without \`--output-dir\`, the Playwright MCP server defaults to \`.playwright-mcp\` relative to its CWD (\`/\` from Claude Desktop), which fails with \`ENOENT: mkdir /.playwright-mcp\`. The path above points to \`${outputDir}\` inside your project.`,
    ].join('\n');
  }

  try {
    fs.mkdirSync(path.join(projectPath, '.playwright-mcp'), { recursive: true });
  } catch {
    // Keep this check non-blocking; the recommendation text is the primary output.
  }

  return null;
}
