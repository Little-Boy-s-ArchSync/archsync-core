# ADR-0001: Architecture model is the source of truth

- Status: Accepted
- Date: 2026-08-11
- Phase: 1

## Context

ArchSync needs a representation that can be validated, versioned, compared and consumed by deterministic tooling. A Draw.io file is useful for communication but difficult to query and diff semantically.

## Decision

`architecture.yaml` is the approved source of truth. It contains components, relationships, hard rules and quality goals. Mermaid, Draw.io and future web views are generated from the approved model.

The model does not update merely because implementation differs. A topology change is a proposal until it passes intent, evidence, risk and approval gates.

## Consequences

- Architecture changes are reviewed as code.
- Diagram generation must be deterministic.
- Schema versions require migration notes.
- Runtime observations are evidence, not automatically accepted design.
