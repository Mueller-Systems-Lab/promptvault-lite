# HOLDOUT GOLD SEALED — NON_AUTHORITATIVE_PLACEHOLDER

**Status:** This directory previously contained `holdout.gold.json.sealed` (50042 bytes, 40 cases) as a temporary heuristic placeholder.

**Per R2.3 Phase 9:** The heuristic placeholder MUST NOT become final gold. It is explicitly labeled as NON_AUTHORITATIVE_PLACEHOLDER and MUST never enter final metric computation.

**Current state (2026-08-24):**
- The placeholder file has been REMOVED from builder-visible repo.
- Only the SHA256 hash is retained for audit: `2bbbf4f57231585a21a64e74ada5decf69b51ad2f1fdcb500c6e8a3aec5ebd64`
- Real holdout gold is isolated off-repo, verifier-only, hash-sealed via `scripts/holdout_pairwise_seal.py` with fields contract_sha256, holdout_input_sha256, reference_sha256, pair_manifest_sha256, created_before_promptvault_scoring, promptvault_scores_seen, verifier_identity.
- Builder must NOT receive 40 holdout prompts or holdout gold before freeze (HOLDOUT_INPUT_ISOLATED: YES, HOLDOUT_GOLD_ISOLATED: YES via hash only).

**Next:** Independent verifier constructs holdout-pairwise-v2.json BEFORE PromptVault scoring is opened.
