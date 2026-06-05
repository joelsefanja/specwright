import { resolveUiAuditOptions } from "./config.js";
import { ISSUE_DEFINITIONS, type UiAuditIssueKey } from "./issues.js";
import type { AuditPageLike, ResolvedUiAuditOptions, UiAuditIssue, UiAuditOptions, UiAuditSnapshot } from "./types.js";

interface BrowserAuditInput {
  options: ResolvedUiAuditOptions;
  issueDefinitions: typeof ISSUE_DEFINITIONS;
}

interface BrowserAuditResult {
  issues: UiAuditIssue[];
  motion?: string;
  theme?: string;
  viewport: { width: number; height: number };
}

export async function auditPlaywrightPage(page: AuditPageLike, options: UiAuditOptions = {}): Promise<UiAuditSnapshot> {
  const browserResult = await page.evaluate(runBrowserAudit, {
    options: resolveUiAuditOptions(options),
    issueDefinitions: ISSUE_DEFINITIONS,
  });
  return {
    url: page.url(),
    title: await page.title(),
    theme: browserResult.theme,
    motion: browserResult.motion,
    viewport: page.viewportSize() ?? browserResult.viewport,
    issues: browserResult.issues,
  };
}

function runBrowserAudit({ options, issueDefinitions }: BrowserAuditInput): BrowserAuditResult {
  const issues: UiAuditIssue[] = [];
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const selectors = {
    auditedInteractive: "button, a, input, textarea, select, [role='button'], [data-ui-audit]",
    button: "button, [role='button']",
    interactive: "button, a, input, textarea, select, [role='button']",
    overlap: "button, a, input, textarea, select, [role='button'], dialog, [data-ui-audit-overlap]",
    text: "body, button, input, textarea, select, h1, h2, h3, p, span, label, code",
  };
  const testIdAttributes = ["data-testid", "data-test-id"];
  const layoutTransitionProperties = new Set(["all", "width", "height", "top", "right", "bottom", "left", "margin", "padding"]);
  const maxFontElementsToCheck = 250;
  const overlapToleranceArea = 16;
  const viewportTolerancePx = 1;

  [
    auditThemeAndMotion,
    auditElements,
    auditCopy,
    auditFonts,
    auditOverlaps,
    auditDocumentOverflow,
    auditMotion,
  ].forEach((check) => check());

  return {
    issues,
    motion: readDataAttribute(options.motionAttribute),
    theme: readDataAttribute(options.themeAttribute),
    viewport,
  };

  function auditThemeAndMotion(): void {
    const attributes = [
      { attribute: options.themeAttribute, issue: "missingThemeAttribute" },
      { attribute: options.motionAttribute, issue: "missingMotionAttribute" },
    ] as const;

    attributes
      .filter(({ attribute }) => Boolean(attribute) && !readDataAttribute(attribute))
      .forEach(({ attribute, issue }) => report(issue, { details: { attribute: `data-${attribute}` } }));
  }

  function auditElements(): void {
    for (const element of visibleElements(selectors.auditedInteractive)) {
      const rect = element.getBoundingClientRect();
      const selector = selectorFor(element);
      const text = normalizedText(element.innerText || element.textContent || "");

      reportWhen(overflowsViewport(rect), "horizontalOverflow", { selector, details: rectDetails(rect) });
      reportWhen(isSmallInteractiveTarget(element, rect), "touchTargetSmall", {
        selector,
        details: { width: rect.width, height: rect.height, min: options.minTouchTarget },
      });
      reportWhen(isLongButtonLabel(element, text), "buttonLabelLong", {
        selector,
        details: { text, max: options.maxButtonTextLength },
      });
    }
  }

  function auditCopy(): void {
    const pageText = normalizedText(document.body.innerText || "").toLowerCase();
    options.forbiddenVisibleText
      .filter((forbidden) => pageText.includes(forbidden.toLowerCase()))
      .forEach((forbidden) => report("forbiddenVisibleText", { details: { text: forbidden } }));
  }

  function auditFonts(): void {
    if (options.allowedFontFamilies.length === 0) return;

    const unexpectedElement = visibleElements(selectors.text)
      .slice(0, maxFontElementsToCheck)
      .find((element) => hasText(element) && !usesAllowedFont(element));
    if (!unexpectedElement) return;

    report("unexpectedFontFamily", {
      selector: selectorFor(unexpectedElement),
      details: { fontFamily: window.getComputedStyle(unexpectedElement).fontFamily },
    });
  }

  function auditOverlaps(): void {
    const elements = visibleElements(selectors.overlap);
    for (let firstIndex = 0; firstIndex < elements.length; firstIndex += 1) {
      const first = elements[firstIndex];
      const overlap = elements.slice(firstIndex + 1).find((second) => areComparableElements(first, second) && overlaps(first.getBoundingClientRect(), second.getBoundingClientRect()));
      if (!overlap) continue;

      report("interactiveOverlap", {
        selector: selectorFor(first),
        details: {
          other: selectorFor(overlap),
          first: rectDetails(first.getBoundingClientRect()),
          second: rectDetails(overlap.getBoundingClientRect()),
        },
      });
    }
  }

  function auditDocumentOverflow(): void {
    reportWhen(document.documentElement.scrollWidth > viewport.width + viewportTolerancePx, "documentHorizontalScroll", {
      details: { scrollWidth: document.documentElement.scrollWidth, viewportWidth: viewport.width },
    });
  }

  function auditMotion(): void {
    let animatedCount = 0;
    for (const element of visibleElements("*")) {
      const style = window.getComputedStyle(element);
      const transitionDurations = parseTimeList(style.transitionDuration);
      const durations = [...transitionDurations, ...parseTimeList(style.animationDuration)];

      if (durations.some(isPositiveDuration)) animatedCount += 1;

      const tooLong = durations.find((duration) => duration > options.maxMotionDurationMs);
      if (tooLong !== undefined) {
        report("motionDurationTooLong", {
          selector: selectorFor(element),
          details: { durationMs: tooLong, maxMotionDurationMs: options.maxMotionDurationMs },
        });
        break;
      }

      const layoutProperty = options.disallowLayoutTransitionProperties
        ? animatedLayoutTransitionProperty(style.transitionProperty, transitionDurations)
        : undefined;
      if (layoutProperty) {
        report("layoutTransitionProperty", {
          selector: selectorFor(element),
          details: { property: layoutProperty },
        });
        break;
      }
    }

    reportWhen(animatedCount > options.maxAnimatedElements, "tooManyAnimatedElements", {
      details: { animatedCount, maxAnimatedElements: options.maxAnimatedElements },
    });
  }

  function report(issue: UiAuditIssueKey, input: Pick<UiAuditIssue, "selector" | "details"> = {}): void {
    issues.push({ ...issueDefinitions[issue], ...input });
  }

  function reportWhen(condition: boolean, issue: UiAuditIssueKey, input?: Pick<UiAuditIssue, "selector" | "details">): void {
    if (condition) report(issue, input);
  }

  function visibleElements(selector: string): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
  }

  function isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function readDataAttribute(attribute: string | false): string | undefined {
    if (!attribute) return undefined;
    const key = attribute.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return document.documentElement.dataset[key];
  }

  function parseTimeList(value: string): number[] {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.endsWith("ms") ? Number(item.slice(0, -2)) : Number(item.replace(/s$/, "")) * 1000))
      .filter(Number.isFinite);
  }

  function animatedLayoutTransitionProperty(transitionProperty: string, transitionDurations: number[]): string | undefined {
    if (!transitionDurations.some(isPositiveDuration)) return undefined;
    return transitionProperty
      .split(",")
      .map((property) => property.trim().toLowerCase())
      .find((property) => layoutTransitionProperties.has(property));
  }

  function isPositiveDuration(duration: number): boolean {
    return duration > 0;
  }

  function overflowsViewport(rect: DOMRect): boolean {
    return rect.right > viewport.width + viewportTolerancePx || rect.left < -viewportTolerancePx;
  }

  function isSmallInteractiveTarget(element: HTMLElement, rect: DOMRect): boolean {
    return element.matches(selectors.interactive) && (rect.width < options.minTouchTarget || rect.height < options.minTouchTarget);
  }

  function isLongButtonLabel(element: HTMLElement, text: string): boolean {
    return element.matches(selectors.button) && text.length > options.maxButtonTextLength;
  }

  function usesAllowedFont(element: HTMLElement): boolean {
    const fontFamily = window.getComputedStyle(element).fontFamily.toLowerCase();
    return options.allowedFontFamilies.some((font) => fontFamily.includes(font.toLowerCase()));
  }

  function hasText(element: HTMLElement): boolean {
    return Boolean(element.textContent?.trim());
  }

  function areComparableElements(first: HTMLElement, second: HTMLElement): boolean {
    return !first.contains(second) && !second.contains(first);
  }

  function overlaps(first: DOMRect, second: DOMRect): boolean {
    const x = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const y = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return x * y > overlapToleranceArea;
  }

  function rectDetails(rect: DOMRect): Record<string, number> {
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function normalizedText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function selectorFor(element: HTMLElement): string {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const testId = testIdAttributes.map((attribute) => element.getAttribute(attribute)).find(Boolean);
    if (testId) return `[data-testid='${testId.replace(/'/g, "\\'")}']`;
    const label = normalizedText(element.getAttribute("aria-label") || element.innerText || element.textContent || "").slice(0, 40);
    return `${element.tagName.toLowerCase()}${label ? `[text='${label.replace(/'/g, "\\'")}']` : ""}`;
  }
}
