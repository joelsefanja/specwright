import { existsSync, readdirSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';

const resultsPath = 'test-results/allure/results';
const reportPath = 'test-results/allure/report';
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';

const command = text => `${bold}${cyan}${text}${reset}`;
const hasResults = existsSync(resultsPath) && readdirSync(resultsPath).some(fileName => fileName.endsWith('-result.json'));

function runAllure(args, options = { exitOnFailure: true }) {
  const result = spawnSync('npx', ['allure', ...args], {
    shell: true,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    if (!options.exitOnFailure) {
      return false;
    }

    const error = new Error(`Allure command failed: allure ${args.join(' ')}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }

  return true;
}

function clearReportOutput() {
  rmSync(reportPath, { recursive: true, force: true });
}

function generateReport() {
  clearReportOutput();
  runAllure(['classic', resultsPath, '-o', reportPath]);
}

function exitOnFailure(callback) {
  try {
    callback();
  } catch (error) {
    process.exit(error.exitCode ?? 1);
  }
}

if (!hasResults) {
  console.log(`${bold}${yellow}No Allure results found${reset}`);
  console.log('');
  console.log(`Run tests first: ${command('npm run test:vitest')}`);
  console.log(`Then open report: ${command('npm run test:report')}`);
  process.exit(0);
}

const normalizeResult = spawnSync('node', ['scripts/normalize-allure-results.js'], {
  shell: true,
  stdio: 'inherit'
});

if (normalizeResult.status !== 0) {
  process.exit(normalizeResult.status ?? 1);
}

exitOnFailure(() => {
  generateReport();
  runAllure(['open', reportPath]);
});
