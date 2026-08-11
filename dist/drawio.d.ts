import type { ArchitectureDocument } from "./model.js";
export type DiagramState = "violation" | "evolution" | "removed";
export interface DrawioRenderOptions {
    title?: string;
    nodeStates?: Record<string, DiagramState>;
    edgeStates?: Record<string, DiagramState>;
    edgeLabels?: Record<string, string>;
}
/** Generate an uncompressed, editable diagrams.net/draw.io XML document. */
export declare function generateDrawio(document: ArchitectureDocument, options?: DrawioRenderOptions): string;
//# sourceMappingURL=drawio.d.ts.map