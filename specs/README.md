# ArchSync Architecture Model v0.1

`architecture.schema.json` is the machine-readable architecture contract for Phase 1. `benchmark-ground-truth.schema.json` validates the runtime shape of benchmark metadata, cases, graph deltas, expected findings and source-evidence records before semantic and engine-backed checks run. `quality-goal.schema.json` is the opt-in proposed v0.2 goal contract for the Phase 6 runtime-awareness foundation.

## Model sections

- `metadata`: model identity and ownership.
- `components`: stable component identifiers and properties.
- `relationships`: intended directed edges.
- `rules`: deterministic `deny`, `allow`, direct `require` or multi-hop `require-path` constraints.
- `quality_goals`: legacy targets or explicitly versioned v0.2 latency, availability, security, cost and complexity targets. See [`docs/quality-goals-v0.2.md`](../docs/quality-goals-v0.2.md); the proposed schema does not imply stakeholder approval.

Schema validation is followed by semantic validation. Semantic checks currently cover unknown references, duplicate ids/edges and self relationships.

## Identifier rules

- Component ids use lowercase kebab-case, for example `order-service`.
- Rule and quality goal ids use uppercase ids, for example `ARCH-001`.
- A selector may use `*`; the conformance engine evaluates wildcard selectors deterministically.

## Rule semantics

- `deny`: every matching observed relationship is a violation.
- `allow`: for matching sources (and optional relationship type), every target outside `to` is a violation.
- `require`: every matching source must have a direct relationship to a target matching `to`.
- `require-path`: every matching source must have a non-empty directed path to a target matching `to`; when `relationship_type` is set, every edge on the path must use that type.

## Commands

```bash
pnpm arch:model validate test/fixtures/order-platform.architecture.yaml
pnpm arch:model graph test/fixtures/order-platform.architecture.yaml
pnpm arch:model diff test/fixtures/minimal.architecture.yaml test/fixtures/minimal-evolution.architecture.yaml
pnpm arch:model check test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml
pnpm arch:model report test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml output.drawio
pnpm arch:model mermaid test/fixtures/order-platform.architecture.yaml output.mmd
pnpm arch:model drawio test/fixtures/order-platform.architecture.yaml output.drawio
```
