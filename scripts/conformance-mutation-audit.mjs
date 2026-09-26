import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Small, declared semantic fault model; not a whole-program mutation score.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'evidence/rigor-2026-09-26/mutations'));
const mutations = [
  ['deny-disabled', 'if (rule.type !== "deny") continue;', 'if (rule.type === "deny") continue;'],
  ['allow-inverted', '!matchesSelector(rule.to, relationship.to)', 'matchesSelector(rule.to, relationship.to)'],
  ['require-satisfied-is-error', 'if (matching) continue;', 'if (!matching) continue;'],
  ['path-ignores-edge-type', 'if (relationshipType && edge.type !== relationshipType) continue;', 'if (false) continue;'],
  ['path-is-direct-only', 'queue.push(edge.to);', '/* injected fault: do not traverse */'],
  ['path-misses-direct-target', 'if (matchesSelector(targetSelector, edge.to)) return true;', 'if (false) return true;'],
  ['violation-demoted', '? "violation"', '? "no-impact"'],
  ['evolution-demoted', '? "evolution"', '? "no-impact"'],
];
// Never reuse an earlier receipt directory: a crashed runner must not inherit
// a previous run's JSON report or erase a failed audit.
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
const workspace = await mkdtemp(join(tmpdir(), 'archsync-mutation-audit-'));
const original = await readFile(join(root, 'src/conformance.ts'), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const report = { schema_version: 1, scope: 'eight targeted semantic mutants; synthetic finite model checking, not field accuracy',
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  source_sha256: digest(original), test_sha256: digest(await readFile(join(root, 'src/conformance-exhaustive.test.ts'))), runs: [] };
try {
  await mkdir(join(workspace, 'src'));
  await writeFile(join(workspace, 'package.json'), '{"type":"module","private":true}\n');
  await symlink(join(root, 'node_modules'), join(workspace, 'node_modules'), 'dir');
  for (const file of ['graph.ts', 'model.ts', 'versions.ts', 'conformance-exhaustive.test.ts']) {
    await copyFile(join(root, 'src', file), join(workspace, 'src', file));
  }
  for (const [id, before, after] of [['baseline', null, null], ...mutations]) {
    if (before && original.split(before).length !== 2) throw new Error(`Mutation ${id} must match exactly once`);
    const source = before ? original.replace(before, after) : original;
    await writeFile(join(workspace, 'src/conformance.ts'), source);
    const jsonPath = join(out, `${id}.json`);
    const args = [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', workspace,
      'src/conformance-exhaustive.test.ts', '--reporter=json', `--outputFile=${jsonPath}`];
    const result = spawnSync(process.execPath, args, { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
    await writeFile(join(out, `${id}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    let parsed;
    try { parsed = JSON.parse(await readFile(jsonPath, 'utf8')); } catch { /* retained as execution error */ }
    const completed = !result.error && !result.signal && parsed?.numTotalTests === 3 &&
      parsed.numPassedTests + parsed.numFailedTests === parsed.numTotalTests;
    const status = !completed ? 'execution-error' : result.status === 0 ? 'passed' : parsed.numFailedTests > 0 ? 'assertion-failure' : 'execution-error';
    report.runs.push({ id, replacement: before ? { before, after } : null, source_sha256: digest(source),
      exit_code: result.status, signal: result.signal, status, tests: parsed?.numTotalTests ?? null,
      failed_tests: parsed?.numFailedTests ?? null });
    if (id === 'baseline' && status !== 'passed') throw new Error('Baseline must pass before mutation results are interpretable');
  }
  report.killed = report.runs.slice(1).filter(r => r.status === 'assertion-failure').length;
  report.survived = report.runs.slice(1).filter(r => r.status === 'passed').length;
  report.execution_errors = report.runs.slice(1).filter(r => r.status === 'execution-error').length;
  if (report.killed !== mutations.length) process.exitCode = 1;
} finally {
  await writeFile(join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  await rm(workspace, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
