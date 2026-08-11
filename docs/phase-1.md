# Phase 1 - Architecture Model and Benchmark Lab

## Objective

Turn architecture into a machine-readable contract and create ground truth for the first analyzer.

## In scope

- Architecture schema v0.1.
- YAML parser and schema/semantic validation.
- Graph domain model and graph diff.
- Deterministic Mermaid generation.
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
6. `pnpm phase1:verify` passes from a clean checkout of `archloop-core`.
