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
  type: "deny" | "require";
  from: string;
  to: string;
  relationship_type?: RelationshipType;
  severity: Severity;
  rationale?: string;
}

export interface QualityGoal {
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

export interface ArchitectureDocument {
  version: string;
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
  nodes: ReadonlyMap<string, GraphNode>;
  edges: readonly GraphEdge[];
  outgoing: ReadonlyMap<string, readonly GraphEdge[]>;
  incoming: ReadonlyMap<string, readonly GraphEdge[]>;
}

export interface GraphDiff {
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
  keyword: "schema" | "reference" | "duplicate" | "semantic";
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ValidationIssue[];
}
