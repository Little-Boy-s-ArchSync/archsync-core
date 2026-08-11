import { describe, expect, it } from "vitest";

import { generateMermaid } from "./mermaid.js";
import type { ArchitectureDocument } from "./model.js";

describe("Mermaid generation", () => {
  it("is deterministic and does not expose hyphens as invalid ids", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "example" },
      components: {
        "order-service": {
          name: "Order Service",
          type: "service",
          layer: "domain",
        },
        frontend: {
          name: "Frontend",
          type: "frontend",
          layer: "experience",
        },
      },
      relationships: [
        { from: "frontend", to: "order-service", type: "http" },
      ],
    };

    const result = generateMermaid(document);

    expect(result).toContain('order_service["Order Service"]');
    expect(result).toContain("frontend -->|http| order_service");
    expect(result).toBe(generateMermaid(document));
  });
});

