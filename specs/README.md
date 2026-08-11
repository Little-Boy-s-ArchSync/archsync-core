# ArchSync Architecture Model v0.1

`architecture.schema.json` is the machine-readable contract for Phase 1.

## Model sections

- `metadata`: model identity and ownership.
- `components`: stable component identifiers and properties.
- `relationships`: intended directed edges.
- `rules`: deterministic `deny` or `require` constraints.
- `quality_goals`: measurable targets used later by the Evolution Engine.

Schema validation is followed by semantic validation. Semantic checks currently cover unknown references, duplicate ids/edges and self relationships.

## Identifier rules

- Component ids use lowercase kebab-case, for example `order-service`.
- Rule and quality goal ids use uppercase ids, for example `ARCH-001`.
- A selector may use `*` for future rule matching, but Phase 1 does not evaluate wildcard rules yet.

## Commands

```bash
pnpm arch:model validate test/fixtures/order-platform.architecture.yaml
pnpm arch:model graph test/fixtures/order-platform.architecture.yaml
pnpm arch:model mermaid test/fixtures/order-platform.architecture.yaml output.mmd
```
