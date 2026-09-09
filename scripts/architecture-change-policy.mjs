import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

export const POLICY_PATH = "docs/adr/0004-architecture-change-policy-proposed.md";
export const CANONICAL_APPEND_ONLY_BASE = "origin/main";
export const CANONICAL_GITHUB_REPOSITORY = "Little-Boy-s-ArchSync/archsync-core";
export const CANONICAL_ORIGIN_URLS = Object.freeze([
  "https://github.com/Little-Boy-s-ArchSync/archsync-core.git",
  "https://github.com/Little-Boy-s-ArchSync/archsync-core",
  "git@github.com:Little-Boy-s-ArchSync/archsync-core.git",
  "git@github.com:Little-Boy-s-ArchSync/archsync-core",
  "ssh://git@github.com/Little-Boy-s-ArchSync/archsync-core.git",
  "ssh://git@github.com/Little-Boy-s-ArchSync/archsync-core",
]);
export const ACCEPTANCE_RECORD_FIELDS = Object.freeze([
  "schema_version",
  "policy_id",
  "policy_revision",
  "policy_commit",
  "policy_sha256",
  "actor_type",
  "accepted_by",
  "accountable_role",
  "decision",
  "accepted_at_utc",
  "evidence_commit",
  "evidence_url",
]);

const COMPLETE_ACCEPTANCE_RECORD_FIELDS = Object.freeze([
  ...ACCEPTANCE_RECORD_FIELDS,
  "acceptance_record_sha256",
]);
const placeholder = /^(?:n\/?a|none|null|placeholder|tbd|todo|unknown|unassigned|unfilled|pending)$/iu;
const githubBlob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([0-9a-f]{40})\/([^?#\s]+)(?:#L\d+(?:-L\d+)?)?$/u;

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value, fields) {
  return object(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function gov103AcceptanceRecordSha256(value) {
  return sha256(JSON.stringify(Object.fromEntries(
    ACCEPTANCE_RECORD_FIELDS.map((field) => [field, value[field]]),
  )));
}

export function validUtcSecond(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    return false;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant)
    && new Date(instant).toISOString() === value.replace(/Z$/u, ".000Z");
}

export function validNamedValue(value) {
  return typeof value === "string"
    && /^\S(?:.{0,126}\S)?$/u.test(value)
    && !placeholder.test(value);
}

export function validReference(value) {
  return typeof value === "string"
    && /^\S(?:.{0,2046}\S)?$/u.test(value)
    && !placeholder.test(value);
}

export function parseImmutableEvidenceUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = githubBlob.exec(value);
  if (!match) return undefined;
  let path;
  try {
    path = decodeURIComponent(match[4]);
  } catch {
    return undefined;
  }
  if (path.startsWith("/") || path.split("/").includes("..")) return undefined;
  return { owner: match[1], repository: match[2], commit: match[3], path };
}

function verificationTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

export function acceptanceRecordSemanticIssues(value, { now = Date.now() } = {}) {
  const issues = [];
  if (!exactFields(value, COMPLETE_ACCEPTANCE_RECORD_FIELDS)) {
    issues.push("record must contain exactly the GOV-103 v1 fields");
    return issues;
  }
  if (value.policy_revision !== "GOV-103-r1") issues.push("contract v1 accepts only policy_revision GOV-103-r1");
  if (value.accepted_by !== "Hiếu") issues.push("accepted_by must be the documented Repository Lead, Hiếu");
  if (value.accountable_role !== "Repository Lead") issues.push("accountable_role must be Repository Lead");
  if (!validUtcSecond(value.accepted_at_utc)) {
    issues.push("accepted_at_utc must be a real UTC-second timestamp");
  } else if (Date.parse(value.accepted_at_utc) > verificationTime(now)) {
    issues.push("accepted_at_utc must not be in the future at verification");
  }
  const evidence = parseImmutableEvidenceUrl(value.evidence_url);
  if (!evidence || evidence.commit !== value.evidence_commit) {
    issues.push("evidence_url must be an immutable GitHub blob URL pinned to evidence_commit");
  }
  if (!/^[0-9a-f]{64}$/u.test(value.acceptance_record_sha256)
      || value.acceptance_record_sha256 !== gov103AcceptanceRecordSha256(value)) {
    issues.push("acceptance_record_sha256 must match the canonical field digest");
  }
  return issues;
}

export function approvalEvidenceSemanticIssues(value, { now = Date.now() } = {}) {
  const issues = [];
  if (!object(value)) return ["approval evidence must be an object"];
  const acceptedAtValid = validUtcSecond(value.accepted_at_utc);
  if (!acceptedAtValid) {
    issues.push("evidence accepted_at_utc must be a real UTC-second timestamp");
  } else if (Date.parse(value.accepted_at_utc) > verificationTime(now)) {
    issues.push("evidence accepted_at_utc must not be in the future at verification");
  }
  if (value.policy_revision !== "GOV-103-r1") issues.push("approval evidence v1 accepts only GOV-103-r1");
  if (value.accepted_by !== "Hiếu") issues.push("evidence accepted_by must be the documented Repository Lead, Hiếu");
  if (!validReference(value.acceptance_authorization_reference)) {
    issues.push("evidence acceptance_authorization_reference cannot be a placeholder");
  }
  if (!Array.isArray(value.policy_authors)
      || value.policy_authors.some((author) => !validNamedValue(author))) {
    issues.push("every declared policy author must be named and cannot be a placeholder");
  }
  const review = value.non_author_review;
  if (!object(review)) return [...issues, "non_author_review is required"];
  const reviewedAtValid = validUtcSecond(review.reviewed_at_utc);
  if (!reviewedAtValid) {
    issues.push("non-author review time must be a real UTC-second timestamp");
  } else {
    const reviewedAt = Date.parse(review.reviewed_at_utc);
    if (reviewedAt > verificationTime(now)) issues.push("non-author review time must not be in the future at verification");
    if (acceptedAtValid && reviewedAt > Date.parse(value.accepted_at_utc)) {
      issues.push("non-author review time must be no later than acceptance time");
    }
  }
  if (!validNamedValue(review.reviewed_by)) issues.push("non-author review must name a human and cannot be a placeholder");
  if (!validNamedValue(review.reviewer_role)) issues.push("non-author reviewer_role cannot be a placeholder");
  if (!validReference(review.authorization_reference)) issues.push("non-author authorization_reference cannot be a placeholder");
  if (review.policy_sha256 !== value.policy_sha256) issues.push("non-author review must bind the same policy SHA-256");
  if (review.reviewed_by === value.accepted_by) issues.push("non-author reviewer must be separate from the accountable approver");
  if (Array.isArray(value.policy_authors) && value.policy_authors.includes(review.reviewed_by)) {
    issues.push("non-author reviewer must not be a declared policy author");
  }
  return issues;
}

export function createSchemaValidator(schema) {
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function schemaIssues(validate, value, label) {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => `${label}${error.instancePath || "/"}: ${error.message}`);
}

export function policyDocumentIssues(policy, procedure, evidenceProcedure, ciWorkflow) {
  const issues = [];
  const requirements = [
    [policy, "- Status: Proposed", "policy must remain Proposed until human acceptance"],
    [policy, "- Policy revision: GOV-103-r1", "policy revision must be explicit"],
    [policy, "| Low |", "low-risk row is required"],
    [policy, "| Medium |", "medium-risk row is required"],
    [policy, "| High |", "high-risk row is required"],
    [policy, "Any baseline edit is high risk", "baseline edits must always be high risk"],
    [policy, "**Hiếu** is the documented Repository Lead", "authoritative Repository Lead must be identified"],
    [policy, "GitHub login `an1dee3301`", "delegated operator boundary is required"],
    [policy, "cannot legitimize itself by editing the baseline", "bad implementation must not move the baseline"],
    [policy, "no automatic, one-sided, default, inferred, or retrospective acceptance", "fail-closed behavior is required"],
    [procedure, "Non-self-referential P → E → C sequence", "P/E/C procedure is required"],
    [procedure, "`P < E < C <= HEAD` ancestry", "strict P/E/C ancestry is required"],
    [procedure, "both P and E must already be ancestors of that base", "P and E must be durable protected-main checkpoints"],
    [procedure, "byte-identical to `HEAD`", "tracked HEAD-exact evidence and closure bytes are required"],
    [procedure, "accepts only the remote-tracking ref `origin/main`", "canonical origin/main must be the only accepted base"],
    [procedure, "not proof that a local", "local verification must disclaim GitHub protection and freshness"],
    [procedure, "No human evidence or acceptance record exists", "current acceptance must remain explicitly absent"],
    [procedure, "`schema_version`: integer `1`", "record schema version is required"],
    [procedure, "`policy_id`: exact string `GOV-103`", "policy binding is required"],
    [procedure, "`acceptance_record_sha256`", "deterministic record digest is required"],
    [procedure, "never includes its own future commit hash", "closure must not reference its own commit"],
    [evidenceProcedure, "not approval evidence", "procedure README must not claim approval"],
    [evidenceProcedure, "non-author human", "non-author review must be retained separately"],
    [evidenceProcedure, "neither timestamp may be in", "review and acceptance timestamps must not be future-dated"],
    [ciWorkflow, "fetch-depth: 0", "CI checkout must retain full history for provenance checks"],
  ];
  for (const [source, marker, message] of requirements) {
    if (!source.includes(marker)) issues.push(message);
  }
  if (policy.includes("Võ Đức Hiếu")) issues.push("policy must not invent an untracked full-name identity");
  return issues;
}

function protectedAppendOnlyPath(path) {
  return (path.startsWith("docs/adr/acceptance-records/") && path.endsWith(".json"))
    || (path.startsWith("docs/adr/acceptance-evidence/")
      && path.endsWith(".json"));
}

export function appendOnlyDiffIssues(nameStatus) {
  const issues = [];
  for (const line of nameStatus.split(/\r?\n/u).filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    for (const path of paths) {
      if (protectedAppendOnlyPath(path) && status !== "A") {
        issues.push(`${path}: existing governed record/evidence is append-only (found ${status})`);
      }
    }
  }
  return issues;
}

export function governedHistoryIssues(root) {
  const paths = git(root, [
    "log",
    "--format=",
    "--name-only",
    "--diff-filter=A",
    "--",
    "docs/adr/acceptance-records",
    "docs/adr/acceptance-evidence",
  ])
    .split(/\r?\n/u)
    .filter(protectedAppendOnlyPath);
  return [...new Set(paths)]
    .filter((path) => !trackedAtHead(root, path))
    .map((path) => `${path}: append-only governed artifact was introduced historically but is absent from HEAD`);
}

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function gitObjectBytes(root, commit, path) {
  return git(root, ["cat-file", "blob", `${commit}:${path}`], { encoding: null });
}

function isAncestor(root, ancestor, descendant) {
  const result = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant], {
    encoding: "utf8",
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(result.stderr || `cannot compare ${ancestor} and ${descendant}`);
}

function isStrictAncestor(root, ancestor, descendant) {
  return ancestor !== descendant && isAncestor(root, ancestor, descendant);
}

function trackedAtHead(root, path) {
  return spawnSync("git", ["-C", root, "cat-file", "-e", `HEAD:${path}`], {
    encoding: "utf8",
  }).status === 0;
}

function introducingCommits(root, path) {
  return git(root, ["log", "--diff-filter=A", "--format=%H", "--reverse", "--", path])
    .split(/\r?\n/u)
    .filter(Boolean);
}

export function trackedArtifactState(root, path) {
  const issues = [];
  if (!trackedAtHead(root, path)) {
    return { issues: [`${path}: governed artifact must be tracked in HEAD`], introducing_commit: undefined };
  }
  let headBytes;
  let workingBytes;
  try {
    headBytes = gitObjectBytes(root, "HEAD", path);
    workingBytes = readFileSync(join(root, path));
  } catch {
    return { issues: [`${path}: governed artifact must exist in both HEAD and the working tree`], introducing_commit: undefined };
  }
  if (!headBytes.equals(workingBytes)) {
    issues.push(`${path}: working bytes must exactly match tracked HEAD bytes`);
  }
  const introductions = introducingCommits(root, path);
  if (introductions.length !== 1) {
    issues.push(`${path}: exactly one introducing commit is required; found ${introductions.length}`);
    return { issues, introducing_commit: undefined, head_bytes: headBytes };
  }
  const introducingCommit = introductions[0];
  const introducedBytes = gitObjectBytes(root, introducingCommit, path);
  if (!introducedBytes.equals(headBytes)) {
    issues.push(`${path}: bytes changed after introducing commit ${introducingCommit}`);
  }
  return {
    issues,
    introducing_commit: introducingCommit,
    head_bytes: headBytes,
  };
}

function recordFilenameIssues(name, record) {
  if (typeof record.accepted_at_utc !== "string"
      || typeof record.policy_revision !== "string"
      || typeof record.policy_sha256 !== "string") {
    return [`${name}: acceptance filename cannot be checked until record identity fields are valid`];
  }
  const date = record.accepted_at_utc.slice(0, 10).replaceAll("-", "");
  const expected = `${date}-${record.policy_revision}-${record.policy_sha256.slice(0, 12)}.json`;
  return name === expected ? [] : [`${name}: acceptance filename must be ${expected}`];
}

export function approvalEvidenceBindingIssues(root, evidence, { evidencePath, base } = {}) {
  if (!evidencePath) return ["approval evidence path is required for provenance validation"];
  const issues = [];
  const policyState = trackedArtifactState(root, POLICY_PATH);
  issues.push(...policyState.issues);
  let policyBytes;
  try {
    policyBytes = gitObjectBytes(root, evidence.policy_commit, POLICY_PATH);
  } catch {
    return [...issues, `${evidence.policy_revision}: policy_commit does not contain ${POLICY_PATH}`];
  }
  if (sha256(policyBytes) !== evidence.policy_sha256) {
    issues.push(`${evidence.policy_revision}: evidence policy_sha256 does not match policy_commit bytes`);
  }
  if (policyState.introducing_commit !== evidence.policy_commit) {
    issues.push(`${evidence.policy_revision}: policy_commit P must be the introducing commit for immutable r1 policy bytes`);
  }
  if (policyState.head_bytes && sha256(policyState.head_bytes) !== evidence.policy_sha256) {
    issues.push(`${evidence.policy_revision}: current HEAD policy bytes must remain identical to P`);
  }

  const evidenceState = trackedArtifactState(root, evidencePath);
  issues.push(...evidenceState.issues);
  if (evidenceState.introducing_commit
      && !isStrictAncestor(root, evidence.policy_commit, evidenceState.introducing_commit)) {
    issues.push(`${evidence.policy_revision}: evidence introducing commit E must be strictly later than P`);
  }
  if (base && !isAncestor(root, evidence.policy_commit, base)) {
    issues.push(`${evidence.policy_revision}: policy checkpoint P must already be an ancestor of base ${base}`);
  }
  return issues;
}

export function acceptanceBindingIssues(root, record, evidenceValidate, {
  recordPath,
  base,
  now = Date.now(),
} = {}) {
  const issues = [];
  if (!recordPath) return ["closure record path is required for provenance validation"];
  const closureState = trackedArtifactState(root, recordPath);
  issues.push(...closureState.issues);
  const policyState = trackedArtifactState(root, POLICY_PATH);
  issues.push(...policyState.issues);
  let policyBytes;
  try {
    policyBytes = gitObjectBytes(root, record.policy_commit, POLICY_PATH);
  } catch {
    return [`${record.policy_revision}: policy_commit does not contain ${POLICY_PATH}`];
  }
  if (sha256(policyBytes) !== record.policy_sha256) {
    issues.push(`${record.policy_revision}: policy_sha256 does not match policy_commit bytes`);
  }
  if (policyState.introducing_commit !== record.policy_commit) {
    issues.push(`${record.policy_revision}: policy_commit P must be the introducing commit for immutable r1 policy bytes`);
  }
  if (policyState.head_bytes && sha256(policyState.head_bytes) !== record.policy_sha256) {
    issues.push(`${record.policy_revision}: active HEAD and working-tree policy bytes must remain identical to closure-bound P`);
  }

  const evidenceLocation = parseImmutableEvidenceUrl(record.evidence_url);
  if (!evidenceLocation || evidenceLocation.commit !== record.evidence_commit) return issues;
  if (evidenceLocation.owner !== "Little-Boy-s-ArchSync" || evidenceLocation.repository !== "archsync-core") {
    issues.push(`${record.policy_revision}: evidence_url must point to immutable evidence in archsync-core`);
    return issues;
  }
  if (!evidenceLocation.path.startsWith("docs/adr/acceptance-evidence/")
      || !evidenceLocation.path.endsWith(".json")) {
    issues.push(`${record.policy_revision}: evidence_url must point to an approval-evidence JSON`);
    return issues;
  }
  const evidenceState = trackedArtifactState(root, evidenceLocation.path);
  issues.push(...evidenceState.issues);
  if (evidenceState.introducing_commit !== record.evidence_commit) {
    issues.push(`${record.policy_revision}: evidence_commit E must be the evidence file's introducing commit`);
  }
  if (!isStrictAncestor(root, record.policy_commit, record.evidence_commit)) {
    issues.push(`${record.policy_revision}: evidence commit E must be later than policy commit P`);
    return issues;
  }
  if (!closureState.introducing_commit
      || !isStrictAncestor(root, record.evidence_commit, closureState.introducing_commit)) {
    issues.push(`${record.policy_revision}: closure introducing commit C must be strictly later than E`);
  }
  if (base) {
    if (!isAncestor(root, record.policy_commit, base)) {
      issues.push(`${record.policy_revision}: policy checkpoint P must already be an ancestor of base ${base}`);
    }
    if (!isAncestor(root, record.evidence_commit, base)) {
      issues.push(`${record.policy_revision}: evidence checkpoint E must already be an ancestor of base ${base}`);
    }
  }

  let evidence;
  try {
    evidence = JSON.parse(gitObjectBytes(root, record.evidence_commit, evidenceLocation.path).toString("utf8"));
  } catch {
    issues.push(`${record.policy_revision}: evidence_url does not resolve to valid JSON at evidence_commit`);
    return issues;
  }
  issues.push(...schemaIssues(evidenceValidate, evidence, `${record.policy_revision} evidence`));
  issues.push(...approvalEvidenceSemanticIssues(evidence, { now }).map((issue) => `${record.policy_revision}: ${issue}`));
  for (const field of [
    "policy_id",
    "policy_revision",
    "policy_commit",
    "policy_sha256",
    "actor_type",
    "accepted_by",
    "accountable_role",
    "decision",
    "accepted_at_utc",
  ]) {
    if (evidence[field] !== record[field]) issues.push(`${record.policy_revision}: evidence ${field} must match closure record`);
  }
  return issues;
}

function resolvedCommit(root, ref) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--verify", `${ref}^{commit}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function requestedAppendOnlyBase(argv) {
  let requested;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    let value;
    if (argument === "--base") {
      value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--base requires the canonical origin/main ref");
      index += 1;
    } else if (argument.startsWith("--base=")) {
      value = argument.slice("--base=".length);
      if (!value) throw new Error("--base requires the canonical origin/main ref");
    } else {
      throw new Error(`unexpected governance verifier argument: ${argument}`);
    }
    if (requested !== undefined) throw new Error("--base may be provided only once");
    requested = value;
  }
  return requested;
}

function configuredOriginUrls(root) {
  const result = spawnSync("git", ["-C", root, "config", "--get-all", "remote.origin.url"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function effectiveOriginUrls(root) {
  const result = spawnSync("git", ["-C", root, "remote", "get-url", "--all", "origin"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

export function resolveSafeAppendOnlyBase(root, { argv = [], env = process.env } = {}) {
  const requested = requestedAppendOnlyBase(argv);
  if (requested !== undefined
      && requested !== CANONICAL_APPEND_ONLY_BASE
      && requested !== "refs/remotes/origin/main") {
    throw new Error(`--base must be ${CANONICAL_APPEND_ONLY_BASE}; received ${requested}`);
  }
  if (env.GITHUB_BASE_REF && env.GITHUB_BASE_REF !== "main") {
    throw new Error(`GITHUB_BASE_REF must be main; received ${env.GITHUB_BASE_REF}`);
  }
  if (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY !== CANONICAL_GITHUB_REPOSITORY) {
    throw new Error(`GITHUB_REPOSITORY must be ${CANONICAL_GITHUB_REPOSITORY}`);
  }
  const originUrls = configuredOriginUrls(root);
  const effectiveUrls = effectiveOriginUrls(root);
  if (originUrls.length !== 1
      || effectiveUrls.length !== 1
      || !CANONICAL_ORIGIN_URLS.includes(originUrls[0])
      || !CANONICAL_ORIGIN_URLS.includes(effectiveUrls[0])) {
    throw new Error(
      `origin URL must identify ${CANONICAL_GITHUB_REPOSITORY}; configured ${originUrls.length === 0 ? "none" : originUrls.join(", ")}; effective ${effectiveUrls.length === 0 ? "none" : effectiveUrls.join(", ")}`,
    );
  }
  const canonicalCommit = resolvedCommit(root, "refs/remotes/origin/main");
  if (!canonicalCommit) throw new Error("canonical refs/remotes/origin/main is missing or not a commit");
  const head = resolvedCommit(root, "HEAD");
  if (!head) throw new Error("cannot resolve HEAD for canonical origin/main verification");
  if (!isAncestor(root, canonicalCommit, head)) {
    throw new Error("canonical origin/main must be an ancestor of HEAD; refresh or reconcile the checkout");
  }
  return CANONICAL_APPEND_ONLY_BASE;
}

export async function verifyArchitectureChangePolicy(root, {
  base,
  argv = [],
  env = process.env,
} = {}) {
  const policyPath = join(root, POLICY_PATH);
  const procedurePath = join(root, "docs", "adr", "acceptance-records", "README.md");
  const evidenceProcedurePath = join(root, "docs", "adr", "acceptance-evidence", "README.md");
  const recordSchemaPath = join(root, "specs", "gov103-acceptance-record.schema.json");
  const evidenceSchemaPath = join(root, "specs", "gov103-approval-evidence.schema.json");
  const ciWorkflowPath = join(root, ".github", "workflows", "ci.yml");
  const recordsDirectory = join(root, "docs", "adr", "acceptance-records");
  const evidenceDirectory = join(root, "docs", "adr", "acceptance-evidence");
  const [policy, procedure, evidenceProcedure, recordSchemaSource, evidenceSchemaSource, ciWorkflow] = await Promise.all([
    readFile(policyPath, "utf8"),
    readFile(procedurePath, "utf8"),
    readFile(evidenceProcedurePath, "utf8"),
    readFile(recordSchemaPath, "utf8"),
    readFile(evidenceSchemaPath, "utf8"),
    readFile(ciWorkflowPath, "utf8"),
  ]);
  if (base !== undefined && argv.length > 0) {
    throw new Error("provide either base or argv to governance verification, not both");
  }
  const appendOnlyBase = resolveSafeAppendOnlyBase(root, {
    argv: base === undefined ? argv : ["--base", base],
    env,
  });
  const now = Date.now();
  const issues = policyDocumentIssues(policy, procedure, evidenceProcedure, ciWorkflow);
  const recordValidate = createSchemaValidator(JSON.parse(recordSchemaSource));
  const evidenceValidate = createSchemaValidator(JSON.parse(evidenceSchemaSource));
  const evidenceNames = (await readdir(evidenceDirectory)).filter((name) => name.endsWith(".json")).sort();
  for (const name of evidenceNames) {
    const evidencePath = `docs/adr/acceptance-evidence/${name}`;
    const evidence = JSON.parse(await readFile(join(root, evidencePath), "utf8"));
    issues.push(...schemaIssues(evidenceValidate, evidence, name));
    issues.push(...approvalEvidenceSemanticIssues(evidence, { now }).map((issue) => `${name}: ${issue}`));
    issues.push(...approvalEvidenceBindingIssues(root, evidence, {
      evidencePath,
      base: appendOnlyBase,
    }).map((issue) => `${name}: ${issue}`));
  }

  const recordNames = (await readdir(recordsDirectory)).filter((name) => name.endsWith(".json")).sort();
  issues.push(...governedHistoryIssues(root));
  const revisions = new Set();
  for (const name of recordNames) {
    const recordPath = `docs/adr/acceptance-records/${name}`;
    const record = JSON.parse(await readFile(join(root, recordPath), "utf8"));
    issues.push(...schemaIssues(recordValidate, record, name));
    issues.push(...acceptanceRecordSemanticIssues(record, { now }).map((issue) => `${name}: ${issue}`));
    issues.push(...recordFilenameIssues(name, record));
    if (revisions.has(record.policy_revision)) issues.push(`${name}: duplicate closure record for ${record.policy_revision}`);
    revisions.add(record.policy_revision);
    issues.push(...acceptanceBindingIssues(root, record, evidenceValidate, {
      recordPath,
      base: appendOnlyBase,
      now,
    }));
  }

  try {
      git(root, ["rev-parse", "--verify", `${appendOnlyBase}^{commit}`]);
      const diff = git(root, [
        "diff",
        "--name-status",
        "--no-renames",
        appendOnlyBase,
        "--",
        "docs/adr/acceptance-records",
        "docs/adr/acceptance-evidence",
      ]);
      issues.push(...appendOnlyDiffIssues(diff));
  } catch (error) {
    issues.push(`cannot verify append-only history against ${appendOnlyBase}: ${error.message}`);
  }

  if (issues.length > 0) throw new Error(`GOV-103 POLICY INVALID\n- ${issues.join("\n- ")}`);
  return {
    status: governanceVerificationStatus(recordNames.length, evidenceNames.length),
    evidence_count: evidenceNames.length,
    acceptance_record_count: recordNames.length,
    append_only_base: appendOnlyBase,
  };
}

export function governanceVerificationStatus(recordCount, evidenceCount) {
  if (recordCount > 0) return "CLOSURE_RECORD_VALIDATED_AUTHENTICITY_REVIEW_REQUIRED";
  if (evidenceCount > 0) return "PROPOSED_PENDING_CLOSURE";
  return "PROPOSED_PENDING_HUMAN";
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const root = resolve(dirname(modulePath), "..");
  const result = await verifyArchitectureChangePolicy(root, {
    argv: process.argv.slice(2),
  });
  console.log(
    `VALID GOV-103 POLICY ${result.status} (${result.evidence_count} evidence, ${result.acceptance_record_count} acceptance records; append-only base ${result.append_only_base})`,
  );
}
