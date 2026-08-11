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
});
