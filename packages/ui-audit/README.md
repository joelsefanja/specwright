# @specwright/ui-audit

Deterministic UI audits for layout, copy, fonts, theme, motion, and accessibility. Use it before visual or AI review to catch mechanical UI regressions quickly and consistently.

## Package Status

This package is private in the monorepo for now. It is structured like a publishable package so it can later become a public npm package after the API settles.

## CLI

```bash
pnpm --filter @specwright/ui-audit build
pnpm --filter @specwright/ui-audit exec specwright-ui-audit \
  --url http://localhost:5173 \
  --config ui-audit.config.json \
  --theme light,dark \
  --motion reduced,standard \
  --output ui-audit-report.json
```

The CLI exits with `1` when blocking layout issues are found.

Example config:

```json
{
  "themes": ["light", "dark"],
  "motions": ["reduced", "standard"],
  "viewport": { "width": 1440, "height": 1000 },
  "audit": {
    "allowedFontFamilies": ["Inter", "system-ui"],
    "forbiddenVisibleText": ["undefined", "null", "lorem ipsum"],
    "themeAttribute": "theme",
    "motionAttribute": "motion",
    "maxMotionDurationMs": 500,
    "maxAnimatedElements": 24
  }
}
```

## TypeScript Diagnostics

Use this to collect TypeScript errors into a machine-readable report. It does not guess fixes; it makes the error list deterministic so an agent or developer can fix the exact failing files quickly.

```bash
specwright-ui-audit ts --project tsconfig.json --output test-results/ts-diagnostics.json
```

Recommended loop:

1. Run `specwright-ui-audit ts`.
2. Fix the reported file/line errors.
3. Run it again until diagnostics are `0`.
4. Then run the UI audit/E2E checks.

## Playwright Adapter

```ts
import { test, expect } from "@playwright/test";
import { auditPlaywrightPage, hasBlockingUiAuditIssues } from "@specwright/ui-audit";

test("page passes UI audit", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.motion = "standard";
  });
  const audit = await auditPlaywrightPage(page, {
    allowedFontFamilies: ["Inter", "system-ui"],
    themeAttribute: "theme",
    motionAttribute: "motion",
  });
  expect(hasBlockingUiAuditIssues(audit), JSON.stringify(audit.issues, null, 2)).toBe(false);
});
```

## Checks

- horizontal overflow
- document horizontal scroll
- overlapping interactive elements
- small interactive targets
- long button labels
- forbidden visible copy such as `undefined`, `null`, or placeholder text
- unexpected font families
- missing configured theme or motion data attributes
- long motion durations
- transitions on layout-affecting properties
- too many animated elements

## Recommended Matrix

- themes: your product-supported themes
- motion: your product-supported motion modes
- widths: `390`, `768`, `1440`

Keep AI/vision review as a later layer. This package should remain deterministic and fast.
