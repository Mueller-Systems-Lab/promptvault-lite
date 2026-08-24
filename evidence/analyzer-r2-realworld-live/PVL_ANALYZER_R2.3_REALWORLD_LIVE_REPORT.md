# PromptVault R2.3 real-world semantic validation — frozen archive

**Status:** `INCOMPLETE_EXTERNAL_VALIDATION`
**Study scope:** 176 planned external-safe cases
**Valid completed cases:** 86
**Missing cases:** 90
**Stop reason:** `EXTERNAL_PROVIDER_INSTABILITY`

This archive preserves the partial live study as informational development
evidence. Repeated empty responses from the external provider infrastructure
prevented completion. The worker was allowed to shut down; no replacement
provider was started and the missing cases were not retried in this closure
run.

## Interpretation

- `86/176` is incomplete, not PASS and not FAIL.
- Interim metrics, if present in the JSONL evidence, are
  `INTERIM_NON_AUTHORITATIVE` and are not extrapolated.
- No simulated result was promoted to final evidence.
- The Analyzer source and consumed corpus were frozen; no post-result tuning
  occurred.
- Broad semantic generalization is `NOT_PROVEN`.
- Recommendation V2 real-world status is
  `NOT_PROVEN_EXTERNAL_STUDY_INCOMPLETE`.
- Controlled product-safety evidence remains separate and records zero known
  critical misleading recommendations.

## Preserved evidence

`realworld-live-judgments.jsonl` contains 87 sanitized rows: 86 valid cases and
one incomplete/malformed row. `live-call-evidence.jsonl` contains 212
sanitized call records. The records contain hashes, aggregate judgments and
status metadata only; raw prompt text, credentials, request/session
identifiers, local-only payloads and private corpus paths are not included.

The production contract remains local, offline and deterministic: structure,
completeness, hygiene, contradiction signals and actionable deterministic
improvement suggestions. External judges are development/test reference
infrastructure only.
