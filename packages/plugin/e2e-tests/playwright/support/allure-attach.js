import * as allure from 'allure-js-commons';

function humanizeSegment(segment) {
  return String(segment || '')
    .replace(/^@/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function getFeaturePathMeta(filePath) {
  if (!filePath) {
    return {};
  }

  const normalized = filePath.replace(/\\/g, '/');
  const marker = 'features/playwright-bdd/';
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) {
    return {};
  }

  const segments = normalized
    .slice(markerIndex + marker.length)
    .split('/')
    .filter(Boolean);

  segments.pop();
  const [category, module] = segments;

  return {
    categoryName: humanizeSegment(category),
    moduleName: humanizeSegment(module),
  };
}

function getTitlePath(testInfo) {
  if (typeof testInfo.titlePath === 'function') {
    return testInfo.titlePath();
  }

  if (Array.isArray(testInfo.titlePath)) return testInfo.titlePath;

  return [];
}

async function applyBddAllureMeta(testInfo, filePath) {
  const meta = getFeaturePathMeta(filePath);
  const titlePath = getTitlePath(testInfo);
  const featureTitle = titlePath.at(-3);
  const scenarioTitle = titlePath.at(-2);
  const suiteName = [meta.categoryName, meta.moduleName].filter(Boolean).join(' / ') || 'BDD';

  await allure.label('test type', 'e2e');
  await allure.parentSuite('E2E');
  await allure.suite(suiteName);

  if (meta.categoryName) {
    await allure.epic(meta.categoryName);
  }

  if (meta.moduleName) {
    await allure.feature(meta.moduleName);
  }

  if (featureTitle) {
    await allure.subSuite(featureTitle);
  }

  if (scenarioTitle) {
    await allure.story(scenarioTitle);
  }
}

function getFilePath(testInfo) {
  if (typeof testInfo.file === 'string') {
    return testInfo.file;
  }

  if (testInfo.file && typeof testInfo.file === 'object') {
    return testInfo.file.file || testInfo.file.filePath || testInfo.file.path;
  }

  return undefined;
}

export function attachAllure(test) {
  try {
    test.beforeEach(async ({}, testInfo) => {
      try {
        await applyBddAllureMeta(testInfo, getFilePath(testInfo));
      } catch (e) {
        // noop
      }
    });
  } catch (err) {
    // noop
  }
}

export default attachAllure;
