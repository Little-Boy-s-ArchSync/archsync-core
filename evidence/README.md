# Phase 1 evidence

`phase-1-evidence.json` is a deterministic, machine-readable evidence manifest generated from the current architecture and benchmark schemas, fixtures, graph model and diagram renderers. Its provenance section SHA-256 binds both schema files, the production TypeScript source, unit tests, complete fixture tree, verification scripts/configuration, `package.json` and `pnpm-lock.yaml` used to produce the result.

Update it after an intentional model or renderer change:

```bash
pnpm evidence:update
```

Verify that committed evidence still matches the implementation:

```bash
pnpm evidence:verify
```

Any change to a bound implementation, input, verifier or dependency makes the committed manifest stale until the full evidence gate is rerun and the regenerated manifest is reviewed.

`pnpm phase1:verify` also enforces:

- at least ten schema/topology review scenarios;
- 100% statement, branch, function and line coverage thresholds for all deterministic engine modules;
- 17/17 built-CLI command-contract checks for entry-point behavior and exit codes;
- valid and intentionally invalid fixture behavior;
- the built CLI exit-code and output contract;
- deterministic Mermaid and editable draw.io generation.

CI uploads `coverage/coverage-summary.json`, the HTML coverage report and this manifest as downloadable evidence artifacts. The manifest stores platform-stable 100% and covered-equals-total assertions; the raw covered/total counts remain in the uploaded summary because V8 may instrument different absolute branch totals across operating systems.
