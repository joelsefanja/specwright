/**
 * instructions.js — Usage Examples
 *
 * Copy any entry below into instructions.js to generate BDD tests.
 * Run with: /e2e-automate (Claude Code skill)
 *
 * After generation, run:
 *   pnpm bddgen          # regenerate .features-gen/
 *   pnpm test:bdd         # run all BDD tests
 */

export default [
  // ─────────────────────────────────────────────────────────────
  // Example 1: Text instructions — describe what to test
  // ─────────────────────────────────────────────────────────────
  {
    filePath: '',
    moduleName: '@YourModule',
    category: '@Modules',
    subModuleName: [],
    fileName: 'your_feature',
    instructions: [
      'Navigate to the target page (authenticated)',
      'Verify the main content loads correctly',
      'Fill out a form and submit',
      'Verify the result appears',
      'Test with invalid input and verify error messages',
    ],
    pageURL: 'http://localhost:5173/your-page', // Update: your app's URL
    inputs: {},
    explore: true,
    autoApprove: false,       // true = skip Phase 6 approval prompt and generate immediately
    runExploredCases: false,
    runGeneratedCases: false,
  },

  // ─────────────────────────────────────────────────────────────
  // Example 2: Jira-driven test generation
  // ─────────────────────────────────────────────────────────────
  {
    filePath: '',
    moduleName: '@YourModule',
    category: '@Modules',
    subModuleName: [],
    fileName: 'your_feature',
    instructions: [],
    pageURL: 'http://localhost:5173/your-page', // Update: your app's URL
    inputs: {
      jira: {
        url: 'https://your-org.atlassian.net/browse/PROJ-123', // Update: your Jira URL
      },
    },
    explore: true,
    runExploredCases: false,
    runGeneratedCases: false,
  },

  // ─────────────────────────────────────────────────────────────
  // Example 3: CSV file-based test generation
  // ─────────────────────────────────────────────────────────────
  {
    filePath: 'e2e-tests/files/test-cases.csv', // Update: your CSV path
    moduleName: '@YourModule',
    category: '@Modules',
    subModuleName: [],
    fileName: 'your_feature',
    instructions: [],
    pageURL: 'http://localhost:5173/your-page',
    inputs: {},
    explore: false,
    runExploredCases: false,
    runGeneratedCases: true,
  },

  // ─────────────────────────────────────────────────────────────
  // Example 4: Cross-module workflow
  // ─────────────────────────────────────────────────────────────
  {
    filePath: '',
    moduleName: '@YourWorkflow',
    category: '@Workflows',
    subModuleName: ['@Step1', '@Step2'],
    fileName: 'workflow_name',
    instructions: [
      'Precondition: Create required data',
      'Step 1: Process the created data',
      'Step 2: Verify the result',
    ],
    pageURL: 'http://localhost:5173/your-page',
    inputs: {},
    explore: true,
    runExploredCases: false,
    runGeneratedCases: false,
  },
];

/**
 * Field Reference:
 *
 * filePath      — Source file (CSV, Excel, PDF, JSON). Leave "" for instruction/Jira-based.
 * moduleName    — Target module directory name (e.g., "@Dashboard", "@Settings").
 * category      — "@Modules" (default) or "@Workflows".
 * subModuleName — Array of nested subdirectories.
 * fileName      — Output filename stem (e.g., "dashboard" → dashboard.feature + steps.js).
 * instructions  — Free-text test descriptions.
 * pageURL       — App URL for exploration. Required when explore: true.
 * inputs.jira.url — Jira ticket URL for requirements extraction.
 * explore       — Enable live browser exploration for selector discovery.
 * autoApprove   — Skip the Phase 6 user approval prompt and proceed to BDD generation
 *                 automatically. Useful for CI or trusted runs. Default: false.
 * runExploredCases  — Run explored seed tests before BDD generation (Phase 5).
 * runGeneratedCases — Run generated BDD tests after creation (Phase 8).
 */
