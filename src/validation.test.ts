import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  formatSchemaIssue,
  formatValidationIssues,
  parseArchitecture,
  validateQualityGoal,
} from "./validation.js";

const examplesDirectory = new URL("../test/fixtures/", import.meta.url);

async function readExample(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, examplesDirectory)), "utf8");
}

describe("architecture validation", () => {
  it("accepts the minimal model", async () => {
    const result = await parseArchitecture(
      await readExample("minimal.architecture.yaml"),
    );

    expect(result.valid).toBe(true);
    expect(Object.keys(result.value?.components ?? {})).toHaveLength(2);
  });

  it("accepts rules and quality goals", async () => {
    const result = await parseArchitecture(
      await readExample("order-platform.architecture.yaml"),
    );

    expect(result.valid).toBe(true);
    expect(result.value?.rules).toHaveLength(4);
    expect(result.value?.quality_goals).toHaveLength(3);
  });

  it("accepts every typed quality-goal v0.2 family without breaking legacy goals", async () => {
    const goals = [
      ["LAT-001", "latency", "p95_latency", "<=", 200, "ms"],
      ["AVL-001", "availability", "availability_ratio", ">=", 0.995, "ratio"],
      ["SEC-001", "security", "security_violation_count", "<=", 0, "count"],
      ["COST-001", "cost", "estimated_cost", "<=", 500, "usd"],
      ["CPLX-001", "complexity", "component_count", "<=", 12, "count"],
    ].map(([id, attribute, metric, operator, target, unit]) => ({
      contract_version: "0.2",
      id,
      attribute,
      scope: "service",
      metric,
      operator,
      target,
      unit,
      window: { value: 15, unit: "minute" },
      priority: "high",
    }));

    for (const goal of goals) {
      const result = await validateQualityGoal(goal);
      expect(result).toEqual({ valid: true, value: goal, issues: [] });
    }

    const architecture = await parseArchitecture(`
version: "0.1"
metadata:
  name: typed-goals
components:
  service:
    type: service
    layer: application
relationships: []
quality_goals:
  - contract_version: "0.2"
    id: LAT-001
    attribute: latency
    scope: service
    metric: p95_latency
    operator: "<="
    target: 200
    unit: ms
    window: { value: 15, unit: minute }
    priority: high
`);
    expect(architecture.valid).toBe(true);
    expect(architecture.value?.quality_goals?.[0]).toEqual(goals[0]);
  });

  it("rejects invalid v0.2 units, targets, windows and unknown properties", async () => {
    const invalidGoals = [
      {
        contract_version: "0.2",
        id: "LAT-001",
        attribute: "latency",
        scope: "service",
        metric: "p95_latency",
        operator: "<=",
        target: 200,
        unit: "usd",
        window: { value: 15, unit: "minute" },
        priority: "high",
      },
      {
        contract_version: "0.2",
        id: "AVL-001",
        attribute: "availability",
        scope: "service",
        metric: "availability_ratio",
        operator: ">=",
        target: 1.01,
        unit: "ratio",
        window: { value: 15, unit: "minute" },
        priority: "high",
      },
      {
        contract_version: "0.2",
        id: "SEC-001",
        attribute: "security",
        scope: "service",
        metric: "security_violation_count",
        operator: "<=",
        target: 0.5,
        unit: "count",
        window: { value: 0, unit: "minute" },
        priority: "high",
        approved: true,
      },
    ];

    for (const goal of invalidGoals) {
      const result = await validateQualityGoal(goal);
      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.issues.every((issue) => issue.keyword === "schema")).toBe(true);
    }
  });

  it("accepts allow and required-path rule types", async () => {
    const result = await parseArchitecture(`
version: "0.1"
metadata:
  name: rule-types
components:
  app:
    type: service
    layer: application
  database:
    type: database
    layer: data
relationships: []
rules:
  - id: ALLOW-001
    type: allow
    from: app
    to: database
    severity: error
  - id: PATH-001
    type: require-path
    from: app
    to: database
    relationship_type: data
    severity: critical
`);

    expect(result.valid).toBe(true);
    expect(result.value?.rules?.map((rule) => rule.type)).toEqual(["allow", "require-path"]);
  });

  it("rejects an unknown relationship reference", async () => {
    const result = await parseArchitecture(
      await readExample("invalid-unknown-component.architecture.yaml"),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "/relationships/0/to",
        keyword: "reference",
      }),
    );
    const formatted = formatValidationIssues(result.issues);
    expect(formatted).toContain("PROBLEMS (1)");
    expect(formatted).toContain("1. Unknown component 'missing-database'");
    expect(formatted).toContain(
      "Location: relationships[0].to (/relationships/0/to)",
    );
    expect(formatted).toContain(
      "Fix: Add 'missing-database' under components",
    );
  });

  it("rejects a document that violates the JSON schema", async () => {
    const result = await parseArchitecture(
      await readExample("invalid-schema.architecture.yaml"),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.keyword === "schema")).toBe(true);
    expect(formatValidationIssues(result.issues)).toMatch(
      /Location: (components|relationships)/,
    );
  });

  it("rejects duplicate topology edges", async () => {
    const result = await parseArchitecture(`
version: "0.1"
metadata:
  name: duplicate-edge
components:
  a:
    type: service
    layer: application
  b:
    type: database
    layer: data
relationships:
  - from: a
    to: b
    type: data
  - from: a
    to: b
    type: data
`);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ keyword: "duplicate" }),
    );
  });

  it("rejects malformed YAML and duplicate mapping keys", async () => {
    const malformed = await parseArchitecture("components: [unterminated");
    const duplicate = await parseArchitecture(`
version: "0.1"
version: "0.1.1"
metadata:
  name: duplicate-key
components: {}
relationships: []
`);

    expect(malformed.valid).toBe(false);
    expect(malformed.issues[0]?.path).toBe("/");
    expect(duplicate.valid).toBe(false);
    expect(formatValidationIssues(duplicate.issues)).toMatch(/Map keys must be unique/);
    expect(formatValidationIssues(duplicate.issues)).toContain(
      "Fix: Remove or rename the duplicate YAML key.",
    );
  });

  it("rejects unresolved YAML tags instead of silently discarding the warning", async () => {
    const result = await parseArchitecture(`
version: "0.1"
metadata:
  name: !custom tagged-model
components:
  service:
    type: service
    layer: application
relationships: []
`);

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: "/",
      keyword: "schema",
      message: expect.stringContaining("Unresolved tag: !custom"),
    }));
  });

  it("rejects quality-goal targets that are incompatible with their operators", async () => {
    const result = await parseArchitecture(`
version: "0.1"
metadata:
  name: invalid-quality-goals
components:
  service:
    type: service
    layer: application
relationships: []
quality_goals:
  - id: PERF-001
    attribute: performance
    metric: latency
    operator: "<="
    target: fast
    priority: high
  - id: SEC-001
    attribute: security
    metric: protocols
    operator: contains
    target: 3
    priority: high
  - id: SEC-002
    attribute: security
    metric: protocols
    operator: contains
    target: tls
    priority: medium
`);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "/quality_goals/0/target",
        keyword: "semantic",
        message: "Operator '<=' requires a numeric target",
      }),
      expect.objectContaining({
        path: "/quality_goals/1/target",
        keyword: "semantic",
        message: "Operator 'contains' requires a string target",
      }),
    ]));
  });

  it("formats actionable fixes for common schema failures", () => {
    const formatted = formatValidationIssues([
      { path: "/", message: "must have required property 'metadata'", keyword: "schema" },
      { path: "/metadata/extra", message: "must NOT have additional properties", keyword: "schema" },
      { path: "/metadata/name", message: "custom semantic failure", keyword: "semantic" },
    ]);

    expect(formatted).toContain("Location: document root (/)");
    expect(formatted).toContain("Fix: Add the required field at this location.");
    expect(formatted).toContain("Fix: Remove the unsupported field");
    expect(formatted).toContain("Fix: Update this value so it satisfies");
  });

  it("provides a deterministic fallback when a schema engine omits its message", () => {
    const issue = formatSchemaIssue({
      instancePath: "/metadata/name",
      schemaPath: "#/properties/metadata/properties/name/type",
      keyword: "type",
      params: { type: "string" },
    });

    expect(issue).toEqual({
      path: "/metadata/name",
      message: "Schema validation failed",
      keyword: "schema",
    });
  });

  it("formats exact escaped JSON Pointer paths for schema property errors", () => {
    const root = formatSchemaIssue({
      instancePath: "",
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    });
    const required = formatSchemaIssue({
      instancePath: "",
      schemaPath: "#/required",
      keyword: "required",
      params: { missingProperty: "metadata" },
      message: "must have required property 'metadata'",
    });
    const additional = formatSchemaIssue({
      instancePath: "/metadata",
      schemaPath: "#/properties/metadata/additionalProperties",
      keyword: "additionalProperties",
      params: { additionalProperty: "extra/field~name" },
      message: "must NOT have additional properties",
    });
    const innerPropertyName = formatSchemaIssue({
      instancePath: "/components",
      schemaPath: "#/$defs/componentId/pattern",
      keyword: "pattern",
      params: { pattern: "component-id" },
      propertyName: "Bad_Component_ID",
      message: "must match pattern",
    });
    const outerPropertyName = formatSchemaIssue({
      instancePath: "/components",
      schemaPath: "#/properties/components/propertyNames",
      keyword: "propertyNames",
      params: { propertyName: "Another_Bad_ID" },
      message: "property name must be valid",
    });

    expect(root.path).toBe("/");
    expect(required.path).toBe("/metadata");
    expect(additional.path).toBe("/metadata/extra~1field~0name");
    expect(innerPropertyName.path).toBe("/components/Bad_Component_ID");
    expect(outerPropertyName.path).toBe("/components/Another_Bad_ID");
  });
});
