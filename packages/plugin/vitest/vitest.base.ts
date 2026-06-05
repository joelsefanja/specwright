import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { TestResult } from 'allure-js-commons';
import type { ViteUserConfig } from 'vitest/config';

const thisfilename = fileURLToPath(import.meta.url);
const thisdirname = dirname(thisfilename);

const isVerbose = process.env['VITEST_VERBOSE'] === 'true';
type VitestReporters = NonNullable<NonNullable<ViteUserConfig['test']>['reporters']>;
const HIDDEN_LABELS = new Set(['framework', 'language', 'host', 'thread', 'package', '_fallbackTestCaseId']);

function normalizeAllureSuites(result: TestResult): void {
  const testType = result.labels.find(label => label.name === 'test type')?.value;

  if (!testType) {
    return;
  }

  result.labels = result.labels.filter(label => !HIDDEN_LABELS.has(label.name) && !['parentSuite', 'suite', 'subSuite'].includes(label.name));
  result.labels.push({ name: 'parentSuite', value: 'Vitest' });
  result.labels.push({ name: 'suite', value: testType });
  result.titlePath = ['Vitest', testType, ...(result.titlePath ?? [])];
}

export const testReporters: VitestReporters = [
  isVerbose ? 'verbose' : 'default',
  ['allure-vitest/reporter', {
    resultsDir: 'test-results/allure/results',
    listeners: [{ beforeTestResultWrite: normalizeAllureSuites }]
  }]
];

export const baseConfig = {
  cacheDir: resolve(thisdirname, '../.vite-test-cache'),
  server: {
    sourcemapIgnoreList: (sourcePath: string) => sourcePath.includes('allure-vitest')
  },
  test: {
    reporters: testReporters
  }
} satisfies ViteUserConfig;
