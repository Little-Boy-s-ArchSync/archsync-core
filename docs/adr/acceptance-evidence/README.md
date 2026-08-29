# GOV-103 human approval evidence

This directory is reserved for immutable, human-authored or signed approval
evidence for proposed GOV-103 policy revision r1. Each evidence JSON must validate
against [`specs/gov103-approval-evidence.schema.json`](../../../specs/gov103-approval-evidence.schema.json)
and must be introduced by its own reviewed protected-main checkpoint after P
and before the later closure record can reference its full commit-pinned GitHub
blob URL.

This README is procedural documentation, not approval evidence. No human
acceptance evidence exists for `GOV-103-r1` as of 2026-08-30.

An evidence artifact must state the exact `policy_id`, `policy_revision`,
`policy_commit`, policy-file SHA-256, policy authors, Hiếu as the documented
Repository Lead, accountable role `Repository Lead`, `decision: approved`, a
valid UTC-second decision time, and an acceptance-authorization reference. It
must separately retain the non-author human's identity, role, approval,
UTC-second time, matching policy digest, and authorization reference. The review
time must be no later than the acceptance time, and neither timestamp may be in
the future when verified. The reviewer must differ from the accountable approver
and every declared policy author.

Approval must be authored or explicitly signed/authorized by the named humans.
Technical-operator authorship, CI output, CODEOWNERS routing, or merge metadata
does not establish acceptance. A later closure record verifies the evidence from
its earlier protected-main introducing commit; the evidence must never point to
a temporary branch commit or a future closure commit.

Local verification is anchored only to the canonical ArchSync Core
`origin/main`; it rejects other base refs and repository URLs. Even a valid local
ref does not prove GitHub protected or freshly served it, so GitHub protected
state/API evidence and human authenticity review remain separate requirements.
