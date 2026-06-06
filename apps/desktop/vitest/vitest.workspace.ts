import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@renderer": path.resolve(__dirname, "..", "src", "renderer", "src") };

export default defineConfig({
  test: {
    reporters: ["default", ["allure-vitest/reporter", { resultsDir: "test-results/allure/results" }]],
    name: "unit",
    include: ["src/**/*.unit.spec.ts", "src/**/*.unit.spec.tsx"],
    environment: "node",
    projects: [
      {
        test: {
          name: "component",
          include: ["src/**/*.component.spec.ts", "src/**/*.component.spec.tsx"],
          environment: "jsdom",
        },
        resolve: { alias },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.spec.ts", "src/**/*.integration.spec.tsx"],
          environment: "node",
        },
        resolve: { alias },
      },
    ],
  },
  resolve: { alias },
});
