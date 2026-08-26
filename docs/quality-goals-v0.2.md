# Quality goal contract v0.2 (proposed Phase 6 foundation)

Status: **Proposed — not approved and not experimentally validated**

The standalone `specs/quality-goal.schema.json` contract makes each Phase 6 trade-off target independently measurable. It covers latency, availability, security, cost and complexity without collapsing unlike dimensions into one score.

Every v0.2 goal declares a component selector, metric, comparison operator, typed target, unit, measurement window and priority. The schema binds each attribute to a single metric/unit family and rejects impossible combinations such as availability above `1`, fractional counts or latency expressed as currency.

The architecture schema accepts both the original unversioned quality-goal shape and the opt-in `contract_version: "0.2"` shape. Existing v0.1 architecture documents therefore remain valid. Consumers must branch on `contract_version`; they must not silently reinterpret a legacy goal as v0.2.

This contract supplies deterministic validation only. Goal selection, thresholds, priorities and any claim that a goal represents stakeholder intent still require the project review process. Runtime observations can measure a declared goal, but absence of telemetry is `unknown`, not evidence that the goal was met.
