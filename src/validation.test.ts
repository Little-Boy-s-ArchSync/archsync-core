import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  formatSchemaIssue,
  formatValidationIssues,
  parseArchitecture,
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
});
