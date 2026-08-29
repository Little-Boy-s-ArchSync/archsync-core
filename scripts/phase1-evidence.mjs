import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  ARCHITECTURE_CONTRACT_LEGACY_VERSION,
  ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
  CLI_JSON_CONTRACT_VERSION,
  CONFORMANCE_CONTRACT_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
  GRAPH_CONTRACT_VERSION,
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
const coverageSummaryPath = join(root, "coverage", "coverage-summary.json");
const writeMode = process.argv.includes("--write");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(filePath) {
  return relative(root, filePath).replaceAll("\\", "/");
}

async function hashFiles(filePaths) {
  const entries = [];
  for (const filePath of [...filePaths].sort()) {
    entries.push({
      file: relativePath(filePath),
      sha256: sha256(await readFile(filePath)),
    });
  }
  return entries;
}

async function treeSha256(directory) {
  const files = [];
  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  await visit(directory);
  const manifest = await hashFiles(files);
  return {
    files: manifest,
    sha256: sha256(JSON.stringify(manifest)),
  };
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
const benchmarkSchemaPath = join(root, "specs", "benchmark-ground-truth.schema.json");
const benchmarkSchemaSource = await readFile(benchmarkSchemaPath, "utf8");
const benchmarkSchema = JSON.parse(benchmarkSchemaSource);
const governancePolicyPath = join(root, "docs", "adr", "0004-architecture-change-policy-proposed.md");
const governancePolicySource = await readFile(governancePolicyPath, "utf8");
const governanceRecordProcedurePath = join(root, "docs", "adr", "acceptance-records", "README.md");
const governanceRecordProcedureSource = await readFile(governanceRecordProcedurePath, "utf8");
const governanceEvidenceProcedurePath = join(root, "docs", "adr", "acceptance-evidence", "README.md");
const governanceEvidenceProcedureSource = await readFile(governanceEvidenceProcedurePath, "utf8");
const governanceRecordSchemaPath = join(root, "specs", "gov103-acceptance-record.schema.json");
const governanceRecordSchemaSource = await readFile(governanceRecordSchemaPath, "utf8");
const governanceRecordSchema = JSON.parse(governanceRecordSchemaSource);
const governanceEvidenceSchemaPath = join(root, "specs", "gov103-approval-evidence.schema.json");
const governanceEvidenceSchemaSource = await readFile(governanceEvidenceSchemaPath, "utf8");
const governanceEvidenceSchema = JSON.parse(governanceEvidenceSchemaSource);
const governanceAcceptanceRecordNames = (await readdir(join(root, "docs", "adr", "acceptance-records")))
  .filter((name) => name.endsWith(".json"))
  .sort();
const governanceApprovalEvidenceNames = (await readdir(join(root, "docs", "adr", "acceptance-evidence")))
  .filter((name) => name.endsWith(".json"))
  .sort();
const governanceAcceptanceRecords = await hashFiles(governanceAcceptanceRecordNames
  .map((name) => join(root, "docs", "adr", "acceptance-records", name)));
const governanceApprovalEvidence = await hashFiles(governanceApprovalEvidenceNames
  .map((name) => join(root, "docs", "adr", "acceptance-evidence", name)));
const sourceDirectory = join(root, "src");
const sourceNames = (await readdir(sourceDirectory))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort();
const unitTestNames = (await readdir(sourceDirectory))
  .filter((name) => name.endsWith(".test.ts"))
  .sort();
const implementationSource = await hashFiles(
  sourceNames.map((name) => join(sourceDirectory, name)),
);
const unitTestSource = await hashFiles(
  unitTestNames.map((name) => join(sourceDirectory, name)),
);
const fixtureTree = await treeSha256(fixturesDirectory);
const verificationSource = await hashFiles([
  join(root, ".github", "workflows", "ci.yml"),
  join(root, "scripts", "cli-smoke.mjs"),
  join(root, "scripts", "architecture-change-policy.mjs"),
  join(root, "scripts", "architecture-change-policy.node-tests.mjs"),
  join(root, "scripts", "contract-compatibility.mjs"),
  join(root, "scripts", "phase1-evidence.mjs"),
  join(root, "tsconfig.json"),
  join(root, "tsconfig.test.json"),
  join(root, "vitest.config.ts"),
]);
const dependencySource = await hashFiles([
  join(root, "package.json"),
  join(root, "pnpm-lock.yaml"),
]);
const coverageSummary = JSON.parse(await readFile(coverageSummaryPath, "utf8"));
const measuredCoverage = Object.fromEntries(
  ["statements", "branches", "functions", "lines"].map((metric) => {
    const measurement = coverageSummary.total[metric];
    assert.equal(measurement.pct, 100, `${metric} coverage must remain at 100%`);
    assert.equal(measurement.covered, measurement.total, `${metric} coverage must have no uncovered items`);
    return [metric, {
      percent: measurement.pct,
      covered_equals_total: true,
    }];
  }),
);
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
  provenance: {
    implementation_source: implementationSource,
    implementation_source_sha256: sha256(JSON.stringify(implementationSource)),
    unit_test_source: unitTestSource,
    unit_test_source_sha256: sha256(JSON.stringify(unitTestSource)),
    fixture_tree: fixtureTree,
    verification_source: verificationSource,
    verification_source_sha256: sha256(JSON.stringify(verificationSource)),
    dependency_source: dependencySource,
    dependency_source_sha256: sha256(JSON.stringify(dependencySource)),
  },
  schema: {
    file: relativePath(schemaPath),
    id: schema.$id,
    title: schema.title,
    sha256: sha256(schemaSource),
    required_sections: schema.required,
    contract_sections: ["components", "relationships", "rules", "quality_goals"],
  },
  benchmark_schema: {
    file: relativePath(benchmarkSchemaPath),
    id: benchmarkSchema.$id,
    title: benchmarkSchema.title,
    sha256: sha256(benchmarkSchemaSource),
    required_sections: benchmarkSchema.required,
  },
  governance_policy: {
    task: "GOV-103",
    revision: "GOV-103-r1",
    status: governanceAcceptanceRecordNames.length === 0
      ? (governanceApprovalEvidenceNames.length === 0
          ? "proposed-pending-human"
          : "proposed-pending-closure")
      : "closure-record-present-authenticity-review-required",
    file: relativePath(governancePolicyPath),
    sha256: sha256(governancePolicySource),
    acceptance_record_schema: {
      file: relativePath(governanceRecordSchemaPath),
      id: governanceRecordSchema.$id,
      sha256: sha256(governanceRecordSchemaSource),
    },
    approval_evidence_schema: {
      file: relativePath(governanceEvidenceSchemaPath),
      id: governanceEvidenceSchema.$id,
      sha256: sha256(governanceEvidenceSchemaSource),
    },
    acceptance_record_procedure: {
      file: relativePath(governanceRecordProcedurePath),
      sha256: sha256(governanceRecordProcedureSource),
    },
    approval_evidence_procedure: {
      file: relativePath(governanceEvidenceProcedurePath),
      sha256: sha256(governanceEvidenceProcedureSource),
    },
    approval_evidence_files: governanceApprovalEvidence,
    acceptance_record_files: governanceAcceptanceRecords,
  },
  contract_compatibility: {
    architecture: {
      current: ARCHITECTURE_CONTRACT_CURRENT_VERSION,
      previous: ARCHITECTURE_CONTRACT_PREVIOUS_VERSION,
      legacy_alias: ARCHITECTURE_CONTRACT_LEGACY_VERSION,
    },
    graph: GRAPH_CONTRACT_VERSION,
    finding: FINDING_CONTRACT_VERSION,
    evidence: EVIDENCE_CONTRACT_VERSION,
    conformance: CONFORMANCE_CONTRACT_VERSION,
    cli_json: CLI_JSON_CONTRACT_VERSION,
    replay_fixtures: [
      "test/fixtures/compatibility/ground-truth-current.json",
      "test/fixtures/compatibility/ground-truth-previous.json",
    ],
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
    measured_engine_coverage: measuredCoverage,
    coverage_thresholds_percent: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    cli_smoke_checks: [
      "valid model exits 0",
      "invalid model exits 1 with actionable path",
      "unsupported contract version exits 1 with migration guidance",
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
