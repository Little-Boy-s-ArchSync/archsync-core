import { buildGraph, diffGraphs, edgeKey } from "./graph.js";
import type {
  ArchitectureDocument,
  ArchitectureGraph,
  ArchitectureRelationship,
  ArchitectureRule,
  GraphDiff,
  RelationshipType,
  Severity,
} from "./model.js";

export type ConformanceClassification = "no-impact" | "violation" | "evolution";

export interface ConformanceEvidence {
  document: "expected" | "observed";
  path: string;
}

export interface ConformanceFinding {
  id: string;
  kind: "deny-rule" | "required-edge" | "architecture-evolution";
  severity: Severity;
  message: string;
  from?: string;
  to?: string;
  relationship_type?: RelationshipType;
  edge_key?: string;
  component?: string;
  change?: "added" | "removed" | "changed";
  evidence: ConformanceEvidence;
}

export interface ConformanceSummary {
  violations: number;
  evolutions: number;
  added_nodes: number;
  removed_nodes: number;
  changed_nodes: number;
  added_edges: number;
  removed_edges: number;
}

export interface ConformanceResult {
  classification: ConformanceClassification;
  findings: ConformanceFinding[];
  diff: GraphDiff;
  summary: ConformanceSummary;
}

function selectorExpression(selector: string): RegExp {
  const escaped = selector
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

function matchesSelector(selector: string, componentId: string): boolean {
  return selectorExpression(selector).test(componentId);
}

function matchingComponents(graph: ArchitectureGraph, selector: string): string[] {
  return [...graph.nodes.keys()].filter((id) => matchesSelector(selector, id)).sort();
}

function ruleMatchesEdge(rule: ArchitectureRule, relationship: ArchitectureRelationship): boolean {
  return matchesSelector(rule.from, relationship.from) &&
    matchesSelector(rule.to, relationship.to) &&
    (!rule.relationship_type || rule.relationship_type === relationship.type);
}

function relationshipIndex(document: ArchitectureDocument, key: string): number {
  return document.relationships.findIndex((relationship) => edgeKey(relationship) === key);
}

function denyFindings(
  expected: ArchitectureDocument,
  observed: ArchitectureDocument,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const rule of expected.rules ?? []) {
    if (rule.type !== "deny") continue;
    const matching = observed.relationships
      .filter((relationship) => ruleMatchesEdge(rule, relationship))
      .sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
    for (const relationship of matching) {
      const key = edgeKey(relationship);
      findings.push({
        id: rule.id,
        kind: "deny-rule",
        severity: rule.severity,
        message: `Forbidden relationship '${key}' matches deny rule '${rule.id}'`,
        from: relationship.from,
        to: relationship.to,
        relationship_type: relationship.type,
        edge_key: key,
        evidence: {
          document: "observed",
          path: `/relationships/${relationshipIndex(observed, key)}`,
        },
      });
    }
  }
  return findings;
}

function requiredFindings(
  expected: ArchitectureDocument,
  observed: ArchitectureDocument,
  observedGraph: ArchitectureGraph,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const [ruleIndex, rule] of (expected.rules ?? []).entries()) {
    if (rule.type !== "require") continue;
    const sources = matchingComponents(observedGraph, rule.from);
    for (const source of sources) {
      const matching = observed.relationships.some((relationship) =>
        relationship.from === source &&
        matchesSelector(rule.to, relationship.to) &&
        (!rule.relationship_type || rule.relationship_type === relationship.type),
      );
      if (matching) continue;
      const relationshipType = rule.relationship_type ?? "other";
      const target = rule.to;
      findings.push({
        id: rule.id,
        kind: "required-edge",
        severity: rule.severity,
        message: `Required relationship '${source}|${relationshipType}|${target}' is missing for rule '${rule.id}'`,
        from: source,
        to: target,
        ...(rule.relationship_type ? { relationship_type: rule.relationship_type } : {}),
        edge_key: `${source}|${relationshipType}|${target}`,
        evidence: { document: "expected", path: `/rules/${ruleIndex}` },
      });
    }
  }
  return findings;
}

function evolutionFindings(
  expected: ArchitectureDocument,
  observed: ArchitectureDocument,
  diff: GraphDiff,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  let sequence = 1;
  const nextId = () => `EVOLUTION-${String(sequence++).padStart(3, "0")}`;

  for (const node of diff.addedNodes) {
    findings.push({
      id: nextId(),
      kind: "architecture-evolution",
      severity: "warning",
      message: `Component '${node.id}' was added to the observed architecture`,
      component: node.id,
      change: "added",
      evidence: { document: "observed", path: `/components/${node.id}` },
    });
  }
  for (const node of diff.removedNodes) {
    findings.push({
      id: nextId(),
      kind: "architecture-evolution",
      severity: "warning",
      message: `Component '${node.id}' is missing from the observed architecture`,
      component: node.id,
      change: "removed",
      evidence: { document: "expected", path: `/components/${node.id}` },
    });
  }
  for (const node of diff.changedNodes) {
    findings.push({
      id: nextId(),
      kind: "architecture-evolution",
      severity: "warning",
      message: `Component '${node.id}' changed architecture metadata`,
      component: node.id,
      change: "changed",
      evidence: { document: "observed", path: `/components/${node.id}` },
    });
  }
  for (const edge of diff.addedEdges) {
    findings.push({
      id: nextId(),
      kind: "architecture-evolution",
      severity: "warning",
      message: `Relationship '${edge.key}' was added to the observed architecture`,
      from: edge.from,
      to: edge.to,
      relationship_type: edge.type,
      edge_key: edge.key,
      change: "added",
      evidence: {
        document: "observed",
        path: `/relationships/${relationshipIndex(observed, edge.key)}`,
      },
    });
  }
  for (const edge of diff.removedEdges) {
    findings.push({
      id: nextId(),
      kind: "architecture-evolution",
      severity: "warning",
      message: `Relationship '${edge.key}' is missing from the observed architecture`,
      from: edge.from,
      to: edge.to,
      relationship_type: edge.type,
      edge_key: edge.key,
      change: "removed",
      evidence: {
        document: "expected",
        path: `/relationships/${relationshipIndex(expected, edge.key)}`,
      },
    });
  }
  return findings;
}

export function analyzeConformance(
  expected: ArchitectureDocument,
  observed: ArchitectureDocument,
): ConformanceResult {
  const expectedGraph = buildGraph(expected);
  const observedGraph = buildGraph(observed);
  const diff = diffGraphs(expectedGraph, observedGraph);
  const violations = [
    ...denyFindings(expected, observed),
    ...requiredFindings(expected, observed, observedGraph),
  ];
  const evolutions = evolutionFindings(expected, observed, diff);
  const classification: ConformanceClassification = violations.length > 0
    ? "violation"
    : evolutions.length > 0
      ? "evolution"
      : "no-impact";

  return {
    classification,
    findings: [...violations, ...evolutions],
    diff,
    summary: {
      violations: violations.length,
      evolutions: evolutions.length,
      added_nodes: diff.addedNodes.length,
      removed_nodes: diff.removedNodes.length,
      changed_nodes: diff.changedNodes.length,
      added_edges: diff.addedEdges.length,
      removed_edges: diff.removedEdges.length,
    },
  };
}

export function formatConformanceResult(result: ConformanceResult): string {
  const violationLabel = `${result.summary.violations} violation${result.summary.violations === 1 ? "" : "s"}`;
  const changeLabel = `${result.summary.evolutions} architecture change${result.summary.evolutions === 1 ? "" : "s"}`;
  const lines = [
    `${result.classification.toUpperCase()} (${violationLabel}, ${changeLabel})`,
  ];
  for (const finding of result.findings) {
    const location = `${finding.evidence.document}:${finding.evidence.path}`;
    lines.push(
      `- [${finding.id}] ${finding.severity.toUpperCase()} ${finding.kind} at ${location}: ${finding.message}`,
    );
  }
  if (result.findings.length === 0) {
    lines.push("- No rule violations or architecture topology changes detected");
  }
  lines.push(
    `DELTA nodes +${result.summary.added_nodes}/-${result.summary.removed_nodes}/~${result.summary.changed_nodes}, edges +${result.summary.added_edges}/-${result.summary.removed_edges}`,
  );
  return lines.join("\n");
}
