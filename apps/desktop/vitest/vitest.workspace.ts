import { defineConfig } from "vitest/config";

const reporters = ["default", ["allure-vitest/reporter", { resultsDir: "test-results/allure/results" }]] as const;

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
        },
      },
      {
        test: {
          name: "component",
          include: ["src/**/*.component.spec.ts", "src/**/*.component.spec.tsx"],
          environment: "jsdom",
          globals: false,
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.spec.ts", "src/**/*.integration.spec.tsx"],
          environment: "node",
          globals: false,
        },
      },
    ],
  },
});
