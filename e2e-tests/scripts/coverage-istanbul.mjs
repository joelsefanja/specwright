#!/usr/bin/env node
/**
 * Convert reports/coverage/lcov-full.info → Istanbul HTML report
 * (tree sidebar + statement / branch / function / line coverage).
 *
 * Statements are approximated from line coverage (lcov doesn't carry
 * statement-level data); for E2E line-level coverage this is the same
 * granularity Istanbul itself reports.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Ensure deps are available
let libCoverage, libReport, reports;
try {
  libCoverage = require("istanbul-lib-coverage");
  libReport = require("istanbul-lib-report");
  reports = require("istanbul-reports");
} catch {
  console.error("Missing deps. Install with:");
  console.error("  yarn add -D istanbul-lib-coverage istanbul-lib-report istanbul-reports");
  process.exit(1);
}

const LCOV = "reports/coverage/lcov-full.info";
const OUT = "reports/coverage-istanbul";
const PROJECT_ROOT = path.resolve(".");

if (!fs.existsSync(LCOV)) {
  console.error(`No ${LCOV}. Run 'yarn coverage:expand' first.`);
  process.exit(1);
}

// ── Parse lcov into per-file entries ──────────────────────────────
const records = [];
let cur = null;
for (const line of fs.readFileSync(LCOV, "utf8").split("\n")) {
  if (line.startsWith("SF:")) {
    cur = {
      file: line.slice(3).trim(),
      lines: {},
      fns: {},
      fnMap: {},
      fnNext: 0,
      branches: {} // key = "line:block" → array of hit counts per branch
    };
    records.push(cur);
  } else if (!cur) continue;
  else if (line.startsWith("DA:")) {
    const [n, c] = line.slice(3).split(",");
    cur.lines[+n] = +c;
  } else if (line.startsWith("FN:")) {
    const [n, name] = line.slice(3).split(",");
    cur.fnMap[cur.fnNext] = { name, line: +n };
    cur.fnNext++;
  } else if (line.startsWith("FNDA:")) {
    const [c, name] = line.slice(5).split(",");
    for (const [id, fn] of Object.entries(cur.fnMap)) {
      if (fn.name === name) cur.fns[id] = +c;
    }
  } else if (line.startsWith("BRDA:")) {
    // BRDA:<line>,<block>,<branch>,<taken|->
    const [lineNo, block, branch, taken] = line.slice(5).split(",");
    const key = `${lineNo}:${block}`;
    if (!cur.branches[key]) cur.branches[key] = [];
    const idx = +branch;
    cur.branches[key][idx] = taken === "-" ? 0 : +taken;
  } else if (line.startsWith("end_of_record")) {
    cur = null;
  }
}

// ── Build Istanbul FileCoverage objects ────────────────────────────
const coverageMap = libCoverage.createCoverageMap({});
let included = 0, skipped = 0;
for (const r of records) {
  const absPath = path.isAbsolute(r.file) ? r.file : path.join(PROJECT_ROOT, r.file);
  // Skip files that no longer exist on disk (shouldn't happen for our data)
  if (!fs.existsSync(absPath)) { skipped++; continue; }

  const statementMap = {};
  const s = {};
  let i = 0;
  for (const [lineNo, hits] of Object.entries(r.lines)) {
    statementMap[i] = {
      start: { line: +lineNo, column: 0 },
      end: { line: +lineNo, column: 80 }
    };
    s[i] = hits;
    i++;
  }

  const fnMap = {};
  const f = {};
  for (const [id, fn] of Object.entries(r.fnMap)) {
    fnMap[id] = {
      name: fn.name,
      decl: { start: { line: fn.line, column: 0 }, end: { line: fn.line, column: 0 } },
      loc: { start: { line: fn.line, column: 0 }, end: { line: fn.line, column: 0 } },
      line: fn.line
    };
    f[id] = r.fns[id] ?? 0;
  }

  // Build branch map + hit counts from BRDA entries
  const branchMap = {};
  const b = {};
  let bi = 0;
  for (const [key, hits] of Object.entries(r.branches)) {
    const [lineNo] = key.split(":");
    // Each block becomes one Istanbul branch with N locations (one per branch index)
    const locations = hits.map(() => ({
      start: { line: +lineNo, column: 0 },
      end: { line: +lineNo, column: 0 }
    }));
    branchMap[bi] = {
      loc: { start: { line: +lineNo, column: 0 }, end: { line: +lineNo, column: 0 } },
      type: "branch",
      locations,
      line: +lineNo
    };
    // Replace any sparse-array undefined with 0
    b[bi] = hits.map(h => (typeof h === "number" ? h : 0));
    bi++;
  }

  coverageMap.addFileCoverage({
    path: absPath,
    statementMap,
    fnMap,
    branchMap,
    s,
    f,
    b
  });
  included++;
}

console.log(`Parsed ${records.length} lcov records, ${included} included, ${skipped} skipped.`);

// ── Render Istanbul HTML report ────────────────────────────────────
const context = libReport.createContext({
  dir: OUT,
  defaultSummarizer: "nested",
  coverageMap
});

// Classic html report: full 4-metric table (Statements / Branches / Functions / Lines)
// at every directory level, breadcrumb navigation, drill into any subdir.
reports.create("html", { skipEmpty: false }).execute(context);

// html-spa as a sibling: single-page tree sidebar for quick navigation.
const contextSpa = libReport.createContext({
  dir: OUT + "-spa",
  defaultSummarizer: "nested",
  coverageMap
});
reports.create("html-spa", { skipEmpty: false }).execute(contextSpa);

reports.create("text-summary").execute(context);

console.log(`\nClassic HTML  → ${OUT}/index.html         (full 4-metric tables)`);
console.log(`Tree (SPA)    → ${OUT}-spa/index.html      (single-page tree sidebar)`);
