import type {
  ArchitectureContractVersion,
  GRAPH_CONTRACT_VERSION,
} from "./versions.js";

export const componentTypes = [
  "frontend",
  "gateway",
  "service",
  "worker",
  "database",
  "cache",
  "queue",
  "external",
  "library",
  "other",
] as const;

export type ComponentType = (typeof componentTypes)[number];

export const layers = [
  "experience",
  "edge",
  "application",
  "domain",
  "data",
  "integration",
  "external",
] as const;

export type Layer = (typeof layers)[number];

export const relationshipTypes = [
  "http",
  "async",
  "data",
  "dependency",
  "event",
  "deployment",
  "other",
] as const;

export type RelationshipType = (typeof relationshipTypes)[number];

export type Severity = "info" | "warning" | "error" | "critical";
export type Priority = "low" | "medium" | "high" | "critical";

export interface ArchitectureMetadata {
  name: string;
  description?: string;
  owners?: string[];
  tags?: string[];
}

export interface ArchitectureComponent {
  name?: string;
  type: ComponentType;
  layer: Layer;
  description?: string;
  technology?: string;
  owner?: string;
  tags?: string[];
}

export interface ArchitectureRelationship {
  id?: string;
  from: string;
  to: string;
  type: RelationshipType;
  description?: string;
  criticality?: Priority;
}

export interface ArchitectureRule {
  id: string;
  type: "deny" | "allow" | "require" | "require-path";
  from: string;
  to: string;
  relationship_type?: RelationshipType;
  severity: Severity;
  rationale?: string;
}

export interface LegacyQualityGoal {
  id: string;
  attribute:
    | "performance"
    | "availability"
    | "security"
    | "cost"
    | "scalability"
    | "reliability"
    | "complexity"
    | "maintainability";
  scope?: string;
  metric: string;
  operator: "<" | "<=" | "=" | ">=" | ">" | "contains" | "not_contains";
  target: number | string | boolean;
  unit?: string;
  priority: Priority;
  description?: string;
}

export type QualityGoalAttributeV02 =
  | "latency"
  | "availability"
  | "security"
  | "cost"
  | "complexity";

export type QualityGoalMetricV02 =
  | "p95_latency"
  | "availability_ratio"
  | "security_violation_count"
  | "estimated_cost"
  | "component_count";

export interface QualityGoalWindowV02 {
  value: number;
  unit: "minute" | "hour" | "day";
}

export interface QualityGoalV02 {
  contract_version: "0.2";
  id: string;
  attribute: QualityGoalAttributeV02;
  scope: string;
  metric: QualityGoalMetricV02;
  operator: "<" | "<=" | ">=" | ">";
  target: number;
  unit: "ms" | "ratio" | "count" | "usd";
  window: QualityGoalWindowV02;
  priority: Priority;
  description?: string;
}

export type QualityGoal = LegacyQualityGoal | QualityGoalV02;

export interface ArchitectureDocument {
  version: ArchitectureContractVersion;
  metadata: ArchitectureMetadata;
  components: Record<string, ArchitectureComponent>;
  relationships: ArchitectureRelationship[];
  rules?: ArchitectureRule[];
  quality_goals?: QualityGoal[];
}

export interface GraphNode {
  id: string;
  component: ArchitectureComponent;
}

export interface GraphEdge extends ArchitectureRelationship {
  key: string;
}

export interface ArchitectureGraph {
  schema_version: typeof GRAPH_CONTRACT_VERSION;
  nodes: ReadonlyMap<string, GraphNode>;
  edges: readonly GraphEdge[];
  outgoing: ReadonlyMap<string, readonly GraphEdge[]>;
  incoming: ReadonlyMap<string, readonly GraphEdge[]>;
}

export interface GraphDiff {
  schema_version: typeof GRAPH_CONTRACT_VERSION;
  addedNodes: GraphNode[];
  removedNodes: GraphNode[];
  changedNodes: GraphNodeChange[];
  addedEdges: GraphEdge[];
  removedEdges: GraphEdge[];
}

export interface GraphNodeChange {
  id: string;
  expected: GraphNode;
  observed: GraphNode;
}

export interface ValidationIssue {
  path: string;
  message: string;
  keyword: "schema" | "version" | "reference" | "duplicate" | "semantic";
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ValidationIssue[];
}
