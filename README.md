# ArchSync Core

`@archsync/core` provides the machine-readable architecture contract, validation, graph/conformance primitives and deterministic Mermaid/draw.io reporting for ArchSync.

This repository contains the deterministic foundation completed in **Phase 1: Architecture Model and Benchmark Lab**. It deliberately excludes Guardian orchestration, LLM, MCP, IaC and runtime features.

## Phase 1 deliverables

- Architecture-as-code schema v0.1.
- YAML schema and semantic validation.
- Graph builder and graph diff.
- Deterministic `deny`, `allow`, direct `require` and multi-hop `require-path` conformance checks with no-impact, violation and evolution classification.
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
pnpm build
pnpm phase1:verify
```

## Useful commands

```bash
# Validate one model
node dist/bin.js validate test/fixtures/order-platform.architecture.yaml

# Print the normalized graph
node dist/bin.js graph test/fixtures/order-platform.architecture.yaml

# Compare an expected and observed graph
node dist/bin.js diff test/fixtures/minimal.architecture.yaml test/fixtures/minimal-evolution.architecture.yaml

# Check a schema-valid observed model against expected rules
node dist/bin.js check test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml

# Generate an editable report with violations highlighted
node dist/bin.js report test/fixtures/order-platform.architecture.yaml test/fixtures/order-platform.violation.architecture.yaml output.drawio

# Generate a Mermaid diagram
node dist/bin.js mermaid test/fixtures/order-platform.architecture.yaml output.mmd

# Generate an editable draw.io diagram
node dist/bin.js drawio test/fixtures/order-platform.architecture.yaml output.drawio

# Validate all Phase 1 artifacts
pnpm phase1:verify
```

`phase1:verify` enforces 100% statement, branch, function and line coverage across every deterministic engine module, validates fixtures, builds the tracked distribution, runs all 15 built-CLI contract checks and verifies [`evidence/phase-1-evidence.json`](evidence/phase-1-evidence.json). Entry-point wiring and type-only declarations are checked by typecheck/build and the built-binary smoke suite rather than being hidden inside the engine percentage. CI runs the same gate on Ubuntu, Windows and macOS and uploads coverage/evidence artifacts.

See the [architecture conformance demo](docs/demo/README.md) for violation and evolution screenshots. `check` returns exit code `0` for no-impact, `1` for violation and `3` for evolution requiring approval. These Core commands compare declared models; Guardian adds source-code reconstruction in Phase 2 and Git-diff/PR gating in Phase 3.

For the complete Vietnamese presentation script covering the Architecture Model, Guardian source analysis and Phase 3 pull-request gate, see [`README-DEMO.md`](README-DEMO.md).

## Repository map

```text
src/            model, validation, graph, benchmark and diagram tooling
specs/          JSON Schema v0.1
test/fixtures/  valid and invalid model fixtures
docs/adr/       architecture decision records
evidence/       deterministic Phase 1 evidence manifest
scripts/        CLI smoke and evidence verification
```

The user-facing models live in `archsync-examples`; the independently verified 20-case end-to-end dataset and 40-signal detector corpus live in `archsync-benchmark`. See [Phase 1](docs/phase-1.md), [ADR-0001](docs/adr/0001-architecture-model-is-source-of-truth.md) and [ADR-0002](docs/adr/0002-expanded-evaluation-foundation.md).
