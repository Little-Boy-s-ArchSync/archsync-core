import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseDocument } from "yaml";

import { edgeKey } from "./graph.js";
import type {
  ArchitectureComponent,
  ArchitectureDocument,
  ArchitectureRelationship,
} from "./model.js";
import { loadArchitecture } from "./validation.js";

export type BenchmarkCategory = "no-impact" | "violation" | "evolution";

export interface BenchmarkCaseDelta {
  components_added?: Record<string, ArchitectureComponent>;
  components_removed?: string[];
  relationships_added?: ArchitectureRelationship[];
  relationships_removed?: ArchitectureRelationship[];
}

export interface BenchmarkExpectedFinding {
  id: string;
  kind: "deny-rule" | "required-edge" | "architecture-evolution";
  severity: "info" | "warning" | "error" | "critical";
  from?: string;
  to?: string;
}

export interface BenchmarkCase {
  id: string;
  title: string;
  owner: string;
  category: BenchmarkCategory;
  risk: "low" | "medium" | "high";
  description: string;
  patch: string;
  changed_files: string[];
  delta: BenchmarkCaseDelta;
  expected: {
    classification: BenchmarkCategory;
    findings: BenchmarkExpectedFinding[];
    approval_required: boolean;
  };
}

export interface BenchmarkGroundTruth {
  version: string;
  benchmark: {
    id: string;
    architecture: string;
    repository: string;
    stack: string;
    expected_distribution: Record<BenchmarkCategory, number>;
  };
  cases: BenchmarkCase[];
}

export interface BenchmarkValidationResult {
  valid: boolean;
  issues: string[];
  summary: Record<BenchmarkCategory, number>;
}

export function applyBenchmarkDelta(
  baseline: ArchitectureDocument,
  delta: BenchmarkCaseDelta,
): ArchitectureDocument {
  const components = {
    ...baseline.components,
    ...(delta.components_added ?? {}),
  };

  for (const componentId of delta.components_removed ?? []) {
    delete components[componentId];
  }

  const removedEdges = new Set(
    (delta.relationships_removed ?? []).map(edgeKey),
  );
  const removedComponents = new Set(delta.components_removed ?? []);
  const relationships = baseline.relationships
    .filter((relationship) => !removedEdges.has(edgeKey(relationship)))
    .filter(
      (relationship) =>
        !removedComponents.has(relationship.from) &&
        !removedComponents.has(relationship.to),
    )
    .concat(delta.relationships_added ?? []);

  return { ...baseline, components, relationships };
}

function deltaHasTopologyImpact(delta: BenchmarkCaseDelta): boolean {
  return (
    Object.keys(delta.components_added ?? {}).length > 0 ||
    (delta.components_removed?.length ?? 0) > 0 ||
    (delta.relationships_added?.length ?? 0) > 0 ||
    (delta.relationships_removed?.length ?? 0) > 0
  );
}

function hasComponent(
  id: string,
  baseline: Set<string>,
  added: Record<string, ArchitectureComponent>,
): boolean {
  return baseline.has(id) || Object.hasOwn(added, id);
}

export async function validateBenchmark(
  filePath: string,
): Promise<BenchmarkValidationResult> {
  const absolutePath = resolve(filePath);
  const baseDir = dirname(absolutePath);
  const parsed = parseDocument(await readFile(absolutePath, "utf8"), {
    prettyErrors: true,
    uniqueKeys: true,
  });
  const issues = parsed.errors.map((error) => error.message);
  const summary: Record<BenchmarkCategory, number> = {
    "no-impact": 0,
    violation: 0,
    evolution: 0,
  };

  if (issues.length > 0) {
    return { valid: false, issues, summary };
  }

  const groundTruth = parsed.toJS() as BenchmarkGroundTruth;
  if (!groundTruth?.benchmark || !Array.isArray(groundTruth.cases)) {
    return {
      valid: false,
      issues: ["Ground truth must contain benchmark metadata and a cases array"],
      summary,
    };
  }

  const architecturePath = resolve(baseDir, groundTruth.benchmark.architecture);
  const architectureResult = await loadArchitecture(architecturePath);
  if (!architectureResult.valid || !architectureResult.value) {
    issues.push("Benchmark architecture is invalid");
    issues.push(...architectureResult.issues.map((issue) => `${issue.path}: ${issue.message}`));
    return { valid: false, issues, summary };
  }

  const componentIds = new Set(Object.keys(architectureResult.value.components));
  const baselineEdgeKeys = new Set(
    architectureResult.value.relationships.map(edgeKey),
  );
  const caseIds = new Set<string>();

  for (const [index, scenario] of groundTruth.cases.entries()) {
    if (caseIds.has(scenario.id)) {
      issues.push(`cases/${index}: duplicate id '${scenario.id}'`);
    }
    caseIds.add(scenario.id);

    if (!scenario.owner?.trim()) {
      issues.push(`cases/${index}: owner is required`);
    }
    if (!Array.isArray(scenario.changed_files) || scenario.changed_files.length === 0) {
      issues.push(`cases/${index}: changed_files must not be empty`);
    }

    if (!(scenario.category in summary)) {
      issues.push(`cases/${index}: unknown category '${String(scenario.category)}'`);
      continue;
    }
    summary[scenario.category] += 1;

    if (scenario.category !== scenario.expected.classification) {
      issues.push(`cases/${index}: category and expected.classification differ`);
    }
    if (scenario.category === "evolution" && !scenario.expected.approval_required) {
      issues.push(`cases/${index}: evolution must require approval in Phase 1`);
    }
    if (scenario.category === "violation" && scenario.expected.findings.length === 0) {
      issues.push(`cases/${index}: violation must contain at least one expected finding`);
    }
    if (scenario.category === "no-impact" && scenario.expected.findings.length > 0) {
      issues.push(`cases/${index}: no-impact case cannot contain findings`);
    }
    if (scenario.category === "no-impact" && deltaHasTopologyImpact(scenario.delta)) {
      issues.push(`cases/${index}: no-impact case cannot contain a topology delta`);
    }
    if (scenario.category === "evolution" && !deltaHasTopologyImpact(scenario.delta)) {
      issues.push(`cases/${index}: evolution must contain a topology delta`);
    }

    const added = scenario.delta.components_added ?? {};
    for (const componentId of Object.keys(added)) {
      if (componentIds.has(componentId)) {
        issues.push(`cases/${index}: added component '${componentId}' already exists`);
      }
    }
    for (const componentId of scenario.delta.components_removed ?? []) {
      if (!componentIds.has(componentId)) {
        issues.push(`cases/${index}: cannot remove unknown component '${componentId}'`);
      }
    }
    for (const relationship of scenario.delta.relationships_added ?? []) {
      if (!hasComponent(relationship.from, componentIds, added)) {
        issues.push(`cases/${index}: added edge references unknown '${relationship.from}'`);
      }
      if (!hasComponent(relationship.to, componentIds, added)) {
        issues.push(`cases/${index}: added edge references unknown '${relationship.to}'`);
      }
    }
    for (const relationship of scenario.delta.relationships_removed ?? []) {
      if (!baselineEdgeKeys.has(edgeKey(relationship))) {
        issues.push(
          `cases/${index}: cannot remove unknown edge '${edgeKey(relationship)}'`,
        );
      }
    }
    for (const finding of scenario.expected.findings) {
      if (finding.from && !hasComponent(finding.from, componentIds, added)) {
        issues.push(`cases/${index}: finding references unknown '${finding.from}'`);
      }
      if (finding.to && !hasComponent(finding.to, componentIds, added)) {
        issues.push(`cases/${index}: finding references unknown '${finding.to}'`);
      }
    }

    const patchPath = resolve(baseDir, scenario.patch);
    const repositoryPath = resolve(baseDir, groundTruth.benchmark.repository);
    try {
      const patchSource = await readFile(patchPath, "utf8");
      for (const changedFile of scenario.changed_files) {
        if (!patchSource.includes(`b/${changedFile}`)) {
          issues.push(
            `cases/${index}: patch does not mention changed file '${changedFile}'`,
          );
        }
      }
    } catch {
      issues.push(`cases/${index}: missing patch '${scenario.patch}'`);
    }
    try {
      await access(repositoryPath);
    } catch {
      issues.push(`benchmark: missing repository '${groundTruth.benchmark.repository}'`);
    }
  }

  for (const category of Object.keys(summary) as BenchmarkCategory[]) {
    const expected = groundTruth.benchmark.expected_distribution[category];
    if (summary[category] !== expected) {
      issues.push(
        `distribution/${category}: expected ${expected}, found ${summary[category]}`,
      );
    }
  }

  return { valid: issues.length === 0, issues, summary };
}
