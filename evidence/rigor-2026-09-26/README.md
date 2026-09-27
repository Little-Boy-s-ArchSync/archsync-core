# Finite rule-semantics validation, 2026-09-26

This is developer-authored engineering evidence, not an independent repository
sample, a population accuracy estimate, or a replacement for D3. Historical
benchmark observations have not been rewritten.

## Scope and oracle

`src/conformance-exhaustive.test.ts` enumerates all 4,096 graphs on three fixed
nodes, two edge types (HTTP/data), and the 12 possible directed non-self edge
slots. Each graph is checked against 192 deny/allow/require/require-path rules:
four source selectors, four target selectors, and three type constraints.
This gives 786,432 rule–graph evaluations, not 786,432 independent samples.

The oracle implements the documented rule semantics using adjacency matrices
and Floyd–Warshall transitive closure, separate from production graph/selector/
traversal helpers. The diagonal starts false, so a path must contain an edge;
cycles can establish a nonempty path back to the source. The test checks each
rule's violation count, aggregate count and classification. It also checks
ordering/consistent-renaming invariance on 241 graph states (masks 0..4080 by17)
and addition/removal inverse deltas on all 4,096 states.

Scope excludes self-loop inputs, arbitrary wildcard fragments, larger graphs,
component metadata changes, all other edge types, and extraction from source.
Separate implementation does not establish independent human authorship or
eliminate specification errors shared by the implementation and test author.

## Mutation adequacy and retained failure

`scripts/conformance-mutation-audit.mjs` copies the minimal tested source into
an isolated temporary directory. It changes exactly one source expression per
mutant and executes the finite-model suite. The production source is untouched.
It distinguishes assertion failures from execution errors and requires a
passing unmodified baseline before interpreting any mutant.

Eight declared faults cover disabled deny enforcement, inverted allow logic,
inverted required-edge satisfaction, ignored path edge types, direct-only path
search, missing path-target detection, demoted violations, and demoted evolution.
These are a targeted fault model, not all possible or automatically generated
mutants; equivalent-mutant adjudication and a whole-program score are not claimed.

The initial audit killed seven mutants; violation demotion survived because the
oracle checked violation counts without asserting the resulting classification.
The test was strengthened, then rerun against the same eight faults: eight
assertion-failure kills, zero survivors, zero execution errors. Both rounds are
retained in `mutations-initial/` and `mutations/`, including replacement text,
source/test hashes, native test reports and logs. The final score is therefore
test-development evidence, not an untouched validation sample.

Code review identified a receipt hazard on reusing the output directory. The
runner now requires a new directory and requires all three tests to complete,
preventing an old JSON report from being mistaken for a new result. A further
run with this hardened runner is retained in `mutations-reviewed/`: 8/8 kills,
zero survivors or execution errors.

The initial typecheck failure from a test-only union type is retained in
`typecheck-initial.log`; it was corrected before final validation.

## Verification

Environment: Node22.16.0, macOS arm64. Full Core suite: 126/126 tests pass;
configured statement/branch/function/line coverage remains 100%. Typecheck
passes. `coverage.log` and `typecheck.log` are the final suite receipts.
The complete Phase1 command reached its last check and found the expected stale
source-evidence digest after adding the test. The previous current engineering
receipt is preserved in `phase-1-evidence-before.json`; it was refreshed and
its verifier passed (`evidence-update.log`, `evidence-verify.log`). Compatibility,
CLI smoke, fixture validation and governance checks passed in `phase1-verify.log`.
`model-check.log` is the initial finite-model run before mutation-driven test
strengthening; the final baseline is in `mutations/baseline.json` and the full
coverage run. Timing values are execution diagnostics, not performance claims.

Reproduce from Core with Node22.16.0 on PATH:

```sh
pnpm typecheck
pnpm test:coverage
node scripts/conformance-mutation-audit.mjs /absolute/path/to/new-audit-directory
```
