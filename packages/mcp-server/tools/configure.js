import fs from 'fs';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { getPlaywrightMcpConfigRecommendation } from '../utils/playwrightMcpConfigRecommendation.js';

export const definition = {
  name: 'e2e_configure',
  annotations: { title: 'E2E Configure' },
  description:
    'Read, list, add, or initialize E2E test configuration. Use action "init" to get setup info and base URL. Supports env vars E2E_BASE_URL and E2E_PROJECT_ROOT from MCP server config.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'list', 'add', 'init', 'set_project'],
        description:
          'init: get setup info + base URL + existing modules. read: show instructions.js. list: show test modules. add: append config entry. set_project: register project path for this session by reading .specwright.json — use when SPECWRIGHT_PROJECT env var is not set.',
      },
      projectPath: {
        type: 'string',
        description: 'Absolute path to the project root — only used with action=set_project.',
      },
      config: {
        type: 'object',
        description: 'Config entry to add (only for action=add). Must include moduleName and pageURL.',
        properties: {
          moduleName:         { type: 'string' },
          category:           { type: 'string' },
          subModuleName:      { type: 'array', items: { type: 'string' } },
          fileName:           { type: 'string' },
          instructions:       { type: 'array', items: { type: 'string' } },
          pageURL:            { type: 'string' },
          filePath:           { type: 'string', description: 'Path to a spec file (PDF, Word, Excel, CSV, text)' },
          inputs:             { type: 'object', description: 'Structured inputs e.g. { "jira": { "url": "..." } }' },
          explore:            { type: 'boolean' },
          runExploredCases:   { type: 'boolean' },
          runGeneratedCases:  { type: 'boolean' },
        },
      },
    },
    required: ['action'],
  },
};

export async function handler({ action, config: configInput, projectPath }) {
  const config = getConfig();

  if (action === 'set_project') {
    return handleSetProject(projectPath);
  }

  if (action === 'init') {
    return handleInit(config);
  }

  if (action === 'read') {
    if (!fs.existsSync(config.instructionsPath)) {
      return { content: [{ type: 'text', text: 'No instructions.js found.' }] };
    }
    const content = fs.readFileSync(config.instructionsPath, 'utf-8');
    return { content: [{ type: 'text', text: `## Current instructions.js\n\n\`\`\`javascript\n${content}\n\`\`\`` }] };
  }

  if (action === 'list') {
    return handleList(config);
  }

  if (action === 'add') {
    return handleAdd(config, configInput);
  }

  return { content: [{ type: 'text', text: `Unknown action: ${action}` }] };
}

function handleSetProject(projectPath) {
  if (!projectPath) {
    return { content: [{ type: 'text', text: 'Error: projectPath is required for action=set_project.' }] };
  }

  const spwJsonPath = path.join(projectPath, '.specwright.json');
  if (!fs.existsSync(spwJsonPath)) {
    return {
      content: [{
        type: 'text',
        text: [
          `⚠️ No .specwright.json found at \`${projectPath}\`.`,
          '',
          'Run this in your project root to initialise Specwright:',
          '```',
          `cd ${projectPath}`,
          'npx @specwright/plugin init',
          '```',
          'Then call `e2e_configure` with `action: "set_project"` again.',
        ].join('\n'),
      }],
    };
  }

  // Set for this MCP server session only — no global file written.
  // For permanent configuration, set SPECWRIGHT_PROJECT in claude_desktop_config.json env.
  process.env.SPECWRIGHT_PROJECT = projectPath;

  const spwJson = JSON.parse(fs.readFileSync(spwJsonPath, 'utf-8'));

  // Check whether the project already has config entries in instructions.js.
  // If it does — SKIP the setup questionnaire entirely and tell Claude to proceed.
  const instructionsPath = path.join(projectPath, 'e2e-tests/instructions.js');
  let hasExistingEntries = false;
  if (fs.existsSync(instructionsPath)) {
    try {
      const content = fs.readFileSync(instructionsPath, 'utf-8');
      // Simple heuristic: at least one `moduleName` key in the file
      // Matches both quoted (`"moduleName":`) and unquoted (`moduleName:`) formats
      hasExistingEntries = /["']?moduleName["']?\s*:/.test(content);
    } catch {
      hasExistingEntries = false;
    }
  }

  // ── Check Playwright MCP config ──────────────────────────────────────────
  const playwrightWarning = getPlaywrightMcpConfigRecommendation(projectPath);

  const header = [
    `✅ Project set for this session: \`${projectPath}\``,
    '',
    `**Plugin:** ${spwJson.plugin || '(base)'}${spwJson.overlay ? ` + overlay: ${spwJson.overlay}` : ''}`,
    `**Auth strategy:** ${spwJson.authStrategy || 'not specified'}`,
    '',
    'To make this permanent, add to your Claude Desktop config:',
    '```json',
    `"env": { "SPECWRIGHT_PROJECT": "${projectPath}" }`,
    '```',
    '',
    ...(playwrightWarning ? [playwrightWarning, ''] : []),
  ].join('\n');

  // ── Path A: instructions.js already has entries — skip setup, go to pipeline ──
  if (hasExistingEntries) {
    return {
      content: [{
        type: 'text',
        text: [
          header,
          '---',
          '',
          '📂 **Existing config detected** — `instructions.js` already has test module entries.',
          '',
          '⛔ **Do NOT ask any setup questions. Do NOT call `e2e_setup`.**',
          '',
          '### NEXT_ACTION: CALL_E2E_AUTOMATE',
          '',
          'Immediately call `mcp__specwright__e2e_automate({})` to load the existing plan and proceed with the pipeline (exploration → approval → generation → execution).',
        ].join('\n'),
      }],
    };
  }

  // ── Path B: instructions.js is empty or missing — ask the 8 questions ──
  return {
    content: [{
      type: 'text',
      text: [
        header,
        '---',
        '',
        '## ⛔ PRESENT THIS ENTIRE QUESTIONNAIRE TO THE USER IN A SINGLE MESSAGE',
        '',
        '**CRITICAL INSTRUCTIONS — read carefully before responding to the user:**',
        '- Copy the **entire numbered list below** into your next message to the user, verbatim',
        '- Do NOT ask questions one at a time',
        '- Do NOT say "Question 1" and wait for the answer before showing Question 2',
        '- Do NOT reword, summarise, or split the questions',
        '- The user will read ALL 8 questions and reply with ALL answers in one message',
        '',
        '---',
        '',
        '📋 **Configure your test module** — please answer all 8 questions in one reply:',
        '',
        '1. **What do you want to test?** — paste a Jira ticket URL, describe the feature in plain text, or give a file path to a spec document',
        '2. **Module name** — a short tag starting with @ to group these tests (e.g. @LoginPage, @SearchPage, @CheckoutFlow)',
        '3. **Page URL** — the full URL Claude will navigate to, including port (e.g. http://localhost:5173/your-page)',
        '4. **Test category** — type @Modules for standalone feature tests, or @Workflows for multi-step flows with shared data between phases',
        '5. **Sub-modules** — optional, for modules with sub-sections. @Workflows use numbered prefixes (e.g. @0-Precondition,@1-VerifyInList). @Modules can use plain names (e.g. @CreateUser,@VerifyInList). Leave blank for a single-level module.',
        '6. **Explore in browser?** — yes to open a live browser and discover real selectors via Playwright, no to generate from description only',
        '7. **Validate explored selectors?** — (only if explore=yes) yes to run seed.spec.js and confirm selectors work before generation, no to skip validation',
        '8. **Run tests after generation?** — yes to execute generated BDD tests and auto-heal failures, no to only generate files',
        '',
        '---',
        '',
        '**After the user answers all 8 questions**, call `e2e_configure` with `action: "add"` to write the config to `instructions.js`, then call `e2e_automate` to proceed with the pipeline.',
      ].join('\n'),
    }],
  };
}

function handleInit(config) {
  const hasInstructions = fs.existsSync(config.instructionsPath);
  const { modules, workflows } = scanModules(config);

  let instructionsSummary = '(no instructions.js found)';
  if (hasInstructions) {
    const content = fs.readFileSync(config.instructionsPath, 'utf-8');
    const entryCount = (content.match(/moduleName/g) || []).length;
    instructionsSummary = `${entryCount} config ${entryCount === 1 ? 'entry' : 'entries'} configured`;
  }

  // Check seed file and plans
  const hasSeed = fs.existsSync(config.seedFilePath);
  const planFiles = fs.existsSync(config.plansDir)
    ? fs.readdirSync(config.plansDir).filter((f) => f.endsWith('-plan.md'))
    : [];

  const text = [
    `## E2E Automation Setup`,
    ``,
    `**Base URL:** ${config.baseURL}${process.env.BASE_URL ? ' (from env)' : ' (default)'}`,
    `**Project Root:** ${config.projectRoot}`,
    `**Auth Required:** ${config.authRequired ? 'Yes' : 'No (public site)'}`,
    config.authRequired
      ? config.authData
        ? `**Auth Data:** ${Object.keys(config.authData)
            .filter((k) => k !== 'instructions')
            .join(', ')} configured`
        : `**Auth Data:** Not set — set AUTH_DATA in MCP env (JSON with email, password, etc.)`
      : '',
    `**Instructions:** ${instructionsSummary}`,
    `**Seed File:** ${hasSeed ? 'exists' : 'not yet created'}`,
    `**Plans:** ${planFiles.length > 0 ? planFiles.join(', ') : 'none'}`,
    ``,
    `### Existing Modules (${modules.length})`,
    modules.length > 0 ? modules.join('\n') : '(none)',
    ``,
    `### Existing Workflows (${workflows.length})`,
    workflows.length > 0 ? workflows.join('\n') : '(none)',
    ``,
    `### To Create Tests`,
    ``,
    ...buildMissingInfoPrompt(config),
  ].join('\n');

  return { content: [{ type: 'text', text }] };
}

function handleList(config) {
  const { modules, workflows } = scanModules(config);

  const text = [
    `## Existing Test Modules`,
    ``,
    `### @Modules/ (${modules.length})`,
    modules.length > 0 ? modules.join('\n') : '(none)',
    ``,
    `### @Workflows/ (${workflows.length})`,
    workflows.length > 0 ? workflows.join('\n') : '(none)',
  ].join('\n');

  return { content: [{ type: 'text', text }] };
}

function handleAdd(config, configInput) {
  if (!configInput || !configInput.moduleName) {
    return {
      content: [
        {
          type: 'text',
          text: [
            'Error: config must include at least moduleName.',
            '',
            'If the user did not provide a page URL, ask them for it.',
            '',
            '### NEXT_ACTION: ASK_USER',
            'Ask for the page URL and test instructions.',
          ].join('\n'),
        },
      ],
    };
  }

  // Resolve pageURL — use provided URL or construct from base URL
  let pageURL = configInput.pageURL;
  if (!pageURL) {
    return {
      content: [
        {
          type: 'text',
          text: [
            `Error: pageURL is required for module ${configInput.moduleName}.`,
            ``,
            `**Base URL:** ${config.baseURL}`,
            `Provide the page path (e.g., /home) or full URL.`,
            ``,
            `### NEXT_ACTION: ASK_USER`,
          ].join('\n'),
        },
      ],
    };
  }

  // If pageURL is a path, prepend base URL
  if (pageURL.startsWith('/')) {
    pageURL = `${config.baseURL}${pageURL}`;
  }

  const entry = {
    filePath:          configInput.filePath          ?? '',
    moduleName:        configInput.moduleName,
    category:          configInput.category          || '@Modules',
    subModuleName:     configInput.subModuleName     || [],
    fileName:          configInput.fileName          || configInput.moduleName.replace('@', '').toLowerCase(),
    instructions:      configInput.instructions      || [],
    pageURL,
    inputs:            configInput.inputs            || {},
    explore:           configInput.explore           ?? true,
    runExploredCases:  configInput.runExploredCases  ?? false,
    runGeneratedCases: configInput.runGeneratedCases ?? false,
  };

  // Read existing, append entry
  let existing = 'export default [];';
  if (fs.existsSync(config.instructionsPath)) {
    existing = fs.readFileSync(config.instructionsPath, 'utf-8');
  }

  const entryStr = JSON.stringify(entry, null, 2);
  const updated = existing.replace(/\];\s*$/, `  ${entryStr},\n];\n`);
  fs.writeFileSync(config.instructionsPath, updated);

  const jiraUrl = entry.inputs?.jira?.url;
  const sources = [
    jiraUrl              ? `Jira: ${jiraUrl}` : null,
    entry.filePath       ? `File: ${entry.filePath}` : null,
    entry.instructions.length > 0 ? `Instructions: ${entry.instructions.length} item(s)` : null,
  ].filter(Boolean);

  return {
    content: [
      {
        type: 'text',
        text: [
          `✅ Config for **${configInput.moduleName}** written to \`instructions.js\`.`,
          ``,
          `**Input sources:** ${sources.length > 0 ? sources.join(' | ') : '(none — auto-explore only)'}`,
          `**Explore:** ${entry.explore ? 'Yes' : 'No'} | **Run after gen:** ${entry.runGeneratedCases ? 'Yes' : 'No'}`,
          ``,
          `Now call \`e2e_automate\` to get the full pipeline plan with input routing.`,
        ].join('\n'),
      },
    ],
  };
}

function scanModules(config) {
  const modules = [];
  const workflows = [];

  const modulesDir = path.join(config.featuresDir, '@Modules');
  const workflowsDir = path.join(config.featuresDir, '@Workflows');

  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        const features = fs.readdirSync(path.join(modulesDir, entry.name)).filter((f) => f.endsWith('.feature'));
        modules.push(`- **${entry.name}** (${features.length} feature${features.length !== 1 ? 's' : ''})`);
      }
    }
  }

  if (fs.existsSync(workflowsDir)) {
    for (const entry of fs.readdirSync(workflowsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        const subDirs = fs.readdirSync(path.join(workflowsDir, entry.name)).filter((d) => d.startsWith('@'));
        workflows.push(`- **${entry.name}** (${subDirs.length} sub-feature${subDirs.length !== 1 ? 's' : ''})`);
      }
    }
  }

  return { modules, workflows };
}

function buildMissingInfoPrompt(config) {
  const lines = [];
  const questions = [];
  let questionNum = 1;

  // Check what's missing and build targeted questions
  const hasBaseURL = !!process.env.BASE_URL;
  const hasCredentials = config.authData && config.authData.email && config.authData.password;

  if (!hasBaseURL) {
    questions.push(
      `${questionNum++}. **What is the application URL?** (e.g., http://localhost:5173) — BASE_URL is not configured`,
    );
  }

  if (config.authRequired && !hasCredentials) {
    questions.push(
      `${questionNum++}. **What are the login credentials?** (email and password) — needed for authenticated pages. Set AUTH_DATA in MCP env config, or set AUTH_REQUIRED=false if the site is public.`,
    );
  }

  questions.push(`${questionNum++}. **Which page do you want to test?** (e.g., /home, /users, /bookings)`);
  questions.push(
    `${questionNum++}. **What should be tested?** Describe test scenarios, or say "auto-explore" to discover automatically.`,
  );

  lines.push(`Ask the user the following:\n`);
  lines.push(questions.join('\n'));
  lines.push('');
  lines.push(`### NEXT_ACTION: ASK_USER`);
  lines.push(
    `Collect the missing information above before proceeding. You can derive the module name from the page path (e.g., /home → @HomePage, /users → @Users).`,
  );

  return lines;
}
