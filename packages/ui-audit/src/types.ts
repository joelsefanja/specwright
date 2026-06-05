export type UiAuditSeverity = "error" | "warning";
export type UiAuditCategory = "layout" | "copy" | "font" | "theme" | "motion" | "accessibility";

export interface UiAuditIssue {
  id: string;
  severity: UiAuditSeverity;
  category: UiAuditCategory;
  message: string;
  selector?: string;
  details?: Record<string, unknown>;
}

export interface UiAuditOptions {
  allowedFontFamilies?: string[];
  forbiddenVisibleText?: string[];
  maxButtonTextLength?: number;
  minTouchTarget?: number;
  themeAttribute?: string | false;
  motionAttribute?: string | false;
  maxMotionDurationMs?: number;
  maxAnimatedElements?: number;
  disallowLayoutTransitionProperties?: boolean;
}

export interface ResolvedUiAuditOptions {
  allowedFontFamilies: string[];
  forbiddenVisibleText: string[];
  maxButtonTextLength: number;
  minTouchTarget: number;
  themeAttribute: string | false;
  motionAttribute: string | false;
  maxMotionDurationMs: number;
  maxAnimatedElements: number;
  disallowLayoutTransitionProperties: boolean;
}

export interface UiAuditSnapshot {
  url?: string;
  title?: string;
  theme?: string;
  motion?: string;
  viewport: { width: number; height: number };
  issues: UiAuditIssue[];
}

export interface AuditPageLike {
  title(): Promise<string>;
  url(): string;
  viewportSize(): { width: number; height: number } | null;
  evaluate<T, A>(pageFunction: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
}
