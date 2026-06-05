import { isBlockingIssue } from "./issues.js";
import type { UiAuditSnapshot } from "./types.js";

export function summarizeUiAudit(snapshot: UiAuditSnapshot): string {
  const errors = snapshot.issues.filter(isBlockingIssue).length;
  const warnings = snapshot.issues.length - errors;
  return `UI audit: ${errors} error(s), ${warnings} warning(s)${snapshot.theme ? `, theme=${snapshot.theme}` : ""}${snapshot.motion ? `, motion=${snapshot.motion}` : ""}`;
}

export function hasBlockingUiAuditIssues(snapshot: UiAuditSnapshot): boolean {
  return snapshot.issues.some(isBlockingIssue);
}
