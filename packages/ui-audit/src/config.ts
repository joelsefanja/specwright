import type { ResolvedUiAuditOptions, UiAuditOptions } from "./types.js";

export const defaultUiAuditOptions: ResolvedUiAuditOptions = {
  allowedFontFamilies: [],
  forbiddenVisibleText: ["undefined", "null", "lorem ipsum"],
  maxButtonTextLength: 34,
  minTouchTarget: 36,
  themeAttribute: false,
  motionAttribute: false,
  maxMotionDurationMs: 500,
  maxAnimatedElements: 24,
  disallowLayoutTransitionProperties: true,
};

export function resolveUiAuditOptions(options: UiAuditOptions = {}): ResolvedUiAuditOptions {
  return {
    ...defaultUiAuditOptions,
    ...options,
    allowedFontFamilies: options.allowedFontFamilies ?? defaultUiAuditOptions.allowedFontFamilies,
    forbiddenVisibleText: options.forbiddenVisibleText ?? defaultUiAuditOptions.forbiddenVisibleText,
  };
}
