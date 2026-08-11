import { describe, expect, it } from "vitest";

import { applyBenchmarkDelta } from "./benchmark.js";
import type { ArchitectureDocument } from "./model.js";

describe("Phase 1 benchmark ground truth", () => {
  it("applies a topology delta without mutating the baseline", () => {
    const baseline: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "delta-test" },
      components: {
        service: { type: "service", layer: "domain" },
        database: { type: "database", layer: "data" },
      },
      relationships: [
        { from: "service", to: "database", type: "data" },
      ],
    };

    const observed = applyBenchmarkDelta(baseline, {
      components_added: {
        redis: { type: "cache", layer: "data" },
      },
      relationships_added: [
        { from: "service", to: "redis", type: "data" },
      ],
    });

    expect(Object.keys(baseline.components)).toEqual(["service", "database"]);
    expect(Object.keys(observed.components)).toEqual([
      "service",
      "database",
      "redis",
    ]);
    expect(observed.relationships).toHaveLength(2);
  });
});
