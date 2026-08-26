export const ARCHITECTURE_CONTRACT_CURRENT_VERSION = "0.1.1";
export const ARCHITECTURE_CONTRACT_PREVIOUS_VERSION = "0.1.0";
export const ARCHITECTURE_CONTRACT_LEGACY_VERSION = "0.1";
export const SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS = [
    ARCHITECTURE_CONTRACT_CURRENT_VERSION,
    ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
    ARCHITECTURE_CONTRACT_LEGACY_VERSION,
];
export const GRAPH_CONTRACT_VERSION = "1.0.0";
export const FINDING_CONTRACT_VERSION = "1.0.0";
export const EVIDENCE_CONTRACT_VERSION = "1.0.0";
export const CONFORMANCE_CONTRACT_VERSION = "1.0.0";
export const CLI_JSON_CONTRACT_VERSION = "1.0.0";
export function isSupportedArchitectureContractVersion(version) {
    return typeof version === "string" &&
        SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS.includes(version);
}
export function unsupportedArchitectureContractVersionMessage(version) {
    if (typeof version !== "string" || isSupportedArchitectureContractVersion(version)) {
        return undefined;
    }
    return `Unsupported architecture contract version '${version}'. Supported versions: ${SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS.join(", ")}.`;
}
//# sourceMappingURL=versions.js.map