#!/usr/bin/env node

const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith('--'));
const flags = args.filter(a => a.startsWith('--'));

// Extract target dir: first non-flag arg after 'init', or cwd
const initIndex = args.indexOf('init');
const targetDir = args.find((a, i) => i > initIndex && !a.startsWith('--')) || process.cwd();

// Check if running in non-interactive mode (desktop app or CI)
const nonInteractive = flags.includes('--non-interactive') || !process.stdin.isTTY;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellEnvAssignment(key, value) {
  return value ? `${key}=${shellQuote(value)}` : '';
}

function toBashPath(filePath) {
  if (process.platform !== 'win32') return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const drivePath = normalized.match(/^([A-Za-z]):\/(.*)$/);

  try {
    const uname = execFileSync('bash', ['-lc', 'uname -r'], { encoding: 'utf-8' }).toLowerCase();
    if (drivePath && uname.includes('microsoft')) {
      return `/mnt/${drivePath[1].toLowerCase()}/${drivePath[2]}`;
    }
  } catch {
    return normalized;
  }

  try {
    const converted = execSync(
      `bash -lc "if command -v wslpath >/dev/null 2>&1; then wslpath -a ${shellQuote(filePath)}; else printf '%s' ${shellQuote(normalized)}; fi"`,
      { encoding: 'utf-8' }
    ).trim();
    return converted || normalized;
  } catch {
    return normalized;
  }
}

function ask(question, defaultValue) {
  if (nonInteractive) return Promise.resolve(defaultValue || '');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || '');
    });
  });
}

async function runInit() {
  const installScript = path.join(__dirname, 'install.sh');

  if (!fs.existsSync(installScript)) {
    console.error('Error: install.sh not found in plugin package.');
    process.exit(1);
  }

  console.log(`\n  Specwright E2E Plugin Installer\n`);
  console.log(`  Target: ${targetDir}\n`);

  const installFlags = [...flags.filter(f => f !== '--non-interactive')];
  const installEnv = { ...process.env };
  installEnv.SPECWRIGHT_NODE_BIN = toBashPath(process.execPath);

  // ── Base URL ──
  if (!flags.includes('--base-url') && !nonInteractive) {
    const baseUrl = await ask('  Base URL of your application', 'http://localhost:3000');
    if (baseUrl) {
      installEnv.SPECWRIGHT_BASE_URL = baseUrl;
      console.log(`  → Base URL: ${baseUrl}\n`);
    }
  } else {
    const baseUrlFlag = flags.find(f => f.startsWith('--base-url='));
    if (baseUrlFlag) {
      installEnv.SPECWRIGHT_BASE_URL = baseUrlFlag.split('=')[1];
    }
  }

  // ── Auth strategy ──
  const authStrategyFlag = flags.find(f => f.startsWith('--auth-strategy='));
  if (authStrategyFlag) {
    installEnv.SPECWRIGHT_AUTH_STRATEGY = authStrategyFlag.split('=')[1];
  } else if (!nonInteractive) {
    console.log('  Auth strategies:');
    console.log('    1. email-password — two-step login (email → password → optional 2FA)');
    console.log('    2. oauth     — click-based OAuth or mock sign-in button');
    console.log('    3. none           — no authentication required\n');
    const answer = await ask('  Auth strategy (1/2/3)', '1');
    const strategyMap = { '1': 'email-password', '2': 'oauth', '3': 'none' };
    const strategy = strategyMap[answer] || answer;
    installEnv.SPECWRIGHT_AUTH_STRATEGY = strategy;
    console.log(`  → Auth strategy: ${strategy}\n`);
    if (strategy === 'none') {
      installFlags.push('--skip-auth');
    }
  }

  // ── Auth module (skip if strategy is 'none' or 'oauth') ──
  if (installEnv.SPECWRIGHT_AUTH_STRATEGY === 'none') {
    installFlags.push('--skip-auth');
    console.log('  → Skipping authentication module (strategy: none)\n');
  } else if (installEnv.SPECWRIGHT_AUTH_STRATEGY === 'oauth') {
    installFlags.push('--skip-auth');
    console.log('  → Skipping authentication module (OAuth apps have no login form to test)\n');
  } else if (!flags.includes('--skip-auth') && !flags.includes('--with-auth')) {
    if (nonInteractive) {
      console.log('  → Including authentication module (default)\n');
    } else {
      const answer = await ask('  Include authentication test module? (Y/n)', 'Y');
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        installFlags.push('--skip-auth');
        console.log('  → Skipping authentication module\n');
      } else {
        console.log('  → Including authentication module\n');
      }
    }
  }

  // ── Package manager ──
  if (!flags.includes('--pm') && !nonInteractive) {
    const detected = detectPackageManager(targetDir);
    const pm = await ask('  Package manager', detected);
    if (pm && ['pnpm', 'npm', 'yarn'].includes(pm.toLowerCase())) {
      installEnv.SPECWRIGHT_PM = pm.toLowerCase();
      console.log(`  → Package manager: ${pm.toLowerCase()}\n`);
    }
  } else {
    const pmFlag = flags.find(f => f.startsWith('--pm='));
    if (pmFlag) {
      installEnv.SPECWRIGHT_PM = pmFlag.split('=')[1];
    }
  }

  // In non-interactive mode (Desktop app, CI) the caller manages dependency install.
  // Pass --skip-install so install.sh skips the pnpm/npm/yarn install step.
  if (nonInteractive && !installFlags.includes('--skip-install')) {
    installFlags.push('--skip-install');
  }

  try {
    const flagStr = installFlags
      .filter(f => !f.startsWith('--base-url=') && !f.startsWith('--pm='))
      .join(' ');
    const command = [
      shellEnvAssignment('SPECWRIGHT_NODE_BIN', installEnv.SPECWRIGHT_NODE_BIN),
      shellEnvAssignment('SPECWRIGHT_BASE_URL', installEnv.SPECWRIGHT_BASE_URL),
      shellEnvAssignment('SPECWRIGHT_AUTH_STRATEGY', installEnv.SPECWRIGHT_AUTH_STRATEGY),
      shellEnvAssignment('SPECWRIGHT_PM', installEnv.SPECWRIGHT_PM),
      'bash',
      shellQuote(toBashPath(installScript)),
      shellQuote(toBashPath(path.resolve(targetDir))),
      flagStr,
    ].filter(Boolean).join(' ');
    execFileSync('bash', ['-lc', command], {
      stdio: 'inherit',
      env: installEnv,
    });
  } catch (err) {
    console.error('Installation failed:', err.message);
    process.exit(1);
  }

  // Write .specwright.json — required by MCP server set_project and Desktop app detectPlugin.
  // Only plugin identity is written here; authStrategy lives in .env.testing.
  const spwJsonPath = path.join(path.resolve(targetDir), '.specwright.json');
  if (!fs.existsSync(spwJsonPath)) {
    fs.writeFileSync(spwJsonPath, JSON.stringify({ plugin: '@specwright/plugin' }, null, 2) + '\n', 'utf-8');
    console.log('  ✓ Created .specwright.json\n');
  }
}

/** Detect which package manager the project uses */
function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  // Check parent dirs (monorepo)
  let current = dir;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    if (fs.existsSync(path.join(parent, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(parent, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(parent, 'package-lock.json'))) return 'npm';
    current = parent;
  }
  return 'pnpm';
}

function runUpdate() {
  const installScript = path.join(__dirname, 'install.sh');
  if (!fs.existsSync(installScript)) {
    console.error('Error: install.sh not found in plugin package.');
    process.exit(1);
  }

  const updateIndex = args.indexOf('update');
  const target = args.find((a, i) => i > updateIndex && !a.startsWith('--')) || process.cwd();
  const resolved = path.resolve(target);

  if (!fs.existsSync(path.join(resolved, 'e2e-tests/playwright/fixtures.js'))) {
    console.error('Error: @specwright/plugin not installed in this project. Run init first.');
    process.exit(1);
  }

  console.log(`\n  Specwright E2E Plugin — Updating framework files\n`);
  console.log(`  Target: ${resolved}\n`);
  console.log('  ℹ  User-customized files (authenticationData.js, .env.testing, instructions.js) are preserved.\n');

  try {
    const command = [
      shellEnvAssignment('SPECWRIGHT_NODE_BIN', toBashPath(process.execPath)),
      'bash',
      shellQuote(toBashPath(installScript)),
      shellQuote(toBashPath(resolved)),
      '--skip-auth --skip-install',
    ].join(' ');
    execFileSync('bash', ['-lc', command], {
      stdio: 'inherit',
      env: { ...process.env, SPECWRIGHT_NODE_BIN: toBashPath(process.execPath) },
    });
    console.log('\n  ✅ Base plugin updated.\n');
  } catch {
    process.exit(1);
  }

  const spwJsonPath = path.join(resolved, '.specwright.json');
  if (!fs.existsSync(spwJsonPath)) {
    fs.writeFileSync(spwJsonPath, JSON.stringify({ plugin: '@specwright/plugin' }, null, 2) + '\n', 'utf-8');
    console.log('  ✓ Created .specwright.json\n');
  }
}

if (command === 'init') {
  runInit();
} else if (command === 'update') {
  runUpdate();
} else {
  console.log(`
  @specwright/plugin — AI-powered E2E test automation

  Usage:
    npx @specwright/plugin init [target-dir] [options]
    npx @specwright/plugin update [target-dir]

  Commands:
    init    Install the plugin into a project (interactive)
    update  Update framework files to the latest version
            (preserves authenticationData.js, .env.testing, instructions.js)

  Init options:
    --skip-auth           Skip authentication test module
    --with-auth           Include authentication module (default, no prompt)
    --base-url=URL        Set base URL (e.g., --base-url=http://localhost:3000)
    --pm=MANAGER          Set package manager: pnpm, npm, or yarn
    --non-interactive     Skip all prompts, use defaults (for CI/desktop app)

  More info: https://github.com/SanthoshDhandapani/specwright
  `);
}
