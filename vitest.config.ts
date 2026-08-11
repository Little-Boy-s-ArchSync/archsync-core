import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/benchmark.ts",
        "src/conformance.ts",
        "src/conformance-report.ts",
        "src/drawio.ts",
        "src/graph.ts",
        "src/mermaid.ts",
        "src/validation.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
