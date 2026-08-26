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
        "src/serialization.ts",
        "src/validation.ts",
        "src/versions.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
