import type { UiAuditCategory, UiAuditIssue, UiAuditSeverity } from "./types.js";

export const BLOCKING_SEVERITIES = new Set<UiAuditSeverity>(["error"]);

export const ISSUE_DEFINITIONS = {
  missingThemeAttribute: {
    id: "theme.missing-theme-attribute",
    severity: "warning",
    category: "theme",
    message: "Missing configured theme data attribute on documentElement.",
  },
  missingMotionAttribute: {
    id: "motion.missing-motion-attribute",
    severity: "warning",
    category: "motion",
    message: "Missing configured motion data attribute on documentElement.",
  },
  horizontalOverflow: {
    id: "layout.horizontal-overflow",
    severity: "error",
    category: "layout",
    message: "Visible element overflows the viewport horizontally.",
  },
  documentHorizontalScroll: {
    id: "layout.document-horizontal-scroll",
    severity: "error",
    category: "layout",
    message: "Document has horizontal scroll.",
  },
  interactiveOverlap: {
    id: "layout.interactive-overlap",
    severity: "error",
    category: "layout",
    message: "Interactive elements overlap.",
  },
  touchTargetSmall: {
    id: "accessibility.touch-target-small",
    severity: "warning",
    category: "accessibility",
    message: "Interactive target is smaller than configured minimum.",
  },
  buttonLabelLong: {
    id: "copy.button-label-long",
    severity: "warning",
    category: "copy",
    message: "Button label is long and may wrap or become unclear.",
  },
  forbiddenVisibleText: {
    id: "copy.forbidden-visible-text",
    severity: "warning",
    category: "copy",
    message: "Visible copy contains forbidden text.",
  },
  unexpectedFontFamily: {
    id: "font.unexpected-family",
    severity: "warning",
    category: "font",
    message: "Element uses a font outside the configured family allowlist.",
  },
  motionDurationTooLong: {
    id: "motion.duration-too-long",
    severity: "warning",
    category: "motion",
    message: "Motion duration exceeds configured maximum.",
  },
  layoutTransitionProperty: {
    id: "motion.layout-transition-property",
    severity: "warning",
    category: "motion",
    message: "Transition animates layout-affecting property. Prefer transform or opacity.",
  },
  tooManyAnimatedElements: {
    id: "motion.too-many-animated-elements",
    severity: "warning",
    category: "motion",
    message: "Many visible elements have active transition or animation durations.",
  },
} as const satisfies Record<string, { id: string; message: string } & {
  severity: UiAuditSeverity;
  category: UiAuditCategory;
}>;

export type UiAuditIssueKey = keyof typeof ISSUE_DEFINITIONS;
export type UiAuditIssueId = typeof ISSUE_DEFINITIONS[UiAuditIssueKey]["id"];

export function createUiAuditIssue(
  key: UiAuditIssueKey,
  input: Pick<UiAuditIssue, "selector" | "details"> = {},
): UiAuditIssue {
  return {
    ...ISSUE_DEFINITIONS[key],
    ...input,
  };
}

export function isBlockingIssue(issue: Pick<UiAuditIssue, "severity">): boolean {
  return BLOCKING_SEVERITIES.has(issue.severity);
}
