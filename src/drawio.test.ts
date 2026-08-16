import { describe, expect, it } from "vitest";

import { generateDrawio } from "./drawio.js";
import type { ArchitectureDocument } from "./model.js";

describe("draw.io generation", () => {
  it("creates deterministic editable XML with nodes and edges", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "demo & test" },
      components: {
        frontend: { name: "Store <UI>", type: "frontend", layer: "experience" },
        "order-service": { name: "Order Service", type: "service", layer: "domain" },
      },
      relationships: [{ from: "frontend", to: "order-service", type: "http" }],
    };

    const result = generateDrawio(document);

    expect(result.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(result).toContain('<mxfile host="app.diagrams.net"');
    expect(result).toContain('id="node-frontend"');
    expect(result).toContain('id="node-order-service"');
    expect(result).toContain('source="node-frontend" target="node-order-service"');
    expect(result).toContain("demo &amp; test");
    expect(result).toContain("Store &amp;lt;UI&amp;gt;");
    expect(result).toBe(generateDrawio(document));
  });

  it("renders every node and edge state and routes annotated edges around a blocked source column", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "routing & states" },
      components: {
        source: { type: "frontend", layer: "experience" },
        "z-blocker": { name: "Blocker", type: "frontend", layer: "experience" },
        middle: { name: "Middle", type: "service", layer: "domain" },
        target: { name: "Target", type: "database", layer: "data" },
        "z-data-blocker": { name: "Data Blocker", type: "database", layer: "data" },
        skipped: { name: "Skipped", type: "other", layer: "invalid" as "data" },
      },
      relationships: [
        { from: "source", to: "target", type: "http" },
        { from: "target", to: "source", type: "data" },
        { from: "middle", to: "target", type: "dependency" },
      ],
    };

    const result = generateDrawio(document, {
      title: "Conformance <report>",
      nodeStates: { source: "removed", target: "violation" },
      edgeStates: {
        "source|http|target": "evolution",
        "target|data|source": "violation",
        "middle|dependency|target": "removed",
      },
      edgeLabels: { "source|http|target": "NEW <HTTP>" },
    });

    expect(result).toContain("frontend · experience · REMOVED");
    expect(result).toContain("strokeWidth=3");
    expect(result).toContain("strokeWidth=4");
    expect(result).toContain("dashed=1;dashPattern=6 4;opacity=70");
    expect(result).toContain("NEW &lt;HTTP&gt;");
    expect(result).toContain('<mxPoint x="250" y="146"/>');
    expect(result).toContain('<mxPoint x="500" y="146"/>');
    expect(result).not.toContain('id="node-skipped"');
  });

  it("routes an annotated edge directly when the source column is clear", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "clear-route" },
      components: {
        source: { type: "frontend", layer: "experience" },
        middle: { type: "service", layer: "domain" },
        target: { type: "database", layer: "data" },
      },
      relationships: [{ from: "source", to: "target", type: "http" }],
    };

    const result = generateDrawio(document, {
      edgeStates: { "source|http|target": "evolution" },
    });

    expect(result).toContain('<mxPoint x="145" y="260"/>');
  });

  it("orders edges by their unambiguous graph key", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "ambiguous-sort-keys" },
      components: {
        a: { type: "service", layer: "application" },
        "a-b": { type: "service", layer: "application" },
        "b-c": { type: "database", layer: "data" },
        c: { type: "database", layer: "data" },
      },
      relationships: [
        { from: "a-b", to: "c", type: "http" },
        { from: "a", to: "b-c", type: "http" },
      ],
    };
    const reordered = structuredClone(document);
    reordered.relationships.reverse();

    expect(generateDrawio(document)).toBe(generateDrawio(reordered));
  });

  it("replaces characters that are forbidden by XML 1.0", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "control\u0000character" },
      components: {
        service: {
          name: "service\u0001name",
          type: "service",
          layer: "application",
        },
      },
      relationships: [],
    };

    const result = generateDrawio(document, { title: "title\u000bvalue" });

    expect(result).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
    expect(result).toContain("control character");
    expect(result).toContain("service name");
    expect(result).toContain("title value");
  });
});
