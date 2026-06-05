#!/usr/bin/env node
/**
 * extract-generate-context.js
 *
 * Regenerates e2e-tests/.knowledge/generate-context.md from the project's
 * live utility files (stepHelpers.js + testDataGenerator.js).
 *
 * Run manually after updating those files:
 *   node e2e-tests/scripts/extract-generate-context.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const stepHelpersPath = path.join(rootDir, 'e2e-tests', 'utils', 'stepHelpers.js');
const testDataGenPath = path.join(rootDir, 'e2e-tests', 'utils', 'testDataGenerator.js');
const outputPath = path.join(rootDir, 'e2e-tests', '.knowledge', 'generate-context.md');

// ── 1. Extract FIELD_TYPES from stepHelpers.js ────────────────────────────────

const stepHelpersSource = fs.readFileSync(stepHelpersPath, 'utf-8');

const fieldTypesBlock = stepHelpersSource.match(/export const FIELD_TYPES = \{([\s\S]*?)\};/);
if (!fieldTypesBlock) {
  console.error('❌ Could not find FIELD_TYPES in stepHelpers.js');
  process.exit(1);
}

// Classify types by their comment section: lines before "// Validation types" are
// interaction types, lines after are validation types. This handles custom FIELD_TYPES
// added by project overlays without requiring updates to this script.
const blockContent = fieldTypesBlock[1];
const validationSectionStart = blockContent.indexOf('// Validation types');
const interactionSection = validationSectionStart >= 0
  ? blockContent.slice(0, validationSectionStart)
  : blockContent;
const validationSection = validationSectionStart >= 0
  ? blockContent.slice(validationSectionStart)
  : '';

// Fallback descriptions — match inline comments in stepHelpers.js source
const INLINE_DESC = {
  FILL: 'Plain text input',
  FILL_AND_ENTER: 'Fill then press Enter (tags, chips)',
  DROPDOWN: 'Native `<select>` or ARIA combobox',
  CLICK: 'Button / toggle via click',
  CHECKBOX_TOGGLE: 'Checkbox by label text',
  TOGGLE: 'Boolean toggle switch',
  CUSTOM: 'Unique interaction — requires `fieldHandlers` entry',
  INPUT_VALUE: 'Assert text input `.value` (toHaveValue)',
  DROPDOWN_VALUE: 'Assert selected dropdown option text',
  TEXT_VISIBLE: 'Assert element text visible by testID',
};

function extractTypeEntries(section) {
  const rows = [];
  for (const m of section.matchAll(/(\w+):\s*'(\w+)'[^\/\n]*(?:\/\/\s*(.+))?/g)) {
    const [, key, value, inlineComment] = m;
    const desc = inlineComment?.trim() || INLINE_DESC[key] || '';
    rows.push({ key, value, desc });
  }
  return rows;
}

const interactionEntries = extractTypeEntries(interactionSection);
const validationEntries = extractTypeEntries(validationSection);

const interactionRows = interactionEntries.map(({ key, value, desc }) =>
  `| \`FIELD_TYPES.${key}\` | \`"${value}"\` | ${desc} |`
);
const validationRows = validationEntries.map(({ key, desc }) =>
  `| \`FIELD_TYPES.${key}\` | ${desc} |`
);

// ── 2. Extract faker patterns from testDataGenerator.js ───────────────────────
// Uses a line-by-line approach to correctly handle:
//   - Single condition: if (field.includes('x')) return y;
//   - AND condition:    if (field.includes('x') && field.includes('y')) return z;
//   - OR condition:     if (field.includes('x') || field.includes('y')) return z;
//   - Multi-line:       if (...)\n  return z;

const testDataSource = fs.readFileSync(testDataGenPath, 'utf-8');
const lines = testDataSource.split('\n');
const fakerRows = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line.startsWith('if (field.includes(')) continue;

  // Extract all field name literals from the condition
  const fieldNames = [...line.matchAll(/field\.includes\('([^']+)'\)/g)].map(m => m[1]);
  if (!fieldNames.length) continue;

  // Find return value — may be on same line or next non-empty line
  let returnExpr = null;
  const sameLineReturn = line.match(/return ([^;]+);/);
  if (sameLineReturn) {
    returnExpr = sameLineReturn[1].trim();
  } else {
    // Look at next line(s) for the return statement
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const next = lines[j].trim();
      const m = next.match(/return ([^;]+);/);
      if (m) {
        returnExpr = m[1].trim();
        break;
      }
    }
  }
  if (!returnExpr) continue;

  const keyLabel = fieldNames.map(k => `\`${k}\``).join(' / ');
  fakerRows.push(`| ${keyLabel} | \`${returnExpr}\` |`);
}

// Add default row — the final bare return in the function
const defaultMatch = testDataSource.match(/\/\/ Default[^\n]*\n\s*return ([^;]+);/);
fakerRows.push(`| _(default)_ | \`${defaultMatch ? defaultMatch[1].trim() : '{word}_{timestamp-6-digits}'}\` |`);

// ── 3. Write generate-context.md ─────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

const content = `# Framework Generation Context
<!-- Regenerate: node e2e-tests/scripts/extract-generate-context.js -->
<!-- Last updated: ${today} -->

## FIELD_TYPES Constants

Import path follows the **Import Path Depth Reference** table at the bottom of this document.
Example from \`@Modules/@Mod/steps.js\`: \`import { FIELD_TYPES, processDataTable, validateExpectations } from '../../../../utils/stepHelpers.js';\`

### Interaction Types (processDataTable fieldConfig)

| Constant | Value | When to Use |
|---|---|---|
${interactionRows.join('\n')}

### Validation Types (validateExpectations validationConfig)

| Constant | When to Use |
|---|---|
${validationRows.join('\n')}

## processDataTable API

\`\`\`javascript
await processDataTable(page, dataTable, {
  mapping: { 'Field Name': 'cacheKey' },          // field label → page.testData property
  fieldConfig: {
    'Field Name': { type: FIELD_TYPES.FILL, testID: 'input-testid' },
    'Select Field': { type: FIELD_TYPES.DROPDOWN, testID: 'select-testid' },
    'Button': { type: FIELD_TYPES.CLICK, testID: 'btn-testid' },
  },
  fieldHandlers: {                                  // CUSTOM type only
    'Special Field': async (page, value) => { /* ... */ },
  },
  container: page,                                  // scope locators (default: page)
});
\`\`\`

**Auto-handling:**
- \`<gen_test_data>\` → generates faker value via \`generateValueForField(fieldName)\`, caches in \`page.testData[cacheKey]\` and \`featureDataCache\` (for \`SharedGenerated\` type)
- \`<from_test_data>\` → reads from \`page.testData[cacheKey]\` then \`featureDataCache\`
- No \`fieldConfig\` entry → falls back to \`fillFieldByName()\` (testID → name attr → placeholder → label → role)

## validateExpectations API

\`\`\`javascript
await validateExpectations(page, dataTable, {
  mapping: { 'Field Name': 'cacheKey' },
  validationConfig: {
    'Field Name': { type: FIELD_TYPES.INPUT_VALUE, testID: 'input-testid' },
    'Display Field': { type: FIELD_TYPES.TEXT_VISIBLE, testID: 'display-testid' },
  },
  container: page,
});
\`\`\`

**Auto-handling:** \`<from_test_data>\` reads from \`page.testData[cacheKey]\` then \`featureDataCache\`. Throws if no cached value found.

## generateValueForField Patterns

| Field name contains | Generated value |
|---|---|
${fakerRows.join('\n')}

## Import Path Depth Reference

The number of \`../\` levels = (directory depth from \`e2e-tests/features/playwright-bdd/\` + 2).

| Steps file location | fixtures.js import | stepHelpers.js import |
|---|---|---|
| \`@Modules/@Mod/steps.js\` | \`../../../../playwright/fixtures.js\` | \`../../../../utils/stepHelpers.js\` |
| \`@Modules/@Mod/@Sub/steps.js\` | \`../../../../../playwright/fixtures.js\` | \`../../../../../utils/stepHelpers.js\` |
| \`@Workflows/@Flow/@0-Pre/steps.js\` | \`../../../../../playwright/fixtures.js\` | \`../../../../../utils/stepHelpers.js\` |
| \`shared/steps.js\` | \`../playwright/fixtures.js\` | \`../utils/stepHelpers.js\` |
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, content, 'utf-8');

console.log(`✅ generate-context.md updated — ${interactionRows.length} interaction FIELD_TYPES, ${validationRows.length} validation FIELD_TYPES, ${fakerRows.length - 1} faker patterns`);
console.log(`   Written to: ${outputPath}`);
