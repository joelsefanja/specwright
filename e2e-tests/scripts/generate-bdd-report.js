import report from "multiple-cucumber-html-reporter";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { resolveDataTablePlaceholders } from "./data-table-placeholder-resolver.js";
import { extractHierarchy, getFeatureDirectorySegments } from "./path-hierarchy.js";
import { getFeatureStatus, getScenarioCounts, getTreeSummary } from "./report-status-summary.js";

const require = createRequire(import.meta.url);

// Read project name from nearest package.json (best-effort)
const getProjectName = () => {
  try {
    const pkg = require(path.resolve(process.cwd(), "package.json"));
    return pkg.name || "E2E Tests";
  } catch {
    return "E2E Tests";
  }
};

// ─── Tree Structure ──────────────────────────────────────────────────────────

/**
 * Build a nested tree from report data using directory paths.
 * Each node can have child directories and a _features array.
 */
const buildTree = reportData => {
  const root = {};
  reportData.forEach(feature => {
    const segments = getFeatureDirectorySegments(feature.uri || "");
    let current = root;
    segments.forEach(seg => {
      if (!current[seg]) current[seg] = {};
      current = current[seg];
    });
    if (!current._features) current._features = [];
    current._features.push(feature);
  });
  return root;
};

/**
 * Recursively aggregate scenario pass/fail counts for a tree node.
 */
const aggregateStats = node => {
  let total = 0;
  let passed = 0;
  let failed = 0;

  if (node._features) {
    node._features.forEach(f => {
      const c = getScenarioCounts(f);
      total += c.total;
      passed += c.passed;
      failed += c.failed;
    });
  }

  Object.keys(node)
    .filter(k => k !== "_features")
    .forEach(key => {
      const sub = aggregateStats(node[key]);
      total += sub.total;
      passed += sub.passed;
      failed += sub.failed;
    });

  return { total, passed, failed };
};

// ─── Enrichment ──────────────────────────────────────────────────────────────

/**
 * Enrich each feature with a "Directory" metadata breadcrumb and write to a
 * temp dir that multiple-cucumber-html-reporter reads from.
 */
const enrichReportWithHierarchy = (reportData, reportDir) => {
  const enrichedData = reportData.map(feature => {
    const hierarchy = extractHierarchy(feature.uri || "");
    const parts = [hierarchy.Category, hierarchy.Module, hierarchy["Sub-Module"]].filter(Boolean);
    const metadata = [{ name: "Directory", value: parts.join("  /  ") || "-" }];
    return { ...feature, metadata };
  });

  const enrichedDir = path.join(reportDir, ".enriched");
  fs.mkdirSync(enrichedDir, { recursive: true });
  fs.writeFileSync(path.join(enrichedDir, "report.json"), JSON.stringify(enrichedData, null, 2));
  return enrichedDir;
};

// ─── Tree View HTML Generation ───────────────────────────────────────────────

/**
 * Recursively render tree nodes as nested <ul>/<li> HTML.
 */
const renderTreeNodes = (node, depth = 0, featureLinks = new Map()) => {
  let html = "";
  const dirs = Object.keys(node).filter(k => k !== "_features").sort();
  const features = node._features || [];

  dirs.forEach(key => {
    const stats = aggregateStats(node[key]);
    const statusCls = stats.failed > 0 ? "tv-node--failed" : "tv-node--passed";
    const icon = depth === 0 ? "\u{1F4C2}" : "\u{1F4C1}"; // 📂 : 📁
    const badge = stats.failed > 0
      ? `${stats.passed}/${stats.total} passed, ${stats.failed} failed`
      : `${stats.passed}/${stats.total} passed`;

    html += `<li class="tv-node ${statusCls}">`;
    html += `<div class="tv-label" onclick="this.parentElement.classList.toggle('tv-node--collapsed')">`;
    html += `<span class="tv-caret"></span>`;
    html += `<span class="tv-icon">${icon}</span>`;
    html += `<span class="tv-name">${key}</span>`;
    html += `<span class="tv-badge">${badge}</span>`;
    html += `</div>`;
    html += `<ul class="tv-children">`;
    html += renderTreeNodes(node[key], depth + 1, featureLinks);
    html += `</ul></li>`;
  });

  features.forEach(feature => {
    const counts = getScenarioCounts(feature);
    const status = getFeatureStatus(feature);
    const statusIcon = status === "passed" ? "\u2705" : status === "failed" ? "\u274C" : "\u23F3"; // ✅ ❌ ⏳
    const statusCls = `tv-leaf--${status}`;
    const link = featureLinks.get(feature.name);

    html += `<li class="tv-leaf ${statusCls}">`;
    html += `<span class="tv-icon">\u{1F4C4}</span>`; // 📄
    if (link) {
      html += `<a class="tv-feature-link" href="${link}">${feature.name}</a>`;
    } else {
      html += `<span class="tv-feature-name">${feature.name}</span>`;
    }
    html += `<span class="tv-feature-stats">${statusIcon} ${counts.passed}/${counts.total} scenarios</span>`;
    html += `</li>`;
  });

  return html;
};

const getTreeViewCSS = () => `<style id="tree-view-css">
/* ── Tree View Container ── */
.tv-container {
  margin: 0 0 20px 0;
  padding: 20px 24px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.tv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.tv-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
}
.tv-summary {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 10px;
  background: #e8f5e9;
  color: #2e7d32;
  font-weight: 500;
}
.tv-summary--has-failures {
  background: #fde0dc;
  color: #c62828;
}
/* ── Tree Structure ── */
.tv-root { list-style: none; padding: 0; margin: 0; }
.tv-root ul { list-style: none; padding: 0 0 0 24px; margin: 0; }
/* ── Directory Nodes ── */
.tv-node { margin: 1px 0; }
.tv-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.tv-label:hover { background: #f0f4f8; }
.tv-caret {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6 4l4 4-4 4' fill='none' stroke='%23777' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
  transition: transform 0.15s;
  transform: rotate(90deg);
}
.tv-node--collapsed > .tv-label .tv-caret { transform: rotate(0deg); }
.tv-icon { font-size: 15px; flex-shrink: 0; line-height: 1; }
.tv-name { font-weight: 600; font-size: 13px; color: #34495e; }
.tv-badge {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: #e8f5e9;
  color: #2e7d32;
  white-space: nowrap;
  font-weight: 500;
}
.tv-node--failed > .tv-label .tv-badge { background: #fde0dc; color: #c62828; }
/* ── Collapse ── */
.tv-children { overflow: hidden; transition: max-height 0.2s ease; }
.tv-node--collapsed > .tv-children { display: none; }
/* ── Tree connectors ── */
.tv-children { position: relative; }
.tv-children::before {
  content: '';
  position: absolute;
  top: 0; left: 15px; bottom: 6px;
  width: 1px;
  background: #dee2e6;
}
.tv-children > li { position: relative; }
.tv-children > li::before {
  content: '';
  position: absolute;
  top: 14px; left: -9px;
  width: 9px; height: 1px;
  background: #dee2e6;
}
/* ── Feature Leaves ── */
.tv-leaf {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  margin: 1px 0;
  border-radius: 4px;
}
.tv-feature-name { font-size: 13px; color: #444; }
.tv-feature-link {
  font-size: 13px;
  color: #2980b9;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}
.tv-feature-link:hover { color: #1a5276; }
.tv-leaf--passed .tv-feature-name { color: #2c3e50; }
.tv-leaf--failed .tv-feature-name { color: #c62828; font-weight: 500; }
.tv-leaf--failed .tv-feature-link { color: #c62828; font-weight: 500; }
.tv-leaf--failed .tv-feature-link:hover { color: #961f1f; }
.tv-feature-stats { margin-left: auto; font-size: 12px; color: #888; white-space: nowrap; }
/* ── Dark Mode ── */
body.darkmode .tv-container, [data-bs-theme="dark"] .tv-container { background: #1e1e2e; border-color: #333; }
body.darkmode .tv-title, [data-bs-theme="dark"] .tv-title { color: #d0d0e0; }
body.darkmode .tv-label:hover, [data-bs-theme="dark"] .tv-label:hover { background: #2a2a3e; }
body.darkmode .tv-caret, [data-bs-theme="dark"] .tv-caret {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6 4l4 4-4 4' fill='none' stroke='%23999' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
}
body.darkmode .tv-name, [data-bs-theme="dark"] .tv-name { color: #c0c0d0; }
body.darkmode .tv-badge, [data-bs-theme="dark"] .tv-badge { background: #1b3a1b; color: #66bb6a; }
body.darkmode .tv-summary, [data-bs-theme="dark"] .tv-summary { background: #1b3a1b; color: #66bb6a; }
body.darkmode .tv-node--failed > .tv-label .tv-badge, [data-bs-theme="dark"] .tv-node--failed > .tv-label .tv-badge { background: #3a1b1b; color: #ef5350; }
body.darkmode .tv-summary--has-failures, [data-bs-theme="dark"] .tv-summary--has-failures { background: #3a1b1b; color: #ef5350; }
body.darkmode .tv-children::before, [data-bs-theme="dark"] .tv-children::before { background: #444; }
body.darkmode .tv-children > li::before, [data-bs-theme="dark"] .tv-children > li::before { background: #444; }
body.darkmode .tv-feature-name, [data-bs-theme="dark"] .tv-feature-name { color: #b0b0c0; }
body.darkmode .tv-feature-link, [data-bs-theme="dark"] .tv-feature-link { color: #5dade2; }
body.darkmode .tv-feature-link:hover, [data-bs-theme="dark"] .tv-feature-link:hover { color: #85c1e9; }
body.darkmode .tv-leaf--passed .tv-feature-name, [data-bs-theme="dark"] .tv-leaf--passed .tv-feature-name { color: #d0d0e0; }
body.darkmode .tv-leaf--failed .tv-feature-name, [data-bs-theme="dark"] .tv-leaf--failed .tv-feature-name,
body.darkmode .tv-leaf--failed .tv-feature-link, [data-bs-theme="dark"] .tv-leaf--failed .tv-feature-link { color: #ef5350; }
body.darkmode .tv-feature-stats, [data-bs-theme="dark"] .tv-feature-stats { color: #777; }
</style>`;

const generateTreeViewHTML = (reportData, featureLinks = new Map()) => {
  const tree = buildTree(reportData);
  const totalStats = aggregateStats(tree);
  const { summaryText, summaryClass } = getTreeSummary(totalStats);

  return `<div class="tv-container">
  <div class="tv-header">
    <h4 class="tv-title">Directory Structure</h4>
    <span class="${summaryClass}">${summaryText}</span>
  </div>
  <ul class="tv-root">
    ${renderTreeNodes(tree, 0, featureLinks)}
  </ul>
</div>`;
};

// ─── Post-Processing ─────────────────────────────────────────────────────────

/**
 * Extract feature name → detail page URL mappings from the generated HTML.
 */
const extractFeatureLinks = html => {
  const links = new Map();
  const regex = /<a\s+href="(features\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.set(match[2].trim(), match[1]);
  }
  return links;
};

/**
 * Inject the tree view section into the generated HTML report above the features table.
 */
const postProcessReport = (htmlReportPath, reportData) => {
  const indexPath = path.join(htmlReportPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.warn("   ⚠️  Could not find index.html for post-processing");
    return;
  }

  let html = fs.readFileSync(indexPath, "utf8");
  const featureLinks = extractFeatureLinks(html);

  html = html.replace("</head>", `${getTreeViewCSS()}\n</head>`);
  const treeHTML = generateTreeViewHTML(reportData, featureLinks);
  html = html.replace(
    '<div class="table-responsive">',
    `${treeHTML}\n            <div class="table-responsive">`
  );

  fs.writeFileSync(indexPath, html);
};

// ─── Main Report Generation ──────────────────────────────────────────────────

const generateReport = () => {
  const reportDir = "reports/cucumber-bdd";
  const jsonReportPath = path.join(reportDir, "report.json");
  const htmlReportPath = path.join(reportDir, "html-report");
  const projectName = getProjectName();

  // Clean stale html-report directory to avoid asset copy issues
  if (fs.existsSync(htmlReportPath)) {
    console.log("🧹 Removing stale html-report directory...");
    fs.rmSync(htmlReportPath, { recursive: true, force: true });
  }

  fs.mkdirSync(reportDir, { recursive: true });

  // Guard: missing or empty JSON report
  if (!fs.existsSync(jsonReportPath)) {
    console.error(`❌ JSON report not found at: ${jsonReportPath}`);
    console.log("💡 Run tests first: pnpm test:bdd");
    process.exit(1);
  }

  const reportContent = fs.readFileSync(jsonReportPath, "utf8").trim();
  if (!reportContent || reportContent === "[]") {
    console.error("❌ JSON report is empty — no test results to display");
    console.log("💡 Re-run the tests: pnpm test:bdd");
    process.exit(1);
  }

  let reportData;
  try {
    reportData = JSON.parse(reportContent);
  } catch (parseError) {
    console.error(`❌ Failed to parse ${jsonReportPath}: ${parseError.message}`);
    process.exit(1);
  }

  const featureCount = reportData.length;
  const scenarioCount = reportData.reduce((sum, f) => sum + (f.elements ? f.elements.length : 0), 0);
  const reportStat = fs.statSync(jsonReportPath);

  console.log("📊 Generating BDD HTML report...");
  console.log(`   Source: ${jsonReportPath}`);
  console.log(`   Last modified: ${reportStat.mtime.toISOString()}`);
  console.log(`   Features: ${featureCount}, Scenarios: ${scenarioCount}`);

  // Warn if report.json looks stale
  const playwrightResultsPath = "reports/json/results.json";
  if (fs.existsSync(playwrightResultsPath)) {
    const pwStat = fs.statSync(playwrightResultsPath);
    if (Math.abs(pwStat.mtimeMs - reportStat.mtimeMs) > 60000) {
      console.warn(`\n⚠️  WARNING: report.json and results.json have different timestamps`);
      console.warn(`   report.json:  ${reportStat.mtime.toISOString()}`);
      console.warn(`   results.json: ${pwStat.mtime.toISOString()}`);
      console.warn(`   report.json may be stale — re-run tests to refresh.\n`);
    }
  }

  // Fix race condition: when multiple Playwright projects run concurrently, a project that
  // grep-filters tests (e.g. serial-execution skipping non-@serial tests) can write "skipped"
  // results to report.json AFTER a project that actually ran the tests wrote "passed".
  // Cross-reference results.json (the authoritative Playwright reporter) and promote any
  // scenario that Playwright recorded as "expected" (passed) but the cucumber reporter
  // captured as containing skipped steps with duration=0 (grep-filtered ghost results).
  if (fs.existsSync(playwrightResultsPath)) {
    try {
      const pwResults = JSON.parse(fs.readFileSync(playwrightResultsPath, "utf8"));
      const passedTitles = new Set();
      const collectPassed = suites => {
        for (const suite of suites || []) {
          for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
              if (test.status === "expected") passedTitles.add(spec.title);
            }
          }
          collectPassed(suite.suites);
        }
      };
      collectPassed(pwResults.suites);

      let fixed = 0;
      for (const feature of reportData) {
        for (const scenario of feature.elements || []) {
          if (!passedTitles.has(scenario.name)) continue;
          // Playwright says this scenario passed. Promote any step that is "skipped" with
          // duration=0 — these are grep-filtered ghost results from another Playwright project
          // that ran the same spec file but excluded this test. They are not genuine skips.
          const stepsToFix = (scenario.steps || []).filter(
            s => !s.hidden && s.result?.status === "skipped" && (s.result?.duration ?? 0) === 0
          );
          if (stepsToFix.length > 0) {
            stepsToFix.forEach(s => { s.result = { status: "passed", duration: 1000000 }; });
            fixed++;
          }
        }
      }
      if (fixed > 0) {
        console.log(`🔧 Fixed ${fixed} scenario(s) incorrectly marked as skipped (multi-project reporter race condition)`);
      }
    } catch {
      // Non-critical — proceed without cross-reference fix
    }
  }

  // Enrich features with directory hierarchy metadata
  console.log("📂 Enriching features with directory hierarchy...");
  reportData.forEach(f => {
    const h = extractHierarchy(f.uri || "");
    const parts = [h.Category, h.Module, h["Sub-Module"]].filter(Boolean);
    console.log(`   ${f.name} → ${parts.join(" > ") || "(root)"}`);
  });

  // Resolve DataTable placeholders with actual test values from embeddings
  console.log("🔄 Resolving DataTable placeholders...");
  resolveDataTablePlaceholders(reportData);

  // Strip non-media embeddings so the report only shows screenshots/videos
  const mediaMimeTypes = new Set(["image/png", "video/webm", "image/jpeg", "image/gif"]);
  for (const feature of reportData) {
    for (const scenario of feature.elements || []) {
      for (const step of scenario.steps || []) {
        if (step.embeddings) {
          step.embeddings = step.embeddings.filter(e => mediaMimeTypes.has(e.mime_type));
        }
      }
    }
  }

  const enrichedDir = enrichReportWithHierarchy(reportData, reportDir);

  report.generate({
    jsonDir: enrichedDir,
    reportPath: htmlReportPath,
    customMetadata: true,
    customData: {
      title: `${projectName} — BDD Test Report`,
      data: [
        { label: "Project", value: projectName },
        { label: "Version", value: process.env.npm_package_version || "—" },
        { label: "Environment", value: process.env.TEST_ENV || process.env.NODE_ENV || "test" },
        { label: "Generated", value: new Date().toLocaleString() },
      ],
    },
    displayDuration: true,
    displayReportTime: true,
    useCDN: false,
    pageTitle: `${projectName} — BDD Test Report`,
    reportName: "Playwright BDD Test Results",
    pageFooter: `<div><p>Generated by Specwright · playwright-bdd · multiple-cucumber-html-reporter</p></div>`,
    hideMetadata: false,
    openReportInBrowser: false,
  });

  // Clean up enriched temp dir
  fs.rmSync(enrichedDir, { recursive: true, force: true });

  // Post-process: inject tree view into the HTML report
  console.log("🌲 Injecting directory tree view into report...");
  postProcessReport(htmlReportPath, reportData);

  console.log("✅ BDD HTML report generated successfully!");
  console.log(`📁 Report: ${path.resolve(htmlReportPath, "index.html")}`);
};

try {
  generateReport();
} catch (error) {
  console.error("❌ Error generating BDD report:", error.message);
  process.exit(1);
}
