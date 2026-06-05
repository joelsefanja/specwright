export const getFeatureStatus = feature => {
  if (!feature.elements || feature.elements.length === 0) {
    return "pending";
  }

  const anyFailed = feature.elements.some(scenario =>
    scenario.steps?.some(step => step.result && step.result.status === "failed")
  );

  if (anyFailed) {
    return "failed";
  }

  return "passed";
};

export const getScenarioCounts = feature => {
  if (!feature.elements) {
    return { total: 0, passed: 0, failed: 0 };
  }

  let passed = 0;
  let failed = 0;

  for (const scenario of feature.elements) {
    const hasFailed = scenario.steps?.some(step => step.result && step.result.status === "failed");
    if (hasFailed) {
      failed++;
    } else {
      passed++;
    }
  }

  return { total: feature.elements.length, passed, failed };
};

export const getTreeSummary = totalStats => {
  const summaryText = totalStats.failed > 0
    ? `${totalStats.passed} passed, ${totalStats.failed} failed of ${totalStats.total} scenarios`
    : `All ${totalStats.total} scenarios passed`;
  const summaryClass = totalStats.failed > 0 ? "tv-summary tv-summary--has-failures" : "tv-summary";

  return { summaryText, summaryClass };
};
