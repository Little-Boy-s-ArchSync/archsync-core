import { describe, expect, it } from "vitest";

import {
  analyzeConformance,
  formatConformanceResult,
  type ConformanceResult,
} from "./conformance.js";
import type { ArchitectureDocument } from "./model.js";

function expectedModel(): ArchitectureDocument {
  return {
    version: "0.1",
    metadata: { name: "conformance-test" },
    components: {
      frontend: { type: "frontend", layer: "experience" },
      gateway: { type: "gateway", layer: "edge" },
      service: { type: "service", layer: "domain" },
      database: { type: "database", layer: "data" },
    },
    relationships: [
      { from: "frontend", to: "gateway", type: "http" },
      { from: "gateway", to: "service", type: "http" },
      { from: "service", to: "database", type: "data" },
    ],
    rules: [
      { id: "ARCH-001", type: "deny", from: "frontend", to: "database", relationship_type: "data", severity: "critical" },
      { id: "ARCH-002", type: "require", from: "gateway", to: "service", relationship_type: "http", severity: "error" },
    ],
  };
}

describe("architecture conformance", () => {
  it("classifies an unchanged architecture as no-impact", () => {
    const expected = expectedModel();
    const result = analyzeConformance(expected, structuredClone(expected));

    expect(result.classification).toBe("no-impact");
    expect(result.findings).toEqual([]);
  });

  it("reports an actionable deny-rule violation", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    observed.relationships.push({ from: "frontend", to: "database", type: "data" });

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("violation");
    expect(result.findings).toContainEqual(expect.objectContaining({
      id: "ARCH-001",
      kind: "deny-rule",
      severity: "critical",
      edge_key: "frontend|data|database",
      evidence: { document: "observed", path: "/relationships/3" },
    }));
  });

  it("reports a missing required relationship", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    observed.relationships = observed.relationships.filter((edge) => edge.from !== "gateway");

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("violation");
    expect(result.findings).toContainEqual(expect.objectContaining({
      id: "ARCH-002",
      kind: "required-edge",
      from: "gateway",
      to: "service",
    }));
    expect(formatConformanceResult(result)).toContain(
      "Fix: Restore the required dependency",
    );
  });

  it("supports wildcard deny selectors", () => {
    const expected = expectedModel();
    expected.rules = [
      { id: "DATA-001", type: "deny", from: "*", to: "data-*", severity: "error" },
    ];
    expected.components["data-store"] = { type: "database", layer: "data" };
    const observed = structuredClone(expected);
    observed.relationships.push({ from: "frontend", to: "data-store", type: "data" });

    const result = analyzeConformance(expected, observed);

    expect(result.findings).toContainEqual(expect.objectContaining({ id: "DATA-001" }));
  });

  it("enforces an allowlist for matching outgoing relationships", () => {
    const expected = expectedModel();
    expected.rules = [
      { id: "EDGE-001", type: "allow", from: "frontend", to: "gateway", relationship_type: "http", severity: "error" },
    ];
    const allowed = analyzeConformance(expected, structuredClone(expected));
    const observed = structuredClone(expected);
    observed.relationships.push({ from: "frontend", to: "service", type: "http" });
    observed.relationships.push({ from: "frontend", to: "database", type: "data" });

    const result = analyzeConformance(expected, observed);

    expect(allowed.classification).toBe("no-impact");
    expect(result.findings.filter((finding) => finding.id === "EDGE-001")).toEqual([
      expect.objectContaining({
        kind: "allow-rule",
        edge_key: "frontend|http|service",
        evidence: { document: "observed", path: "/relationships/3" },
      }),
    ]);
    expect(formatConformanceResult(result)).toContain(
      "Dependency is outside the approved allow-list",
    );
    expect(formatConformanceResult(result)).toContain(
      "Fix: Route the dependency to an allowed target",
    );
  });

  it("supports wildcard targets in allow rules", () => {
    const expected = expectedModel();
    expected.rules = [
      { id: "EDGE-002", type: "allow", from: "*", to: "*service", severity: "warning" },
    ];
    const observed = structuredClone(expected);

    const result = analyzeConformance(expected, observed);

    expect(result.findings.filter((finding) => finding.id === "EDGE-002")).toEqual([
      expect.objectContaining({ edge_key: "frontend|http|gateway" }),
      expect.objectContaining({ edge_key: "service|data|database" }),
    ]);
  });

  it("evaluates a wildcard require rule for every matching source", () => {
    const expected = expectedModel();
    expected.components.worker = { type: "worker", layer: "domain" };
    expected.rules = [
      { id: "SERVICE-001", type: "require", from: "*", to: "database", relationship_type: "data", severity: "warning" },
    ];
    const observed = structuredClone(expected);

    const result = analyzeConformance(expected, observed);

    expect(result.findings.filter((finding) => finding.id === "SERVICE-001").length).toBe(4);
  });

  it("accepts a multi-hop required path and reports it when broken", () => {
    const expected = expectedModel();
    expected.rules = [
      { id: "PATH-001", type: "require-path", from: "frontend", to: "database", severity: "critical" },
    ];
    const passing = analyzeConformance(expected, structuredClone(expected));
    const observed = structuredClone(expected);
    observed.relationships = observed.relationships.filter((edge) => edge.from !== "gateway");

    const failing = analyzeConformance(expected, observed);

    expect(passing.classification).toBe("no-impact");
    expect(failing.findings).toContainEqual(expect.objectContaining({
      id: "PATH-001",
      kind: "required-path",
      from: "frontend",
      to: "database",
      evidence: { document: "expected", path: "/rules/0" },
    }));
    expect(formatConformanceResult(failing)).toContain(
      "Required architecture path is missing",
    );
    expect(formatConformanceResult(failing)).toContain(
      "Fix: Restore an approved path to the target",
    );
  });

  it("can constrain every edge in a required path by relationship type", () => {
    const expected = expectedModel();
    expected.rules = [
      { id: "PATH-HTTP", type: "require-path", from: "frontend", to: "database", relationship_type: "http", severity: "error" },
    ];

    const result = analyzeConformance(expected, structuredClone(expected));

    expect(result.findings).toContainEqual(expect.objectContaining({
      id: "PATH-HTTP",
      kind: "required-path",
      relationship_type: "http",
    }));
  });

  it("classifies an unruled topology addition as evolution", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    observed.components.redis = { type: "cache", layer: "data" };
    observed.relationships.push({ from: "service", to: "redis", type: "data" });

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("evolution");
    expect(result.summary).toMatchObject({ violations: 0, added_nodes: 1, added_edges: 1 });
    expect(result.findings.filter((finding) => finding.kind === "architecture-evolution")).toHaveLength(2);
    const formatted = formatConformanceResult(result);
    expect(formatted).toMatch(/^DECISION: REVIEW/);
    expect(formatted).toContain("2 architecture changes require human approval");
    expect(formatted).toContain("ADDED component: redis");
    expect(formatted).toContain(
      "Evidence: observed architecture, component 'redis' (/components/redis)",
    );
    expect(formatted).toContain("EXIT CODE: 3 (REVIEW)");
  });

  it("reports removed components and their relationships as evolution", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    delete observed.components.database;
    observed.relationships = observed.relationships.filter((edge) => edge.to !== "database");

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("evolution");
    expect(result.summary).toMatchObject({ removed_nodes: 1, removed_edges: 1 });
    expect(result.findings).toContainEqual(expect.objectContaining({
      component: "database",
      change: "removed",
      evidence: { document: "expected", path: "/components/database" },
    }));
    expect(result.findings).toContainEqual(expect.objectContaining({
      edge_key: "service|data|database",
      change: "removed",
      evidence: { document: "expected", path: "/relationships/2" },
    }));
    expect(formatConformanceResult(result)).toContain("REMOVED component: database");
  });

  it("detects architecture metadata changes on an existing component", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    observed.components.service!.technology = "Bun";

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("evolution");
    expect(result.diff.changedNodes.map(({ id }) => id)).toEqual(["service"]);
    expect(formatConformanceResult(result)).toContain("CHANGED component: service");
  });

  it("prioritizes violation when a change also evolves topology", () => {
    const expected = expectedModel();
    const observed = structuredClone(expected);
    observed.relationships.push({ from: "frontend", to: "database", type: "data" });

    const result = analyzeConformance(expected, observed);

    expect(result.classification).toBe("violation");
    expect(result.summary).toMatchObject({ violations: 1, evolutions: 1 });
    const formatted = formatConformanceResult(result);
    expect(formatted).toMatch(/^DECISION: BLOCK/);
    expect(formatted).toContain("RULE VIOLATIONS (1)");
    expect(formatted).toContain(
      "Relationship: frontend --data--> database (frontend|data|database)",
    );
    expect(formatted).toContain(
      "Evidence: observed architecture, relationship #4 (/relationships/3)",
    );
    expect(formatted).toContain("ARCHITECTURE CHANGES (1)");
    expect(formatted).toContain("EXIT CODE: 1 (BLOCK)");
  });

  it("formats a clean result with an explicit no-findings message", () => {
    const expected = expectedModel();
    const result = analyzeConformance(expected, structuredClone(expected));

    const formatted = formatConformanceResult(result);
    expect(formatted).toMatch(/^DECISION: PASS/);
    expect(formatted).toContain(
      "No rule violations or architecture topology changes were detected.",
    );
    expect(formatted).toContain("NEXT STEP: No action required.");
    expect(formatted).toContain("EXIT CODE: 0 (PASS)");
  });

  it("supports documents without rules and rules without a relationship type", () => {
    const unruled = expectedModel();
    delete unruled.rules;
    expect(analyzeConformance(unruled, structuredClone(unruled)).classification).toBe("no-impact");

    const expected = expectedModel();
    expected.components.orphan = { type: "service", layer: "domain" };
    expected.rules = [
      { id: "EDGE-ANY", type: "require", from: "orphan", to: "database", severity: "error" },
      { id: "PATH-ANY", type: "require-path", from: "orphan", to: "database", severity: "error" },
    ];
    const result = analyzeConformance(expected, structuredClone(expected));

    const untypedEdge = result.findings.find((finding) => finding.id === "EDGE-ANY");
    expect(untypedEdge).toEqual(expect.objectContaining({
      id: "EDGE-ANY",
      kind: "required-edge",
      from: "orphan",
      to: "database",
    }));
    expect(untypedEdge).not.toHaveProperty("relationship_type");
    expect(untypedEdge).not.toHaveProperty("edge_key");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ id: "PATH-ANY", kind: "required-path" }),
    );
    expect(formatConformanceResult(result)).toContain(
      "Relationship: orphan --any--> database",
    );
  });

  it("formats plural violations and defensive finding fallbacks deterministically", () => {
    const base = analyzeConformance(expectedModel(), structuredClone(expectedModel()));
    const result: ConformanceResult = {
      ...base,
      classification: "violation",
      findings: [
        {
          id: "CUSTOM-001",
          kind: "unsupported" as "deny-rule",
          severity: "error",
          message: "Custom violation message",
          evidence: { document: "observed", path: "/custom/path" },
        },
        {
          id: "CUSTOM-002",
          kind: "unsupported" as "deny-rule",
          severity: "warning",
          message: "Second custom violation",
          from: "frontend",
          to: "service",
          evidence: { document: "observed", path: "/custom/second" },
        },
        {
          id: "EVOLUTION-CUSTOM",
          kind: "architecture-evolution",
          severity: "warning",
          message: "Topology changed without structured fields",
          evidence: { document: "observed", path: "/custom/evolution" },
        },
      ],
      summary: { ...base.summary, violations: 2, evolutions: 1 },
    };

    const formatted = formatConformanceResult(result);

    expect(formatted).toContain("2 architecture rules are violated");
    expect(formatted).toContain("Custom violation message");
    expect(formatted).toContain("Review the architecture rule and the observed topology.");
    expect(formatted).toContain("frontend --any--> service");
    expect(formatted).toContain("Topology changed without structured fields");
    expect(formatted).toContain("observed architecture (/custom/path)");
  });
});
