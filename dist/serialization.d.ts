import type { ConformanceResult } from "./conformance.js";
import type { ArchitectureContractVersion } from "./versions.js";
import type { ArchitectureGraph, GraphDiff } from "./model.js";
export declare function serializeGraph(modelVersion: ArchitectureContractVersion, graph: ArchitectureGraph): {
    schema_version: "1.0.0";
    kind: "archsync.graph";
    contracts: {
        architecture_model: "0.1.1" | "0.1.0" | "0.1";
        graph: "1.0.0";
    };
    nodes: string[];
    edges: {
        key: string;
        from: string;
        to: string;
        type: "http" | "async" | "data" | "dependency" | "event" | "deployment" | "other";
    }[];
};
export declare function serializeGraphDiff(expectedModelVersion: ArchitectureContractVersion, observedModelVersion: ArchitectureContractVersion, diff: GraphDiff): {
    schema_version: "1.0.0";
    kind: "archsync.graph-diff";
    contracts: {
        expected_architecture_model: "0.1.1" | "0.1.0" | "0.1";
        observed_architecture_model: "0.1.1" | "0.1.0" | "0.1";
        graph: "1.0.0";
    };
    addedNodes: string[];
    removedNodes: string[];
    changedNodes: {
        id: string;
        expected: import("./model.js").ArchitectureComponent;
        observed: import("./model.js").ArchitectureComponent;
    }[];
    addedEdges: {
        key: string;
        from: string;
        to: string;
        type: "http" | "async" | "data" | "dependency" | "event" | "deployment" | "other";
    }[];
    removedEdges: {
        key: string;
        from: string;
        to: string;
        type: "http" | "async" | "data" | "dependency" | "event" | "deployment" | "other";
    }[];
};
export declare function serializeConformanceResult(expectedModelVersion: ArchitectureContractVersion, observedModelVersion: ArchitectureContractVersion, result: ConformanceResult): {
    schema_version: "1.0.0";
    kind: "archsync.conformance";
    contracts: {
        expected_architecture_model: "0.1.1" | "0.1.0" | "0.1";
        observed_architecture_model: "0.1.1" | "0.1.0" | "0.1";
        conformance: "1.0.0";
        graph: "1.0.0";
        finding: "1.0.0";
        evidence: "1.0.0";
    };
    classification: import("./conformance.js").ConformanceClassification;
    summary: import("./conformance.js").ConformanceSummary;
    findings: import("./conformance.js").ConformanceFinding[];
    diff: {
        addedNodes: string[];
        removedNodes: string[];
        changedNodes: {
            id: string;
            expected: import("./model.js").ArchitectureComponent;
            observed: import("./model.js").ArchitectureComponent;
        }[];
        addedEdges: string[];
        removedEdges: string[];
    };
};
//# sourceMappingURL=serialization.d.ts.map