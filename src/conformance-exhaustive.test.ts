import { describe, expect, it } from "vitest";
import { analyzeConformance } from "./conformance.js";
import type { ArchitectureDocument, ArchitectureRelationship, ArchitectureRule } from "./model.js";

// Finite model checking, not a random sample or an estimate of field accuracy.
// Oracle follows specs/README.md using adjacency matrices and transitive closure;
// it deliberately imports no graph, selector, or traversal implementation helpers.
const ids = ["a", "b", "c"];
const types = ["http", "data"] as const;
const slots: ArchitectureRelationship[] = ids.flatMap(from =>
  ids.filter(to => to !== from).flatMap(to => types.map(type => ({ from, to, type }))));
const selectors = [...ids, "*"];
const rules: ArchitectureRule[] = [];
for (const type of ["deny", "allow", "require", "require-path"] as const) {
  for (const from of selectors) for (const to of selectors) {
    for (const relationship_type of [undefined, ...types]) {
      rules.push({ id: `RULE-${rules.length}`, type, from, to, severity: "error",
        ...(relationship_type ? { relationship_type } : {}) });
    }
  }
}

function model(relationships: ArchitectureRelationship[]): ArchitectureDocument {
  return { version: "0.1", metadata: { name: "exhaustive-three-node" },
    components: Object.fromEntries(ids.map(id => [id, { type: "service", layer: "domain" }])),
    relationships };
}

function violations(edges: ArchitectureRelationship[]): number[] {
  const matrices = [undefined, ...types].map(type => {
    const direct = ids.map(from => ids.map(to => edges.some(e =>
      e.from === from && e.to === to && (!type || e.type === type))));
    const reachable = direct.map(row => [...row]);
    // Do not seed the diagonal: require-path requires at least one edge.
    for (let k = 0; k < ids.length; k++) for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        reachable[i]![j] = reachable[i]![j]! || (reachable[i]![k]! && reachable[k]![j]!);
      }
    }
    return { direct, reachable };
  });
  return rules.map(rule => {
    const source = (id: string) => rule.from === "*" || rule.from === id;
    const target = (id: string) => rule.to === "*" || rule.to === id;
    if (rule.type === "deny" || rule.type === "allow") {
      return edges.filter(e => source(e.from) && (!rule.relationship_type || e.type === rule.relationship_type) &&
        (rule.type === "deny" ? target(e.to) : !target(e.to))).length;
    }
    const matrix = matrices[rule.relationship_type === undefined ? 0 : rule.relationship_type === "http" ? 1 : 2]!;
    const relation = rule.type === "require" ? matrix.direct : matrix.reachable;
    return ids.filter((from, i) => source(from) && !ids.some((to, j) => target(to) && relation[i]![j])).length;
  });
}

describe("finite conformance model checking", () => {
  it("matches a matrix oracle for all 4096 typed three-node graphs and 192 rules", () => {
    for (let mask = 0; mask < 2 ** slots.length; mask++) {
      const edges = slots.filter((_, bit) => (mask & (1 << bit)) !== 0);
      const expected = { ...model(edges), rules };
      const actual = analyzeConformance(expected, model(edges));
      const counts = new Map<string, number>();
      for (const finding of actual.findings) counts.set(finding.id, (counts.get(finding.id) ?? 0) + 1);
      const oracle = violations(edges);
      expect(rules.map(r => counts.get(r.id) ?? 0), `graph mask ${mask}`).toEqual(oracle);
      expect(actual.summary.violations).toBe(oracle.reduce((a, b) => a + b, 0));
      expect(actual.classification).toBe(oracle.some(count => count > 0) ? "violation" : "no-impact");
      expect(actual.summary.evolutions).toBe(0);
    }
  }, 60_000);

  it("preserves semantic outcomes under ordering and bijective component renaming", () => {
    const normalize = (result: ReturnType<typeof analyzeConformance>) => ({
      classification: result.classification, summary: result.summary,
      counts: rules.map(rule => result.findings.filter(f => f.id === rule.id).length),
    });
    for (let mask = 0; mask < 2 ** slots.length; mask += 17) {
      const edges = slots.filter((_, bit) => (mask & (1 << bit)) !== 0);
      const expected = { ...model(edges), rules };
      const renamed = (id: string) => id === "*" ? id : `renamed-${id}`;
      const transformed: ArchitectureDocument = {
        ...expected,
        components: Object.fromEntries(Object.entries(expected.components).reverse().map(([id, value]) => [renamed(id), value])),
        relationships: [...edges].reverse().map(e => ({ ...e, from: renamed(e.from), to: renamed(e.to) })),
        rules: [...rules].reverse().map(r => ({ ...r, from: renamed(r.from), to: renamed(r.to) })),
      };
      expect(normalize(analyzeConformance(transformed, transformed)), `graph mask ${mask}`)
        .toEqual(normalize(analyzeConformance(expected, expected)));
    }
  }, 60_000);

  it("classifies every edge addition/removal and verifies inverse graph deltas", () => {
    const empty = model([]);
    for (let mask = 0; mask < 2 ** slots.length; mask++) {
      const edges = slots.filter((_, bit) => (mask & (1 << bit)) !== 0);
      const forward = analyzeConformance(empty, model(edges));
      const reverse = analyzeConformance(model(edges), empty);
      expect(forward.classification).toBe(mask === 0 ? "no-impact" : "evolution");
      expect(reverse.classification).toBe(forward.classification);
      expect(forward.diff.addedEdges.map(e => [e.from, e.type, e.to]).sort())
        .toEqual(edges.map(e => [e.from, e.type, e.to]).sort());
      expect(reverse.diff.removedEdges).toEqual(forward.diff.addedEdges);
      expect(forward.diff.removedEdges).toEqual([]);
      expect(reverse.diff.addedEdges).toEqual([]);
    }
  }, 60_000);
});
