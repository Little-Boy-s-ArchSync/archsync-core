import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGraph,
  diffGraphs,
  analyzeConformance,
  generateConformanceDrawio,
  generateConformanceMermaid,
  generateDrawio,
  generateMermaid,
  loadArchitecture,
} from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDirectory = join(root, "test", "fixtures");
const evidencePath = join(root, "evidence", "phase-1-evidence.json");
const writeMode = process.argv.includes("--write");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(filePath) {
  return relative(root, filePath).replaceAll("\\", "/");
}

async function requiredModel(filePath) {
  const result = await loadArchitecture(filePath);
  assert.equal(result.valid, true, `${filePath} must be valid`);
  assert.ok(result.value, `${filePath} must produce a model`);
  return result.value;
}

const schemaPath = join(root, "specs", "architecture.schema.json");
const schemaSource = await readFile(schemaPath, "utf8");
const schema = JSON.parse(schemaSource);
const fixtureNames = (await readdir(fixturesDirectory))
  .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
  .sort();
const validFixtures = [];
const expectedInvalidFixtures = [];

for (const name of fixtureNames) {
  const filePath = join(fixturesDirectory, name);
  const result = await loadArchitecture(filePath);
  if (name.startsWith("invalid-")) {
    assert.equal(result.valid, false, `${name} must remain invalid`);
    expectedInvalidFixtures.push({
      file: relativePath(filePath),
      issues: result.issues.map(({ path, keyword, message }) => ({ path, keyword, message })),
    });
  } else {
    assert.equal(result.valid, true, `${name} must remain valid`);
    assert.ok(result.value);
    const graph = buildGraph(result.value);
    validFixtures.push({
      file: relativePath(filePath),
      components: graph.nodes.size,
      relationships: graph.edges.length,
    });
  }
}

const referencePath = join(fixturesDirectory, "order-platform.architecture.yaml");
const reference = await requiredModel(referencePath);
const referenceGraph = buildGraph(reference);
const baseline = await requiredModel(join(fixturesDirectory, "minimal.architecture.yaml"));
const evolved = await requiredModel(join(fixturesDirectory, "minimal-evolution.architecture.yaml"));
const graphDiff = diffGraphs(buildGraph(baseline), buildGraph(evolved));
const mermaid = generateMermaid(reference);
const drawio = generateDrawio(reference);
const violationObservedPath = join(fixturesDirectory, "order-platform.violation.architecture.yaml");
const violationObserved = await requiredModel(violationObservedPath);
const violationResult = analyzeConformance(reference, violationObserved);
assert.equal(violationResult.classification, "violation");
const evolutionObservedPath = join(fixturesDirectory, "order-platform.evolution.architecture.yaml");
const evolutionObserved = await requiredModel(evolutionObservedPath);
const evolutionResult = analyzeConformance(reference, evolutionObserved);
assert.equal(evolutionResult.classification, "evolution");
const violationMermaid = generateConformanceMermaid(reference, violationObserved, violationResult);
const violationDrawio = generateConformanceDrawio(reference, violationObserved, violationResult);
const evolutionMermaid = generateConformanceMermaid(reference, evolutionObserved, evolutionResult);
const evolutionDrawio = generateConformanceDrawio(reference, evolutionObserved, evolutionResult);
const demoDirectory = join(root, "docs", "demo");
const committedViolationMermaid = await readFile(join(demoDirectory, "order-platform-violation-report.mmd"), "utf8");
const committedViolationDrawio = await readFile(join(demoDirectory, "order-platform-violation-report.drawio"), "utf8");
const committedEvolutionMermaid = await readFile(join(demoDirectory, "order-platform-evolution-report.mmd"), "utf8");
const committedEvolutionDrawio = await readFile(join(demoDirectory, "order-platform-evolution-report.drawio"), "utf8");
assert.equal(committedViolationMermaid, violationMermaid, "Violation Mermaid demo is stale");
assert.equal(committedViolationDrawio, violationDrawio, "Violation draw.io demo is stale");
assert.equal(committedEvolutionMermaid, evolutionMermaid, "Evolution Mermaid demo is stale");
assert.equal(committedEvolutionDrawio, evolutionDrawio, "Evolution draw.io demo is stale");

const evidence = {
  phase: 1,
  release: "v0.1",
  objective: "Machine-readable architecture contract and deterministic conformance foundation",
  schema: {
    file: relativePath(schemaPath),
    id: schema.$id,
    title: schema.title,
    sha256: sha256(schemaSource),
    required_sections: schema.required,
    contract_sections: ["components", "relationships", "rules", "quality_goals"],
  },
  fixtures: {
    valid: validFixtures,
    expected_invalid: expectedInvalidFixtures,
  },
  reference_graph: {
    source: relativePath(referencePath),
    nodes: [...referenceGraph.nodes.keys()],
    edges: referenceGraph.edges.map(({ key }) => key),
    normalized_sha256: sha256(JSON.stringify({
      nodes: [...referenceGraph.nodes.keys()],
      edges: referenceGraph.edges.map(({ key }) => key),
    })),
  },
  graph_diff_demo: {
    expected: "test/fixtures/minimal.architecture.yaml",
    observed: "test/fixtures/minimal-evolution.architecture.yaml",
    added_nodes: graphDiff.addedNodes.map(({ id }) => id),
    removed_nodes: graphDiff.removedNodes.map(({ id }) => id),
    added_edges: graphDiff.addedEdges.map(({ key }) => key),
    removed_edges: graphDiff.removedEdges.map(({ key }) => key),
  },
  deterministic_views: {
    mermaid_sha256: sha256(mermaid),
    drawio_sha256: sha256(drawio),
  },
  conformance_demo: {
    expected: relativePath(referencePath),
    violation_observed: relativePath(violationObservedPath),
    violation_classification: violationResult.classification,
    violated_rules: violationResult.findings
      .filter(({ kind }) => kind !== "architecture-evolution")
      .map(({ id }) => id),
    evolution_observed: relativePath(evolutionObservedPath),
    evolution_classification: evolutionResult.classification,
    violation_report_mermaid_sha256: sha256(violationMermaid),
    violation_report_drawio_sha256: sha256(violationDrawio),
    evolution_report_mermaid_sha256: sha256(evolutionMermaid),
    evolution_report_drawio_sha256: sha256(evolutionDrawio),
  },
  demo_artifacts: {
    directory: "docs/demo",
    violation_preview_png_sha256: sha256(
      await readFile(join(demoDirectory, "order-platform-violation-report.png")),
    ),
    evolution_preview_png_sha256: sha256(
      await readFile(join(demoDirectory, "order-platform-evolution-report.png")),
    ),
  },
  enforced_gates: {
    topology_scenarios_minimum: 10,
    coverage_thresholds_percent: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
    cli_smoke_checks: [
      "valid model exits 0",
      "invalid model exits 1 with actionable path",
      "graph emits parseable JSON",
      "graph diff emits expected delta",
      "clean conformance exits 0",
      "rule violation exits 1 with actionable findings",
      "machine-readable conformance JSON is stable",
      "architecture evolution exits 3 for approval",
      "Mermaid output is deterministic",
      "draw.io output is deterministic editable XML",
      "annotated Mermaid conformance report is deterministic",
      "annotated draw.io conformance report is deterministic",
      "invalid CLI usage exits 2",
    ],
  },
};

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (writeMode) {
  await writeFile(evidencePath, serialized, "utf8");
  console.log(`WROTE ${evidencePath}`);
} else {
  const committed = await readFile(evidencePath, "utf8");
  assert.equal(
    committed,
    serialized,
    "Phase 1 evidence is stale; run 'pnpm evidence:update' and commit the result",
  );
  console.log(`VALID PHASE 1 EVIDENCE ${evidencePath}`);
}
