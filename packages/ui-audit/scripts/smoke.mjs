import { chromium } from "@playwright/test";
import { auditPlaywrightPage, hasBlockingUiAuditIssues } from "../dist/index.js";

const browser = await chromium.launch({ headless: true });

try {
  await verifyCleanPage();
  await verifyProblemPage();
  console.log("UI audit smoke: passed");
} finally {
  await browser.close();
}

async function verifyCleanPage() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.setContent("<button style='width:44px;height:44px'>OK</button>");
    const audit = await auditPlaywrightPage(page);
    assert(audit.issues.length === 0, `Expected clean page, got ${JSON.stringify(audit.issues)}`);
  } finally {
    await page.close();
  }
}

async function verifyProblemPage() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.setContent("<button style='position:absolute;left:0;top:0;width:30px;height:30px'>A</button><button style='position:absolute;left:10px;top:10px;width:30px;height:30px'>B</button><div style='width:1200px'>undefined</div>");
    const audit = await auditPlaywrightPage(page);
    assert(hasBlockingUiAuditIssues(audit), `Expected blocking issue, got ${JSON.stringify(audit.issues)}`);
    assert(audit.issues.some((issue) => issue.id === "copy.forbidden-visible-text"), `Expected forbidden text issue, got ${JSON.stringify(audit.issues)}`);
  } finally {
    await page.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
