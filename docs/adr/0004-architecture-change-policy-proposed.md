# ADR-0004: Govern architecture changes with risk-bound human acceptance

- Status: Proposed
- Date: 2026-08-30
- Task: GOV-103
- Policy revision: GOV-103-r1
- Supersedes: none

## Context

ADR-0001 makes `architecture.yaml` the approved source of truth and says that
implementation drift is not permission to change it. The repository did not,
however, define one complete policy for classifying a proposed change, naming
the required human approvers, retaining evidence, proving rollback readiness,
or deciding when a baseline candidate may reach the default branch.

This gap is especially important because CI, a GitHub login, an AI operator, or
a green deterministic result can prepare and verify a proposal but cannot make
an architecture decision. A baseline edit that merely follows observed code
would hide drift instead of governing it.

## Decision drivers

- Preserve the approved Architecture Model as intent rather than observed fact.
- Make the minimum human authority and evidence deterministic for each risk.
- Keep approval attributable even when technical work is delegated.
- Bind every decision to exact immutable candidate bytes.
- Reject incomplete, ambiguous, retrospective, or provider-created approval.
- Make rollback possible without rewriting repository history or old evidence.

## Decision

If this proposal is accepted through the separate procedure in
[`acceptance-records/README.md`](acceptance-records/README.md), every
architecture-related change is governed by the highest applicable row below.
Task-specific gates may add approvers or evidence; they may not weaken this
matrix.

The authoritative roles already established by project governance are:

- **Hiếu** is the documented Repository Lead responsible for research scope,
  RQ/protocol, architecture approval, paper, and final merge.
- The accountable human owner remains responsible for the scoped artifact.
- A human reviewer satisfies non-author review only when that person did not
  author the exact candidate bytes.
- GitHub login `an1dee3301` may perform technical operations for TV1, TV2, and
  TV3, but its commits, pull requests, automation, and account metadata do not
  prove that any named human reviewed or accepted a decision.

This ADR records no human acceptance. Its effective status remains **Proposed**
until immutable human approval evidence exists and a later valid append-only
GOV-103 closure record binds the exact bytes of a commit containing this file.
Contract v1 closes only revision `GOV-103-r1` through three protected-main
checkpoints: P first merges these immutable policy bytes, E later merges human
approval plus separate non-author review bound to P, and C finally appends the
closure record after both P and E are already in its protected target branch.
Temporary feature-branch commits are not durable P or E identities because
squash/rebase may replace them.

### Risk and approval matrix

| Risk | Classification | Required human decisions | Minimum evidence snapshot | Rollback before merge | Baseline rule |
| --- | --- | --- | --- | --- | --- |
| Low | Documentation, generated views, internal refactoring, or test cleanup that does not change behavior, a public contract, architecture semantics, hard rules, research claims, or approved evidence. | The named accountable human owner accepts, and one named human reviewer who is not the candidate author accepts. Hiếu still performs the final merge under project governance. | Exact candidate commit/path/SHA-256, scoped diff, relevant checks, and an explicit statement that behavior and architecture intent are unchanged. | A concrete revert or regeneration command and the previously verified state. | Editing `architecture.yaml` or another approved architecture baseline is forbidden at low risk. |
| Medium | Public CLI behavior, schema-compatible non-Architecture-Model output, report presentation that can affect consumers, benchmark tooling, or other reversible behavior whose failure does not change architecture intent, hard-rule meaning, security boundaries, ground truth, RQ/metric, release authority, or accepted research claims. | Hiếu, acting as research lead and architecture owner, accepts; one named human reviewer who is not the candidate author accepts. The accountable person is recorded even when not an approver. | Low-risk evidence plus compatibility/replay results, consumer impact, migration note when applicable, before/after output, and the complete OS matrix relevant to the repository. | Exact revert steps, consumer downgrade/migration steps, and a verified return to the prior contract or output. | Editing `architecture.yaml` or another approved architecture baseline is forbidden at medium risk. |
| High | Any Architecture Model schema, version, semantic, hard rule, quality-goal target, expected component/relationship, approved baseline, ground truth, RQ/metric, security boundary, provider-data boundary, release authority, or change intended to turn an observed evolution into accepted intent. Any baseline edit is high risk regardless of diff size. | Hiếu, acting as architecture owner, explicitly accepts the exact candidate; at least one named human reviewer who is not the candidate author reviews the same bytes. If a task requires a separate security reviewer, independent verifier, or ground-truth reviewer, that additional named-human decision is also mandatory. | Medium-risk evidence plus immutable before/after models, conformance and rule impact, downstream contract/fixture impact, exact evidence digests, assumptions and unknowns, migration plan, and rollback verification. | A tested plan that restores the last approved baseline and compatible toolchain by a new revert/forward commit; accepted records and old artifacts are never overwritten. | A baseline candidate may be merged only through the sequence below. It never follows implementation automatically. |

If more than one row applies, the highest risk wins. If classification is
uncertain, classification moves up one level. Any uncertainty about architecture
semantics or baseline intent is high risk.

### Architecture-change evidence and identity requirements

Every decision record must bind all of the following:

1. task and decision identifiers;
2. risk level and rationale;
3. exact candidate commit, repository-relative path, Git blob object ID, and
   SHA-256 of the candidate bytes;
4. named accountable person and role;
5. every required human decision, including person, role, decision time,
   retained approval reference, and the same candidate SHA-256;
6. immutable evidence-snapshot reference and SHA-256;
7. rollback plan and rollback-verification reference where required;
8. whether a baseline update is requested and, if so, its exact unmerged commit,
   path, and SHA-256; and
9. the technical operator separately from the accountable person and reviewers.

Git authorship, pull-request authorship, CODEOWNERS routing, branch protection,
CI success, merge metadata, chat text copied by an operator, and model/provider
output are useful provenance but are not human approval evidence. An approval
reference must point to a retained review, signed attestation, or other governed
record created by the named human.

### Baseline-update sequence

`architecture.yaml` or an equivalent approved baseline may change only when all
of these steps succeed in order:

1. Keep the current approved baseline unchanged while diagnosing the observed
   implementation and classifying violations versus intentional evolution.
2. Resolve every change that remains a violation. A violating implementation
   cannot legitimize itself by editing the baseline. Changing a hard rule or its
   meaning requires its own high-risk proposal.
3. Freeze the implementation proposal, before/after Architecture Models,
   evidence snapshot, downstream impact, migration plan, and rollback proof.
4. Put the proposed baseline bytes in a discrete **unmerged** commit. Generate
   derived Mermaid/draw.io views from those bytes and run all relevant gates.
5. After inspecting that exact commit, required humans create immutable approval
   evidence, and a later change-specific decision record binds the baseline
   candidate commit and digest. Neither action edits the candidate.
6. Re-run the repository and downstream compatibility gates on the exact pull
   request head. Any candidate-byte change invalidates the prior human decision
   and requires a new record.
7. Hiếu performs the final merge only while the evidence, checks, required human
   decisions, and append-only record are complete and consistent.

Until step 7, the default-branch baseline remains authoritative. Runtime, IaC,
source analysis, AI reasoning, or provider output is evidence only and cannot
advance this sequence.

### Fail-closed behavior

The result is `pending`/`REVIEW` or `rejected`/`BLOCK`, never accepted, when any
required field, exact-byte binding, evidence item, rollback proof, human
decision, task-specific gate, or relevant check is absent, invalid, stale, or
ambiguous. In particular:

- no automatic, one-sided, default, inferred, or retrospective acceptance is
  allowed;
- a technical operator cannot fill a missing named-human decision;
- a provider or AI system cannot be author, reviewer, approver, or accountable
  person;
- changing candidate bytes after review invalidates that review;
- once a closure record exists, any difference between P, `HEAD`, and working
  tree policy bytes is invalid; a later policy uses a new immutable file,
  revision, and reviewed record contract rather than editing r1;
- governance verification accepts only the canonical `origin/main` ref for the
  exact ArchSync Core GitHub repository; another ref, repository, missing remote
  state, or fallback base fails closed;
- rejected and superseded records remain in history;
- corrections append a new record that names the superseded decision; and
- missing enforcement keeps the baseline unchanged rather than weakening the
  gate.

The repository validator checks this policy, the GOV-103 acceptance-record
contract, exact policy/evidence bindings, the deterministic record digest, and
the append-only Git diff against canonical `origin/main`. It rejects local or
arbitrary base fallbacks. Passing local validation proves structural consistency
only; it does not prove that `origin/main` was freshly fetched, that GitHub branch
protection or API state was effective, or that the referenced human actually
made the decision. Those protected-state and authenticity checks remain
separate. GOV-103 acceptance establishes this policy; it does not replace the
separate human decision required for each future architecture change.

## Considered options

### Automatically update the baseline after clean detection

Rejected. Detection shows observed topology, not approved intent, and would let
an implementation erase evidence of its own drift.

### Treat CI, CODEOWNERS, or merge identity as approval

Rejected. Those controls show that an account or automation acted; they do not
establish named-human review or independence.

### Change `Status: Proposed` in the candidate ADR when accepting it

Rejected. Editing the candidate after review changes the reviewed bytes. A
separate append-only acceptance record preserves the exact proposal and the
decision as distinct artifacts.

## Consequences

### Positive

- Risk, authority, evidence, and rollback are explicit before baseline changes.
- Approval remains auditable across delegated technical operations.
- The approved baseline cannot silently follow an incorrect implementation.
- Candidate, decision, and later corrections remain independently hashable.

### Negative

- Medium- and high-risk changes require more artifacts and at least one human
  review interaction.
- Baseline candidates need a multi-commit pull-request sequence.
- Existing automation can validate structure but cannot replace identity or
  judgment checks.

## Related decisions and policies

- [ADR-0001](0001-architecture-model-is-source-of-truth.md)
- [ADR-0003](0003-version-core-contracts.md)
- [Append-only acceptance-record procedure](acceptance-records/README.md)
- Umbrella repository `docs/GOVERNANCE.md`
- Umbrella repository `docs/ACCOUNT-DELEGATION.md`
