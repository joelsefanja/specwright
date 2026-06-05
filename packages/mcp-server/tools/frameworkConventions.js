import fs from 'fs';

export function getFrameworkConventions(config) {
  const lines = [
    `### Framework Conventions (MUST follow when generating code)`,
    ``,
    `#### Directory Structure`,
    `- \`@Modules/\` — single-page tests (e.g., @Modules/@HomePage/)`,
    `- \`@Workflows/\` — cross-page tests with precondition/consumer pattern`,
    `- \`shared/\` — globally scoped steps (no @ prefix). Reusable across all modules.`,
    `- Steps needed by ONE module → co-locate as \`steps.js\` next to the \`.feature\` file`,
    `- Steps needed by MULTIPLE modules → place in \`shared/\``,
    ``,
    `#### Workflow Naming (numbered prefixes for execution order)`,
    `- Precondition: \`@0-PreconditionName/\` (runs first, tagged \`@precondition @cross-feature-data @serial-execution\`)`,
    `- Consumer 1: \`@1-ConsumerName/\` (tagged \`@workflow-consumer\`, NO @serial-execution)`,
    `- Consumer 2: \`@2-ConsumerName/\` (tagged \`@workflow-consumer\`)`,
    `- The numbered prefix ensures filesystem ordering within serial execution`,
    ``,
    `#### Data Table Pattern (3-column Gherkin tables)`,
    `All form fills and assertions use 3-column data tables:`,
    '```gherkin',
    `| Field Name | Value           | Type            |`,
    `| Name       | <gen_test_data> | SharedGenerated |`,
    `| Email      | <gen_test_data> | SharedGenerated |`,
    '```',
    `- \`<gen_test_data>\` — generates a faker value and caches it (use in form fill steps)`,
    `- \`<from_test_data>\` — reads the previously cached value (use in assertion steps)`,
    `- \`Static\` type — use a known value as-is`,
    `- \`SharedGenerated\` type — value is shared across scenarios via cache`,
    ``,
    `#### Test Data Generation (faker)`,
    `- ALWAYS use \`@faker-js/faker\` via \`processDataTable\` — NEVER use \`Date.now()\` or manual timestamps`,
    `- Import: \`import { processDataTable, validateExpectations, FIELD_TYPES } from '../path/to/utils/stepHelpers.js'\``,
    `- \`processDataTable(page, dataTable, { mapping, fieldConfig })\` fills forms from data tables`,
    `- \`validateExpectations(page, dataTable, { mapping, validationConfig, container })\` asserts displayed values`,
    ``,
    `#### FIELD_TYPES (for fieldConfig)`,
    `- \`FILL\` — plain text input`,
    `- \`DROPDOWN\` — react-select dropdown`,
    `- \`CHECKBOX_TOGGLE\` — checkbox by label`,
    `- \`CLICK\` — button/toggle via click`,
    `- \`CUSTOM\` — use fieldHandlers for unique interactions`,
    ``,
    `#### Validation Types (for validationConfig)`,
    `- \`TEXT_VISIBLE\` — assert text is visible by testID`,
    `- \`INPUT_VALUE\` — assert input .value`,
    ``,
    `#### Cross-Feature Data Sharing`,
    `- Precondition saves: \`saveScopedTestData('scopename', { key: value })\``,
    `- Consumer loads: \`Given I load predata from "scopename"\` (shared step in shared/common.steps.js)`,
    `- Scope name = lowercase workflow name (e.g., "userworkflow", "bookingworkflow")`,
    `- Also hydrate in-memory cache: \`globalThis.__rt_featureDataCache[scope] = data\``,
    `- DO NOT redefine "I load predata from {string}" in consumer steps — it's in shared/common.steps.js`,
    ``,
    `#### Import Pattern`,
    `Always import from fixtures, never from playwright-bdd directly:`,
    '```javascript',
    `import { Given, When, Then, expect } from '../path/to/playwright/fixtures.js';`,
    `import { saveScopedTestData } from '../path/to/playwright/fixtures.js';`,
    '```',
    ``,
    `#### Shared Steps Already Available (DO NOT redefine)`,
  ];

  const sharedStepsSection = getSharedStepsSection(config.featuresDir);
  lines.push(...sharedStepsSection);

  lines.push(
    `#### Tags Reference`,
    `| Tag | Purpose | Project |`,
    `|-----|---------|---------|`,
    `| \`@precondition\` | Workflow setup, runs first | precondition (1 worker) |`,
    `| \`@workflow-consumer\` | Consumes predata, runs after preconditions | workflow-consumers (parallel) |`,
    `| \`@cross-feature-data\` | Feature shares data across features | precondition project |`,
    `| \`@serial-execution\` | Non-workflow serial tests | serial-execution (1 worker) |`,
    `| \`@modulename\` | Module tag (lowercase, e.g., @homepage) | All features |`,
    `| No execution tag | Default parallel | main-e2e |`,
  );

  return lines;
}

function getSharedStepsSection(featuresDir) {
  const lines = [];
  const sharedDir = `${featuresDir}/shared`;

  if (!fs.existsSync(sharedDir)) {
    return lines;
  }

  const sharedFiles = fs.readdirSync(sharedDir).filter((fileName) => fileName.endsWith('.js'));

  for (const sharedFile of sharedFiles) {
    try {
      const content = fs.readFileSync(`${sharedDir}/${sharedFile}`, 'utf-8');
      const stepMatches = content.match(/(Given|When|Then)\(['"]([^'"]+)['"]/g);

      if (!stepMatches) {
        continue;
      }

      lines.push(`**${sharedFile}:**`);

      for (const stepMatch of stepMatches) {
        const stepText = stepMatch.match(/(Given|When|Then)\(['"]([^'"]+)['"]/);

        if (stepText) {
          lines.push(`- \`${stepText[1]} ${stepText[2]}\``);
        }
      }

      lines.push('');
    } catch {
      // Shared step discovery is optional; unreadable files should not block automation.
    }
  }

  return lines;
}
