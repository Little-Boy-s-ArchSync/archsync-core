import type { ArchitectureComponent, ArchitectureDocument, ArchitectureRelationship } from "./model.js";
export type BenchmarkCategory = "no-impact" | "violation" | "evolution";
export interface BenchmarkCaseDelta {
    components_added?: Record<string, ArchitectureComponent>;
    components_removed?: string[];
    relationships_added?: ArchitectureRelationship[];
    relationships_removed?: ArchitectureRelationship[];
}
export interface BenchmarkExpectedFinding {
    id: string;
    kind: "deny-rule" | "required-edge" | "architecture-evolution";
    severity: "info" | "warning" | "error" | "critical";
    from?: string;
    to?: string;
}
export interface BenchmarkEvidenceLocation {
    file: string;
    line: number;
    kind: "source-location";
}
export interface BenchmarkCase {
    id: string;
    title: string;
    owner: string;
    category: BenchmarkCategory;
    risk: "low" | "medium" | "high";
    description: string;
    patch: string;
    changed_files: string[];
    delta: BenchmarkCaseDelta;
    acceptance_criteria: string[];
    expected: {
        classification: BenchmarkCategory;
        findings: BenchmarkExpectedFinding[];
        evidence: BenchmarkEvidenceLocation[];
        approval_required: boolean;
    };
}
export interface BenchmarkGroundTruth {
    version: string;
    benchmark: {
        id: string;
        architecture: string;
        repository: string;
        stack: string;
        expected_distribution: Record<BenchmarkCategory, number>;
    };
    cases: BenchmarkCase[];
}
export interface BenchmarkValidationResult {
    valid: boolean;
    issues: string[];
    summary: Record<BenchmarkCategory, number>;
}
export declare function applyBenchmarkDelta(baseline: ArchitectureDocument, delta: BenchmarkCaseDelta): ArchitectureDocument;
export declare function validateBenchmark(filePath: string): Promise<BenchmarkValidationResult>;
//# sourceMappingURL=benchmark.d.ts.map