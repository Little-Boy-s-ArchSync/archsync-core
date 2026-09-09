# Append-only GOV-103 acceptance records

This directory is the closure channel for policy revision `GOV-103-r1`. Policy
bytes, human approval evidence, and the closure record are separate artifacts.
Accepting the policy adds evidence and then a JSON record here; it **never edits
the policy bytes that the human reviewed**. Contract version 1 accepts only
`GOV-103-r1`; a later revision needs a new immutable policy file and a separately
reviewed contract version rather than editing the r1 file.

No human evidence or acceptance record exists for `GOV-103-r1` as of
2026-08-30. Adding ADR-0004, this procedure, its schema, or its validator does
not approve GOV-103. Placeholder records are forbidden because downstream gates
must remain visibly incomplete until a real human decision exists.

## Exact record contract

Every `*.json` file must validate against
[`specs/gov103-acceptance-record.schema.json`](../../../specs/gov103-acceptance-record.schema.json)
and the repository's semantic validator. The record has exactly these fields in
this canonical digest order:

1. `schema_version`: integer `1`;
2. `policy_id`: exact string `GOV-103`;
3. `policy_revision`: exact string `GOV-103-r1`;
4. `policy_commit`: exact 40-character commit containing the reviewed policy;
5. `policy_sha256`: SHA-256 of the exact policy file bytes at that commit;
6. `actor_type`: exact string `human`;
7. `accepted_by`: exact documented Repository Lead identity `Hiếu`;
8. `accountable_role`: exact role `Repository Lead`;
9. `decision`: exact string `approved`;
10. `accepted_at_utc`: real UTC timestamp at second precision in
    `YYYY-MM-DDTHH:mm:ssZ` form;
11. `evidence_commit`: exact 40-character commit that already contains the
    immutable human approval evidence;
12. `evidence_url`: full
    `https://github.com/<owner>/<repo>/blob/<evidence_commit>/<path>` URL,
    optionally with a fixed line fragment; and
13. `acceptance_record_sha256`: deterministic SHA-256 over fields 1 through 12.

Extra fields, placeholders, an automated actor, a pending/rejected decision, a
floating branch URL, an evidence URL whose commit differs from
`evidence_commit`, a stale digest, or a policy/evidence byte mismatch all fail
closed.

Name the closure file
`YYYYMMDD-GOV-103-r1-<first-12-policy-SHA-256-characters>.json`, using the UTC
date from `accepted_at_utc`. The validator rejects a filename that does not bind
those record fields.

## Non-self-referential P → E → C sequence

1. **P — freeze and merge the proposed policy checkpoint.** Commit ADR-0004
   without evidence or a closure record, pass review and CI, and merge it to the
   protected `main` branch. P is the resulting protected-main commit containing
   the exact policy bytes, not a temporary feature-branch commit that squash or
   rebase may replace. Record P and SHA-256 from that locally preserved Git
   object. Do not begin E until P is reachable from the protected target branch.
2. **Human reviews exact bytes.** The accountable human inspects the policy file
   at `policy_commit`, not a mutable working tree. The decision must identify the
   exact policy ID, revision, commit, digest, human, accountable role, decision,
   and UTC-second time.
3. **E — commit and merge immutable approval evidence next.** Preserve the accountable
   human decision, required non-author review, and authorization references as a
   JSON artifact under `docs/adr/acceptance-evidence/`, validated by
   [`specs/gov103-approval-evidence.schema.json`](../../../specs/gov103-approval-evidence.schema.json).
   Its pull request must use the protected-main P commit and digest, pass review
   and CI, and merge before C starts. E is the protected-main commit that first
   introduces those exact evidence bytes. Git author/committer metadata alone is
   not approval evidence.
4. **C — append the closure record later.** Add one new JSON file here in a
   third pull request whose base already contains P and E. Its `evidence_commit`
   and full blob URL point backward to the exact E artifact. C is the commit that
   first introduces the tracked closure JSON. The validator retrieves locally
   preserved P and E bytes, derives C from Git history, and requires strict
   `P < E < C <= HEAD` ancestry. C never includes its own future commit hash, so
   no self-referential hash or amend cycle is needed.
5. **Compute the deterministic record digest.** UTF-8 encode the compact
   `JSON.stringify` object formed from fields 1 through 12 in the exact order
   above and SHA-256 those bytes. Store the result in
   `acceptance_record_sha256`.
6. **Validate against the target branch.** Run:

   ```text
   pnpm governance:verify -- --base origin/main
   pnpm phase1:verify
   ```

   Existing acceptance JSON may not be modified, deleted, or renamed relative
   to the base ref. Only a newly added record is allowed. For a C pull request,
   both P and E must already be ancestors of that base. This makes provenance
   survive squash/rebase merge strategies instead of retaining temporary branch
   hashes.
7. **Close only after final verification.** Re-run Core and affected downstream
   gates on the exact pull-request head. Hiếu performs final merge only while
   policy bytes, human evidence, closure record, and checks remain consistent.

## Canonical target trust anchor and its limit

The repository verifier accepts only the remote-tracking ref `origin/main` as
the append-only base. The fully qualified equivalent
`refs/remotes/origin/main` is normalized to that ref. It also requires the sole
configured `origin` URL to be a recognized HTTPS or SSH spelling of
`Little-Boy-s-ArchSync/archsync-core` on GitHub and requires `origin/main` to
resolve as an ancestor of `HEAD`. `--base HEAD`, local branches, tags, other
remotes, other repositories, upstream refs, merge bases, and parent-commit
fallbacks are rejected. `origin/main` remains the base when it equals `HEAD`;
the tracked-byte, introduction-history, and append-only checks still run for a
post-merge verification.

This is a fail-closed local structural trust anchor, not proof that a local
remote-tracking ref was freshly fetched from GitHub or that GitHub protected it.
CI therefore checks out full history, while protected-branch state and API
evidence must be verified separately in GitHub. Human authorization and
authenticity review also remain separate and mandatory. A person who controls a
local Git repository can rewrite its config and refs; a local pass must never be
presented as proof of GitHub protection or human action.

## Evidence and identity boundary

The technical operator may prepare code, run validation, and encode the closure
manifest from retained evidence. The operator may not invent `accepted_by`,
convert Git metadata into human approval, or create evidence claiming another
person reviewed the policy. `actor_type: "human"` describes the accountable
decision evidenced by the immutable reference; it is not inferred from the
login that committed the JSON.

Before acceptance, reviewers should retrieve the reviewed bytes from Git:

```text
git cat-file blob <policy-commit>:docs/adr/0004-architecture-change-policy-proposed.md
git rev-parse <policy-commit>:docs/adr/0004-architecture-change-policy-proposed.md
git cat-file blob <evidence-commit>:<evidence-path>
```

The validator reads those objects and checks their digest and URL binding. Every
evidence and closure JSON must be tracked, byte-identical to `HEAD`, and have one
derivable introducing commit. Once C exists, the policy file at `HEAD` and in
the working tree must remain byte-identical to P, and the evidence at `HEAD`
must remain byte-identical to E. Structural validation still cannot establish
that the named humans personally acted; authenticity review remains mandatory.

## Revision and append-only rule

Committed policy revision r1, evidence, and closure records are append-only.
Never modify, rename, delete, squash away, or force-push over an accepted record
that has entered governed history. A policy change uses a new immutable ADR
path, a new policy revision, and a new reviewed record-contract version. It does
not mutate ADR-0004 or reuse the r1 closure. A correction preserves the old
evidence and record and adds a later explicit decision; until a corresponding
versioned contract exists, conflicting or corrective closure records fail
closed and must not satisfy downstream gates.
