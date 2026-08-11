function componentFingerprint(component) {
    return JSON.stringify({
        name: component.name ?? null,
        type: component.type,
        layer: component.layer,
        description: component.description ?? null,
        technology: component.technology ?? null,
        owner: component.owner ?? null,
        tags: [...(component.tags ?? [])].sort(),
    });
}
export function edgeKey(relationship) {
    return `${relationship.from}|${relationship.type}|${relationship.to}`;
}
export function buildGraph(document) {
    const nodes = new Map(Object.entries(document.components).map(([id, component]) => [
        id,
        { id, component },
    ]));
    const edges = document.relationships.map((relationship) => ({
        ...relationship,
        key: edgeKey(relationship),
    }));
    const outgoing = new Map();
    const incoming = new Map();
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
export function diffGraphs(expected, observed) {
    const expectedEdges = new Map(expected.edges.map((edge) => [edge.key, edge]));
    const observedEdges = new Map(observed.edges.map((edge) => [edge.key, edge]));
    return {
        addedNodes: [...observed.nodes.values()].filter((node) => !expected.nodes.has(node.id)),
        removedNodes: [...expected.nodes.values()].filter((node) => !observed.nodes.has(node.id)),
        changedNodes: [...observed.nodes.values()]
            .filter((node) => {
            const expectedNode = expected.nodes.get(node.id);
            return expectedNode !== undefined &&
                componentFingerprint(expectedNode.component) !== componentFingerprint(node.component);
        })
            .map((observedNode) => ({
            id: observedNode.id,
            expected: expected.nodes.get(observedNode.id),
            observed: observedNode,
        })),
        addedEdges: [...observedEdges.values()].filter((edge) => !expectedEdges.has(edge.key)),
        removedEdges: [...expectedEdges.values()].filter((edge) => !observedEdges.has(edge.key)),
    };
}
//# sourceMappingURL=graph.js.map