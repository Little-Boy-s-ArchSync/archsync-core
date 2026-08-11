import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseArchitecture } from "./validation.js";

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
  });

  it("rejects a document that violates the JSON schema", async () => {
    const result = await parseArchitecture(
      await readExample("invalid-schema.architecture.yaml"),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.keyword === "schema")).toBe(true);
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
});
