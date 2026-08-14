# Phase 1 - Architecture Model and Benchmark Lab

**Status:** Baseline completed on 2026-08-11; evaluation foundation strengthened on 2026-08-14 as ArchSync v0.1.

## Objective

Turn architecture into a machine-readable contract and create ground truth for the first analyzer.

## In scope

- Architecture schema v0.1.
- YAML parser and schema/semantic validation.
- Graph domain model and graph diff.
- Deterministic conformance evaluation for schema-valid observed model fixtures.
- Deterministic Mermaid and editable draw.io generation.
- TypeScript/Node order-platform benchmark with five baseline components.
- Twenty labeled change cases: nine no-impact, seven violations and four valid evolutions.

## Out of scope

- LLM reasoning or repair generation.
- MCP server.
- IaC and runtime analyzers.
- Automatic baseline updates.
- Production-ready CLI or multi-language analyzers.

## Exit gate

1. Valid examples load into the expected graph.
2. Invalid schema and unknown references fail with actionable errors.
3. All 20 benchmark cases have an explicit patch, graph delta and expected classification.
4. Benchmark distribution is exactly 9 no-impact / 7 violation / 4 evolution.
5. Mermaid output can be generated deterministically from any valid model.
6. `pnpm phase1:verify` passes from a clean checkout of `archsync-core`.
7. At least ten topology-review scenarios and the built CLI contract are enforced automatically.
8. Statement, branch, function and line coverage remain exactly 100% for every deterministic engine module; built CLI behavior is additionally protected by 13/13 command-contract checks.
9. A schema-valid observed model can be classified as no-impact, violation or evolution with actionable rule evidence.
10. Violation and evolution reports can be generated as deterministic Mermaid and editable draw.io views.

## Completion evidence

| Requirement | Owner | Authoritative artifact or check |
| --- | --- | --- |
| Schema v0.1 for components, relationships, rules and goals | Core engineer | [`specs/architecture.schema.json`](../specs/architecture.schema.json) |
| Three example `architecture.yaml` models | Core engineer | Core fixtures plus [`archsync-examples/models`](https://github.com/Little-Boy-s-ArchSync/archsync-examples/tree/main/models) |
| Graph domain model, graph diff and semantic validation | Core engineer | [`src/graph.ts`](../src/graph.ts), [`src/validation.ts`](../src/validation.ts) and their tests |
| One-stack, five-component benchmark | Research engineer | [`archsync-benchmark/order-platform`](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/tree/main/order-platform) |
| Twenty owned cases with explicit patches, graph deltas and expected classifications | Research engineer | [`ground-truth.json`](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/blob/main/order-platform/ground-truth.json) |
| Deterministic Mermaid view | Core engineer | [`src/mermaid.ts`](../src/mermaid.ts) and the generated example view |
| Editable draw.io view | Core engineer | [`src/drawio.ts`](../src/drawio.ts), XML generation tests and CLI smoke checks |
| Ten-scenario schema/topology review | Core engineer | [`src/validation.topology.test.ts`](../src/validation.topology.test.ts) |
| Reproducible evidence and coverage gates | Core engineer | [`evidence/phase-1-evidence.json`](../evidence/phase-1-evidence.json), which binds production source, tests, fixtures, verification configuration and dependencies by SHA-256; [`vitest.config.ts`](../vitest.config.ts); and cross-platform CI artifacts |
| Graph Diff demo from synthetic input | Core engineer | `archsync diff` with `minimal.architecture.yaml` and `minimal-evolution.architecture.yaml` |
| Architecture error demo | Core engineer | `archsync check` against `order-platform.violation.architecture.yaml`, proving ARCH-001 and ARCH-004 with model paths |
| Visual conformance evidence | Core engineer | [`docs/demo`](demo/README.md), deterministic Mermaid/draw.io report hashes and PNG previews |

Run the independent checks from each repository:

```bash
# archsync-core
pnpm install --frozen-lockfile
pnpm phase1:verify

# archsync-benchmark
pnpm install --frozen-lockfile
pnpm verify

# archsync-examples
pnpm install --frozen-lockfile
pnpm verify
```

The benchmark verifier requires exactly 20 contiguous cases, checks every owner, acceptance criterion, expected source evidence and graph delta, applies every patch independently to a clean baseline, and runs the same conformance engine used by `archsync check`. It enforces the 9/7/4 classification split, matches violation rule IDs, binds declared evidence to patch contents and proves that all patches apply cleanly. The original roadmap distribution remains present in cases 01--10 as five no-impact, three violation and two evolution cases. Source-derived measurements remain owned by the Phase 2 Benchmark and Guardian gates instead of being duplicated inside Core evidence.

Phase 1 conformance uses an explicit observed architecture fixture so the deterministic rule engine and report contract can be demonstrated independently. Discovering that observed graph from TypeScript source files is intentionally still a Phase 2 analyzer responsibility.

Phase 1 scope changes require an ADR in `docs/adr/`. Phase 0 literature, research-question and experiment-protocol artifacts remain a separate research baseline and are not reclassified as Phase 1 deliverables. See [ADR-0002](adr/0002-expanded-evaluation-foundation.md) for the expanded benchmark boundary.
