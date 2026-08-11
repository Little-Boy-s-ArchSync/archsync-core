# ArchSync Core

`@archsync/core` provides the machine-readable architecture contract, validation, graph/conformance primitives and deterministic Mermaid/draw.io reporting for ArchSync.

This repository contains the deterministic foundation completed in **Phase 1: Architecture Model and Benchmark Lab**. It deliberately excludes Guardian orchestration, LLM, MCP, IaC and runtime features.

## Phase 1 deliverables

- Architecture-as-code schema v0.1.
- YAML schema and semantic validation.
- Graph builder and graph diff.
- Deterministic deny/require conformance checks with no-impact, violation and evolution classification.
- Deterministic Mermaid generation.
- Editable draw.io diagram generation.
- Annotated Mermaid/draw.io reports that highlight violations, missing edges and architecture evolution.
- Benchmark manifest validation primitives.
- Reproducible Phase 1 evidence and enforced coverage thresholds.

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

# Compare an expected and observed graph
pnpm arch:model diff test/fixtures/minimal.architecture.yaml test/fixtures/minimal-evolution.architecture.yaml

# Check a schema-valid observed model against expected rules
pnpm arch:model check test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml

# Generate an editable report with violations highlighted
pnpm arch:model report test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml output.drawio

# Generate a Mermaid diagram
pnpm arch:model mermaid test/fixtures/order-platform.architecture.yaml output.mmd

# Generate an editable draw.io diagram
pnpm arch:model drawio test/fixtures/order-platform.architecture.yaml output.drawio

# Validate all Phase 1 artifacts
pnpm phase1:verify
```

`phase1:verify` enforces coverage thresholds, validates fixtures, builds the tracked distribution, smoke-tests the built CLI and verifies [`evidence/phase-1-evidence.json`](evidence/phase-1-evidence.json). CI runs the same gate on Ubuntu and Windows and uploads coverage/evidence artifacts.

See the [architecture conformance demo](docs/demo/README.md) for violation and evolution screenshots. `check` returns exit code `0` for no-impact, `1` for violation and `3` for evolution requiring approval. These commands compare declared models; source-code analysis remains Phase 2.

## Repository map

```text
src/            model, validation, graph, benchmark and diagram tooling
specs/          JSON Schema v0.1
test/fixtures/  valid and invalid model fixtures
docs/adr/       architecture decision records
evidence/       deterministic Phase 1 evidence manifest
scripts/        CLI smoke and evidence verification
```

The user-facing models live in `archsync-examples`; benchmark data lives in `archsync-benchmark`. See [Phase 1](docs/phase-1.md) and [ADR-0001](docs/adr/0001-architecture-model-is-source-of-truth.md).
