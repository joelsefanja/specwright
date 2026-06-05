import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { resolveE2eRunCommand } from "./runCommandResolver";

function createProject(): string {
  const projectPath = path.join(tmpdir(), `specwright-command-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const workflowPath = path.join(projectPath, "e2e-tests", "features", "playwright-bdd", "@Workflows", "@CheckoutFlow");
  const modulePath = path.join(projectPath, "e2e-tests", "features", "playwright-bdd", "@Modules", "@CartPage");

  mkdirSync(workflowPath, { recursive: true });
  mkdirSync(modulePath, { recursive: true });
  writeFileSync(path.join(projectPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({
    scripts: {
      "test:bdd": "bddgen && playwright test --project main-e2e",
      "test:bdd:workflows": "bddgen && playwright test --project precondition --project workflow-consumers",
      "test:bdd:auth": "bddgen && playwright test --project auth-tests",
    },
  }, null, 2));
  writeFileSync(path.join(workflowPath, "checkout.feature"), "@checkout-flow\nFeature: Checkout\n");
  writeFileSync(path.join(modulePath, "cart.feature"), "@cart-page\nFeature: Cart\n");

  return projectPath;
}

test("resolves default and focused E2E run commands", () => {
  const projectPath = createProject();
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  expect(resolveE2eRunCommand(projectPath, "")).toMatchObject({
    command: pnpm,
    args: ["run", "test:bdd"],
  });
  expect(resolveE2eRunCommand(projectPath, "@CheckoutFlow")).toMatchObject({
    command: pnpm,
    args: ["run", "test:bdd:workflows", "--", "--grep", "@checkout-flow"],
  });
  expect(resolveE2eRunCommand(projectPath, "@CartPage")).toMatchObject({
    command: pnpm,
    args: ["run", "test:bdd", "--", "--grep", "@cart-page"],
  });
  expect(resolveE2eRunCommand(projectPath, "--grep @cart-page")).toMatchObject({
    command: pnpm,
    args: ["exec", "playwright", "test", "--grep", "@cart-page"],
  });
});
