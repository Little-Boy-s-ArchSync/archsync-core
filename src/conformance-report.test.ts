import { describe, expect, it } from "vitest";

import {
  analyzeConformance,
  type ConformanceResult,
} from "./conformance.js";
import {
  generateConformanceDrawio,
  generateConformanceMermaid,
} from "./conformance-report.js";
import type { ArchitectureDocument } from "./model.js";

function models(): { expected: ArchitectureDocument; observed: ArchitectureDocument } {
  const expected: ArchitectureDocument = {
    version: "0.1",
    metadata: { name: "report-test" },
    components: {
      frontend: { name: "Storefront", type: "frontend", layer: "experience" },
      service: { name: "Service", type: "service", layer: "domain" },
      database: { name: "Database", type: "database", layer: "data" },
    },
    relationships: [
      { from: "frontend", to: "service", type: "http" },
      { from: "service", to: "database", type: "data" },
    ],
    rules: [
      { id: "ARCH-001", type: "deny", from: "frontend", to: "database", severity: "critical" },
      { id: "ARCH-002", type: "require", from: "service", to: "database", relationship_type: "data", severity: "error" },
    ],
  };
  const observed = structuredClone(expected);
  observed.relationships = [
    { from: "frontend", to: "service", type: "http" },
    { from: "frontend", to: "database", type: "data" },
  ];
  return { expected, observed };
}

describe("conformance report rendering", () => {
  it("highlights forbidden and missing edges in Mermaid", () => {
    const { expected, observed } = models();
    const result = analyzeConformance(expected, observed);
    const report = generateConformanceMermaid(expected, observed, result);

    expect(report).toContain("ArchSync: VIOLATION · 2 violations");
    expect(report).toContain("data · ARCH-001");
    expect(report).toContain("MISSING data · ARCH-002");
    expect(report).toContain("stroke:#dc2626,stroke-width:4px");
    expect(report).toBe(generateConformanceMermaid(expected, observed, result));
  });

  it("creates deterministic editable draw.io XML with violation styling", () => {
    const { expected, observed } = models();
    const result = analyzeConformance(expected, observed);
    const report = generateConformanceDrawio(expected, observed, result);

    expect(report).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(report).toContain("VIOLATION (2 violations");
    expect(report).toContain("MISSING data · ARCH-002");
    expect(report).toContain("strokeColor=#dc2626;strokeWidth=4");
    expect(report).toBe(generateConformanceDrawio(expected, observed, result));
  });

  it("marks an approved-candidate topology addition as evolution", () => {
    const { expected, observed } = models();
    observed.relationships = structuredClone(expected.relationships);
    observed.components.redis = { name: "Redis", type: "cache", layer: "data" };
    observed.relationships.push({ from: "service", to: "redis", type: "data" });
    const result = analyzeConformance(expected, observed);

    const report = generateConformanceMermaid(expected, observed, result);
    expect(result.classification).toBe("evolution");
    expect(report).toContain('redis["Redis · EVOLUTION"]:::evolution');
    expect(report).toContain("stroke:#ea580c,stroke-width:3px");
  });

  it("renders a removed relationship as a gray dashed evolution", () => {
    const { expected, observed } = models();
    observed.relationships = expected.relationships.filter((edge) => edge.from !== "frontend");
    const result = analyzeConformance(expected, observed);

    const mermaid = generateConformanceMermaid(expected, observed, result);
    const drawio = generateConformanceDrawio(expected, observed, result);
    expect(result.classification).toBe("evolution");
    expect(mermaid).toContain("REMOVED http");
    expect(mermaid).toContain("stroke:#94a3b8,stroke-width:2px,stroke-dasharray:6 4");
    expect(drawio).toContain("REMOVED http");
    expect(drawio).toContain("strokeColor=#94a3b8;strokeWidth=1");
    expect(drawio).toContain("dashed=1;dashPattern=6 4;opacity=70");
  });

  it("renders changed and removed nodes, singular labels, id fallbacks and relationship fallbacks", () => {
    const { expected, observed } = models();
    expected.rules = [];
    observed.rules = [];
    delete observed.components.frontend!.name;
    observed.components.service!.technology = "Bun";
    delete observed.components.database;
    observed.relationships = [{ from: "frontend", to: "service", type: "http" }];
    const result = analyzeConformance(expected, observed);

    const mermaid = generateConformanceMermaid(expected, observed, result);
    const drawio = generateConformanceDrawio(expected, observed, result);

    expect(mermaid).toContain('frontend["frontend · EVOLUTION"]');
    expect(mermaid).toContain("Service · EVOLUTION");
    expect(mermaid).toContain("Database · REMOVED");
    expect(drawio).toContain("service · domain · EVOLUTION");
    expect(drawio).toContain("database · data · REMOVED");
  });

  it("handles a synthetic singular violation without endpoints or relationship type", () => {
    const { expected, observed } = models();
    const clean = analyzeConformance(expected, structuredClone(expected));
    const result: ConformanceResult = {
      ...clean,
      classification: "violation",
      findings: [{
        id: "SYNTHETIC-001",
        kind: "required-edge",
        severity: "error",
        message: "Synthetic missing relationship",
        evidence: { document: "expected", path: "/rules/0" },
      }],
      summary: { ...clean.summary, violations: 1 },
    };

    const mermaid = generateConformanceMermaid(expected, observed, result);

    expect(mermaid).toContain("1 violation · 0 changes");
  });

  it("uses a generic edge label when a finding has an edge key but no relationship type", () => {
    const { expected, observed } = models();
    const clean = analyzeConformance(expected, structuredClone(expected));
    const result: ConformanceResult = {
      ...clean,
      classification: "violation",
      findings: [{
        id: "SYNTHETIC-LABEL",
        kind: "deny-rule",
        severity: "error",
        message: "Synthetic label fallback",
        from: "frontend",
        to: "service",
        edge_key: "frontend|http|service",
        evidence: { document: "observed", path: "/relationships/0" },
      }],
      summary: { ...clean.summary, violations: 1 },
    };

    expect(generateConformanceMermaid(expected, observed, result)).toContain(
      "relationship · SYNTHETIC-LABEL",
    );
  });

  it("does not invent an untyped edge and can render an exact typed edge", () => {
    const { expected, observed } = models();
    observed.relationships = structuredClone(expected.relationships);
    const clean = analyzeConformance(expected, observed);
    const result: ConformanceResult = {
      ...clean,
      classification: "violation",
      findings: [
        {
          id: "SYNTHETIC-DEFAULT",
          kind: "required-edge",
          severity: "error",
          message: "Synthetic default edge",
          from: "frontend",
          to: "service",
          evidence: { document: "expected", path: "/rules/0" },
        },
        {
          id: "SYNTHETIC-TYPED",
          kind: "required-edge",
          severity: "error",
          message: "Synthetic typed edge",
          from: "frontend",
          to: "database",
          relationship_type: "http",
          evidence: { document: "expected", path: "/rules/0" },
        },
      ],
      summary: { ...clean.summary, violations: 2 },
    };

    const report = generateConformanceDrawio(expected, observed, result);
    expect(report.match(/source="node-frontend" target="node-service"/g)).toHaveLength(1);
    expect(report).not.toContain("MISSING other · SYNTHETIC-DEFAULT");
    expect(report).toContain("MISSING http · SYNTHETIC-TYPED");
  });

  it("keeps untrusted component names inside a single conformance label", () => {
    const { expected, observed } = models();
    observed.components.frontend!.name = 'Store "A"\nclick frontend "https://example.invalid"';
    const result = analyzeConformance(expected, observed);

    const report = generateConformanceMermaid(expected, observed, result);

    expect(report).toContain(
      'frontend["Store &quot;A&quot; click frontend &quot;https://example.invalid&quot; · VIOLATION"]',
    );
    expect(report).not.toMatch(/\n\s*click frontend/);
  });
});
