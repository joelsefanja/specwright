const { existsSync, readdirSync, rmSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const resultsPath = "test-results/allure/results";
const reportPath = "test-results/allure/report";

function hasAllureResults() {
  return existsSync(resultsPath) && readdirSync(resultsPath).some((fileName) => fileName.endsWith("-result.json"));
}

function runAllure(args, exitOnFailure = true) {
  const result = spawnSync("npx", ["allure", ...args], {
    shell: true,
    stdio: "inherit",
  });

  if (result.status !== 0 && exitOnFailure) {
    process.exit(result.status ?? 1);
  }

  return result.status === 0;
}

function generateReport() {
  rmSync(reportPath, { recursive: true, force: true });
  runAllure(["classic", resultsPath, "-o", reportPath]);
}

if (!hasAllureResults()) {
  console.log("No Allure results found. Run tests first: pnpm test:vitest or pnpm test:e2e");
  process.exit(0);
}

generateReport();
runAllure(["open", reportPath]);
