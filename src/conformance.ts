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
  kind: "deny-rule" | "allow-rule" | "required-edge" | "required-path" | "architecture-evolution";
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

function allowFindings(
  expected: ArchitectureDocument,
  observed: ArchitectureDocument,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const rule of expected.rules ?? []) {
    if (rule.type !== "allow") continue;
    const disallowed = observed.relationships
      .filter((relationship) =>
        matchesSelector(rule.from, relationship.from) &&
        !matchesSelector(rule.to, relationship.to) &&
        (!rule.relationship_type || rule.relationship_type === relationship.type)
      )
      .sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
    for (const relationship of disallowed) {
      const key = edgeKey(relationship);
      findings.push({
        id: rule.id,
        kind: "allow-rule",
        severity: rule.severity,
        message: `Relationship '${key}' is outside allow rule '${rule.id}'`,
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
      const target = rule.to;
      const requiredRelationship = rule.relationship_type
        ? `'${source}|${rule.relationship_type}|${target}'`
        : `from '${source}' to '${target}' (any relationship type)`;
      findings.push({
        id: rule.id,
        kind: "required-edge",
        severity: rule.severity,
        message: `Required relationship ${requiredRelationship} is missing for rule '${rule.id}'`,
        from: source,
        to: target,
        ...(rule.relationship_type
          ? {
              relationship_type: rule.relationship_type,
              edge_key: `${source}|${rule.relationship_type}|${target}`,
            }
          : {}),
        evidence: { document: "expected", path: `/rules/${ruleIndex}` },
      });
    }
  }
  return findings;
}

function hasRequiredPath(
  graph: ArchitectureGraph,
  source: string,
  targetSelector: string,
  relationshipType?: RelationshipType,
): boolean {
  const visited = new Set<string>([source]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.outgoing.get(current)!) {
      if (relationshipType && edge.type !== relationshipType) continue;
      if (matchesSelector(targetSelector, edge.to)) return true;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return false;
}

function requiredPathFindings(
  expected: ArchitectureDocument,
  observedGraph: ArchitectureGraph,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const [ruleIndex, rule] of (expected.rules ?? []).entries()) {
    if (rule.type !== "require-path") continue;
    const sources = matchingComponents(observedGraph, rule.from);
    for (const source of sources) {
      if (hasRequiredPath(observedGraph, source, rule.to, rule.relationship_type)) continue;
      findings.push({
        id: rule.id,
        kind: "required-path",
        severity: rule.severity,
        message: `Required path from '${source}' to '${rule.to}' is missing for rule '${rule.id}'`,
        from: source,
        to: rule.to,
        ...(rule.relationship_type ? { relationship_type: rule.relationship_type } : {}),
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
    ...allowFindings(expected, observed),
    ...requiredFindings(expected, observed, observedGraph),
    ...requiredPathFindings(expected, observedGraph),
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
  const violations = result.findings.filter(
    (finding) => finding.kind !== "architecture-evolution",
  );
  const changes = result.findings.filter(
    (finding) => finding.kind === "architecture-evolution",
  );
  const decision = result.classification === "no-impact"
    ? "PASS"
    : result.classification === "violation"
      ? "BLOCK"
      : "REVIEW";
  const exitCode = result.classification === "no-impact"
    ? 0
    : result.classification === "violation"
      ? 1
      : 3;
  const reason = result.classification === "no-impact"
    ? "No rule violations or architecture topology changes were detected."
    : result.classification === "violation"
      ? `${violations.length} architecture rule${violations.length === 1 ? " is" : "s are"} violated. Fix the violations before merging.`
      : `${changes.length} architecture ${changes.length === 1 ? "change requires" : "changes require"} human approval.`;
  const nextStep = result.classification === "no-impact"
    ? "No action required."
    : result.classification === "violation"
      ? "Fix the rule violations, then run this check again."
      : "Review the changes and update the expected architecture only after approval.";
  const lines = [
    `DECISION: ${decision}`,
    `REASON: ${reason}`,
  ];

  if (violations.length > 0) {
    lines.push("", `RULE VIOLATIONS (${violations.length})`);
    violations.forEach((finding, index) => {
      lines.push(
        `${index + 1}. [${finding.id}] ${violationTitle(finding)}`,
        `   Severity: ${finding.severity.toUpperCase()}`,
      );
      const relationship = formatFindingRelationship(finding);
      if (relationship) lines.push(`   Relationship: ${relationship}`);
      lines.push(
        `   Evidence: ${formatConformanceEvidence(finding.evidence)}`,
        `   Fix: ${violationFix(finding)}`,
      );
    });
  }

  if (changes.length > 0) {
    lines.push("", `ARCHITECTURE CHANGES (${changes.length})`);
    changes.forEach((finding, index) => {
      lines.push(
        `${index + 1}. ${formatArchitectureChange(finding)}`,
        `   Evidence: ${formatConformanceEvidence(finding.evidence)}`,
      );
    });
  }

  lines.push(
    "",
    "SUMMARY",
    `Components: +${result.summary.added_nodes} added, -${result.summary.removed_nodes} removed, ${result.summary.changed_nodes} changed`,
    `Relationships: +${result.summary.added_edges} added, -${result.summary.removed_edges} removed`,
    "",
    `NEXT STEP: ${nextStep}`,
    `EXIT CODE: ${exitCode} (${decision})`,
  );
  return lines.join("\n");
}

function formatFindingRelationship(
  finding: ConformanceFinding,
): string | undefined {
  if (!finding.from || !finding.to) return undefined;
  const type = finding.relationship_type ?? "any";
  const readable = `${finding.from} --${type}--> ${finding.to}`;
  return finding.edge_key ? `${readable} (${finding.edge_key})` : readable;
}

function formatConformanceEvidence(evidence: ConformanceEvidence): string {
  const document = `${evidence.document} architecture`;
  const relationship = evidence.path.match(/^\/relationships\/(\d+)$/);
  if (relationship) {
    return `${document}, relationship #${Number(relationship[1]) + 1} (${evidence.path})`;
  }
  const rule = evidence.path.match(/^\/rules\/(\d+)$/);
  if (rule) {
    return `${document}, rule #${Number(rule[1]) + 1} (${evidence.path})`;
  }
  const component = evidence.path.match(/^\/components\/(.+)$/);
  if (component) {
    return `${document}, component '${component[1]}' (${evidence.path})`;
  }
  return `${document} (${evidence.path})`;
}

function violationTitle(finding: ConformanceFinding): string {
  if (finding.kind === "deny-rule") return "Forbidden dependency detected";
  if (finding.kind === "allow-rule") return "Dependency is outside the approved allow-list";
  if (finding.kind === "required-edge") return "Required dependency is missing";
  if (finding.kind === "required-path") return "Required architecture path is missing";
  return finding.message;
}

function violationFix(finding: ConformanceFinding): string {
  if (finding.kind === "deny-rule") {
    return "Remove or reroute this dependency. Change the deny rule only after architecture approval.";
  }
  if (finding.kind === "allow-rule") {
    return "Route the dependency to an allowed target, or update the allow-list after approval.";
  }
  if (finding.kind === "required-edge") {
    return "Restore the required dependency, or update the requirement after architecture approval.";
  }
  if (finding.kind === "required-path") {
    return "Restore an approved path to the target, or update the path requirement after approval.";
  }
  return "Review the architecture rule and the observed topology.";
}

function formatArchitectureChange(finding: ConformanceFinding): string {
  const change = (finding.change ?? "changed").toUpperCase();
  if (finding.component) return `${change} component: ${finding.component}`;
  const relationship = formatFindingRelationship(finding);
  if (relationship) return `${change} relationship: ${relationship}`;
  return finding.message;
}
