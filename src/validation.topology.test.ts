import { describe, expect, it } from "vitest";

import type { ArchitectureDocument } from "./model.js";
import { validateArchitectureSemantics } from "./validation.js";

function baseline(): ArchitectureDocument {
  return {
    version: "0.1",
    metadata: { name: "topology-review" },
    components: {
      frontend: { type: "frontend", layer: "experience" },
      service: { type: "service", layer: "domain" },
      database: { type: "database", layer: "data" },
    },
    relationships: [
      { id: "frontend-to-service", from: "frontend", to: "service", type: "http" },
      { id: "service-to-database", from: "service", to: "database", type: "data" },
    ],
    rules: [
      { id: "ARCH-001", type: "deny", from: "frontend", to: "database", severity: "error" },
    ],
    quality_goals: [
      { id: "PERF-001", attribute: "performance", scope: "service", metric: "p95_ms", operator: "<=", target: 200, priority: "high" },
    ],
  };
}

interface TopologyScenario {
  name: string;
  arrange: (document: ArchitectureDocument) => void;
  expectedPath: string;
  expectedKeyword: "reference" | "duplicate" | "semantic";
}

const rejectedScenarios: TopologyScenario[] = [
  {
    name: "relationship source does not exist",
    arrange: (document) => { document.relationships[0]!.from = "missing"; },
    expectedPath: "/relationships/0/from",
    expectedKeyword: "reference",
  },
  {
    name: "relationship target does not exist",
    arrange: (document) => { document.relationships[0]!.to = "missing"; },
    expectedPath: "/relationships/0/to",
    expectedKeyword: "reference",
  },
  {
    name: "self relationship is declared",
    arrange: (document) => { document.relationships[0]!.to = "frontend"; },
    expectedPath: "/relationships/0",
    expectedKeyword: "semantic",
  },
  {
    name: "topology edge is duplicated",
    arrange: (document) => { document.relationships.push({ from: "frontend", to: "service", type: "http" }); },
    expectedPath: "/relationships/2",
    expectedKeyword: "duplicate",
  },
  {
    name: "relationship id is duplicated",
    arrange: (document) => { document.relationships[1]!.id = "frontend-to-service"; },
    expectedPath: "/relationships",
    expectedKeyword: "duplicate",
  },
  {
    name: "rule id is duplicated",
    arrange: (document) => { document.rules!.push({ ...document.rules![0]! }); },
    expectedPath: "/rules",
    expectedKeyword: "duplicate",
  },
  {
    name: "rule source selector does not exist",
    arrange: (document) => { document.rules![0]!.from = "missing"; },
    expectedPath: "/rules/0/from",
    expectedKeyword: "reference",
  },
  {
    name: "rule target selector does not exist",
    arrange: (document) => { document.rules![0]!.to = "missing"; },
    expectedPath: "/rules/0/to",
    expectedKeyword: "reference",
  },
  {
    name: "quality goal id is duplicated",
    arrange: (document) => { document.quality_goals!.push({ ...document.quality_goals![0]! }); },
    expectedPath: "/quality_goals",
    expectedKeyword: "duplicate",
  },
  {
    name: "quality goal scope does not exist",
    arrange: (document) => { document.quality_goals![0]!.scope = "missing"; },
    expectedPath: "/quality_goals/0/scope",
    expectedKeyword: "reference",
  },
];

describe("schema v0.1 topology review", () => {
  it("keeps at least ten rejected topology scenarios in the contract", () => {
    expect(rejectedScenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("accepts a valid three-layer topology", () => {
    expect(validateArchitectureSemantics(baseline())).toEqual([]);
  });

  it("accepts wildcard rule selectors reserved by schema v0.1", () => {
    const document = baseline();
    document.rules![0]!.from = "*";
    document.rules![0]!.to = "*-service";

    expect(validateArchitectureSemantics(document)).toEqual([]);
  });

  for (const scenario of rejectedScenarios) {
    it(`rejects topology scenario: ${scenario.name}`, () => {
      const document = baseline();
      scenario.arrange(document);

      expect(validateArchitectureSemantics(document)).toContainEqual(
        expect.objectContaining({
          path: scenario.expectedPath,
          keyword: scenario.expectedKeyword,
        }),
      );
    });
  }
});
