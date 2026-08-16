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

  it("normalizes node and edge order independently of declaration order", () => {
    const unordered: ArchitectureDocument = {
      ...baseline,
      components: {
        worker: { type: "worker", layer: "application" },
        database: baseline.components.database!,
        api: baseline.components.api!,
      },
      relationships: [
        { from: "worker", to: "database", type: "data" },
        { from: "api", to: "database", type: "data" },
      ],
    };

    const graph = buildGraph(unordered);

    expect([...graph.nodes.keys()]).toEqual(["api", "database", "worker"]);
    expect(graph.edges.map((edge) => edge.key)).toEqual([
      "api|data|database",
      "worker|data|database",
    ]);
    expect(graph.incoming.get("database")?.map((edge) => edge.key)).toEqual([
      "api|data|database",
      "worker|data|database",
    ]);
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
    expect(diff.changedNodes).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
  });

  it("detects semantic component metadata changes without treating tag order as drift", () => {
    const reorderedTags: ArchitectureDocument = {
      ...baseline,
      components: {
        ...baseline.components,
        api: { ...baseline.components.api!, tags: ["two", "one"] },
      },
    };
    const taggedBaseline: ArchitectureDocument = {
      ...baseline,
      components: {
        ...baseline.components,
        api: { ...baseline.components.api!, tags: ["one", "two"] },
      },
    };
    expect(diffGraphs(buildGraph(taggedBaseline), buildGraph(reorderedTags)).changedNodes).toEqual([]);

    reorderedTags.components.api!.technology = "Bun";
    expect(
      diffGraphs(buildGraph(taggedBaseline), buildGraph(reorderedTags)).changedNodes.map(({ id }) => id),
    ).toEqual(["api"]);
  });
});
