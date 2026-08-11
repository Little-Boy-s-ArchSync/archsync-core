# Phase 1 - Architecture Model and Benchmark Lab

**Status:** Completed on 2026-08-11 as ArchSync v0.0.

## Objective

Turn architecture into a machine-readable contract and create ground truth for the first analyzer.

## In scope

- Architecture schema v0.1.
- YAML parser and schema/semantic validation.
- Graph domain model and graph diff.
- Deterministic Mermaid and editable draw.io generation.
- TypeScript/Node order-platform benchmark with five baseline components.
- Ten labeled change cases: five no-impact, three violations and two valid evolutions.

## Out of scope

- LLM reasoning or repair generation.
- MCP server.
- IaC and runtime analyzers.
- Automatic baseline updates.
- Production-ready CLI or multi-language analyzers.

## Exit gate

1. Valid examples load into the expected graph.
2. Invalid schema and unknown references fail with actionable errors.
3. All ten benchmark cases have an explicit delta and expected classification.
4. Benchmark distribution is exactly 5 no-impact / 3 violation / 2 evolution.
5. Mermaid output can be generated deterministically from any valid model.
6. `pnpm phase1:verify` passes from a clean checkout of `archsync-core`.
7. At least ten topology-review scenarios and the built CLI contract are enforced automatically.
8. Statement, line and function coverage remain at or above 90%; branch coverage remains at or above 85%.

## Completion evidence

| Requirement | Owner | Authoritative artifact or check |
| --- | --- | --- |
| Schema v0.1 for components, relationships, rules and goals | Core engineer | [`specs/architecture.schema.json`](../specs/architecture.schema.json) |
| Three example `architecture.yaml` models | Core engineer | Core fixtures plus [`archsync-examples/models`](https://github.com/Little-Boy-s-ArchSync/archsync-examples/tree/main/models) |
| Graph domain model, graph diff and semantic validation | Core engineer | [`src/graph.ts`](../src/graph.ts), [`src/validation.ts`](../src/validation.ts) and their tests |
| One-stack, five-component benchmark | Research engineer | [`archsync-benchmark/order-platform`](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/tree/main/order-platform) |
| Ten owned cases with explicit graph deltas and expected classifications | Research engineer | [`ground-truth.json`](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/blob/main/order-platform/ground-truth.json) |
| Deterministic Mermaid view | Core engineer | [`src/mermaid.ts`](../src/mermaid.ts) and the generated example view |
| Editable draw.io view | Core engineer | [`src/drawio.ts`](../src/drawio.ts), XML generation tests and CLI smoke checks |
| Ten-scenario schema/topology review | Core engineer | [`src/validation.topology.test.ts`](../src/validation.topology.test.ts) |
| Reproducible evidence and coverage gates | Core engineer | [`evidence/phase-1-evidence.json`](../evidence/phase-1-evidence.json), [`vitest.config.ts`](../vitest.config.ts) and cross-platform CI artifacts |
| Graph Diff demo from synthetic input | Core engineer | `archsync diff` with `minimal.architecture.yaml` and `minimal-evolution.architecture.yaml` |

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

The benchmark verifier requires exactly ten cases, checks every owner, acceptance criterion, expected source evidence and graph delta, enforces the 5/3/2 classification split, matches deterministic findings to architecture rules, matches declared files to patch contents and proves that all patches apply cleanly to the baseline. Phase 2 work remains intentionally outside this gate.

Phase 1 scope changes require an ADR in `docs/adr/`. Phase 0 literature, research-question and experiment-protocol artifacts remain a separate research baseline and are not reclassified as Phase 1 deliverables.
