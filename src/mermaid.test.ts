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
        { from: "order-service", to: "frontend", type: "event" },
      ],
    };

    const result = generateMermaid(document);

    expect(result).toContain('order_service["Order Service"]');
    expect(result).toContain("frontend -->|http| order_service");
    expect(result).toContain("order_service -->|event| frontend");
    expect(result).toBe(generateMermaid(document));
  });

  it("uses the component id when no display name is declared", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "fallback-label" },
      components: {
        worker: { type: "worker", layer: "application" },
      },
      relationships: [],
    };

    expect(generateMermaid(document)).toContain('worker["worker"]:::service');
  });

  it("keeps untrusted display names inside a single Mermaid label", () => {
    const document: ArchitectureDocument = {
      version: "0.1",
      metadata: { name: "untrusted-label" },
      components: {
        worker: {
          name: 'Worker "A"\nclick worker "https://example.invalid"',
          type: "worker",
          layer: "application",
        },
      },
      relationships: [],
    };

    const result = generateMermaid(document);

    expect(result).toContain(
      'worker["Worker &quot;A&quot; click worker &quot;https://example.invalid&quot;"]:::service',
    );
    expect(result).not.toMatch(/\n\s*click worker/);
  });
});
