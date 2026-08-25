import { describe, expect, it } from "vitest";

import { analyzeConformance } from "./conformance.js";
import { buildGraph, diffGraphs } from "./graph.js";
import type { ArchitectureDocument } from "./model.js";
import {
  serializeConformanceResult,
  serializeGraph,
  serializeGraphDiff,
} from "./serialization.js";
import {
  ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  ARCHITECTURE_CONTRACT_LEGACY_VERSION,
  ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
  CLI_JSON_CONTRACT_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
  GRAPH_CONTRACT_VERSION,
  isSupportedArchitectureContractVersion,
  unsupportedArchitectureContractVersionMessage,
} from "./versions.js";

function architecture(
  version: ArchitectureDocument["version"],
): ArchitectureDocument {
  return {
    version,
    metadata: { name: `compatibility-${version}` },
    components: {
      api: { type: "service", layer: "application" },
      database: { type: "database", layer: "data" },
    },
    relationships: [],
    rules: [{
      id: "ARCH-001",
      type: "deny",
      from: "api",
      to: "database",
      relationship_type: "data",
      severity: "error",
    }],
  };
}

describe("Core contract versions", () => {
  it("accepts current, previous, and legacy architecture spellings", () => {
    expect(isSupportedArchitectureContractVersion(
      ARCHITECTURE_CONTRACT_CURRENT_VERSION,
    )).toBe(true);
    expect(isSupportedArchitectureContractVersion(
      ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
    )).toBe(true);
    expect(isSupportedArchitectureContractVersion(
      ARCHITECTURE_CONTRACT_LEGACY_VERSION,
    )).toBe(true);
    expect(isSupportedArchitectureContractVersion("2.0.0")).toBe(false);
    expect(isSupportedArchitectureContractVersion(1)).toBe(false);
  });

  it("returns a clear message only for unsupported string versions", () => {
    expect(unsupportedArchitectureContractVersionMessage(
      ARCHITECTURE_CONTRACT_CURRENT_VERSION,
    )).toBeUndefined();
    expect(unsupportedArchitectureContractVersionMessage(1)).toBeUndefined();
    expect(unsupportedArchitectureContractVersionMessage("2.0.0")).toBe(
      "Unsupported architecture contract version '2.0.0'. Supported versions: 0.1.1, 0.1.0, 0.1.",
    );
  });
});

describe("versioned Core JSON serialization", () => {
  it("versions normalized graph and graph-diff JSON without moving legacy fields", () => {
    const expected = architecture(ARCHITECTURE_CONTRACT_CURRENT_VERSION);
    const observed = architecture(ARCHITECTURE_CONTRACT_PREVIOUS_VERSION);
    observed.components.redis = { type: "cache", layer: "data" };
    observed.components.api!.technology = "Bun";
    observed.relationships.push({ from: "api", to: "database", type: "data" });

    const expectedGraph = buildGraph(expected);
    const observedGraph = buildGraph(observed);
    const graph = serializeGraph(expected.version, expectedGraph);
    const diff = serializeGraphDiff(
      expected.version,
      observed.version,
      diffGraphs(expectedGraph, observedGraph),
    );

    expect(graph).toMatchObject({
      schema_version: CLI_JSON_CONTRACT_VERSION,
      kind: "archsync.graph",
      contracts: {
        architecture_model: ARCHITECTURE_CONTRACT_CURRENT_VERSION,
        graph: GRAPH_CONTRACT_VERSION,
      },
      nodes: ["api", "database"],
    });
    expect(diff).toMatchObject({
      schema_version: CLI_JSON_CONTRACT_VERSION,
      kind: "archsync.graph-diff",
      contracts: {
        expected_architecture_model: ARCHITECTURE_CONTRACT_CURRENT_VERSION,
        observed_architecture_model: ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
        graph: GRAPH_CONTRACT_VERSION,
      },
      addedNodes: ["redis"],
      changedNodes: [{ id: "api" }],
      addedEdges: [{ key: "api|data|database" }],
    });
  });

  it("versions conformance, finding, and evidence JSON", () => {
    const expected = architecture(ARCHITECTURE_CONTRACT_CURRENT_VERSION);
    const observed = architecture(ARCHITECTURE_CONTRACT_PREVIOUS_VERSION);
    observed.components.api!.technology = "Bun";
    observed.relationships.push({ from: "api", to: "database", type: "data" });
    const result = analyzeConformance(expected, observed);

    const serialized = serializeConformanceResult(
      expected.version,
      observed.version,
      result,
    ) as {
      schema_version: string;
      contracts: Record<string, string>;
      findings: Array<{
        schema_version: string;
        evidence: { schema_version: string };
      }>;
    };

    expect(serialized.schema_version).toBe(CLI_JSON_CONTRACT_VERSION);
    expect(serialized.contracts).toMatchObject({
      graph: GRAPH_CONTRACT_VERSION,
      finding: FINDING_CONTRACT_VERSION,
      evidence: EVIDENCE_CONTRACT_VERSION,
    });
    expect(serialized.findings[0]).toMatchObject({
      schema_version: FINDING_CONTRACT_VERSION,
      evidence: { schema_version: EVIDENCE_CONTRACT_VERSION },
    });
  });
});
