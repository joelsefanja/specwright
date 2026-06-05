/**
 * Global Setup — runs once before all test projects.
 * Uses a .cleanup-done marker file to detect fresh vs. in-progress runs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const markerFile = path.join(__dirname, '.cleanup-done');
const testDataDir = path.join(__dirname, 'test-data');
const authStorageDir = path.join(__dirname, 'auth-storage/.auth');
const reportsDir = path.join(__dirname, '../../reports');

export default async function globalSetup() {
  console.log('[global.setup] Starting global setup...');

  // Always ensure auth-storage directory exists — storageState({ path }) does not
  // create parent directories, so auth setup fails on a fresh clone without this.
  if (!fs.existsSync(authStorageDir)) {
    fs.mkdirSync(authStorageDir, { recursive: true });
    console.log('[global.setup] Created auth-storage/.auth directory.');
  }

  // Always ensure report directories exist — playwright reporters open files
  // immediately and crash if the parent dir is missing (e.g. after `rm -rf reports/`).
  const requiredReportDirs = ['json', 'cucumber-bdd', 'playwright', 'screenshots'];
  for (const dir of requiredReportDirs) {
    const dirPath = path.join(reportsDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  if (!fs.existsSync(markerFile)) {
    // New run — clean previous data
    console.log('[global.setup] Fresh run detected. Cleaning previous data...');

    // Clean test-data directory (but keep the directory)
    if (fs.existsSync(testDataDir)) {
      const files = fs.readdirSync(testDataDir);
      for (const file of files) {
        const filePath = path.join(testDataDir, file);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    } else {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Ensure reports directories exist
    const reportDirs = ['json', 'cucumber-bdd', 'playwright', 'screenshots'];
    for (const dir of reportDirs) {
      const dirPath = path.join(reportsDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  } else {
    console.log('[global.setup] Run in progress — preserving data.');
  }

  // Place marker
  fs.writeFileSync(markerFile, new Date().toISOString());
  console.log('[global.setup] Setup complete.');
}
