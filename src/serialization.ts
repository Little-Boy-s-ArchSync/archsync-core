import type {
  ConformanceClassification,
  ConformanceFinding,
  ConformanceResult,
  ConformanceSummary,
} from "./conformance.js";
import type {
  ArchitectureContractVersion,
} from "./versions.js";
import {
  CLI_JSON_CONTRACT_VERSION,
  CONFORMANCE_CONTRACT_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
  GRAPH_CONTRACT_VERSION,
} from "./versions.js";
import type {
  ArchitectureComponent,
  ArchitectureGraph,
  GraphDiff,
  RelationshipType,
} from "./model.js";

export interface SerializedGraphEdge {
  key: string;
  from: string;
  to: string;
  type: RelationshipType;
}

export interface SerializedChangedNode {
  id: string;
  expected: ArchitectureComponent;
  observed: ArchitectureComponent;
}

export interface SerializedGraph {
  schema_version: typeof CLI_JSON_CONTRACT_VERSION;
  kind: "archsync.graph";
  contracts: {
    architecture_model: ArchitectureContractVersion;
    graph: typeof GRAPH_CONTRACT_VERSION;
  };
  nodes: string[];
  edges: SerializedGraphEdge[];
}

export interface SerializedGraphDiff {
  schema_version: typeof CLI_JSON_CONTRACT_VERSION;
  kind: "archsync.graph-diff";
  contracts: {
    expected_architecture_model: ArchitectureContractVersion;
    observed_architecture_model: ArchitectureContractVersion;
    graph: typeof GRAPH_CONTRACT_VERSION;
  };
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: SerializedChangedNode[];
  addedEdges: SerializedGraphEdge[];
  removedEdges: SerializedGraphEdge[];
}

export interface SerializedConformanceDiff {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: SerializedChangedNode[];
  addedEdges: string[];
  removedEdges: string[];
}

export interface SerializedConformanceResult {
  schema_version: typeof CLI_JSON_CONTRACT_VERSION;
  kind: "archsync.conformance";
  contracts: {
    expected_architecture_model: ArchitectureContractVersion;
    observed_architecture_model: ArchitectureContractVersion;
    conformance: typeof CONFORMANCE_CONTRACT_VERSION;
    graph: typeof GRAPH_CONTRACT_VERSION;
    finding: typeof FINDING_CONTRACT_VERSION;
    evidence: typeof EVIDENCE_CONTRACT_VERSION;
  };
  classification: ConformanceClassification;
  summary: ConformanceSummary;
  findings: ConformanceFinding[];
  diff: SerializedConformanceDiff;
}

export function serializeGraph(
  modelVersion: ArchitectureContractVersion,
  graph: ArchitectureGraph,
): SerializedGraph {
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
): SerializedGraphDiff {
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
): SerializedConformanceResult {
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
