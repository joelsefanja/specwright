export const QUICK_START_TABS = ["Plugin CLI", "Desktop App", "Claude Desktop"] as const;

export type QuickStartTab = typeof QUICK_START_TABS[number];

export type QuickStartVideo = {
  src: string;
  poster: string;
  label: string;
};

export type QuickStartStep = {
  title: string;
  code: string;
  note?: string;
};

const BASE_URL = "https://github.com/SanthoshDhandapani/specwright/releases/download/demo-videos-v1";

export const QUICK_START_VIDEOS: Partial<Record<QuickStartTab, QuickStartVideo>> = {
  "Plugin CLI": {
    src: `${BASE_URL}/Cli_Execution.mp4`,
    poster: `${BASE_URL}/cli-thumb.jpg`,
    label: "See the CLI pipeline run end-to-end",
  },
  "Desktop App": {
    src: `${BASE_URL}/Bootstrapping%2BExploration.mp4`,
    poster: `${BASE_URL}/desktop-thumb.jpg`,
    label: "See the Desktop app bootstrap and explore",
  },
  "Claude Desktop": {
    src: `${BASE_URL}/Claude_Desktop_Favourite_Workflow.mp4`,
    poster: `${BASE_URL}/claude-desktop-thumb.jpg`,
    label: "See the full Favorites workflow run in Claude Desktop",
  },
};

export const QUICK_START_STEPS: Record<QuickStartTab, QuickStartStep[]> = {
  "Plugin CLI": [
    {
      title: "Install the plugin into your project",
      code: "npx @specwright/plugin init",
      note: "Scaffolds e2e-tests/, playwright.config.ts, agents, skills",
    },
    {
      title: "Configure credentials",
      code: `# e2e-tests/.env.testing
AUTH_STRATEGY=email-password
TEST_USER_EMAIL=you@example.com
TEST_USER_PASSWORD=yourpassword`,
    },
    {
      title: "Describe your first test",
      code: `// e2e-tests/instructions.js
export default [
  {
    moduleName: '@LoginPage',
    category: '@Modules',
    fileName: 'login',
    pageURL: 'http://localhost:3000/login',
    instructions: [
      'Verify login form shows email + password fields',
      'Successful login redirects to /dashboard',
    ],
    explore: true,
    runGeneratedCases: false,
  }
]`,
    },
    {
      title: "Run the pipeline",
      code: "/e2e-automate",
      note: "In Claude Code — starts the 10-phase pipeline",
    },
  ],
  "Desktop App": [
    {
      title: "Download Specwright Desktop",
      code: "# Download for Mac (Apple Silicon / Intel) or Windows\n# github.com/SanthoshDhandapani/specwright/releases",
      note: "Electron app — no separate install needed",
    },
    {
      title: "Open your project",
      code: "# Click 'Open Project' → select your project folder\n# App auto-detects plugin installation",
    },
    {
      title: "Configure auth in Settings panel",
      code: "# Auth tab → fill in email/password or OAuth token\n# All saved to e2e-tests/.env.testing",
    },
    {
      title: "Click 'Run Pipeline'",
      code: "# Visual phase-by-phase output\n# Live agent streaming\n# One-click approval at Phase 6",
    },
  ],
  "Claude Desktop": [
    {
      title: "Install the plugin (scaffolds the skill automatically)",
      code: "npx @specwright/plugin init",
      note: "Adds /e2e-desktop-automate skill to .claude/skills/ and wires up @specwright/mcp",
    },
    {
      title: "Add @specwright/mcp to Claude Desktop config",
      code: `# 1. Get your Node.js bin path:
$ dirname $(which node)
# → e.g. /Users/you/.nvm/versions/node/v22.x.x/bin

# 2. Add to ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "specwright": {
      "command": "npx",
      "args": ["@specwright/mcp@latest"],
      "env": {
        "PATH": "/Users/you/.nvm/.../bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
      }
    }
  }
}`,
      note: "Paste the dirname output as the first entry in PATH — Claude Desktop needs it to find npx",
    },
    {
      title: "Open your project folder in Claude Desktop",
      code: `# File → Open Folder → select your project root
# Claude Desktop auto-discovers .claude/skills/e2e-desktop-automate/

# Configure your test target in e2e-tests/instructions.js:
export default [{
  moduleName: '@FavoritesWorkflow',
  category: '@Workflows',
  pageURL: 'https://your-app.vercel.app',
  instructions: ['...'],
}];`,
    },
    {
      title: "Run /e2e-desktop-automate — 10-phase pipeline executes",
      code: `# Type in Claude Desktop chat:
/e2e-desktop-automate

# Phases run automatically:
# Phase 4 — Browser opens, explores your app
# Phase 6 — Pauses for your approval
# Phase 7 — Generates .feature + steps.js
# Phase 8 — Runs tests, auto-heals failures
# Phase 10 — Quality score report`,
      note: "Pause at Phase 6 to review the test plan before files are written",
    },
  ],
};
