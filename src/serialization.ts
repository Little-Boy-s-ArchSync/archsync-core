import type { ConformanceResult } from "./conformance.js";
import type {
  ArchitectureContractVersion,
} from "./versions.js";
import {
  CLI_JSON_CONTRACT_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
} from "./versions.js";
import type {
  ArchitectureGraph,
  GraphDiff,
} from "./model.js";

export function serializeGraph(
  modelVersion: ArchitectureContractVersion,
  graph: ArchitectureGraph,
) {
  return {
    schema_version: CLI_JSON_CONTRACT_VERSION,
    kind: "archsync.graph" as const,
    contracts: {
      architecture_model: modelVersion,
      graph: graph.schema_version,
    },
    nodes: [...graph.nodes.keys()],
    edges: graph.edges.map(({ key, from, to, type }) => ({ key, from, to, type })),
  };
}

export function serializeGraphDiff(
  expectedModelVersion: ArchitectureContractVersion,
  observedModelVersion: ArchitectureContractVersion,
  diff: GraphDiff,
) {
  return {
    schema_version: CLI_JSON_CONTRACT_VERSION,
    kind: "archsync.graph-diff" as const,
    contracts: {
      expected_architecture_model: expectedModelVersion,
      observed_architecture_model: observedModelVersion,
      graph: diff.schema_version,
    },
    addedNodes: diff.addedNodes.map(({ id }) => id),
    removedNodes: diff.removedNodes.map(({ id }) => id),
    changedNodes: diff.changedNodes.map(({ id, expected, observed }) => ({
      id,
      expected: expected.component,
      observed: observed.component,
    })),
    addedEdges: diff.addedEdges.map(({ key, from, to, type }) => ({ key, from, to, type })),
    removedEdges: diff.removedEdges.map(({ key, from, to, type }) => ({ key, from, to, type })),
  };
}

export function serializeConformanceResult(
  expectedModelVersion: ArchitectureContractVersion,
  observedModelVersion: ArchitectureContractVersion,
  result: ConformanceResult,
) {
  return {
    schema_version: CLI_JSON_CONTRACT_VERSION,
    kind: "archsync.conformance" as const,
    contracts: {
      expected_architecture_model: expectedModelVersion,
      observed_architecture_model: observedModelVersion,
      conformance: result.schema_version,
      graph: result.diff.schema_version,
      finding: FINDING_CONTRACT_VERSION,
      evidence: EVIDENCE_CONTRACT_VERSION,
    },
    classification: result.classification,
    summary: result.summary,
    findings: result.findings,
    diff: {
      addedNodes: result.diff.addedNodes.map(({ id }) => id),
      removedNodes: result.diff.removedNodes.map(({ id }) => id),
      changedNodes: result.diff.changedNodes.map(({ id, expected, observed }) => ({
        id,
        expected: expected.component,
        observed: observed.component,
      })),
      addedEdges: result.diff.addedEdges.map(({ key }) => key),
      removedEdges: result.diff.removedEdges.map(({ key }) => key),
    },
  };
}
