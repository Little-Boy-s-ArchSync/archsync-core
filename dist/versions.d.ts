export declare const ARCHITECTURE_CONTRACT_CURRENT_VERSION: "0.1.1";
export declare const ARCHITECTURE_CONTRACT_PREVIOUS_VERSION: "0.1.0";
export declare const ARCHITECTURE_CONTRACT_LEGACY_VERSION: "0.1";
export declare const SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS: readonly ["0.1.1", "0.1.0", "0.1"];
export type ArchitectureContractVersion = (typeof SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS)[number];
export declare const GRAPH_CONTRACT_VERSION: "1.0.0";
export declare const FINDING_CONTRACT_VERSION: "1.0.0";
export declare const EVIDENCE_CONTRACT_VERSION: "1.0.0";
export declare const CONFORMANCE_CONTRACT_VERSION: "1.0.0";
export declare const CLI_JSON_CONTRACT_VERSION: "1.0.0";
export declare function isSupportedArchitectureContractVersion(version: unknown): version is ArchitectureContractVersion;
export declare function unsupportedArchitectureContractVersionMessage(version: unknown): string | undefined;
//# sourceMappingURL=versions.d.ts.map