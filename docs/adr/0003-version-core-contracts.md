# ADR-0003: Version Core contracts independently

- Status: Accepted
- Date: 2026-08-26
- Task: CORE-101

## Context

The package version was visible, but the Architecture Model reader accepted an
open-ended `0.1.x` pattern and normalized graph, finding, evidence and CLI JSON
records did not identify their own contract. A package release could therefore
change a machine-readable shape without giving downstream consumers a reliable
compatibility decision.

## Decision

Core versions each externally consumed contract independently from the npm
package:

- Architecture Model: current `0.1.1`, previous `0.1.0`, with `0.1` retained as
  a deprecated spelling of `0.1.0` during migration.
- normalized graph and graph diff: `1.0.0`;
- conformance result: `1.0.0`;
- finding: `1.0.0`;
- evidence location: `1.0.0`;
- CLI JSON envelope: `1.0.0`.

Readers accept only the declared current, previous and temporary legacy model
versions. An unsupported string version fails at `/version` before semantic
validation and names every supported version. Writers and examples use the
current version.

The `graph`, `diff` and `check-json` commands retain their existing data fields
and add an envelope with `schema_version`, `kind` and `contracts`. Findings and
their evidence locations carry their own `schema_version`. The first versioned
JSON release is therefore additive for consumers that already ignore unknown
fields.

Every future breaking contract change requires all of the following in one
change set:

1. a version-registry update and compatibility-matrix update;
2. a migration note;
3. current and previous fixtures;
4. a replay proving the previous supported model produces the same result when
   semantics are unchanged, or an explicitly reviewed expected delta;
5. updated CLI/type tests and Phase 1 evidence;
6. downstream Guardian, Benchmark, Examples and monorepo compatibility work.

## Consequences

Downstream tools can reject unsupported contracts deterministically instead of
guessing from the package version. Core carries a small compatibility window
and must not remove the previous reader path without a breaking-version review.
Guardian still owns its richer source-evidence and PR-gate JSON contracts; it
must consume these Core constants or publish an explicit mapping in follow-up
work rather than silently copying the new numbers.
