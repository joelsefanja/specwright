import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RESULTS_PATH = 'test-results/allure/results';
const RESULT_FILE_SUFFIX = '-result.json';

const HIDDEN_LABELS = new Set(['framework', 'language', 'host', 'thread', 'package', '_fallbackTestCaseId']);
const SUITE_LABELS = new Set(['parentSuite', 'suite', 'subSuite']);

const compact = values => values.filter(Boolean);
const labelValue = (result, name) => result.labels?.find(label => label.name === name)?.value;
const withoutLabels = (labels, names) => (labels ?? []).filter(label => !names.has(label.name));

function setE2eSuiteLabels(result, suite, subSuite) {
  result.labels = [
    ...withoutLabels(result.labels, SUITE_LABELS),
    { name: 'parentSuite', value: 'E2E' },
    { name: 'suite', value: suite },
    ...compact([subSuite]).map(value => ({ name: 'subSuite', value }))
  ];
}

function normalizeSetupResult(result) {
  setE2eSuiteLabels(result, 'Setup', 'Authentication');
  result.titlePath = compact(['E2E', 'Setup', 'Authentication', result.name]);
}

function normalizeBddResult(result) {
  const bdd = {
    category: labelValue(result, 'epic'),
    module: labelValue(result, 'feature'),
    feature: labelValue(result, 'subSuite'),
    scenario: labelValue(result, 'story')
  };

  setE2eSuiteLabels(result, compact([bdd.category, bdd.module]).join(' / ') || 'BDD', bdd.feature);
  result.titlePath = compact(['E2E', bdd.category, bdd.module, bdd.feature, bdd.scenario, result.name]);
}

function normalizeResult(result) {
  result.labels = withoutLabels(result.labels, HIDDEN_LABELS);

  const testType = labelValue(result, 'test type');
  if (!testType?.startsWith('e2e')) return;

  if (testType === 'e2e setup') normalizeSetupResult(result);
  else if (testType === 'e2e') normalizeBddResult(result);
}

function normalizeFile(fileName) {
  const filePath = join(RESULTS_PATH, fileName);
  const result = JSON.parse(readFileSync(filePath, 'utf8'));

  normalizeResult(result);

  writeFileSync(filePath, `${JSON.stringify(result)}\n`);
}

if (!existsSync(RESULTS_PATH)) {
  process.exit(0);
}

for (const fileName of readdirSync(RESULTS_PATH)) {
  if (fileName.endsWith(RESULT_FILE_SUFFIX)) {
    normalizeFile(fileName);
  }
}
