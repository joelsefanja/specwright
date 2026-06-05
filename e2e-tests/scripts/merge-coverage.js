#!/usr/bin/env node
/**
 * Standalone coverage merge — reads .raw-coverage/*.json one at a time
 * and produces reports/coverage/. Safe to re-run.
 *
 * Run with extra heap:
 *   node --max-old-space-size=16384 e2e-tests/scripts/merge-coverage.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(projectRoot, ".raw-coverage");
const outputDir = path.join(projectRoot, "reports", "coverage");

if (!fs.existsSync(rawDir)) {
  console.error(`[coverage] ${rawDir} does not exist.`);
  process.exit(1);
}

const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith(".json"));
if (rawFiles.length === 0) {
  console.error("[coverage] No raw files to merge.");
  process.exit(1);
}

console.log(`[coverage] Merging ${rawFiles.length} raw coverage files (this can take a while)...`);

// Drop noise BEFORE monocart stores it in memory.
// V8 coverage includes everything the page loaded — node_modules, react,
// polyfills, vendor chunks. We only care about the app's own source.
const URL_KEEP = /\/(src|static\/js)\//;
const URL_DROP =
  /(node_modules|webpack:\/\/|chrome-extension:|sockjs|hot-update|runtime-main|\.test\.|\.spec\.|\.stories\.)/;

function filterEntries(entries) {
  return entries.filter(e => {
    const url = e.url || "";
    if (!url) return false;
    if (URL_DROP.test(url)) return false;
    if (URL_KEEP.test(url)) return true;
    // be conservative: only keep things we recognize
    return false;
  });
}

const { default: CoverageReport } = await import("monocart-coverage-reports");

// Source-level filter (applied after sourcemap resolution).
// Keeps only first-party app code. The most reliable rule is "does this file
// actually exist on disk under the project root?" — library sourcemaps often
// resolve to phantom paths like src/IdleTimer.js or src/MessageChannel/*
// (from html5-qrcode, react-idle-timer, broadcast-channel, etc.) that look
// like yms-ui code but aren't.
const _existsCache = new Map();
const sourceFilter = sourcePath => {
  if (!sourcePath) return false;
  if (sourcePath.includes("node_modules/")) return false;
  if (sourcePath.startsWith("webpack://")) return false;
  if (sourcePath.startsWith("sources/")) return false;
  // CSS / asset modules, including CRA's hashed CSS module compile output
  // (e.g. Foo.module.scss-baac, Bar.scss-11a9)
  if (/\.(scss|sass|css|less|svg|png|jpg|jpeg|gif|woff2?|ttf|eot)(\?|-[a-f0-9]+|$)/i.test(sourcePath))
    return false;
  if (/\.(test|spec|stories)\.[jt]sx?$/.test(sourcePath)) return false;
  // Explicit drops — files that exist on disk but aren't worth measuring
  // (utility wrappers, generated code, etc.). Add to this list as needed.
  const EXPLICIT_DROP = [/(^|\/)src\/utils\/toast-utils\//];
  if (EXPLICIT_DROP.some(re => re.test(sourcePath))) return false;
  if (!/(^|\/)src\//.test(sourcePath)) return false;
  // Must exist on disk in this project — drops phantom library src/ paths
  const rel = sourcePath.replace(/^.*\/(src\/)/, "$1");
  if (_existsCache.has(rel)) return _existsCache.get(rel);
  const exists = fs.existsSync(path.join(projectRoot, rel));
  _existsCache.set(rel, exists);
  return exists;
};

const report = new CoverageReport({
  name: "yms-ui E2E coverage",
  outputDir,
  reports: ["v8", "lcovonly", "console-summary"],
  cleanCache: true,
  sourceFilter
});

let processed = 0;
let kept = 0;
let dropped = 0;

for (const file of rawFiles) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8"));
    const filtered = filterEntries(raw);
    kept += filtered.length;
    dropped += raw.length - filtered.length;
    if (filtered.length > 0) {
      await report.add(filtered);
    }
  } catch (err) {
    console.log(`[coverage] Skipping ${file}: ${err.message}`);
  }
  processed++;
  if (processed % 25 === 0) {
    const heap = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
    console.log(
      `[coverage]   ${processed}/${rawFiles.length} files | kept ${kept} entries | dropped ${dropped} | RSS ${heap} MB`
    );
    if (global.gc) global.gc();
  }
}

console.log(`[coverage] Generating report...`);
await report.generate();
console.log(`[coverage] Done → ${path.relative(projectRoot, outputDir)}/index.html`);
