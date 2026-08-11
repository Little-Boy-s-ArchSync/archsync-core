import type { ArchitectureDocument, GraphDiff, RelationshipType, Severity } from "./model.js";
export type ConformanceClassification = "no-impact" | "violation" | "evolution";
export interface ConformanceEvidence {
    document: "expected" | "observed";
    path: string;
}
export interface ConformanceFinding {
    id: string;
    kind: "deny-rule" | "required-edge" | "architecture-evolution";
    severity: Severity;
    message: string;
    from?: string;
    to?: string;
    relationship_type?: RelationshipType;
    edge_key?: string;
    component?: string;
    change?: "added" | "removed" | "changed";
    evidence: ConformanceEvidence;
}
export interface ConformanceSummary {
    violations: number;
    evolutions: number;
    added_nodes: number;
    removed_nodes: number;
    changed_nodes: number;
    added_edges: number;
    removed_edges: number;
}
export interface ConformanceResult {
    classification: ConformanceClassification;
    findings: ConformanceFinding[];
    diff: GraphDiff;
    summary: ConformanceSummary;
}
export declare function analyzeConformance(expected: ArchitectureDocument, observed: ArchitectureDocument): ConformanceResult;
export declare function formatConformanceResult(result: ConformanceResult): string;
//# sourceMappingURL=conformance.d.ts.map