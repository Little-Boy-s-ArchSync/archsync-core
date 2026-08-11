import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGraph,
  diffGraphs,
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

const evidence = {
  phase: 1,
  release: "v0.0",
  objective: "Machine-readable architecture contract and analyzer ground truth",
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
      "Mermaid output is deterministic",
      "draw.io output is deterministic editable XML",
      "invalid CLI usage exits 2",
    ],
    benchmark_distribution: { "no-impact": 5, violation: 3, evolution: 2 },
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
