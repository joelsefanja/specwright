/**
 * Global Teardown — runs once after all test projects complete.
 * - Removes the .cleanup-done marker so the next run starts fresh.
 * - When ENABLE_COVERAGE=true: merges all raw V8 coverage files into ONE report.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root = two levels up from this file (e2e-tests/playwright/global.teardown.js).
// All coverage I/O paths anchor to this so they're consistent with what the
// page fixture wrote, regardless of where the test command was invoked from.
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const markerFile = path.join(__dirname, '.cleanup-done');

// Source file extensions the walker indexes — covers TS/JS variants and
// common single-file-component formats (Vue, Svelte, Astro).
const SOURCE_EXT_RE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/;

/**
 * Walk one or more source roots and build a map: basename → full relative path.
 * Build tools' dev source maps often emit just basenames (e.g. "ListCard.tsx"),
 * losing the directory structure. This map lets us reconstruct paths
 * like "src/components/lists/ListCard.tsx" in the coverage report.
 *
 * @param {string[]} rootDirs - List of source root directories to walk.
 *   Configurable via COVERAGE_SOURCE_ROOTS env var (comma-separated).
 *   Defaults to ['src']; common alternatives: 'app', 'lib', 'packages/web/src'.
 *
 * Handles duplicates by keeping the LAST match (rare in practice).
 */
function buildSrcPathMap(rootDirs = ['src']) {
  const map = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (SOURCE_EXT_RE.test(entry.name)) {
        map[entry.name] = full;
      }
    }
  };
  for (const root of rootDirs) {
    if (fs.existsSync(root)) walk(root);
  }
  return map;
}

async function generateMergedCoverage() {
  const rawDir = path.join(PROJECT_ROOT, '.raw-coverage');
  if (!fs.existsSync(rawDir)) {
    console.log('[coverage] No raw coverage data — skipping merged report.');
    return;
  }
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('[coverage] Raw coverage directory empty — skipping merged report.');
    return;
  }

  const { CoverageReport } = await import('monocart-coverage-reports');

  // Build basename → full path lookup so the report tree matches the source structure.
  // Configurable via COVERAGE_SOURCE_ROOTS (comma-separated). Defaults to 'src'.
  // Common alternatives: 'app' (Next.js App Router), 'lib', 'packages/web/src'.
  const sourceRoots = (process.env.COVERAGE_SOURCE_ROOTS || 'src')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(PROJECT_ROOT, p));   // anchor to project root
  const srcMap = buildSrcPathMap(sourceRoots);
  console.log(`[coverage] Indexed ${Object.keys(srcMap).length} source files from [${sourceRoots.map(r => path.relative(PROJECT_ROOT, r) || '.').join(', ')}].`);

  // ─── Coverage Exclusions ─────────────────────────────────────────────────
  // Add patterns here to exclude files/directories from coverage measurement.
  // Each entry is a substring or RegExp tested against the resolved sourcePath.
  // Can also be supplied via COVERAGE_EXCLUDE env var (comma-separated).
  //
  // Examples:
  //   'src/legacy/'                  — exclude a directory
  //   '.stories.'                    — exclude all Storybook files
  //   '/__mocks__/'                  — exclude mocks
  //   /\.types\.tsx?$/               — regex: exclude *.types.ts/tsx
  //   'src/generated/'               — exclude codegen output
  const DEFAULT_EXCLUDES = [
    // Build artifacts
    'node_modules',
    '/dist/',
    '/build/',
    '/out/',
    '/.next/',
    // Bundler runtime (webpack/Vite/Turbopack internals)
    // Match paths starting with `webpack/...` (no leading slash) too
    /^webpack\//,
    '/webpack/',
    '/webpack-internal:/',
    'webpack-internal:',
    'webpack:///',
    // Virtual / generated modules
    'virtual:',
    'vite:',
    '/@vite/',
    '/@react-refresh',
    '/@fs/',
    // Tests, specs, mocks, stories
    /\.test\.(tsx?|jsx?|mjs|cjs)/,
    /\.spec\.(tsx?|jsx?|mjs|cjs)/,
    /\.stories\.(tsx?|jsx?|mjs|cjs|mdx)/,
    '/__mocks__/',
    '/__tests__/',
    '/setupTests',
    // Type-only files (no runtime code to measure)
    /\.d\.ts/,
    // Stylesheets (substring, not anchored — covers query strings + CSS modules)
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.styl',
    // CSS-module compile output with hash suffix (e.g. Foo.module.scss-baac)
    /\.(scss|sass|css|less|styl)-[a-f0-9]+/i,
    // Bundler virtual source-map "sources/..." prefixes
    /^sources\//,
    // Static assets imported via webpack/Vite/Turbopack as JS modules
    // (file-loader / url-loader / SVGR / asset modules wrap them as
    // `module.exports = "<url>"`, so V8 captures them as JS execution)
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.bmp',
    '.ico',
    '.tiff',
    '.tif',
    '.heic',
    // Fonts
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.eot',
    // Media
    '.mp4',
    '.webm',
    '.mp3',
    '.wav',
    '.ogg',
    '.flac',
    '.m4a',
    // Documents
    '.pdf',
    // Common CRA / Vite boilerplate that's not worth measuring
    '/reportWebVitals',
    '/serviceWorker',
    '/registerServiceWorker',
    '/vite-env',
    // External hosts (e.g. accounts.google.com)
    /^[a-z0-9.-]+\.[a-z]{2,}\//i,
    // Localhost pseudo-paths (HTML, etc.)
    /^localhost[-:]/,
  ];

  const envExcludes = (process.env.COVERAGE_EXCLUDE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ALL_EXCLUDES = [...DEFAULT_EXCLUDES, ...envExcludes];

  const isExcluded = (p) => {
    if (!p) return true;
    return ALL_EXCLUDES.some((rule) =>
      typeof rule === 'string' ? p.includes(rule) : rule.test(p),
    );
  };

  // Phantom-path filter: library sourcemaps often resolve to short paths like
  // "src/IdleTimer.js" or "src/MessageChannel/methods/broadcastChannel.js"
  // (from html5-qrcode, react-idle-timer, broadcast-channel, etc.). They look
  // like first-party app code but don't exist in this project. Reject any
  // source path that claims to be under a configured source root but isn't
  // present on disk. Result cached so the lookup runs once per unique path.
  const _existsCache = new Map();
  const isPhantomSrc = (p) => {
    if (!p) return false;
    // Only enforce for paths that LOOK like first-party src/ — leave others alone
    if (!sourceRoots.some((r) => p.startsWith(`${r}/`) || p.startsWith('src/'))) return false;
    if (_existsCache.has(p)) return _existsCache.get(p);
    const abs = path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p);
    const exists = fs.existsSync(abs);
    _existsCache.set(p, !exists);
    return !exists;
  };

  const report = new CoverageReport({
    name: 'Specwright E2E Code Coverage',
    outputDir: path.join(PROJECT_ROOT, 'reports/coverage'),
    // Filter served scripts — keep only app JS/TS from the local origin
    entryFilter: (entry) => {
      const url = entry.url || '';
      // Drop entries that aren't from our app origin (Google OAuth, third-party widgets)
      if (!url.startsWith('http://localhost') && !url.startsWith('https://localhost')) return false;
      // Drop vendor / dev-server internals (Vite + webpack + Next.js variants)
      if (url.includes('node_modules')) return false;
      if (url.includes('/@vite/')) return false;
      if (url.includes('/@fs/')) return false;
      if (url.includes('/@react-refresh')) return false;
      if (url.includes('/webpack/')) return false;
      if (url.includes('webpack-internal:')) return false;
      if (url.includes('webpack:///')) return false;
      // Drop non-JS resources (HTML pages, stylesheets — coverage tracks JS only)
      const path = url.split('?')[0];
      const isHtmlPath = !path.match(/\.(js|jsx|ts|tsx|mjs|cjs)$/) && !path.includes('/src/');
      if (isHtmlPath) return false;
      if (/\.(css|scss|sass|less|styl)(\?|$)/.test(path)) return false;
      return true;
    },
    // Filter source-mapped files — apply unified EXCLUDES list above and
    // drop phantom library paths that don't exist on disk
    sourceFilter: (sourcePath) => {
      const p = sourcePath || '';
      if (isExcluded(p)) return false;
      if (isPhantomSrc(p)) return false;
      return true;
    },
    reports: [
      ['v8'],
      ['console-summary'],
      ['lcov'],
      ['v8-json'],
    ],
    // Normalize source paths — reconstruct the full source tree from basenames.
    // Dev-server source maps often drop directory structure; we look up the
    // basename in srcMap (built from walking the configured source roots) and
    // substitute the real path.
    sourcePath: (filePath) => {
      // Skip paths already under a configured source root or in node_modules
      if (sourceRoots.some((r) => filePath.startsWith(`${r}/`))) return filePath;
      if (filePath.includes('node_modules')) return filePath;
      // Try to resolve basename → full source path via the indexed map
      const basename = filePath.split('/').pop();
      if (srcMap[basename]) return srcMap[basename];
      // Fallback: prepend the first source root for any recognised source extension
      if (!filePath.includes('/') && SOURCE_EXT_RE.test(filePath)) {
        return `${sourceRoots[0]}/${filePath}`;
      }
      return filePath;
    },
    clean: true,
  });

  console.log(`[coverage] Merging ${files.length} raw coverage files...`);
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    await report.add(data);
  }
  const summary = await report.generate();
  console.log(`[coverage] Merged report → reports/coverage/index.html`);
  console.log(`[coverage] Summary: ${summary.summary.lines.pct.toFixed(1)}% lines covered`);

  // Clean up raw files
  fs.rmSync(rawDir, { recursive: true, force: true });
}

export default async function globalTeardown() {
  console.log('[global.teardown] Starting global teardown...');

  if (fs.existsSync(markerFile)) {
    fs.unlinkSync(markerFile);
    console.log('[global.teardown] Marker file removed.');
  }

  if (process.env.ENABLE_COVERAGE === 'true') {
    try {
      await generateMergedCoverage();
    } catch (err) {
      console.log(`[coverage] Merge failed: ${err.message}`);
    }
  }

  console.log('[global.teardown] Teardown complete.');
}
