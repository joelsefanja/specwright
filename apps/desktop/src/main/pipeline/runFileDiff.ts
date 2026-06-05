import fs from "fs";
import path from "path";

export interface SpecwrightFileSnapshot {
  files: Record<string, string>;
}

export interface SpecwrightFileDiff {
  diff: string;
  changedFiles: string[];
}

const DIFF_ROOTS = [
  "e2e-tests/features",
  "e2e-tests/playwright",
  ".features-gen",
  "playwright.config.ts",
];

const MAX_FILE_BYTES = 240_000;
const MAX_DIFF_LINES_PER_FILE = 600;

export function createSpecwrightFileSnapshot(projectPath: string): SpecwrightFileSnapshot {
  const files: Record<string, string> = {};

  for (const root of DIFF_ROOTS) {
    const absoluteRoot = path.join(projectPath, root);
    if (!fs.existsSync(absoluteRoot)) continue;

    const stat = fs.statSync(absoluteRoot);
    if (stat.isDirectory()) {
      collectDirectoryFiles(projectPath, absoluteRoot, files);
    } else if (stat.isFile()) {
      collectFile(projectPath, absoluteRoot, files);
    }
  }

  return { files };
}

export function createSpecwrightFileDiff(before: SpecwrightFileSnapshot, after: SpecwrightFileSnapshot): SpecwrightFileDiff {
  const changedFiles = Array.from(new Set([...Object.keys(before.files), ...Object.keys(after.files)]))
    .filter((relativePath) => before.files[relativePath] !== after.files[relativePath])
    .sort((a, b) => a.localeCompare(b));

  const sections = changedFiles.map((relativePath) => formatFileDiff(relativePath, before.files[relativePath], after.files[relativePath]));
  return { changedFiles, diff: sections.join("\n") };
}

function collectDirectoryFiles(projectPath: string, directoryPath: string, files: Record<string, string>): void {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collectDirectoryFiles(projectPath, absolutePath, files);
      continue;
    }

    if (entry.isFile()) {
      collectFile(projectPath, absolutePath, files);
    }
  }
}

function collectFile(projectPath: string, absolutePath: string, files: Record<string, string>): void {
  const relativePath = normalizeRelativePath(path.relative(projectPath, absolutePath));
  if (shouldSkipFile(relativePath)) return;

  const stat = fs.statSync(absolutePath);
  if (stat.size > MAX_FILE_BYTES) return;

  const buffer = fs.readFileSync(absolutePath);
  if (buffer.includes(0)) return;

  files[relativePath] = buffer.toString("utf-8");
}

function shouldSkipFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.includes("/.auth/")
    || lower.includes("/auth/")
    || lower.includes("/data/migrations/files/")
    || lower.endsWith("/.env.testing")
    || lower.endsWith(".png")
    || lower.endsWith(".jpg")
    || lower.endsWith(".jpeg")
    || lower.endsWith(".webp")
    || lower.endsWith(".zip");
}

function formatFileDiff(relativePath: string, before: string | undefined, after: string | undefined): string {
  const beforeLines = splitLines(before ?? "");
  const afterLines = splitLines(after ?? "");
  const header = [
    `diff --specwright a/${relativePath} b/${relativePath}`,
    before === undefined ? "--- /dev/null" : `--- a/${relativePath}`,
    after === undefined ? "+++ /dev/null" : `+++ b/${relativePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ];
  const body = [
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ];
  const truncatedBody = body.slice(0, MAX_DIFF_LINES_PER_FILE);
  if (body.length > truncatedBody.length) {
    truncatedBody.push(`... diff truncated after ${MAX_DIFF_LINES_PER_FILE} lines`);
  }

  return [...header, ...truncatedBody].join("\n");
}

function splitLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [];
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
