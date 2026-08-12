import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseDocument } from "yaml";

import { analyzeConformance } from "./conformance.js";
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
  kind: "deny-rule" | "allow-rule" | "required-edge" | "required-path" | "architecture-evolution";
  severity: "info" | "warning" | "error" | "critical";
  from?: string;
  to?: string;
}

export interface BenchmarkEvidenceLocation {
  file: string;
  line: number;
  kind: "source-location";
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
  acceptance_criteria: string[];
  expected: {
    classification: BenchmarkCategory;
    findings: BenchmarkExpectedFinding[];
    evidence: BenchmarkEvidenceLocation[];
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
  evaluatedCases: number;
  totalCases: number;
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

function isExactSelector(selector: string): boolean {
  return !selector.includes("*");
}

function selectorMatches(selector: string, componentId: string): boolean {
  const escaped = selector
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(componentId);
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
  let evaluatedCases = 0;
  let totalCases = 0;

  if (issues.length > 0) {
    return { valid: false, issues, summary, evaluatedCases, totalCases };
  }

  const groundTruth = parsed.toJS() as BenchmarkGroundTruth;
  if (!groundTruth?.benchmark || !Array.isArray(groundTruth.cases)) {
    return {
      valid: false,
      issues: ["Ground truth must contain benchmark metadata and a cases array"],
      summary,
      evaluatedCases,
      totalCases,
    };
  }
  totalCases = groundTruth.cases.length;

  const architecturePath = resolve(baseDir, groundTruth.benchmark.architecture);
  const architectureResult = await loadArchitecture(architecturePath);
  if (!architectureResult.valid || !architectureResult.value) {
    issues.push("Benchmark architecture is invalid");
    issues.push(...architectureResult.issues.map((issue) => `${issue.path}: ${issue.message}`));
    return { valid: false, issues, summary, evaluatedCases, totalCases };
  }

  const componentIds = new Set(Object.keys(architectureResult.value.components));
  const baselineEdgeKeys = new Set(
    architectureResult.value.relationships.map(edgeKey),
  );
  const rulesById = new Map(
    (architectureResult.value.rules ?? []).map((rule) => [rule.id, rule]),
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
    if (
      !Array.isArray(scenario.acceptance_criteria) ||
      scenario.acceptance_criteria.length === 0 ||
      scenario.acceptance_criteria.some((criterion) => !criterion.trim())
    ) {
      issues.push(`cases/${index}: acceptance_criteria must contain a non-empty criterion`);
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

    if (!Array.isArray(scenario.expected.evidence) || scenario.expected.evidence.length === 0) {
      issues.push(`cases/${index}: expected evidence must not be empty`);
    } else {
      for (const evidence of scenario.expected.evidence) {
        if (!scenario.changed_files.includes(evidence.file)) {
          issues.push(`cases/${index}: evidence file '${evidence.file}' is not a changed file`);
        }
        if (!Number.isInteger(evidence.line) || evidence.line < 1) {
          issues.push(`cases/${index}: evidence line must be a positive integer`);
        }
        if (evidence.kind !== "source-location") {
          issues.push(`cases/${index}: unsupported evidence kind '${String(evidence.kind)}'`);
        }
      }
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

      if (finding.kind !== "architecture-evolution") {
        const rule = rulesById.get(finding.id);
        if (!rule) {
          issues.push(`cases/${index}: finding references unknown rule '${finding.id}'`);
          continue;
        }
        const expectedKind = {
          deny: "deny-rule",
          allow: "allow-rule",
          require: "required-edge",
          "require-path": "required-path",
        }[rule.type];
        if (finding.kind !== expectedKind) {
          issues.push(`cases/${index}: finding kind '${finding.kind}' differs from rule '${rule.id}'`);
        }
        if (finding.severity !== rule.severity) {
          issues.push(`cases/${index}: finding severity differs from rule '${rule.id}'`);
        }
        if (isExactSelector(rule.from) && finding.from !== rule.from) {
          issues.push(`cases/${index}: finding source differs from rule '${rule.id}'`);
        }
        if (rule.type !== "allow" && isExactSelector(rule.to) && finding.to !== rule.to) {
          issues.push(`cases/${index}: finding target differs from rule '${rule.id}'`);
        }
        if (rule.type === "allow" && finding.to && selectorMatches(rule.to, finding.to)) {
          issues.push(`cases/${index}: allow-rule finding target is inside rule '${rule.id}'`);
        }

        const matchingDelta = finding.kind === "required-path"
          ? (scenario.delta.relationships_removed?.length ?? 0) > 0 ||
            (scenario.delta.components_removed?.length ?? 0) > 0
          : (finding.kind === "deny-rule" || finding.kind === "allow-rule"
              ? scenario.delta.relationships_added ?? []
              : scenario.delta.relationships_removed ?? [])
            .some((relationship) =>
              relationship.from === finding.from &&
              relationship.to === finding.to &&
              (!rule.relationship_type || relationship.type === rule.relationship_type),
            );
        if (!matchingDelta) {
          issues.push(`cases/${index}: finding '${finding.id}' has no matching graph delta`);
        }
      }
    }

    const observed = applyBenchmarkDelta(architectureResult.value, scenario.delta);
    const conformance = analyzeConformance(architectureResult.value, observed);
    evaluatedCases += 1;
    if (conformance.classification !== scenario.expected.classification) {
      issues.push(
        `cases/${index}: conformance engine classified '${conformance.classification}', expected '${scenario.expected.classification}'`,
      );
    }
    if (scenario.expected.classification === "violation") {
      const actualRuleIds = conformance.findings
        .filter((finding) => finding.kind !== "architecture-evolution")
        .map((finding) => finding.id)
        .sort();
      const expectedRuleIds = scenario.expected.findings
        .filter((finding) => finding.kind !== "architecture-evolution")
        .map((finding) => finding.id)
        .sort();
      if (actualRuleIds.join("\0") !== expectedRuleIds.join("\0")) {
        issues.push(
          `cases/${index}: conformance engine rule findings [${actualRuleIds.join(", ")}] differ from expected [${expectedRuleIds.join(", ")}]`,
        );
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

  return { valid: issues.length === 0, issues, summary, evaluatedCases, totalCases };
}
