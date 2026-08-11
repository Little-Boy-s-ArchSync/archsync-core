import type {
  ArchitectureDocument,
  ArchitectureGraph,
  ArchitectureRelationship,
  GraphDiff,
  GraphEdge,
  GraphNode,
} from "./model.js";

export function edgeKey(relationship: ArchitectureRelationship): string {
  return `${relationship.from}|${relationship.type}|${relationship.to}`;
}

export function buildGraph(document: ArchitectureDocument): ArchitectureGraph {
  const nodes = new Map<string, GraphNode>(
    Object.entries(document.components).map(([id, component]) => [
      id,
      { id, component },
    ]),
  );

  const edges: GraphEdge[] = document.relationships.map((relationship) => ({
    ...relationship,
    key: edgeKey(relationship),
  }));

  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();

  for (const id of nodes.keys()) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge);
    incoming.get(edge.to)?.push(edge);
  }

  return { nodes, edges, outgoing, incoming };
}

export function diffGraphs(
  expected: ArchitectureGraph,
  observed: ArchitectureGraph,
): GraphDiff {
  const expectedEdges = new Map(expected.edges.map((edge) => [edge.key, edge]));
  const observedEdges = new Map(observed.edges.map((edge) => [edge.key, edge]));

  return {
    addedNodes: [...observed.nodes.values()].filter(
      (node) => !expected.nodes.has(node.id),
    ),
    removedNodes: [...expected.nodes.values()].filter(
      (node) => !observed.nodes.has(node.id),
    ),
    addedEdges: [...observedEdges.values()].filter(
      (edge) => !expectedEdges.has(edge.key),
    ),
    removedEdges: [...expectedEdges.values()].filter(
      (edge) => !observedEdges.has(edge.key),
    ),
  };
}

