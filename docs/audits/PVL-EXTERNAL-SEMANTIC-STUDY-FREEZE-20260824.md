---
title: PromptVault External Semantic Study Freeze
date: 2026-08-24
status: INCOMPLETE_EXTERNAL_VALIDATION
---

# Sanitized final study record

```text
EXPECTED_CASES=176
COMPLETED_VALID_CASES=86
MISSING_CASES=90
STOP_REASON=EXTERNAL_PROVIDER_INSTABILITY
ANALYZER_CHANGED=NO
SIMULATED_RESULTS_USED_FOR_FINAL=NO
FINAL_GENERALIZATION_CONCLUSION=NOT_PROVEN
STUDY_STATUS=INCOMPLETE_EXTERNAL_VALIDATION
```

The valid 86-case evidence is preserved in the sanitized JSONL evidence. The
remaining 90 cases were not retried or extrapolated after repeated empty
responses from the external provider infrastructure. No replacement provider,
model-catalog search, or Analyzer retuning was used.

Any recorded correlations or interim score summaries are labelled
`INTERIM_NON_AUTHORITATIVE`. They are development evidence only and are not
used as a product pass/fail threshold or as a claim of broad semantic
generalization.

Recommendation V2 was not completed in the real-world study:

```text
REALWORLD_RECOMMENDATION_V2=NOT_PROVEN_EXTERNAL_STUDY_INCOMPLETE
```

The separate controlled recommendation evidence remains the product-safety
reference. It records zero critical misleading recommendations. Therefore the
bounded product safety conclusion is kept separate from the unproven
real-world generalization conclusion.

Privacy scope: this record contains no raw prompt text, credentials, request or
session identifiers, private corpus paths, or unsafe judge payloads.
