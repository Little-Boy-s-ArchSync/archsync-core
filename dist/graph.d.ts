import type { ArchitectureDocument, ArchitectureGraph, ArchitectureRelationship, GraphDiff } from "./model.js";
export declare function edgeKey(relationship: ArchitectureRelationship): string;
export declare function buildGraph(document: ArchitectureDocument): ArchitectureGraph;
export declare function diffGraphs(expected: ArchitectureGraph, observed: ArchitectureGraph): GraphDiff;
//# sourceMappingURL=graph.d.ts.map