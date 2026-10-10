# Independent Review Evidence

This directory holds the durable, sanitized record of **independent reviews** of
PromptVault Lite pull requests.

## Why

A review that exists only in a commit message or a PR description is not
durably auditable. This directory makes each independent review a machine-
readable artifact that names the **exact reviewed commit SHA**, the verdict and
the findings — so a later reader can verify what was reviewed without trusting
prose.

## Building a review package

```bash
# tracked repository state only — the default and the only safe default
node scripts/create-review-package.mjs --out /tmp/pvl-review --json

# include ONE untracked file, explicitly authorized and justified
node scripts/create-review-package.mjs \
  --allow-untracked path/to/file --authorized-untracked --purpose "why"
```

The tool resolves the Git root, verifies repository identity through the project
contract, packages tracked files only, refuses restricted paths and symlinks
that escape the root, writes a sanitized `inventory.json` plus `MANIFEST.sha256`
into a byte-deterministic `.tar.gz`, and prints the archive SHA-256. A restricted
path such as `Promps/private.md` is refused even when explicitly allowlisted.


| Class | Meaning | How it is produced |
| --- | --- | --- |
| `CI_VALIDATION` | Automated gates (local + GitHub Actions). | Workflow runs on the reviewed commit. |
| `AGENT_INDEPENDENT_REVIEW` | An independent reviewer agent inspected the exact HEAD and returned a verdict. Never a human approval. | A record in this directory + a PR comment quoting the reviewed SHA. |
| `HUMAN_APPROVAL` | The repository owner approved the merge. | GitHub approval / explicit owner statement. |

**An `AGENT_INDEPENDENT_REVIEW` is not a `HUMAN_APPROVAL`.** A record here never
satisfies the Human-Approval rule in `AGENTS.md` §7. Never label an agent review
as an approval.

## Enforcement classification (honest)

| Mechanism | Classification |
| --- | --- |
| Record format + required fields | `CI_ENFORCED` — `node scripts/validate-review-evidence.mjs --dir docs/audits/reviews` runs as a step in the CI `frontend` job (`VALIDATOR_AVAILABLE`) |
| Review evidence being *required* on a PR | `DOCUMENT_ONLY` — GitHub branch protection cannot technically require an agent-review artifact. There is no ruleset primitive for it. |
| Review-package privacy boundary (Promps/, .env, credentials, untracked) | `CI_ENFORCED` — `scripts/__tests__/review-package.test.js` runs under `pnpm test` in the CI frontend job |
| Secret / restricted-path scanning | `CI_ENFORCED` (CI `security-gate` + `secret-scan` jobs) |

No server-side enforcement of the review artifact is claimed. The validator
checks *format*; it cannot prove a review genuinely happened.

## Code HEAD vs. evidence commit

A review record must name the `code_head_reviewed` — the exact commit whose code
was inspected. Recording the record itself in a later, evidence-only commit is
expected and correct:

```
CODE_HEAD_REVIEWED   = the commit the reviewer inspected (recorded verbatim)
EVIDENCE_COMMIT      = the commit that adds this record (never self-referential)
```

The record must **not** claim that `code_head_reviewed` equals the commit that
contains its own file. `scripts/validate-review-evidence.mjs` warns if a record
appears to make that self-referential claim.

## Record format

One JSON file per review: `REVIEW-<pr>-<shortsha>.json`.

Required fields:

- `pr` — pull request number
- `code_head_reviewed` — full 40-hex SHA the reviewer inspected
- `review_type` — `AGENT_INDEPENDENT_REVIEW` | `HUMAN_APPROVAL` | `CI_VALIDATION`
- `reviewer_role` — e.g. `independent-reviewer-agent`
- `timestamp` — ISO-8601
- `verdict` — `APPROVE` | `APPROVE_WITH_NITS` | `REQUEST_CHANGES` | `BLOCK`
- `findings_summary` — short prose
- `findings` — list of `{ id, severity, description, fixed }`
- `delta_review_sha` — SHA of the delta re-review, or `null`
- `enforcement` — `{ review_evidence: "DOCUMENT_ONLY", validator: "VALIDATOR_AVAILABLE" }`

See `review-evidence.template.json` and run:

```bash
node scripts/validate-review-evidence.mjs docs/audits/reviews/REVIEW-*.json
```
