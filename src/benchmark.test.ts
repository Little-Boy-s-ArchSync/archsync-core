import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyBenchmarkDelta,
  validateBenchmark,
  type BenchmarkGroundTruth,
} from "./benchmark.js";
import type { ArchitectureDocument } from "./model.js";

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "archsync-benchmark-test-"));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function groundTruth(): BenchmarkGroundTruth {
  return {
    version: "0.1",
    benchmark: {
      id: "test-benchmark",
      architecture: "architecture.yaml",
      repository: "repository",
      stack: "TypeScript/Node.js",
      expected_distribution: { "no-impact": 1, violation: 1, evolution: 1 },
    },
    cases: [
      {
        id: "case-01",
        title: "Internal refactor",
        owner: "service-team",
        category: "no-impact",
        risk: "low",
        description: "No topology change",
        patch: "changes/case-01.patch",
        changed_files: ["service/src/internal.ts"],
        delta: {},
        acceptance_criteria: ["No component or relationship changes"],
        expected: {
          classification: "no-impact",
          findings: [],
          evidence: [{ file: "service/src/internal.ts", line: 1, kind: "source-location" }],
          approval_required: false,
        },
      },
      {
        id: "case-02",
        title: "Required edge removed",
        owner: "service-team",
        category: "violation",
        risk: "high",
        description: "The data dependency is removed",
        patch: "changes/case-02.patch",
        changed_files: ["service/src/data.ts"],
        delta: { relationships_removed: [{ from: "service", to: "database", type: "data" }] },
        acceptance_criteria: ["ARCH-001 is reported"],
        expected: {
          classification: "violation",
          findings: [{ id: "ARCH-001", kind: "required-edge", severity: "error", from: "service", to: "database" }],
          evidence: [{ file: "service/src/data.ts", line: 1, kind: "source-location" }],
          approval_required: false,
        },
      },
      {
        id: "case-03",
        title: "Cache evolution",
        owner: "service-team",
        category: "evolution",
        risk: "medium",
        description: "A cache is introduced",
        patch: "changes/case-03.patch",
        changed_files: ["service/src/cache.ts"],
        delta: {
          components_added: { redis: { type: "cache", layer: "data" } },
          relationships_added: [{ from: "service", to: "redis", type: "data" }],
        },
        acceptance_criteria: ["The cache topology requires approval"],
        expected: {
          classification: "evolution",
          findings: [{ id: "EVOLUTION-001", kind: "architecture-evolution", severity: "warning", from: "service", to: "redis" }],
          evidence: [{ file: "service/src/cache.ts", line: 1, kind: "source-location" }],
          approval_required: true,
        },
      },
    ],
  };
}

async function writeBenchmark(
  value: BenchmarkGroundTruth,
  options: { architecture?: string; repository?: boolean; patches?: boolean } = {},
): Promise<string> {
  const architecture = options.architecture ?? `
version: "0.1"
metadata:
  name: benchmark-test
components:
  service:
    type: service
    layer: domain
  database:
    type: database
    layer: data
relationships:
  - from: service
    to: database
    type: data
rules:
  - id: ARCH-001
    type: require
    from: service
    to: database
    relationship_type: data
    severity: error
`;
  await writeFile(join(temporaryDirectory, "architecture.yaml"), architecture, "utf8");
  await writeFile(
    join(temporaryDirectory, "ground-truth.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  if (options.repository !== false) {
    await mkdir(join(temporaryDirectory, "repository"), { recursive: true });
  }
  if (options.patches !== false) {
    await mkdir(join(temporaryDirectory, "changes"), { recursive: true });
    for (const scenario of value.cases) {
      await writeFile(
        join(temporaryDirectory, scenario.patch),
        `diff --git a/${scenario.changed_files[0]} b/${scenario.changed_files[0]}\n+++ b/${scenario.changed_files[0]}\n`,
        "utf8",
      );
    }
  }
  return join(temporaryDirectory, "ground-truth.json");
}

describe("Phase 1 benchmark ground truth", () => {
  it("applies a topology delta without mutating the baseline", () => {
    const baseline: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "delta-test" },
      components: {
        service: { type: "service", layer: "domain" },
        database: { type: "database", layer: "data" },
      },
      relationships: [
        { from: "service", to: "database", type: "data" },
      ],
    };

    const observed = applyBenchmarkDelta(baseline, {
      components_added: {
        redis: { type: "cache", layer: "data" },
      },
      relationships_added: [
        { from: "service", to: "redis", type: "data" },
      ],
    });

    expect(Object.keys(baseline.components)).toEqual(["service", "database"]);
    expect(Object.keys(observed.components)).toEqual([
      "service",
      "database",
      "redis",
    ]);
    expect(observed.relationships).toHaveLength(2);
  });

  it("validates a complete ground-truth manifest", async () => {
    const result = await validateBenchmark(await writeBenchmark(groundTruth()));

    expect(result.valid).toBe(true);
    expect(result.summary).toEqual({ "no-impact": 1, violation: 1, evolution: 1 });
    expect(result.evaluatedCases).toBe(3);
    expect(result.totalCases).toBe(3);
  });

  it("rejects a ground-truth classification that disagrees with the conformance engine", async () => {
    const value = groundTruth();
    value.cases[2]!.category = "no-impact";
    value.cases[2]!.expected.classification = "no-impact";
    value.cases[2]!.expected.findings = [];
    value.cases[2]!.delta = {
      relationships_added: [{ from: "service", to: "database", type: "http" }],
    };
    value.benchmark.expected_distribution = { "no-impact": 2, violation: 1, evolution: 0 };

    const result = await validateBenchmark(await writeBenchmark(value));

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/conformance engine classified 'evolution', expected 'no-impact'/);
  });

  it("rejects expected violation rule ids that disagree with engine findings", async () => {
    const value = groundTruth();
    value.cases[1]!.expected.findings[0]!.id = "ARCH-002";
    const architecture = `
version: "0.1"
metadata:
  name: benchmark-test
components:
  service:
    type: service
    layer: domain
  database:
    type: database
    layer: data
relationships:
  - from: service
    to: database
    type: data
rules:
  - id: ARCH-001
    type: require
    from: service
    to: database
    relationship_type: data
    severity: error
  - id: ARCH-002
    type: require
    from: service
    to: database
    relationship_type: data
    severity: error
`;

    const result = await validateBenchmark(await writeBenchmark(value, { architecture }));

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/conformance engine rule findings \[ARCH-001, ARCH-002\] differ from expected \[ARCH-002\]/);
  });

  const rejectedCases: Array<{
    name: string;
    mutate: (value: BenchmarkGroundTruth) => void;
    issue: RegExp;
  }> = [
    {
      name: "duplicate case ids",
      mutate: (value) => { value.cases[1]!.id = value.cases[0]!.id; },
      issue: /duplicate id/,
    },
    {
      name: "missing owner",
      mutate: (value) => { value.cases[0]!.owner = " "; },
      issue: /owner is required/,
    },
    {
      name: "empty changed files",
      mutate: (value) => { value.cases[0]!.changed_files = []; },
      issue: /changed_files must not be empty/,
    },
    {
      name: "missing acceptance criteria",
      mutate: (value) => { value.cases[0]!.acceptance_criteria = []; },
      issue: /acceptance_criteria must contain a non-empty criterion/,
    },
    {
      name: "missing expected evidence",
      mutate: (value) => { value.cases[0]!.expected.evidence = []; },
      issue: /expected evidence must not be empty/,
    },
    {
      name: "evidence outside changed files",
      mutate: (value) => { value.cases[0]!.expected.evidence[0]!.file = "other.ts"; },
      issue: /evidence file 'other\.ts' is not a changed file/,
    },
    {
      name: "invalid evidence line",
      mutate: (value) => { value.cases[0]!.expected.evidence[0]!.line = 0; },
      issue: /evidence line must be a positive integer/,
    },
    {
      name: "unsupported evidence kind",
      mutate: (value) => { value.cases[0]!.expected.evidence[0]!.kind = "runtime" as "source-location"; },
      issue: /unsupported evidence kind 'runtime'/,
    },
    {
      name: "classification mismatch",
      mutate: (value) => { value.cases[0]!.expected.classification = "violation"; },
      issue: /category and expected\.classification differ/,
    },
    {
      name: "evolution without approval",
      mutate: (value) => { value.cases[2]!.expected.approval_required = false; },
      issue: /evolution must require approval/,
    },
    {
      name: "violation without findings",
      mutate: (value) => { value.cases[1]!.expected.findings = []; },
      issue: /violation must contain at least one expected finding/,
    },
    {
      name: "no-impact with findings",
      mutate: (value) => { value.cases[0]!.expected.findings = [{ id: "BAD", kind: "deny-rule", severity: "error" }]; },
      issue: /no-impact case cannot contain findings/,
    },
    {
      name: "no-impact with topology delta",
      mutate: (value) => { value.cases[0]!.delta.components_removed = ["database"]; },
      issue: /no-impact case cannot contain a topology delta/,
    },
    {
      name: "evolution without topology delta",
      mutate: (value) => { value.cases[2]!.delta = {}; },
      issue: /evolution must contain a topology delta/,
    },
    {
      name: "adding an existing component",
      mutate: (value) => { value.cases[2]!.delta.components_added = { database: { type: "database", layer: "data" } }; },
      issue: /added component 'database' already exists/,
    },
    {
      name: "removing an unknown component",
      mutate: (value) => { value.cases[1]!.delta.components_removed = ["missing"]; },
      issue: /cannot remove unknown component 'missing'/,
    },
    {
      name: "added edge with unknown source",
      mutate: (value) => { value.cases[2]!.delta.relationships_added = [{ from: "missing", to: "redis", type: "data" }]; },
      issue: /added edge references unknown 'missing'/,
    },
    {
      name: "added edge with unknown target",
      mutate: (value) => { value.cases[2]!.delta.relationships_added = [{ from: "service", to: "missing", type: "data" }]; },
      issue: /added edge references unknown 'missing'/,
    },
    {
      name: "removing an unknown edge",
      mutate: (value) => { value.cases[1]!.delta.relationships_removed = [{ from: "database", to: "service", type: "data" }]; },
      issue: /cannot remove unknown edge/,
    },
    {
      name: "finding with unknown source",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.from = "missing"; },
      issue: /finding references unknown 'missing'/,
    },
    {
      name: "finding with unknown target",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.to = "missing"; },
      issue: /finding references unknown 'missing'/,
    },
    {
      name: "finding with unknown rule",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.id = "ARCH-404"; },
      issue: /finding references unknown rule 'ARCH-404'/,
    },
    {
      name: "finding kind inconsistent with rule",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.kind = "deny-rule"; },
      issue: /finding kind 'deny-rule' differs from rule 'ARCH-001'/,
    },
    {
      name: "finding severity inconsistent with rule",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.severity = "warning"; },
      issue: /finding severity differs from rule 'ARCH-001'/,
    },
    {
      name: "finding source inconsistent with rule",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.from = "database"; },
      issue: /finding source differs from rule 'ARCH-001'/,
    },
    {
      name: "finding target inconsistent with rule",
      mutate: (value) => { value.cases[1]!.expected.findings[0]!.to = "service"; },
      issue: /finding target differs from rule 'ARCH-001'/,
    },
    {
      name: "finding without matching graph delta",
      mutate: (value) => { value.cases[1]!.delta.relationships_removed = []; },
      issue: /finding 'ARCH-001' has no matching graph delta/,
    },
    {
      name: "distribution mismatch",
      mutate: (value) => { value.benchmark.expected_distribution.evolution = 2; },
      issue: /distribution\/evolution: expected 2, found 1/,
    },
  ];

  for (const rejected of rejectedCases) {
    it(`rejects ${rejected.name}`, async () => {
      const value = groundTruth();
      rejected.mutate(value);
      const result = await validateBenchmark(await writeBenchmark(value));

      expect(result.valid).toBe(false);
      expect(result.issues.join("\n")).toMatch(rejected.issue);
    });
  }

  it("rejects an unknown category without crashing", async () => {
    const value = groundTruth();
    value.cases[0]!.category = "unknown" as "no-impact";
    const result = await validateBenchmark(await writeBenchmark(value));

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/unknown category 'unknown'/);
  });

  it("rejects a declared file that is absent from its patch", async () => {
    const value = groundTruth();
    const filePath = await writeBenchmark(value);
    value.cases[0]!.changed_files = ["service/src/not-in-patch.ts"];
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

    const result = await validateBenchmark(filePath);

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/patch does not mention changed file/);
  });

  it("reports a missing patch and repository", async () => {
    const result = await validateBenchmark(
      await writeBenchmark(groundTruth(), { patches: false, repository: false }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/missing patch/);
    expect(result.issues.join("\n")).toMatch(/missing repository/);
  });

  it("reports invalid benchmark architecture", async () => {
    const result = await validateBenchmark(
      await writeBenchmark(groundTruth(), { architecture: "version: invalid" }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/Benchmark architecture is invalid/);
  });

  it("reports malformed ground-truth YAML", async () => {
    const filePath = join(temporaryDirectory, "ground-truth.json");
    await writeFile(filePath, "cases: [unterminated", "utf8");

    const result = await validateBenchmark(filePath);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("rejects a manifest without benchmark metadata", async () => {
    const filePath = join(temporaryDirectory, "ground-truth.json");
    await writeFile(filePath, '{"version":"0.1","cases":[]}', "utf8");

    const result = await validateBenchmark(filePath);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Ground truth must contain benchmark metadata and a cases array");
  });
});
