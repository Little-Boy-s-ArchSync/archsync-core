# Core contract compatibility policy

This matrix is the release contract for `@archsync/core`. Package SemVer and
data-contract versions are related by release notes but are not interchangeable.

| Contract | Current writer | Previous reader | Legacy transition | Compatibility rule |
| --- | --- | --- | --- | --- |
| Architecture Model | `0.1.1` | `0.1.0` | `0.1` is accepted as the deprecated spelling of `0.1.0` | Core reads only the listed versions and emits an actionable `/version` failure otherwise. |
| Normalized graph / graph diff | `1.0.0` | Unversioned output | Existing `nodes`, `edges`, `addedNodes` and related fields remain in place | The `1.0.0` CLI envelope is additive; consumers should require a known `contracts.graph` value before relying on new fields. |
| Conformance result | `1.0.0` | Unversioned output | Existing classification, summary, finding and diff fields remain in place | A breaking meaning or required-field change increments this contract and the CLI envelope. |
| Finding | `1.0.0` | Unversioned record | Existing finding fields remain in place | Every Core-produced finding includes `schema_version`; unknown major versions must not be interpreted. |
| Evidence location | `1.0.0` | Unversioned record | Existing `document` and `path` remain in place | Every Core-produced evidence record includes `schema_version`; source-code evidence remains Guardian-owned. |
| CLI JSON envelope | `1.0.0` | Unversioned output | Legacy fields are preserved at the top level | New optional fields are minor-compatible; removing, renaming or changing a field's meaning is breaking. |

## Version policy

- Patch: clarification or validation hardening with no valid-input/output shape
  change.
- Minor: additive optional fields or a new enum value that old readers can
  safely reject or ignore as documented.
- Major: removed/renamed required fields, changed semantics, changed defaults,
  or reinterpretation of an existing value.
- Before Core `1.0.0`, a minor-number change may be breaking; the same migration
  evidence is still mandatory.
- Current fixtures are written with the current Architecture Model version.
  Previous fixtures exist only to prove the supported reader and replay path.
- The previous version is removed only in a separately reviewed breaking change
  after downstream repositories have migrated.

Run the complete compatibility and Phase 1 gates with:

```bash
pnpm build
pnpm compatibility:verify
pnpm phase1:verify
```
