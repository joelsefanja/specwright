#!/bin/bash
# E2E Automation Plugin — Installation Script
# Run from your project root: bash path/to/e2e-plugin/install.sh
# Options:
#   --skip-auth    Skip installing authentication test module

set -e

NODE_BIN="${SPECWRIGHT_NODE_BIN:-node}"
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  for candidate in "node.exe" "/mnt/c/nvm4w/nodejs/node.exe" "/mnt/c/Program Files/nodejs/node.exe" "/mnt/c/Program Files (x86)/nodejs/node.exe"; do
    if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR=""
SKIP_AUTH=false
SKIP_INSTALL=false

# Parse arguments — first non-flag argument is the target directory
for arg in "$@"; do
  case $arg in
    --skip-auth)    SKIP_AUTH=true ;;
    --skip-install) SKIP_INSTALL=true ;;
    -*) ;; # skip unknown flags
    *) [ -z "$TARGET_DIR" ] && TARGET_DIR="$arg" ;;
  esac
done

# Default to current directory if no target specified
TARGET_DIR="${TARGET_DIR:-$(pwd)}"

# Read config from environment (set by cli.js interactive prompts)
BASE_URL="${SPECWRIGHT_BASE_URL:-http://localhost:5173}"
AUTH_STRATEGY="${SPECWRIGHT_AUTH_STRATEGY:-email-password}"

# Detect package manager from target project lockfile (env override takes precedence)
detect_pm() {
  local dir="$1"
  if [ -f "$dir/pnpm-lock.yaml" ]; then echo "pnpm"
  elif [ -f "$dir/yarn.lock" ]; then echo "yarn"
  elif [ -f "$dir/package-lock.json" ]; then echo "npm"
  else echo "pnpm" # fallback
  fi
}
PM="${SPECWRIGHT_PM:-$(detect_pm "$TARGET_DIR")}"

# Source shared install helpers. Defines safe_copy, force_copy, walk_overrides.
# Overlay install scripts source the same file from <target>/.specwright/
# after this script copies it there (see Step 0 below).
# shellcheck source=./install-helpers.sh
source "$PLUGIN_DIR/install-helpers.sh"

echo "╔══════════════════════════════════════════════╗"
echo "║  Specwright E2E Plugin — Installing           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Source: $PLUGIN_DIR"
echo "Target: $TARGET_DIR"
if [ -n "$SPECWRIGHT_PM" ]; then
  echo "Package manager: $PM (from env)"
else
  echo "Package manager: $PM (auto-detected from lockfile)"
fi
if [ "$SKIP_AUTH" = true ]; then
  echo "Option: --skip-auth (authentication module will NOT be installed)"
fi
echo ""

# ── Step 1: Copy .claude/ directory ──
# Always overwrite agents/skills/rules — these are framework code, not user data
echo "📦 Step 1: Installing .claude/ (agents, skills, rules)..."
mkdir -p "$TARGET_DIR/.claude/agents/playwright"
mkdir -p "$TARGET_DIR/.claude/skills"
mkdir -p "$TARGET_DIR/.claude/rules"
mkdir -p "$TARGET_DIR/.claude/memory"
mkdir -p "$TARGET_DIR/.claude/agent-memory/playwright-test-planner"
mkdir -p "$TARGET_DIR/.claude/agent-memory/playwright-test-healer"
mkdir -p "$TARGET_DIR/.claude/agent-memory/execution-manager"

cp -r "$PLUGIN_DIR/.claude_agents/"* "$TARGET_DIR/.claude/agents/"
cp -r "$PLUGIN_DIR/.claude_skills/"* "$TARGET_DIR/.claude/skills/"
cp -r "$PLUGIN_DIR/.claude_rules/"* "$TARGET_DIR/.claude/rules/"
cp "$PLUGIN_DIR/.claude_README.md" "$TARGET_DIR/.claude/README.md"
# Memory files: only create if missing (preserve learned patterns)
safe_copy "$PLUGIN_DIR/.claude_memory_MEMORY.md" "$TARGET_DIR/.claude/memory/MEMORY.md"
safe_copy "$PLUGIN_DIR/.claude_agent-memory/playwright-test-planner/MEMORY.md" "$TARGET_DIR/.claude/agent-memory/playwright-test-planner/MEMORY.md"
safe_copy "$PLUGIN_DIR/.claude_agent-memory/playwright-test-healer/MEMORY.md" "$TARGET_DIR/.claude/agent-memory/playwright-test-healer/MEMORY.md"
safe_copy "$PLUGIN_DIR/.claude_agent-memory/execution-manager/MEMORY.md" "$TARGET_DIR/.claude/agent-memory/execution-manager/MEMORY.md"
echo "  ✅ .claude/ installed"

# ── Step 2: Copy e2e-tests/ infrastructure ──
echo "📦 Step 2: Installing e2e-tests/ infrastructure..."
mkdir -p "$TARGET_DIR/.specwright"
touch "$TARGET_DIR/.specwright/.gitkeep"
# Ship install-helpers.sh into the target so overlay install scripts can source
# it. Force-copy on every run so the helpers always match the installed base.
force_copy "$PLUGIN_DIR/install-helpers.sh" "$TARGET_DIR/.specwright/install-helpers.sh"
mkdir -p "$TARGET_DIR/e2e-tests/playwright/auth-storage/.auth"
mkdir -p "$TARGET_DIR/e2e-tests/playwright/generated"
mkdir -p "$TARGET_DIR/e2e-tests/playwright/support"
mkdir -p "$TARGET_DIR/e2e-tests/playwright/test-data"
mkdir -p "$TARGET_DIR/e2e-tests/features/playwright-bdd/shared"
mkdir -p "$TARGET_DIR/e2e-tests/utils"
mkdir -p "$TARGET_DIR/e2e-tests/data"
mkdir -p "$TARGET_DIR/e2e-tests/scripts"
mkdir -p "$TARGET_DIR/e2e-tests/.knowledge"
mkdir -p "$TARGET_DIR/e2e-tests/plans"
cp -r "$PLUGIN_DIR/e2e-tests/templates" "$TARGET_DIR/e2e-tests/"

# Framework files: always overwrite (these are the framework, not user code)
cp "$PLUGIN_DIR/e2e-tests/playwright/fixtures.js" "$TARGET_DIR/e2e-tests/playwright/"
cp "$PLUGIN_DIR/e2e-tests/playwright/auth.setup.js" "$TARGET_DIR/e2e-tests/playwright/"
cp "$PLUGIN_DIR/e2e-tests/playwright/global.setup.js" "$TARGET_DIR/e2e-tests/playwright/"
cp "$PLUGIN_DIR/e2e-tests/playwright/global.teardown.js" "$TARGET_DIR/e2e-tests/playwright/"
cp "$PLUGIN_DIR/e2e-tests/playwright/support/allure-attach.js" "$TARGET_DIR/e2e-tests/playwright/support/"
cp "$PLUGIN_DIR/e2e-tests/data/urlConfig.cjs" "$TARGET_DIR/e2e-tests/data/urlConfig.cjs"

# Auth strategy modules
mkdir -p "$TARGET_DIR/e2e-tests/playwright/auth-strategies"
cp "$PLUGIN_DIR/e2e-tests/playwright/auth-strategies/"*.js "$TARGET_DIR/e2e-tests/playwright/auth-strategies/"
cp "$PLUGIN_DIR/e2e-tests/utils/stepHelpers.js" "$TARGET_DIR/e2e-tests/utils/"
cp "$PLUGIN_DIR/e2e-tests/utils/testDataGenerator.js" "$TARGET_DIR/e2e-tests/utils/"
cp "$PLUGIN_DIR/e2e-tests/.knowledge/generate-context.md" "$TARGET_DIR/e2e-tests/.knowledge/"
for f in "$PLUGIN_DIR/e2e-tests/features/playwright-bdd/shared/"*.js; do
  safe_copy "$f" "$TARGET_DIR/e2e-tests/features/playwright-bdd/shared/$(basename "$f")"
done
cp "$PLUGIN_DIR/e2e-tests/scripts/generate-bdd-report.js" "$TARGET_DIR/e2e-tests/scripts/"
cp "$PLUGIN_DIR/e2e-tests/scripts/run-coverage.js" "$TARGET_DIR/e2e-tests/scripts/"
cp "$PLUGIN_DIR/e2e-tests/scripts/extract-generate-context.js" "$TARGET_DIR/e2e-tests/scripts/"
# Coverage reporting scripts (lcov expand → Istanbul HTML with statements/branches)
cp "$PLUGIN_DIR/e2e-tests/scripts/merge-coverage.js" "$TARGET_DIR/e2e-tests/scripts/"
cp "$PLUGIN_DIR/e2e-tests/scripts/coverage-expand.mjs" "$TARGET_DIR/e2e-tests/scripts/"
cp "$PLUGIN_DIR/e2e-tests/scripts/coverage-istanbul.mjs" "$TARGET_DIR/e2e-tests/scripts/"

# Allure report scripts live at the project root to match npm scripts and backoffice clones.
mkdir -p "$TARGET_DIR/scripts"
cp "$PLUGIN_DIR/scripts/open-test-report.js" "$TARGET_DIR/scripts/"
cp "$PLUGIN_DIR/scripts/normalize-allure-results.js" "$TARGET_DIR/scripts/"

# Optional Vitest support. Safe-copy so existing project-specific Vitest workspaces stay untouched.
mkdir -p "$TARGET_DIR/vitest"
safe_copy "$PLUGIN_DIR/vitest/vitest.base.ts" "$TARGET_DIR/vitest/vitest.base.ts"
safe_copy "$PLUGIN_DIR/vitest/README.md" "$TARGET_DIR/vitest/README.md"

# User-configurable files: only create if missing (never overwrite user's config)
safe_copy "$PLUGIN_DIR/e2e-tests/data/authenticationData.js" "$TARGET_DIR/e2e-tests/data/authenticationData.js"
safe_copy "$PLUGIN_DIR/e2e-tests/data/testConfig.js" "$TARGET_DIR/e2e-tests/data/testConfig.js"
safe_copy "$PLUGIN_DIR/e2e-tests/instructions.js" "$TARGET_DIR/e2e-tests/instructions.js"
safe_copy "$PLUGIN_DIR/e2e-tests/instructions.example.js" "$TARGET_DIR/e2e-tests/instructions.example.js"
safe_copy "$PLUGIN_DIR/e2e-tests/.env.testing" "$TARGET_DIR/e2e-tests/.env.testing"
# Ship e2e-tests/package.json with { "type": "module" } so .features-gen
# specs (generated under e2e-tests/) inherit ESM scope on Node ≥22.
# force_copy: the marker is framework-controlled, never user-edited.
force_copy "$PLUGIN_DIR/e2e-tests/package.json" "$TARGET_DIR/e2e-tests/package.json"

# Append any env vars that exist in the plugin template but are missing
# from the user's .env.testing. Idempotent — safe to run on every update.
# Without this, projects installed before a new env var was added (e.g.
# ENABLE_COVERAGE in 0.5.0) never pick up the new keys.
env_file="$TARGET_DIR/e2e-tests/.env.testing"
template_file="$PLUGIN_DIR/e2e-tests/.env.testing"
missing_keys=""
while IFS= read -r line; do
  # Skip comments and blank lines; extract KEY from KEY=VALUE
  case "$line" in
    \#*|"") continue ;;
  esac
  key="${line%%=*}"
  if [ -n "$key" ] && ! grep -q "^${key}=" "$env_file" 2>/dev/null; then
    if [ -z "$missing_keys" ]; then
      echo "" >> "$env_file"
      echo "# Added by Specwright update — new template keys" >> "$env_file"
    fi
    echo "$line" >> "$env_file"
    missing_keys="$missing_keys $key"
  fi
done < "$template_file"
if [ -n "$missing_keys" ]; then
  echo "  ➕ .env.testing extended with new keys:$missing_keys"
fi

# Update BASE_URL in .env.testing with user-provided value (only on fresh install)
if [ "$BASE_URL" != "http://localhost:5173" ]; then
  sed -i.bak "s|^BASE_URL=.*|BASE_URL=$BASE_URL|" "$TARGET_DIR/e2e-tests/.env.testing"
  rm -f "$TARGET_DIR/e2e-tests/.env.testing.bak"
  echo "  → BASE_URL set to $BASE_URL"
fi

# Update AUTH_STRATEGY in .env.testing with user-selected strategy
if [ "$AUTH_STRATEGY" != "email-password" ]; then
  sed -i.bak "s|^AUTH_STRATEGY=.*|AUTH_STRATEGY=$AUTH_STRATEGY|" "$TARGET_DIR/e2e-tests/.env.testing"
  rm -f "$TARGET_DIR/e2e-tests/.env.testing.bak"
  echo "  → AUTH_STRATEGY set to $AUTH_STRATEGY"
fi

# Gitkeep files + directory stubs
touch "$TARGET_DIR/e2e-tests/playwright/auth-storage/.auth/.gitkeep"
touch "$TARGET_DIR/e2e-tests/playwright/generated/.gitkeep"
touch "$TARGET_DIR/e2e-tests/playwright/test-data/.gitkeep"
touch "$TARGET_DIR/e2e-tests/plans/.gitkeep"
mkdir -p "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Modules"
mkdir -p "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Workflows"
touch "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Modules/.gitkeep"
touch "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Workflows/.gitkeep"
mkdir -p "$TARGET_DIR/test-results"
touch "$TARGET_DIR/test-results/.gitkeep"
echo "  ✅ e2e-tests/ infrastructure installed"

# ── Step 3: Install authentication module (unless --skip-auth) ──
if [ "$SKIP_AUTH" = true ]; then
  echo "⏭️  Step 3: Authentication module — SKIPPED (--skip-auth)"
else
  echo "📦 Step 3: Installing authentication test module..."
  mkdir -p "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Modules/@Authentication"
  # safe_copy: never overwrite user-generated or overlay-customised auth module files
  safe_copy "$PLUGIN_DIR/e2e-tests/features/playwright-bdd/@Modules/@Authentication/authentication.feature" \
     "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Modules/@Authentication/authentication.feature"
  safe_copy "$PLUGIN_DIR/e2e-tests/features/playwright-bdd/@Modules/@Authentication/steps.js" \
     "$TARGET_DIR/e2e-tests/features/playwright-bdd/@Modules/@Authentication/steps.js"
  echo "  ✅ @Authentication module installed (7 scenarios)"
fi

# ── Step 4: Copy playwright config ──
echo "📦 Step 4: Installing playwright.config.ts..."
if [ -f "$TARGET_DIR/playwright.config.ts" ]; then
  echo "  ⚠️  playwright.config.ts already exists — backed up to playwright.config.ts.bak"
  cp "$TARGET_DIR/playwright.config.ts" "$TARGET_DIR/playwright.config.ts.bak"
fi
cp "$PLUGIN_DIR/playwright.config.ts" "$TARGET_DIR/"
echo "  ✅ playwright.config.ts installed"

# ── Step 5: Copy documentation ──
echo "📦 Step 5: Installing documentation..."
cp "$PLUGIN_DIR/README-TESTING.md" "$TARGET_DIR/"
echo "  ✅ README-TESTING.md installed"

# ── Step 5b: Merge .mcp.json (MCP server config for Claude Code) ──
echo "📦 Step 5b: Configuring .mcp.json (MCP server config)..."
if [ ! -f "$TARGET_DIR/.mcp.json" ]; then
  cp "$PLUGIN_DIR/mcp.json.template" "$TARGET_DIR/.mcp.json"
  echo "  ✅ .mcp.json created — Claude Code will discover e2e-automation tools"
else
  # Merge: add e2e-automation server if not already present
  "$NODE_BIN" -e "
    const fs = require('fs');
    const path = require('path');
    const fromShellPath = (value) => {
      if (process.platform !== 'win32') return value;
      const match = value.match(/^\/mnt\/([a-z])\/(.*)$/i);
      return match ? match[1].toUpperCase() + ':\\\\' + match[2].replace(/\//g, '\\\\') : value;
    };
    const targetPath = path.join(fromShellPath('$TARGET_DIR'), '.mcp.json');
    const templatePath = path.join(fromShellPath('$PLUGIN_DIR'), 'mcp.json.template');
    try {
      const target = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      target.mcpServers = target.mcpServers || {};
      // Force-update stale entries for core servers (where the template moved to a new package/command).
      // These names are tightly coupled to our agents — must stay in sync.
      const FORCE_UPDATE = new Set(['playwright-test', 'markitdown']);
      for (const [name, config] of Object.entries(template.mcpServers || {})) {
        if (!target.mcpServers[name]) {
          target.mcpServers[name] = config;
          console.log('  ✅ Added MCP server: ' + name);
        } else if (FORCE_UPDATE.has(name) && JSON.stringify(target.mcpServers[name]) !== JSON.stringify(config)) {
          target.mcpServers[name] = config;
          console.log('  🔄 Updated MCP server: ' + name + ' (stale config replaced)');
        } else {
          console.log('  ⏭️  MCP server ' + name + ' already configured — skipping');
        }
      }
      fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n');
    } catch (err) {
      console.log('  ⚠️  Could not merge .mcp.json: ' + err.message);
    }
  "
fi

# ── Step 5c: MCP package verification ──
echo "📦 Step 5c: Checking MCP package dependencies..."

# playwright-test MCP — built into @playwright/test ≥1.59 via `playwright run-test-mcp-server`
echo "  ✅ playwright-test MCP — bundled with @playwright/test ≥1.59.1 (run-test-mcp-server built in)"

# markitdown-mcp — Node package (no Python/uvx required)
echo "  ✅ markitdown-mcp-npx — Node package, installed lazily via 'npx markitdown-mcp-npx' on first use"

# Atlassian MCP — hosted HTTP endpoint, no install required
echo "  ✅ Atlassian MCP — hosted at mcp.atlassian.com (no install required; OAuth managed by client)"

# ── Step 6: Merge dependencies + scripts into package.json ──
echo "📦 Step 6: Merging dependencies and scripts into package.json..."
if [ -f "$TARGET_DIR/package.json" ]; then
  "$NODE_BIN" -e "
    const fs = require('fs');
    const path = require('path');
    const fromShellPath = (value) => {
      if (process.platform !== 'win32') return value;
      const match = value.match(/^\/mnt\/([a-z])\/(.*)$/i);
      return match ? match[1].toUpperCase() + ':\\\\' + match[2].replace(/\//g, '\\\\') : value;
    };

    const targetPkgPath = path.join(fromShellPath('$TARGET_DIR'), 'package.json');
    const snippetPath = path.join(fromShellPath('$PLUGIN_DIR'), 'package.json.snippet');
    const pm = '$PM';

    const pkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf-8'));
    const snippet = JSON.parse(fs.readFileSync(snippetPath, 'utf-8'));

    // Merge devDependencies
    if (snippet.devDependencies) {
      pkg.devDependencies = { ...(pkg.devDependencies || {}), ...snippet.devDependencies };
    }

    // Merge scripts (don't overwrite existing)
    // Replace 'pnpm' with the user's package manager in script values
    if (snippet.scripts) {
      pkg.scripts = pkg.scripts || {};
      for (const [key, val] of Object.entries(snippet.scripts)) {
        if (!pkg.scripts[key]) {
          pkg.scripts[key] = pm === 'pnpm' ? val : val.replace(/pnpm /g, pm + ' ');
        }
      }
    }

    fs.writeFileSync(targetPkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  ✅ package.json updated (devDependencies + scripts merged)');
  "
else
  echo "  ⚠️  No package.json found in target — skipping dependency merge"
  echo "     Manually merge contents of package.json.snippet into your package.json"
fi

# ── Step 7: Append .gitignore entries ──
echo "📦 Step 7: Updating .gitignore..."
if [ -f "$TARGET_DIR/.gitignore" ]; then
  # Only append lines that don't already exist
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    grep -qF "$line" "$TARGET_DIR/.gitignore" 2>/dev/null || echo "$line" >> "$TARGET_DIR/.gitignore"
  done < "$PLUGIN_DIR/.gitignore.snippet"
  echo "  ✅ .gitignore updated"
else
  cp "$PLUGIN_DIR/.gitignore.snippet" "$TARGET_DIR/.gitignore"
  echo "  ✅ .gitignore created"
fi

# ── Step 8: Create migrations/files directory ──
mkdir -p "$TARGET_DIR/e2e-tests/data/migrations/files"
touch "$TARGET_DIR/e2e-tests/data/migrations/files/.gitkeep"

# ── Step 9: Install dependencies ──
if [ "$SKIP_INSTALL" = "true" ]; then
  echo "⏭️  Step 9: Dependency install — SKIPPED (--skip-install, handled by caller)"
else
  echo "📦 Step 9: Installing dependencies ($PM install --ignore-scripts)..."
  (cd "$TARGET_DIR" && "$PM" install --ignore-scripts)
  echo "  ✅ Dependencies installed"
fi

# ── Step 9.5: Ensure Chromium binary matches the installed @playwright/test ──
# Why: each Playwright release pins a different Chromium revision. Without this,
# `pnpm install` updates the JS but the cached browser binary lags, producing:
#   Error: browserType.launch: Executable doesn't exist at .../chromium-XXXX/...
# Always run after install/update so the consumer never has to remember.
if [ "$SKIP_INSTALL" = "true" ]; then
  echo "⏭️  Step 9.5: Browser install — SKIPPED (--skip-install)"
else
  echo "📦 Step 9.5: Ensuring Chromium binary matches @playwright/test version..."
  if (cd "$TARGET_DIR" && "$PM" exec playwright install chromium 2>&1); then
    echo "  ✅ Chromium ready"
  else
    echo "  ⚠️  Browser install failed — run manually: $PM exec playwright install chromium"
  fi
fi

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Installation Complete                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📋 Next steps:"
echo ""
if [ "$SKIP_INSTALL" = "true" ]; then
  echo "  1. Install dependencies:  $PM install"
  echo "  2. Install browsers:      npx playwright install chromium"
  echo "  3. Set credentials in e2e-tests/.env.testing"
  echo "  4. Start your app and run:  /e2e-automate"
else
  echo "  1. Install browsers:  npx playwright install chromium"
  echo "  2. Set credentials in e2e-tests/.env.testing:"
  echo "       TEST_USER_EMAIL=your-email@example.com"
  echo "       TEST_USER_PASSWORD=your-password"
  echo "  3. Start your app and run:  /e2e-automate"
fi
echo ""
