import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  CLI_JSON_CONTRACT_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  FINDING_CONTRACT_VERSION,
  GRAPH_CONTRACT_VERSION,
} from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "bin.js");
const fixture = (...parts) => join(root, "test", "fixtures", ...parts);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "archsync-cli-smoke-"));
const passed = [];

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
}

function pass(name) {
  passed.push(name);
}

try {
  const valid = run(["validate", fixture("order-platform.architecture.yaml")]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /^RESULT: VALID/m);
  assert.match(valid.stdout, /SUMMARY: 5 components, 5 relationships/);
  pass("valid model");

  const minimal = run(["validate", fixture("minimal.architecture.yaml")]);
  assert.equal(minimal.status, 0, minimal.stderr);
  assert.match(minimal.stdout, /SUMMARY: 2 components, 1 relationship$/m);

  const invalid = run(["validate", fixture("invalid-unknown-component.architecture.yaml")]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /^RESULT: INVALID/m);
  assert.match(invalid.stderr, /relationships\[0\]\.to \(\/relationships\/0\/to\)/);
  assert.match(invalid.stderr, /Fix: Add 'missing-database' under components/);
  pass("invalid model exit code");

  const unsupportedVersion = run([
    "validate",
    fixture("invalid-unsupported-version.architecture.yaml"),
  ]);
  assert.equal(unsupportedVersion.status, 1);
  assert.match(
    unsupportedVersion.stderr,
    /Unsupported architecture contract version '1\.0\.0'/,
  );
  assert.match(unsupportedVersion.stderr, /migrate from 0\.1\.0/);
  pass("unsupported contract version is actionable");

  const missingInput = run(["validate", join(temporaryDirectory, "missing.architecture.yaml")]);
  assert.equal(missingInput.status, 2);
  assert.match(missingInput.stderr, /^RESULT: ERROR/m);
  assert.match(missingInput.stderr, /Input path does not exist/);
  assert.doesNotMatch(missingInput.stderr, /\n\s+at /);
  pass("missing input is actionable");

  const emptyDirectory = join(temporaryDirectory, "empty-models");
  await mkdir(emptyDirectory);
  const emptyValidation = run(["validate-dir", emptyDirectory]);
  assert.equal(emptyValidation.status, 2);
  assert.match(emptyValidation.stderr, /^RESULT: ERROR/m);
  assert.match(emptyValidation.stderr, /No architecture YAML files/);
  pass("empty fixture directory is rejected");

  const directoryValidation = run(["validate-dir", fixture()]);
  assert.equal(directoryValidation.status, 1);
  assert.match(directoryValidation.stderr, /invalid-schema\.architecture\.yaml/);
  assert.doesNotMatch(directoryValidation.stdout, /EXPECTED INVALID/);
  pass("directory validation checks every model");

  const fixtureValidation = run([
    "validate-dir",
    fixture(),
    "--expect-invalid-prefix",
  ]);
  assert.equal(fixtureValidation.status, 0, fixtureValidation.stderr);
  assert.match(fixtureValidation.stdout, /EXPECTED INVALID .*invalid-schema\.architecture\.yaml/);
  assert.match(fixtureValidation.stdout, /EXPECTED INVALID .*invalid-unknown-component\.architecture\.yaml/);
  pass("explicit fixture expectation mode");

  const graph = run(["graph", fixture("order-platform.architecture.yaml")]);
  assert.equal(graph.status, 0, graph.stderr);
  const graphJson = JSON.parse(graph.stdout);
  assert.equal(graphJson.schema_version, CLI_JSON_CONTRACT_VERSION);
  assert.equal(graphJson.kind, "archsync.graph");
  assert.equal(
    graphJson.contracts.architecture_model,
    ARCHITECTURE_CONTRACT_CURRENT_VERSION,
  );
  assert.equal(graphJson.contracts.graph, GRAPH_CONTRACT_VERSION);
  assert.equal(graphJson.nodes.length, 5);
  assert.equal(graphJson.edges.length, 5);
  pass("graph JSON");

  const diff = run([
    "diff",
    fixture("minimal.architecture.yaml"),
    fixture("minimal-evolution.architecture.yaml"),
  ]);
  assert.equal(diff.status, 0, diff.stderr);
  const diffJson = JSON.parse(diff.stdout);
  assert.equal(diffJson.schema_version, CLI_JSON_CONTRACT_VERSION);
  assert.equal(diffJson.kind, "archsync.graph-diff");
  assert.equal(diffJson.contracts.graph, GRAPH_CONTRACT_VERSION);
  assert.deepEqual(diffJson.addedNodes, ["redis"]);
  assert.deepEqual(diffJson.addedEdges.map((edge) => edge.key), ["api|data|redis"]);
  pass("graph diff JSON");

  const cleanCheck = run([
    "check",
    fixture("order-platform.architecture.yaml"),
    fixture("order-platform.architecture.yaml"),
  ]);
  assert.equal(cleanCheck.status, 0, cleanCheck.stderr);
  assert.match(cleanCheck.stdout, /^DECISION: PASS/);
  assert.match(cleanCheck.stdout, /EXIT CODE: 0 \(PASS\)/);
  pass("clean conformance exit code");

  const violationCheck = run([
    "check",
    fixture("order-platform.architecture.yaml"),
    fixture("order-platform.violation.architecture.yaml"),
  ]);
  assert.equal(violationCheck.status, 1);
  assert.match(violationCheck.stdout, /^DECISION: BLOCK/);
  assert.match(violationCheck.stdout, /\[ARCH-001\] Forbidden dependency detected/);
  assert.match(violationCheck.stdout, /frontend --http--> payment-service/);
  assert.match(violationCheck.stdout, /\[ARCH-004\] Required dependency is missing/);
  assert.match(violationCheck.stdout, /EXIT CODE: 1 \(BLOCK\)/);
  pass("violation conformance exit code");

  const violationJson = run([
    "check-json",
    fixture("order-platform.architecture.yaml"),
    fixture("order-platform.violation.architecture.yaml"),
  ]);
  assert.equal(violationJson.status, 1);
  const violationResult = JSON.parse(violationJson.stdout);
  assert.equal(violationResult.schema_version, CLI_JSON_CONTRACT_VERSION);
  assert.equal(violationResult.kind, "archsync.conformance");
  assert.equal(violationResult.contracts.finding, FINDING_CONTRACT_VERSION);
  assert.equal(violationResult.contracts.evidence, EVIDENCE_CONTRACT_VERSION);
  assert.equal(violationResult.classification, "violation");
  assert.deepEqual(
    violationResult.findings.filter((finding) => finding.kind !== "architecture-evolution").map((finding) => finding.id),
    ["ARCH-001", "ARCH-004"],
  );
  assert.ok(
    violationResult.findings.every(
      (finding) => finding.schema_version === FINDING_CONTRACT_VERSION &&
        finding.evidence.schema_version === EVIDENCE_CONTRACT_VERSION,
    ),
  );
  pass("machine-readable conformance JSON");

  const evolutionCheck = run([
    "check",
    fixture("order-platform.architecture.yaml"),
    fixture("order-platform.evolution.architecture.yaml"),
  ]);
  assert.equal(evolutionCheck.status, 3);
  assert.match(evolutionCheck.stdout, /^DECISION: REVIEW/);
  assert.match(evolutionCheck.stdout, /ARCHITECTURE CHANGES \(2\)/);
  assert.match(evolutionCheck.stdout, /EXIT CODE: 3 \(REVIEW\)/);
  pass("evolution approval exit code");

  for (const format of ["mermaid", "drawio"]) {
    const extension = format === "mermaid" ? "mmd" : "drawio";
    const first = join(temporaryDirectory, `first.${extension}`);
    const second = join(temporaryDirectory, `second.${extension}`);
    const firstRun = run([format, fixture("order-platform.architecture.yaml"), first]);
    const secondRun = run([format, fixture("order-platform.architecture.yaml"), second]);
    assert.equal(firstRun.status, 0, firstRun.stderr);
    assert.equal(secondRun.status, 0, secondRun.stderr);
    const [firstOutput, secondOutput] = await Promise.all([
      readFile(first, "utf8"),
      readFile(second, "utf8"),
    ]);
    assert.equal(firstOutput, secondOutput);
    if (format === "drawio") {
      assert.match(firstOutput, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      assert.match(firstOutput, /<mxGraphModel/);
    } else {
      assert.match(firstOutput, /^%% Generated by ArchSync/m);
      assert.match(firstOutput, /^flowchart LR$/m);
    }
    pass(`${format} deterministic output`);
  }

  for (const extension of ["mmd", "drawio"]) {
    const first = join(temporaryDirectory, `report-first.${extension}`);
    const second = join(temporaryDirectory, `report-second.${extension}`);
    const args = [
      "report",
      fixture("order-platform.architecture.yaml"),
      fixture("order-platform.violation.architecture.yaml"),
    ];
    const firstRun = run([...args, first]);
    const secondRun = run([...args, second]);
    assert.equal(firstRun.status, 0, firstRun.stderr);
    assert.equal(secondRun.status, 0, secondRun.stderr);
    const [firstOutput, secondOutput] = await Promise.all([
      readFile(first, "utf8"),
      readFile(second, "utf8"),
    ]);
    assert.equal(firstOutput, secondOutput);
    assert.match(firstOutput, /ARCH-001/);
    assert.match(firstOutput, /ARCH-004/);
    pass(`annotated ${extension} conformance report`);
  }

  const usage = run([]);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Usage:/);
  pass("usage exit code");

  console.log(`PASS CLI SMOKE (${passed.length}/${passed.length}: ${passed.join(", ")})`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
