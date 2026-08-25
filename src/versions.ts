export const ARCHITECTURE_CONTRACT_CURRENT_VERSION = "0.1.1" as const;
export const ARCHITECTURE_CONTRACT_PREVIOUS_VERSION = "0.1.0" as const;
export const ARCHITECTURE_CONTRACT_LEGACY_VERSION = "0.1" as const;

export const SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS = [
  ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
  ARCHITECTURE_CONTRACT_LEGACY_VERSION,
] as const;

export type ArchitectureContractVersion =
  (typeof SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS)[number];

export const GRAPH_CONTRACT_VERSION = "1.0.0" as const;
export const FINDING_CONTRACT_VERSION = "1.0.0" as const;
export const EVIDENCE_CONTRACT_VERSION = "1.0.0" as const;
export const CONFORMANCE_CONTRACT_VERSION = "1.0.0" as const;
export const CLI_JSON_CONTRACT_VERSION = "1.0.0" as const;

export function isSupportedArchitectureContractVersion(
  version: unknown,
): version is ArchitectureContractVersion {
  return typeof version === "string" &&
    (SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS as readonly string[]).includes(version);
}

export function unsupportedArchitectureContractVersionMessage(
  version: unknown,
): string | undefined {
  if (typeof version !== "string" || isSupportedArchitectureContractVersion(version)) {
    return undefined;
  }
  return `Unsupported architecture contract version '${version}'. Supported versions: ${SUPPORTED_ARCHITECTURE_CONTRACT_VERSIONS.join(
    ", ",
  )}.`;
}
