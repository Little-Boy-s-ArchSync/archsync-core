import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_APPEND_ONLY_BASE,
  CANONICAL_ORIGIN_URLS,
  POLICY_PATH,
  acceptanceRecordSemanticIssues,
  acceptanceBindingIssues,
  appendOnlyDiffIssues,
  approvalEvidenceSemanticIssues,
  approvalEvidenceBindingIssues,
  createSchemaValidator,
  governedHistoryIssues,
  governanceVerificationStatus,
  gov103AcceptanceRecordSha256,
  parseImmutableEvidenceUrl,
  policyDocumentIssues,
  resolveSafeAppendOnlyBase,
  trackedArtifactState,
  validNamedValue,
  validReference,
  validUtcSecond,
  verifyArchitectureChangePolicy,
} from "./architecture-change-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyCommit = "4".repeat(40);
const policyDigest = "5".repeat(64);
const evidenceCommit = "6".repeat(40);
const verificationNow = "2026-08-30T13:00:00Z";
const acceptedAt = "2020-01-01T00:05:00Z";
const reviewedAt = "2020-01-01T00:04:00Z";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function approvalEvidence() {
  return {
    schema_version: 1,
    policy_id: "GOV-103",
    policy_revision: "GOV-103-r1",
    policy_commit: policyCommit,
    policy_sha256: policyDigest,
    policy_authors: ["Fixture policy author"],
    actor_type: "human",
    accepted_by: "Hiếu",
    accountable_role: "Repository Lead",
    decision: "approved",
    accepted_at_utc: acceptedAt,
    acceptance_authorization_reference: "test-only:retained-human-authorization:GOV-103-r1",
    non_author_review: {
      actor_type: "human",
      reviewed_by: "Fixture non-author reviewer",
      reviewer_role: "non-author architecture reviewer",
      decision: "approved",
      reviewed_at_utc: reviewedAt,
      policy_sha256: policyDigest,
      authorization_reference: "test-only:retained-human-review:GOV-103-r1",
    },
  };
}

function acceptanceRecord() {
  const record = {
    schema_version: 1,
    policy_id: "GOV-103",
    policy_revision: "GOV-103-r1",
    policy_commit: policyCommit,
    policy_sha256: policyDigest,
    actor_type: "human",
    accepted_by: "Hiếu",
    accountable_role: "Repository Lead",
    decision: "approved",
    accepted_at_utc: acceptedAt,
    evidence_commit: evidenceCommit,
    evidence_url: `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${evidenceCommit}/docs/adr/acceptance-evidence/GOV-103-r1.json#L1-L30`,
    acceptance_record_sha256: "",
  };
  record.acceptance_record_sha256 = gov103AcceptanceRecordSha256(record);
  return record;
}

let validatorPromise;
function validators() {
  validatorPromise ??= Promise.all([
    readFile(join(root, "specs", "gov103-acceptance-record.schema.json"), "utf8"),
    readFile(join(root, "specs", "gov103-approval-evidence.schema.json"), "utf8"),
  ]).then(([recordSchema, evidenceSchema]) => ({
    record: createSchemaValidator(JSON.parse(recordSchema)),
    evidence: createSchemaValidator(JSON.parse(evidenceSchema)),
  }));
  return validatorPromise;
}

function runGit(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

async function createPecRepository(context, {
  commitClosure = true,
  fullVerifierFiles = false,
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "archsync-gov103-pec-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  runGit(directory, "init", "--quiet", "--initial-branch=main");
  runGit(directory, "config", "user.name", "GOV-103 contract test");
  runGit(directory, "config", "user.email", "gov103-test@example.invalid");

  await writeFile(join(directory, "README.md"), "# Test-only provenance fixture\n", "utf8");
  if (fullVerifierFiles) {
    for (const relativePath of [
      ".github/workflows/ci.yml",
      "docs/adr/acceptance-evidence/README.md",
      "docs/adr/acceptance-records/README.md",
      "specs/gov103-acceptance-record.schema.json",
      "specs/gov103-approval-evidence.schema.json",
    ]) {
      const destination = join(directory, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(join(root, relativePath)));
    }
  }
  runGit(directory, "add", ".");
  runGit(directory, "commit", "--quiet", "-m", "foundation checkpoint");
  const foundationCommit = runGit(directory, "rev-parse", "HEAD");

  const policyPath = join(directory, POLICY_PATH);
  await mkdir(dirname(policyPath), { recursive: true });
  const policyBytes = fullVerifierFiles
    ? await readFile(join(root, POLICY_PATH))
    : Buffer.from("# GOV-103-r1 test policy candidate\n\nStatus: Proposed\n", "utf8");
  await writeFile(policyPath, policyBytes);
  runGit(directory, "add", POLICY_PATH);
  runGit(directory, "commit", "--quiet", "-m", "policy checkpoint P");
  const actualPolicyCommit = runGit(directory, "rev-parse", "HEAD");
  const actualPolicyDigest = sha256(policyBytes);

  const evidence = approvalEvidence();
  evidence.policy_commit = actualPolicyCommit;
  evidence.policy_sha256 = actualPolicyDigest;
  evidence.non_author_review.policy_sha256 = actualPolicyDigest;
  const evidenceRelativePath = "docs/adr/acceptance-evidence/GOV-103-r1.json";
  const evidencePath = join(directory, evidenceRelativePath);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  runGit(directory, "add", evidenceRelativePath);
  runGit(directory, "commit", "--quiet", "-m", "approval-evidence checkpoint E");
  const actualEvidenceCommit = runGit(directory, "rev-parse", "HEAD");

  const record = acceptanceRecord();
  record.policy_commit = actualPolicyCommit;
  record.policy_sha256 = actualPolicyDigest;
  record.evidence_commit = actualEvidenceCommit;
  record.evidence_url = `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${actualEvidenceCommit}/${evidenceRelativePath}`;
  record.acceptance_record_sha256 = gov103AcceptanceRecordSha256(record);
  const recordDate = record.accepted_at_utc.slice(0, 10).replaceAll("-", "");
  const recordRelativePath = `docs/adr/acceptance-records/${recordDate}-GOV-103-r1-${actualPolicyDigest.slice(0, 12)}.json`;
  const recordPath = join(directory, recordRelativePath);
  await mkdir(dirname(recordPath), { recursive: true });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  let actualClosureCommit;
  if (commitClosure) {
    runGit(directory, "add", recordRelativePath);
    runGit(directory, "commit", "--quiet", "-m", "closure checkpoint C");
    actualClosureCommit = runGit(directory, "rev-parse", "HEAD");
  }

  return {
    actualClosureCommit,
    actualEvidenceCommit,
    actualPolicyCommit,
    actualPolicyDigest,
    directory,
    evidence,
    evidencePath,
    evidenceRelativePath,
    foundationCommit,
    policyBytes,
    policyPath,
    record,
    recordPath,
    recordRelativePath,
  };
}

function configureCanonicalOrigin(directory, mainCommit, url = CANONICAL_ORIGIN_URLS[0]) {
  runGit(directory, "remote", "add", "origin", url);
  runGit(directory, "update-ref", "refs/remotes/origin/main", mainCommit);
}

test("GOV-103 closure v1 binds exact r1 and Repository Lead identity", async () => {
  const validate = (await validators()).record;
  const record = acceptanceRecord();
  assert.equal(validate(record), true, JSON.stringify(validate.errors));
  assert.deepEqual(acceptanceRecordSemanticIssues(record, { now: verificationNow }), []);
  assert.equal(record.acceptance_record_sha256, gov103AcceptanceRecordSha256(record));

  const wrongHuman = { ...record, accepted_by: "Another named human" };
  wrongHuman.acceptance_record_sha256 = gov103AcceptanceRecordSha256(wrongHuman);
  assert.equal(validate(wrongHuman), false);
  assert.ok(acceptanceRecordSemanticIssues(wrongHuman, { now: verificationNow })
    .some((issue) => issue.includes("Hiếu")));

  const wrongRevision = { ...record, policy_revision: "GOV-103-r2" };
  wrongRevision.acceptance_record_sha256 = gov103AcceptanceRecordSha256(wrongRevision);
  assert.equal(validate(wrongRevision), false);
  assert.ok(acceptanceRecordSemanticIssues(wrongRevision, { now: verificationNow })
    .some((issue) => issue.includes("only policy_revision GOV-103-r1")));

  for (const invalid of [
    { ...record, unexpected: true },
    { ...record, schema_version: 2 },
    { ...record, policy_id: "GOV-104" },
    { ...record, policy_commit: "short" },
    { ...record, policy_sha256: "not-a-digest" },
    { ...record, actor_type: "automation" },
    { ...record, accountable_role: "Architecture Owner" },
    { ...record, decision: "pending" },
    { ...record, accepted_at_utc: "2026-08-30T12:34:56+00:00" },
    { ...record, evidence_commit: "short" },
    { ...record, evidence_url: "https://github.com/example/project/blob/main/evidence.json" },
    { ...record, acceptance_record_sha256: "f".repeat(64) },
  ]) {
    assert.equal(validate(invalid) && acceptanceRecordSemanticIssues(invalid, { now: verificationNow }).length === 0, false);
  }
});

test("record digest deterministically rebinds every policy, human, time, and evidence field", () => {
  const record = acceptanceRecord();
  for (const mutation of [
    { policy_revision: "GOV-103-r2" },
    { policy_commit: "7".repeat(40) },
    { policy_sha256: "7".repeat(64) },
    { accepted_by: "Another named human" },
    { accepted_at_utc: "2026-08-30T12:35:56Z" },
    { evidence_commit: "7".repeat(40), evidence_url: record.evidence_url.replace(evidenceCommit, "7".repeat(40)) },
  ]) {
    const changed = { ...record, ...mutation };
    assert.ok(acceptanceRecordSemanticIssues(changed, { now: verificationNow })
      .includes("acceptance_record_sha256 must match the canonical field digest"));
    changed.acceptance_record_sha256 = gov103AcceptanceRecordSha256(changed);
    assert.equal(acceptanceRecordSemanticIssues(changed, { now: verificationNow })
      .includes("acceptance_record_sha256 must match the canonical field digest"), false);
  }
});

test("human evidence requires exact identity, separate review, ordered timestamps, and no future claims", async () => {
  const validate = (await validators()).evidence;
  const evidence = approvalEvidence();
  assert.equal(validate(evidence), true, JSON.stringify(validate.errors));
  assert.deepEqual(approvalEvidenceSemanticIssues(evidence, { now: verificationNow }), []);

  const equalTime = {
    ...evidence,
    non_author_review: { ...evidence.non_author_review, reviewed_at_utc: evidence.accepted_at_utc },
  };
  assert.deepEqual(approvalEvidenceSemanticIssues(equalTime, { now: verificationNow }), []);

  const wrongHuman = { ...evidence, accepted_by: "Another named human" };
  assert.equal(validate(wrongHuman), false);
  assert.ok(approvalEvidenceSemanticIssues(wrongHuman, { now: verificationNow })
    .some((issue) => issue.includes("Hiếu")));
  const wrongRevision = { ...evidence, policy_revision: "GOV-103-r2" };
  assert.equal(validate(wrongRevision), false);
  assert.ok(approvalEvidenceSemanticIssues(wrongRevision, { now: verificationNow })
    .some((issue) => issue.includes("only GOV-103-r1")));

  const acceptanceInFuture = { ...evidence, accepted_at_utc: "2026-08-30T13:00:01Z" };
  assert.ok(approvalEvidenceSemanticIssues(acceptanceInFuture, { now: verificationNow })
    .includes("evidence accepted_at_utc must not be in the future at verification"));
  const reviewInFuture = {
    ...evidence,
    accepted_at_utc: "2026-08-30T13:00:02Z",
    non_author_review: { ...evidence.non_author_review, reviewed_at_utc: "2026-08-30T13:00:01Z" },
  };
  assert.ok(approvalEvidenceSemanticIssues(reviewInFuture, { now: verificationNow })
    .includes("non-author review time must not be in the future at verification"));
  const reviewAfterAcceptance = {
    ...evidence,
    non_author_review: { ...evidence.non_author_review, reviewed_at_utc: "2026-08-30T12:35:00Z" },
  };
  assert.ok(approvalEvidenceSemanticIssues(reviewAfterAcceptance, { now: verificationNow })
    .includes("non-author review time must be no later than acceptance time"));

  const invalidValues = [
    { ...evidence, actor_type: "automation" },
    { ...evidence, accepted_at_utc: "2026-13-30T12:34:56Z" },
    { ...evidence, acceptance_authorization_reference: "TBD" },
    { ...evidence, policy_authors: ["UNFILLED"] },
    { ...evidence, non_author_review: { ...evidence.non_author_review, reviewed_by: evidence.accepted_by } },
    { ...evidence, non_author_review: { ...evidence.non_author_review, reviewed_by: evidence.policy_authors[0] } },
    { ...evidence, non_author_review: { ...evidence.non_author_review, policy_sha256: "8".repeat(64) } },
    { ...evidence, non_author_review: { ...evidence.non_author_review, reviewer_role: "TBD" } },
    { ...evidence, non_author_review: { ...evidence.non_author_review, authorization_reference: "placeholder" } },
  ];
  for (const invalid of invalidValues) {
    assert.equal(validate(invalid) && approvalEvidenceSemanticIssues(invalid, { now: verificationNow }).length === 0, false);
  }
});

test("timestamps, names, and immutable evidence URLs fail closed", () => {
  assert.equal(validUtcSecond("2026-08-30T12:34:56Z"), true);
  assert.equal(validUtcSecond("2026-02-30T12:34:56Z"), false);
  assert.equal(validUtcSecond("2026-08-30T12:34:56.000Z"), false);
  assert.equal(validNamedValue("Hiếu"), true);
  assert.equal(validNamedValue("TBD"), false);
  assert.equal(validNamedValue("  "), false);
  assert.equal(validReference(`https://example.invalid/${"a".repeat(256)}`), true);
  assert.equal(validReference("placeholder"), false);

  const record = acceptanceRecord();
  assert.deepEqual(parseImmutableEvidenceUrl(record.evidence_url), {
    owner: "Little-Boy-s-ArchSync",
    repository: "archsync-core",
    commit: evidenceCommit,
    path: "docs/adr/acceptance-evidence/GOV-103-r1.json",
  });
  assert.equal(parseImmutableEvidenceUrl(record.evidence_url.replace(evidenceCommit, "main")), undefined);
  assert.equal(parseImmutableEvidenceUrl("http://github.com/example/project/blob/main/file"), undefined);
  assert.equal(parseImmutableEvidenceUrl(record.evidence_url.replace("GOV-103-r1.json", "../record.json")), undefined);

  const futureRecord = { ...record, accepted_at_utc: "2026-08-30T13:00:01Z" };
  futureRecord.acceptance_record_sha256 = gov103AcceptanceRecordSha256(futureRecord);
  assert.ok(acceptanceRecordSemanticIssues(futureRecord, { now: verificationNow })
    .includes("accepted_at_utc must not be in the future at verification"));
});

test("P, E, and C bind tracked immutable bytes in strict order", async (context) => {
  const fixture = await createPecRepository(context);
  const evidenceValidate = (await validators()).evidence;
  assert.deepEqual(approvalEvidenceBindingIssues(fixture.directory, fixture.evidence, {
    evidencePath: fixture.evidenceRelativePath,
    base: fixture.actualPolicyCommit,
  }), []);
  assert.deepEqual(acceptanceBindingIssues(fixture.directory, fixture.record, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualEvidenceCommit,
    now: verificationNow,
  }), []);

  const evidenceState = trackedArtifactState(fixture.directory, fixture.evidenceRelativePath);
  const closureState = trackedArtifactState(fixture.directory, fixture.recordRelativePath);
  assert.deepEqual(evidenceState.issues, []);
  assert.deepEqual(closureState.issues, []);
  assert.equal(evidenceState.introducing_commit, fixture.actualEvidenceCommit);
  assert.equal(closureState.introducing_commit, fixture.actualClosureCommit);

  const laterPolicyCommit = { ...fixture.record, policy_commit: fixture.actualEvidenceCommit };
  laterPolicyCommit.acceptance_record_sha256 = gov103AcceptanceRecordSha256(laterPolicyCommit);
  assert.ok(acceptanceBindingIssues(fixture.directory, laterPolicyCommit, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualEvidenceCommit,
    now: verificationNow,
  }).some((issue) => issue.includes("introducing commit for immutable r1 policy bytes")));
});

test("an untracked closure at HEAD equals E cannot pass provenance", async (context) => {
  const fixture = await createPecRepository(context, { commitClosure: false });
  const evidenceValidate = (await validators()).evidence;
  assert.equal(runGit(fixture.directory, "rev-parse", "HEAD"), fixture.actualEvidenceCommit);
  const issues = acceptanceBindingIssues(fixture.directory, fixture.record, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("governed artifact must be tracked in HEAD")));
  assert.ok(issues.some((issue) => issue.includes("closure introducing commit C must be strictly later than E")));
});

test("mutating active policy bytes after P fails in the working tree and in later history", async (context) => {
  const fixture = await createPecRepository(context);
  const evidenceValidate = (await validators()).evidence;
  await writeFile(fixture.policyPath, Buffer.concat([fixture.policyBytes, Buffer.from("mutated\n")]));
  let issues = acceptanceBindingIssues(fixture.directory, fixture.record, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("working bytes must exactly match tracked HEAD bytes")));

  runGit(fixture.directory, "add", POLICY_PATH);
  runGit(fixture.directory, "commit", "--quiet", "-m", "forbidden policy mutation after C");
  issues = acceptanceBindingIssues(fixture.directory, fixture.record, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("bytes changed after introducing commit")));
  assert.ok(issues.some((issue) => issue.includes("active HEAD and working-tree policy bytes must remain identical to closure-bound P")));
  assert.ok(approvalEvidenceBindingIssues(fixture.directory, fixture.evidence, {
    evidencePath: fixture.evidenceRelativePath,
    base: fixture.actualPolicyCommit,
  }).some((issue) => issue.includes("current HEAD policy bytes must remain identical to P")));
});

test("evidence and closure must remain byte-identical to their introducing commits and HEAD", async (context) => {
  const evidenceFixture = await createPecRepository(context);
  const evidenceValidate = (await validators()).evidence;
  const changedEvidence = {
    ...evidenceFixture.evidence,
    acceptance_authorization_reference: "test-only:changed-after-E",
  };
  await writeFile(evidenceFixture.evidencePath, `${JSON.stringify(changedEvidence, null, 2)}\n`, "utf8");
  let issues = acceptanceBindingIssues(evidenceFixture.directory, evidenceFixture.record, evidenceValidate, {
    recordPath: evidenceFixture.recordRelativePath,
    base: evidenceFixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("working bytes must exactly match tracked HEAD bytes")));
  runGit(evidenceFixture.directory, "add", evidenceFixture.evidenceRelativePath);
  runGit(evidenceFixture.directory, "commit", "--quiet", "-m", "forbidden evidence mutation after E");
  issues = acceptanceBindingIssues(evidenceFixture.directory, evidenceFixture.record, evidenceValidate, {
    recordPath: evidenceFixture.recordRelativePath,
    base: evidenceFixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("bytes changed after introducing commit")));

  const closureFixture = await createPecRepository(context);
  const changedRecord = { ...closureFixture.record, acceptance_record_sha256: "f".repeat(64) };
  await writeFile(closureFixture.recordPath, `${JSON.stringify(changedRecord, null, 2)}\n`, "utf8");
  issues = acceptanceBindingIssues(closureFixture.directory, closureFixture.record, evidenceValidate, {
    recordPath: closureFixture.recordRelativePath,
    base: closureFixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("working bytes must exactly match tracked HEAD bytes")));
  runGit(closureFixture.directory, "add", closureFixture.recordRelativePath);
  runGit(closureFixture.directory, "commit", "--quiet", "-m", "forbidden closure mutation after C");
  issues = acceptanceBindingIssues(closureFixture.directory, closureFixture.record, evidenceValidate, {
    recordPath: closureFixture.recordRelativePath,
    base: closureFixture.actualEvidenceCommit,
    now: verificationNow,
  });
  assert.ok(issues.some((issue) => issue.includes("bytes changed after introducing commit")));
});

test("P and E must be separate durable ancestors of the supplied protected-main base", async (context) => {
  const fixture = await createPecRepository(context);
  const evidenceValidate = (await validators()).evidence;
  const evidenceBaseIssues = approvalEvidenceBindingIssues(fixture.directory, fixture.evidence, {
    evidencePath: fixture.evidenceRelativePath,
    base: fixture.foundationCommit,
  });
  assert.ok(evidenceBaseIssues.some((issue) => issue.includes("policy checkpoint P must already be an ancestor")));

  const closureBaseIssues = acceptanceBindingIssues(fixture.directory, fixture.record, evidenceValidate, {
    recordPath: fixture.recordRelativePath,
    base: fixture.actualPolicyCommit,
    now: verificationNow,
  });
  assert.ok(closureBaseIssues.some((issue) => issue.includes("evidence checkpoint E must already be an ancestor")));
  assert.equal(approvalEvidenceBindingIssues(fixture.directory, fixture.evidence)
    .includes("approval evidence path is required for provenance validation"), true);
});

test("historical closure deletion cannot make the repository appear pending again", async (context) => {
  const fixture = await createPecRepository(context);
  runGit(fixture.directory, "rm", fixture.recordRelativePath);
  runGit(fixture.directory, "commit", "--quiet", "-m", "forbidden closure deletion");
  await writeFile(join(fixture.directory, "unrelated.txt"), "later commit\n", "utf8");
  runGit(fixture.directory, "add", "unrelated.txt");
  runGit(fixture.directory, "commit", "--quiet", "-m", "unrelated later commit");
  const issues = governedHistoryIssues(fixture.directory);
  assert.ok(issues.some((issue) => issue.includes(fixture.recordRelativePath)
    && issue.includes("introduced historically but is absent from HEAD")));
});

test("canonical origin/main is the only base and remains valid when it equals HEAD", async (context) => {
  const fixture = await createPecRepository(context, { fullVerifierFiles: true });
  configureCanonicalOrigin(fixture.directory, fixture.actualEvidenceCommit);
  assert.equal(resolveSafeAppendOnlyBase(fixture.directory, { argv: [], env: {} }), CANONICAL_APPEND_ONLY_BASE);
  assert.equal(resolveSafeAppendOnlyBase(fixture.directory, {
    argv: ["--base", "refs/remotes/origin/main"],
    env: {},
  }), CANONICAL_APPEND_ONLY_BASE);
  assert.equal(resolveSafeAppendOnlyBase(fixture.directory, {
    argv: ["--base=origin/main"],
    env: {},
  }), CANONICAL_APPEND_ONLY_BASE);

  let result = await verifyArchitectureChangePolicy(fixture.directory, { env: {} });
  assert.equal(result.append_only_base, CANONICAL_APPEND_ONLY_BASE);
  assert.equal(result.status, "CLOSURE_RECORD_VALIDATED_AUTHENTICITY_REVIEW_REQUIRED");

  runGit(fixture.directory, "update-ref", "refs/remotes/origin/main", fixture.actualClosureCommit);
  result = await verifyArchitectureChangePolicy(fixture.directory, { env: {} });
  assert.equal(result.append_only_base, CANONICAL_APPEND_ONLY_BASE);
});

test("missing, fake, and wrong origins fail before governance verification", async (context) => {
  const noRemote = await createPecRepository(context);
  assert.throws(
    () => resolveSafeAppendOnlyBase(noRemote.directory, { argv: [], env: {} }),
    /origin URL must identify Little-Boy-s-ArchSync\/archsync-core; configured none; effective none/u,
  );

  const wrongOrigin = await createPecRepository(context);
  runGit(wrongOrigin.directory, "remote", "add", "origin", "https://github.com/example/archsync-core.git");
  runGit(wrongOrigin.directory, "update-ref", "refs/remotes/origin/main", wrongOrigin.actualClosureCommit);
  assert.throws(
    () => resolveSafeAppendOnlyBase(wrongOrigin.directory, { argv: [], env: {} }),
    /origin URL must identify Little-Boy-s-ArchSync\/archsync-core/u,
  );

  runGit(wrongOrigin.directory, "remote", "set-url", "origin", CANONICAL_ORIGIN_URLS[0]);
  runGit(
    wrongOrigin.directory,
    "config",
    `url.${join(wrongOrigin.directory, "fake-rewrite.git")}.insteadOf`,
    CANONICAL_ORIGIN_URLS[0],
  );
  assert.throws(
    () => resolveSafeAppendOnlyBase(wrongOrigin.directory, { argv: [], env: {} }),
    /origin URL must identify Little-Boy-s-ArchSync\/archsync-core/u,
  );
  runGit(wrongOrigin.directory, "remote", "set-url", "origin", join(wrongOrigin.directory, "fake-origin.git"));
  assert.throws(
    () => resolveSafeAppendOnlyBase(wrongOrigin.directory, { argv: [], env: {} }),
    /origin URL must identify Little-Boy-s-ArchSync\/archsync-core/u,
  );

  const missingMain = await createPecRepository(context);
  runGit(missingMain.directory, "remote", "add", "origin", CANONICAL_ORIGIN_URLS[2]);
  assert.throws(
    () => resolveSafeAppendOnlyBase(missingMain.directory, { argv: [], env: {} }),
    /canonical refs\/remotes\/origin\/main is missing/u,
  );
});

test("HEAD, other refs, and non-main GitHub context cannot override canonical origin/main", async (context) => {
  const fixture = await createPecRepository(context, { fullVerifierFiles: true });
  configureCanonicalOrigin(fixture.directory, fixture.actualEvidenceCommit);
  for (const base of ["HEAD", "HEAD^", "main", "refs/heads/main", "origin/develop", fixture.actualEvidenceCommit]) {
    assert.throws(
      () => resolveSafeAppendOnlyBase(fixture.directory, { argv: ["--base", base], env: {} }),
      /--base must be origin\/main/u,
    );
  }
  await assert.rejects(
    verifyArchitectureChangePolicy(fixture.directory, { base: "HEAD", env: {} }),
    /--base must be origin\/main/u,
  );
  assert.throws(
    () => resolveSafeAppendOnlyBase(fixture.directory, { argv: [], env: { GITHUB_BASE_REF: "develop" } }),
    /GITHUB_BASE_REF must be main/u,
  );
  assert.throws(
    () => resolveSafeAppendOnlyBase(fixture.directory, {
      argv: [],
      env: { GITHUB_REPOSITORY: "example/archsync-core" },
    }),
    /GITHUB_REPOSITORY must be Little-Boy-s-ArchSync\/archsync-core/u,
  );
});

test("stale origin/main that lacks E cannot bless a local-only closure", async (context) => {
  const fixture = await createPecRepository(context, { fullVerifierFiles: true });
  configureCanonicalOrigin(fixture.directory, fixture.actualPolicyCommit);
  assert.equal(resolveSafeAppendOnlyBase(fixture.directory, { argv: [], env: {} }), CANONICAL_APPEND_ONLY_BASE);
  await assert.rejects(
    verifyArchitectureChangePolicy(fixture.directory, { env: {} }),
    /evidence checkpoint E must already be an ancestor of base origin\/main/u,
  );
});

test("policy documents retain risk, immutable P/E/C checkpoints, and explicit proposed state", async () => {
  const [policy, procedure, evidenceProcedure, ciWorkflow] = await Promise.all([
    readFile(join(root, POLICY_PATH), "utf8"),
    readFile(join(root, "docs", "adr", "acceptance-records", "README.md"), "utf8"),
    readFile(join(root, "docs", "adr", "acceptance-evidence", "README.md"), "utf8"),
    readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
  ]);
  assert.deepEqual(policyDocumentIssues(policy, procedure, evidenceProcedure, ciWorkflow), []);
  assert.ok(policyDocumentIssues(policy.replace("| High |", "| Elevated |"), procedure, evidenceProcedure, ciWorkflow)
    .includes("high-risk row is required"));
  assert.ok(policyDocumentIssues(policy.replace("- Status: Proposed", "- Status: Accepted"), procedure, evidenceProcedure, ciWorkflow)
    .includes("policy must remain Proposed until human acceptance"));
  assert.ok(policyDocumentIssues(policy, procedure.replace("Non-self-referential P → E → C sequence", "Sequence"), evidenceProcedure, ciWorkflow)
    .includes("P/E/C procedure is required"));
  assert.ok(policyDocumentIssues(policy, procedure, evidenceProcedure, ciWorkflow.replace("fetch-depth: 0", "fetch-depth: 1"))
    .includes("CI checkout must retain full history for provenance checks"));
  assert.equal(policy.includes("Võ Đức Hiếu"), false);
});

test("governed evidence and closure files are append-only relative to the base", () => {
  assert.deepEqual(appendOnlyDiffIssues([
    "A\tdocs/adr/acceptance-evidence/GOV-103-r1.json",
    "A\tdocs/adr/acceptance-records/20260830-GOV-103-r1-555555555555.json",
    "M\tdocs/adr/acceptance-records/README.md",
  ].join("\n")), []);

  const issues = appendOnlyDiffIssues([
    "M\tdocs/adr/acceptance-evidence/GOV-103-r1.json",
    "D\tdocs/adr/acceptance-records/20260830-GOV-103-r1-555555555555.json",
  ].join("\n"));
  assert.equal(issues.length, 2);
  assert.match(issues[0], /append-only/u);
});

test("structural closure validation never labels human authenticity as accepted", () => {
  assert.equal(governanceVerificationStatus(0, 0), "PROPOSED_PENDING_HUMAN");
  assert.equal(governanceVerificationStatus(0, 1), "PROPOSED_PENDING_CLOSURE");
  const closureStatus = governanceVerificationStatus(1, 1);
  assert.equal(closureStatus, "CLOSURE_RECORD_VALIDATED_AUTHENTICITY_REVIEW_REQUIRED");
  assert.doesNotMatch(closureStatus, /ACCEPTED/u);
});
