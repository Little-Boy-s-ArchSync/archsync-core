# ArchLoop Core

`@archloop/core` provides the machine-readable architecture contract, validation, graph primitives and deterministic Mermaid generation for ArchLoop.

This repository contains the deterministic foundation completed in **Phase 1: Architecture Model and Benchmark Lab**. It deliberately excludes Guardian orchestration, LLM, MCP, IaC and runtime features.

## Phase 1 deliverables

- Architecture-as-code schema v0.1.
- YAML schema and semantic validation.
- Graph builder and graph diff.
- Deterministic Mermaid generation.
- Benchmark manifest validation primitives.

## Requirements

- Node.js 22+
- pnpm 11+

## Setup

```bash
pnpm install --frozen-lockfile
pnpm phase1:verify
```

## Useful commands

```bash
# Validate one model
pnpm arch:model validate test/fixtures/order-platform.architecture.yaml

# Print the normalized graph
pnpm arch:model graph test/fixtures/order-platform.architecture.yaml

# Generate a Mermaid diagram
pnpm arch:model mermaid test/fixtures/order-platform.architecture.yaml output.mmd

# Validate all Phase 1 artifacts
pnpm phase1:verify
```

## Repository map

```text
src/            model, validation, graph, benchmark and Mermaid tooling
specs/          JSON Schema v0.1
test/fixtures/  valid and invalid model fixtures
docs/adr/       architecture decision records
```

The user-facing models live in `archloop-examples`; benchmark data lives in `archloop-benchmark`. See [Phase 1](docs/phase-1.md) and [ADR-0001](docs/adr/0001-architecture-model-is-source-of-truth.md).
