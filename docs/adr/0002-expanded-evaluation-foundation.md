# ADR-0002: Keep Core evidence local and move expanded evaluation authority to Benchmark

**Status:** Accepted

**Date:** 2026-08-14

## Context

The original Phase 1 plan used ten Order Platform cases. Core evidence also repeated the old 5/3/2 benchmark distribution even though `archsync-core` did not load or execute the external dataset. Phase 2 later required broader coverage and explicit hard negatives to reveal false-positive and false-negative detector behavior.

## Decision

The canonical end-to-end dataset is expanded to 20 independently applied patches with a 9 no-impact / 7 violation / 4 evolution distribution. A separate TypeScript detector challenge corpus adds 20 positive and 20 hard-negative annotated signals.

`archsync-core` remains the authority for the Architecture Model, graph diff, conformance semantics and deterministic report generation. Its local evidence manifest no longer claims an external benchmark distribution. `archsync-benchmark` is the authority for dataset integrity, ground truth, artifact pins, measured metrics and repeatability; `archsync-guardian` is the authority for analyzer implementation and unit coverage.

## Consequences

- Phase 1's foundation is broader without coupling Core verification to a private sibling checkout or the network.
- Every metric is generated where the corresponding data and runtime artifact can actually be verified.
- The 40-signal corpus is identified as a development/regression corpus, not an independent external holdout.
- Future language analyzers can reuse Core contracts but require their own corpus and end-to-end benchmark before any accuracy claim is made.
