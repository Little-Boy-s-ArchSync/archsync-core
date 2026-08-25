import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
  GRAPH_CONTRACT_VERSION,
  analyzeConformance,
  applyBenchmarkDelta,
  buildGraph,
  loadArchitecture,
  serializeConformanceResult,
  serializeGraph,
  validateBenchmark,
} from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compatibilityDirectory = join(root, "test", "fixtures", "compatibility");

async function loadReplay(label, architectureName, groundTruthName, expectedVersion) {
  const architecturePath = join(compatibilityDirectory, architectureName);
  const groundTruthPath = join(compatibilityDirectory, groundTruthName);
  const [architectureResult, benchmarkResult, groundTruthSource] = await Promise.all([
    loadArchitecture(architecturePath),
    validateBenchmark(groundTruthPath),
    readFile(groundTruthPath, "utf8"),
  ]);

  assert.equal(architectureResult.valid, true, `${label} architecture must be valid`);
  assert.ok(architectureResult.value, `${label} architecture must load`);
  assert.equal(architectureResult.value.version, expectedVersion);
  assert.equal(
    benchmarkResult.valid,
    true,
    `${label} benchmark must replay: ${benchmarkResult.issues.join("; ")}`,
  );

  const groundTruth = JSON.parse(groundTruthSource);
  const scenario = groundTruth.cases[0];
  assert.ok(scenario, `${label} benchmark must contain a replay case`);
  const observed = applyBenchmarkDelta(architectureResult.value, scenario.delta);
  const conformance = analyzeConformance(architectureResult.value, observed);
  assert.equal(conformance.classification, "violation");
  assert.deepEqual(
    conformance.findings
      .filter(({ kind }) => kind !== "architecture-evolution")
      .map(({ id }) => id),
    ["ARCH-001"],
  );

  return {
    benchmarkResult,
    graph: serializeGraph(
      architectureResult.value.version,
      buildGraph(architectureResult.value),
    ),
    conformance: serializeConformanceResult(
      architectureResult.value.version,
      observed.version,
      conformance,
    ),
  };
}

function withoutModelVersions(serialized) {
  const comparable = structuredClone(serialized);
  comparable.contracts.expected_architecture_model = "<supported-version>";
  comparable.contracts.observed_architecture_model = "<supported-version>";
  return comparable;
}

const [current, previous] = await Promise.all([
  loadReplay(
    "current",
    "current.architecture.yaml",
    "ground-truth-current.json",
    ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  ),
  loadReplay(
    "previous",
    "previous.architecture.yaml",
    "ground-truth-previous.json",
    ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
  ),
]);

assert.deepEqual(current.benchmarkResult, previous.benchmarkResult);
assert.deepEqual(current.graph.nodes, previous.graph.nodes);
assert.deepEqual(current.graph.edges, previous.graph.edges);
assert.equal(current.graph.contracts.graph, GRAPH_CONTRACT_VERSION);
assert.equal(previous.graph.contracts.graph, GRAPH_CONTRACT_VERSION);
assert.deepEqual(
  withoutModelVersions(current.conformance),
  withoutModelVersions(previous.conformance),
);
assert.equal(current.conformance.contracts.finding, FINDING_CONTRACT_VERSION);
assert.equal(current.conformance.contracts.evidence, EVIDENCE_CONTRACT_VERSION);

console.log(
  `PASS CONTRACT COMPATIBILITY REPLAY (current ${ARCHITECTURE_CONTRACT_CURRENT_VERSION}, previous ${ARCHITECTURE_CONTRACT_PREVIOUS_VERSION}, 1/1 benchmark case each)`,
);
