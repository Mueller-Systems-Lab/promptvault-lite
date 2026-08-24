#!/usr/bin/env python3
"""
Holdout Pairwise Seal — verifier-only tool (R2.3 pairwise_v2)

Purpose:
  Construct and hash-seal the HOLDOUT P1-P7 pair manifest AFTER freeze,
  BEFORE PromptVault holdout scores are opened.

Contract binding:
  - Frozen margin default 5 (configurable, but must match PAIRWISE_V2_CONTRACT.md)
  - TIE (<margin) excluded from ordering.
  - At least one ordered pair per P1-P7 families required in holdout.
  - Manifest fields per HOLDOUT_PAIRWISE_PROTOCOL.md: contract_sha256,
    holdout_input_sha256, reference_sha256, pair_manifest_sha256,
    created_before_promptvault_scoring, promptvault_scores_seen, verifier_identity.

Usage (verifier workstation, OFF-REPO, with hidden holdout artifacts):
  python3 scripts/holdout_pairwise_seal.py \
    --holdout-cases cases/holdout.json \
    --holdout-gold reference/holdout.gold.json \
    --contract benchmarks/semantic-quality-v5/PAIRWISE_V2_CONTRACT.md \
    --pairs-out /secure/holdout_pairs.json \
    --manifest-out /secure/holdout_seal_manifest.json \
    --verifier "Jane Verifier <jane@example.com> key:abcd" \
    [--margin 5] \
    [--allow-scores-seen]   # only for audit re-run after scoring; seal must be false by default

The tool does NOT create builder-visible holdout pairs. Pairs are chosen by the
verifier inspecting holdout cases and reference scores; this script VALIDATES
and SEALS a verifier-authored pairs file. Alternatively the verifier may author
holdout_pairs.json manually and use this tool to seal/hash.

If --holdout-cases contains pairs definitions to validate, or if --pairs-out is
a verifier-written file, the tool checks that every pair:
  - uses only IDs from holdout_cases,
  - has reference margin >= margin for ordering (else TIE flagged),
  - split == "holdout", pairwise_v2 == true, expected_direction == A_GT_B,
  - all P1-P7 present (otherwise FAIL).

Holdout pair construction guidance (--pairs-out not pre-existing):
  The verifier should manually curate holdout P1-P7 contrasts using reference
  scores; this tool then validates. Full auto-generation is prohibited (no
  random generation to pad counts — see contract §5).

Hash sealing:
  All SHAs are hex SHA256 over raw file bytes (or canonical JSON for manifest).
  The manifest's own pair_manifest_sha256 is the hash of holdout_pairs.json bytes.

Fail-closed: exits non-zero if any validation fails, or if promptvault holdout
candidate file is detected alongside without --allow-scores-seen.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

REQUIRED = {"P1", "P2", "P3", "P4", "P5", "P6", "P7"}

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load_json(path: Path):
    with open(path) as f:
        return json.load(f)

def main() -> int:
    p = argparse.ArgumentParser(description="Holdout pairwise seal (verifier-only)")
    p.add_argument("--holdout-cases", required=True, help="path to sealed holdout cases json (list)")
    p.add_argument("--holdout-gold", required=True, help="path to sealed holdout gold/reference json (list)")
    p.add_argument("--contract", required=True, help="path to frozen PAIRWISE_V2_CONTRACT.md")
    p.add_argument("--pairs-out", required=True, help="path to verifier holdout pairs json to write/validate")
    p.add_argument("--manifest-out", required=True, help="path to sealed manifest json to write")
    p.add_argument("--verifier", required=True, help="verifier identity string")
    p.add_argument("--margin", type=int, default=5)
    p.add_argument("--allow-scores-seen", action="store_true", help="allow promptvault_scores_seen=true (audit re-run)")
    p.add_argument("--candidate", default=None, help="optional: path to candidate holdout results (if present, seal requires --allow-scores-seen)")
    args = p.parse_args()

    holdout_cases_path = Path(args.holdout_cases)
    holdout_gold_path = Path(args.holdout_gold)
    contract_path = Path(args.contract)
    pairs_out_path = Path(args.pairs_out)
    manifest_out_path = Path(args.manifest_out)

    # Fail-closed: if candidate exists alongside and not allowed -> refuse
    if args.candidate and Path(args.candidate).exists() and not args.allow_scores_seen:
        print(f"REFUSED: candidate file {args.candidate} exists but --allow-scores-seen not set. "
              f"Seal must be created BEFORE PromptVault scores are seen (protocol §3).", file=sys.stderr)
        return 1

    # Load cases/gold
    try:
        cases_raw = load_json(holdout_cases_path)
        gold_raw = load_json(holdout_gold_path)
    except Exception as e:
        print(f"LOAD FAIL: {e}", file=sys.stderr)
        return 1

    # Extract IDs and scores
    case_ids = set()
    if isinstance(cases_raw, list):
        for c in cases_raw:
            if "id" in c:
                case_ids.add(c["id"])
    elif isinstance(cases_raw, dict) and "cases" in cases_raw:
        for c in cases_raw["cases"]:
            case_ids.add(c["id"])

    gold_scores = {}
    if isinstance(gold_raw, list):
        for g in gold_raw:
            gold_scores[g["id"]] = g["overall_score"]
    elif isinstance(gold_raw, dict) and "results" in gold_raw:
        for g in gold_raw["results"]:
            gold_scores[g["id"]] = g["overall_score"]

    # If pairs_out already exists, validate it; else require verifier to have created it externally
    if not pairs_out_path.exists():
        print(f"pairs_out {pairs_out_path} does not exist. Verifier must author holdout pairs.json manually "
              f"(inspecting cases + reference, P1-P7 at least one per family) then re-run this tool to seal. "
              f"Auto-generation from reference is not performed by this tool.", file=sys.stderr)
        return 1

    try:
        pairs = load_json(pairs_out_path)
    except Exception as e:
        print(f"pairs load fail: {e}", file=sys.stderr)
        return 1
    if isinstance(pairs, dict) and "pairs" in pairs:
        pairs = pairs["pairs"]
    if not isinstance(pairs, list):
        print("pairs file must be a list", file=sys.stderr)
        return 1

    errors = []
    families = set()
    seen = set()
    for entry in pairs:
        pid = entry.get("pair_id", "<missing>")
        fam = entry.get("family_id")
        split = entry.get("split")
        a = entry.get("case_a")
        b = entry.get("case_b")
        if fam in REQUIRED:
            families.add(fam)
        if split != "holdout":
            errors.append(f"{pid}: split must be 'holdout' (got {split!r})")
        if entry.get("pairwise_v2") is not True:
            errors.append(f"{pid}: pairwise_v2 must be true")
        if entry.get("expected_direction") != "A_GT_B":
            errors.append(f"{pid}: expected_direction must be A_GT_B")
        if a not in case_ids:
            errors.append(f"{pid}: case_a {a} not in holdout cases")
        if b not in case_ids:
            errors.append(f"{pid}: case_b {b} not in holdout cases")
        if a not in gold_scores or b not in gold_scores:
            errors.append(f"{pid}: case missing in holdout gold")
        else:
            margin = abs(gold_scores[a] - gold_scores[b])
            if margin < args.margin:
                print(f"WARNING {pid}: reference margin {margin} < {args.margin} -> TIE/NOT_SCORED (pair valid but excluded from denominator)", file=sys.stderr)
            if gold_scores[a] <= gold_scores[b] and fam in REQUIRED:
                # Holdout A should be > B per expected_direction; if not, warn that verifier constructed inverted pair
                print(f"WARNING {pid}: reference A ({gold_scores[a]}) <= B ({gold_scores[b]}) contradicts expected A_GT_B — verify construction_rationale", file=sys.stderr)
        key = (a, b)
        rev = (b, a)
        if key in seen or rev in seen:
            errors.append(f"duplicate pair members {pid}: {a} vs {b}")
        seen.add(key)

    missing = sorted(REQUIRED - families)
    if missing:
        errors.append(f"missing required families in holdout: {missing}")

    if errors:
        print("SEAL VALIDATION FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    # Compute hashes
    contract_sha = sha256_file(contract_path)
    holdout_input_sha = sha256_file(holdout_cases_path)
    reference_sha = sha256_file(holdout_gold_path)
    pair_manifest_sha = sha256_file(pairs_out_path)

    promptvault_scores_seen = bool(args.allow_scores_seen)
    created_before = not promptvault_scores_seen

    manifest = {
        "contract": "pairwise_v2@1.0.0",
        "contract_sha256": contract_sha,
        "holdout_input_sha256": holdout_input_sha,
        "reference_sha256": reference_sha,
        "pair_manifest_sha256": pair_manifest_sha,
        "margin": args.margin,
        "created_before_promptvault_scoring": created_before,
        "promptvault_scores_seen": promptvault_scores_seen,
        "verifier_identity": args.verifier,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "pairs_count": len(pairs),
        "families_present": sorted(families),
        "note": "Holdout P1-P7 sealed before PromptVault scoring was opened (protocol §3). Builder repo must not contain this manifest's pair membership before freeze."
    }

    # Write manifest (canonical JSON)
    manifest_out_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_out_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    manifest_sha = sha256_file(manifest_out_path)

    print(json.dumps({**manifest, "manifest_file_sha256": manifest_sha}, indent=2, ensure_ascii=False))
    print(f"\nSEAL OK: manifest written to {manifest_out_path}", file=sys.stderr)
    print(f"  contract_sha256: {contract_sha}", file=sys.stderr)
    print(f"  holdout_input_sha256: {holdout_input_sha}", file=sys.stderr)
    print(f"  reference_sha256: {reference_sha}", file=sys.stderr)
    print(f"  pair_manifest_sha256: {pair_manifest_sha}", file=sys.stderr)
    print(f"  manifest_file_sha256: {manifest_sha}", file=sys.stderr)
    print(f"  created_before_promptvault_scoring: {created_before}", file=sys.stderr)
    print(f"  promptvault_scores_seen: {promptvault_scores_seen}", file=sys.stderr)
    return 0

if __name__ == "__main__":
    sys.exit(main())
