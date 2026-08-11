import { describe, expect, it } from "vitest";

import { buildGraph, diffGraphs } from "./graph.js";
import type { ArchitectureDocument } from "./model.js";

const baseline: ArchitectureDocument = {
  version: "0.1",
  metadata: { name: "baseline" },
  components: {
    api: { type: "service", layer: "application" },
    database: { type: "database", layer: "data" },
  },
  relationships: [
    { from: "api", to: "database", type: "data" },
  ],
};

describe("architecture graph", () => {
  it("builds incoming and outgoing indexes", () => {
    const graph = buildGraph(baseline);

    expect(graph.nodes.size).toBe(2);
    expect(graph.outgoing.get("api")).toHaveLength(1);
    expect(graph.incoming.get("database")).toHaveLength(1);
  });

  it("returns a deterministic graph diff", () => {
    const observed: ArchitectureDocument = {
      ...baseline,
      components: {
        ...baseline.components,
        redis: { type: "cache", layer: "data" },
      },
      relationships: [
        ...baseline.relationships,
        { from: "api", to: "redis", type: "data" },
      ],
    };

    const diff = diffGraphs(buildGraph(baseline), buildGraph(observed));

    expect(diff.addedNodes.map((node) => node.id)).toEqual(["redis"]);
    expect(diff.addedEdges.map((edge) => edge.key)).toEqual([
      "api|data|redis",
    ]);
    expect(diff.removedNodes).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
  });
});

