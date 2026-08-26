import type { ConformanceClassification, ConformanceFinding, ConformanceResult, ConformanceSummary } from "./conformance.js";
import type { ArchitectureContractVersion } from "./versions.js";
import { CLI_JSON_CONTRACT_VERSION, CONFORMANCE_CONTRACT_VERSION, EVIDENCE_CONTRACT_VERSION, FINDING_CONTRACT_VERSION, GRAPH_CONTRACT_VERSION } from "./versions.js";
import type { ArchitectureComponent, ArchitectureGraph, GraphDiff, RelationshipType } from "./model.js";
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
export declare function serializeGraph(modelVersion: ArchitectureContractVersion, graph: ArchitectureGraph): SerializedGraph;
export declare function serializeGraphDiff(expectedModelVersion: ArchitectureContractVersion, observedModelVersion: ArchitectureContractVersion, diff: GraphDiff): SerializedGraphDiff;
export declare function serializeConformanceResult(expectedModelVersion: ArchitectureContractVersion, observedModelVersion: ArchitectureContractVersion, result: ConformanceResult): SerializedConformanceResult;
//# sourceMappingURL=serialization.d.ts.map