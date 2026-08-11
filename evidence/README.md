# Phase 1 evidence

`phase-1-evidence.json` is a deterministic, machine-readable evidence manifest generated from the current schema, fixtures, graph model and diagram renderers.

Update it after an intentional model or renderer change:

```bash
pnpm evidence:update
```

Verify that committed evidence still matches the implementation:

```bash
pnpm evidence:verify
```

`pnpm phase1:verify` also enforces:

- at least ten schema/topology review scenarios;
- 90% statement/line/function and 85% branch coverage thresholds;
- valid and intentionally invalid fixture behavior;
- the built CLI exit-code and output contract;
- deterministic Mermaid and editable draw.io generation.

CI uploads `coverage/coverage-summary.json`, the HTML coverage report and this manifest as downloadable evidence artifacts.
