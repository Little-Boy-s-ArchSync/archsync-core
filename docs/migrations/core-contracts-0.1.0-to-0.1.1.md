# Migrate Core contracts from 0.1.0 to 0.1.1

## Architecture Model

Change the root version only:

```diff
-version: "0.1.0"
+version: "0.1.1"
```

The component, relationship, rule and quality-goal shapes are unchanged. The
legacy `version: "0.1"` spelling is still readable and is treated as the
`0.1.0` compatibility generation, but maintained models should use `0.1.1`.

Core now rejects unsupported string versions with an error at `/version`. Do
not bypass that error by deleting the field; `version` remains required.

## JSON consumers

`archsync graph`, `archsync diff` and `archsync check-json` now add:

- top-level `schema_version: "1.0.0"`;
- a stable `kind` discriminator;
- a `contracts` map naming the model and record contracts;
- `schema_version: "1.0.0"` on each finding and evidence location.

The pre-existing graph, diff and conformance fields remain at the same level.
Consumers that tolerated unknown fields continue to work. Strict decoders must
add the new fields to their schema and reject unknown major contract versions.

Guardian's source-derived finding and evidence records are not automatically
migrated by this Core change. Guardian must either reuse the exported Core
version constants for Core-compatible records or document a deliberate mapping
for its richer contract.

## Verification

The committed current/previous fixtures replay the same rule violation through
the benchmark and conformance engine:

```bash
pnpm build
pnpm compatibility:verify
```

The replay must report one evaluated case for each version and structurally
identical normalized conformance content after replacing only the declared
model version.
