import path from "node:path";
import { defineConfig } from "vitest/config";

const reporters = ["default", ["allure-vitest/reporter", { resultsDir: "test-results/allure/results" }]] as const;

const resolveAlias = {
  "@renderer": path.resolve(__dirname, "..", "src", "renderer", "src"),
};

export default defineConfig({
  test: {
    reporters,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.unit.spec.ts", "src/**/*.unit.spec.tsx"],
          environment: "node",
          globals: false,
          alias: resolveAlias,
        },
      },
      {
        test: {
          name: "component",
          include: ["src/**/*.component.spec.ts", "src/**/*.component.spec.tsx"],
          environment: "jsdom",
          globals: false,
          alias: resolveAlias,
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.spec.ts", "src/**/*.integration.spec.tsx"],
          environment: "node",
          globals: false,
          alias: resolveAlias,
        },
      },
    ],
  },
});
