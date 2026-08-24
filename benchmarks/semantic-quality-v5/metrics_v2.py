#!/usr/bin/env python3
"""
Pairwise V2 scorer — frozen contract implementation.

Reference margin policy:
  abs(ref_A - ref_B) < margin  -> TIE / NO_ORDER_EXPECTED (excluded from denominator)
  abs(ref_A - ref_B) >= margin -> ordering expected, direction = A_GT_B

FAIL CLOSED:
  - missing required family P1-P7 -> overall FAIL
  - any pair references ID missing from reference or candidate -> NOT_EVALUATED -> FAIL
  - duplicate pair_id or duplicate (case_a,case_b) -> FAIL
  - builder-visible holdout pairs -> FAIL
  - 0/0 (no scored pairs) -> NOT_PASS / FAIL (never PASS)

Usage:
  python3 benchmarks/semantic-quality-v5/metrics_v2.py --pairs pairs.json --reference development.gold.json --candidate pv-r23-v5-dev.json [--margin 5]
  python3 metrics_v2.py (alias at repo root may re-export)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from collections import Counter

REQUIRED_FAMILIES = {"P1", "P2", "P3", "P4", "P5", "P6", "P7"}

def _load_json(path: str):
    with open(path) as f:
        data = json.load(f)
    return data

def _extract_scores(raw):
    """
    Reference/candidate may be:
      - list[{"id":..., "overall_score":...}]
      - dict {"results": [...]}
      - dict {"id":score}
    Return dict id->score.
    """
    if isinstance(raw, list):
        return {e["id"]: e["overall_score"] for e in raw}
    if isinstance(raw, dict):
        if "results" in raw:
            return {e["id"]: e["overall_score"] for e in raw["results"]}
        # maybe direct id->entry
        # check if values are ints
        if all(isinstance(v, (int, float)) for v in raw.values()):
            return raw
        # otherwise maybe dict with id keys containing objects
        # fallback: try to parse as gold list wrapped?
        raise ValueError(f"Unrecognized dict shape keys={list(raw.keys())[:5]}")
    raise ValueError(f"Unrecognized json top-level type {type(raw)}")

def main() -> int:
    parser = argparse.ArgumentParser(description="Pairwise V2 scorer (frozen margin=5)")
    parser.add_argument("--pairs", required=True, help="pairs.json path")
    parser.add_argument("--reference", required=True, help="reference gold json path")
    parser.add_argument("--candidate", required=True, help="promptvault candidate results json path")
    parser.add_argument("--margin", type=int, default=5, help="reference margin threshold (default 5, frozen)")
    parser.add_argument("--output", default=None, help="optional JSON output path")
    args = parser.parse_args()

    pairs_raw = _load_json(args.pairs)
    if not isinstance(pairs_raw, list):
        # allow wrapper {"pairs": [...]}
        if isinstance(pairs_raw, dict) and "pairs" in pairs_raw:
            pairs_raw = pairs_raw["pairs"]
        else:
            print(json.dumps({"error": "pairs.json must be a list"}, indent=2))
            return 1

    ref_raw = _load_json(args.reference)
    cand_raw = _load_json(args.candidate)

    try:
        ref_scores = _extract_scores(ref_raw)
    except Exception as e:
        print(json.dumps({"error": f"reference load failed: {e}"}, indent=2))
        return 1
    try:
        cand_scores = _extract_scores(cand_raw)
    except Exception as e:
        print(json.dumps({"error": f"candidate load failed: {e}"}, indent=2))
        return 1

    # Validation accumulators
    seen_ids = set()
    seen_pairs = set()
    family_present = set()
    per_pair = []
    fail_closed_reasons = []
    pass_count = 0
    fail_count = 0
    tie_count = 0
    not_eval_count = 0

    # Pre-check duplicate pair_id
    pair_ids = [p.get("pair_id") for p in pairs_raw]
    dup_ids = [k for k, c in Counter(pair_ids).items() if c > 1]
    if dup_ids:
        fail_closed_reasons.append(f"duplicate pair_id: {dup_ids}")

    for p in pairs_raw:
        pid = p.get("pair_id", "<missing>")
        fam = p.get("family_id")
        split = p.get("split")
        a = p.get("case_a")
        b = p.get("case_b")
        direction = p.get("expected_direction")
        v2 = p.get("pairwise_v2")

        # basic schema checks
        if fam not in REQUIRED_FAMILIES and fam is not None:
            # allow EQUIVALENCE_CHECK but flag if ordering family missing still
            pass
        if split is not None and split != "development":
            # builder-visible holdout pairs -> FAIL CLOSED
            if split == "holdout":
                fail_closed_reasons.append(f"builder-visible holdout pair forbidden before freeze: {pid}")
        if v2 is not True:
            fail_closed_reasons.append(f"pairwise_v2 must be true: {pid}")
        if direction != "A_GT_B" and fam in REQUIRED_FAMILIES:
            fail_closed_reasons.append(f"expected_direction must be A_GT_B for ordering pairs: {pid}")

        if fam in REQUIRED_FAMILIES:
            family_present.add(fam)

        key = (a, b)
        rev = (b, a)
        if key in seen_pairs or rev in seen_pairs:
            fail_closed_reasons.append(f"duplicate pair members: {pid} {a} vs {b}")
        seen_pairs.add(key)

        # evaluate
        if a not in ref_scores or b not in ref_scores:
            per_pair.append({
                "pair_id": pid,
                "family_id": fam,
                "case_a": a,
                "case_b": b,
                "status": "NOT_EVALUATED",
                "reason": "missing in reference gold",
                "ref_a": ref_scores.get(a),
                "ref_b": ref_scores.get(b),
                "cand_a": cand_scores.get(a),
                "cand_b": cand_scores.get(b),
            })
            not_eval_count += 1
            continue
        if a not in cand_scores or b not in cand_scores:
            per_pair.append({
                "pair_id": pid,
                "family_id": fam,
                "case_a": a,
                "case_b": b,
                "status": "NOT_EVALUATED",
                "reason": "missing in candidate results",
                "ref_a": ref_scores[a],
                "ref_b": ref_scores[b],
                "cand_a": cand_scores.get(a),
                "cand_b": cand_scores.get(b),
            })
            not_eval_count += 1
            continue

        ref_a = ref_scores[a]
        ref_b = ref_scores[b]
        cand_a = cand_scores[a]
        cand_b = cand_scores[b]
        ref_diff = ref_a - ref_b
        abs_margin = abs(ref_diff)

        if abs_margin < args.margin:
            # TIE excluded
            per_pair.append({
                "pair_id": pid,
                "family_id": fam,
                "case_a": a,
                "case_b": b,
                "status": "TIE",
                "reason": f"abs(reference diff) {abs_margin} < margin {args.margin} -> NO_ORDER_EXPECTED",
                "ref_a": ref_a,
                "ref_b": ref_b,
                "cand_a": cand_a,
                "cand_b": cand_b,
                "ref_diff": ref_diff,
                "cand_diff": cand_a - cand_b,
                "margin": args.margin,
            })
            tie_count += 1
        else:
            # ordering expected: A > B
            # direction is reference-implied; we also enforce ref actually A>B (construction sanity)
            # If reference says B>A while expected_direction A_GT_B, that's a construction error -> count as FAIL_CLOSED info? but per contract direction is A_GT_B, so ref should reflect it.
            # We still evaluate candidate ordering vs expected.
            cand_diff = cand_a - cand_b
            if ref_diff < 0:
                # reference actually B>A, contradicts expected_direction — record warning but still evaluate candidate vs expected
                expected = "A_GT_B"
                ref_direction = "B_GT_A"
            else:
                ref_direction = "A_GT_B"
            if cand_a > cand_b:
                status = "PASS"
                pass_count += 1
            else:
                status = "FAIL"
                fail_count += 1
            per_pair.append({
                "pair_id": pid,
                "family_id": fam,
                "case_a": a,
                "case_b": b,
                "status": status,
                "ref_a": ref_a,
                "ref_b": ref_b,
                "cand_a": cand_a,
                "cand_b": cand_b,
                "ref_diff": ref_diff,
                "cand_diff": cand_a - cand_b,
                "margin": args.margin,
                "expected_direction": "A_GT_B",
                "ref_direction": ref_direction,
            })

    # family completeness
    missing_families = sorted(REQUIRED_FAMILIES - family_present)
    if missing_families:
        fail_closed_reasons.append(f"missing required families: {missing_families} (P1-P7 must all be present)")

    if not_eval_count > 0:
        fail_closed_reasons.append(f"{not_eval_count} pair(s) NOT_EVALUATED (missing member)")

    # 0/0 handling
    total_scored = pass_count + fail_count
    if total_scored == 0:
        accuracy = None
        verdict = "FAIL"
        fail_closed_reasons.append("0/0 scored pairs (all TIE or NOT_EVALUATED) -> NOT_PASS per contract (never PASS)")
        fail_closed = True
    else:
        accuracy = pass_count / total_scored
        # overall verdict
        if fail_closed_reasons:
            verdict = "FAIL"
            fail_closed = True
        elif fail_count > 0:
            verdict = "FAIL"
            fail_closed = False
        else:
            verdict = "PASS"
            fail_closed = False

    # Determine fail_closed boolean from reasons or 0/0 etc
    # If any fail_closed_reasons that are structural (missing family etc), we already set.
    # But a single ordering FAIL is also a gate FAIL (not necessarily FAIL_CLOSED but still FAIL).
    result = {
        "contract": "pairwise_v2@1.0.0",
        "margin": args.margin,
        "total_pairs": len(pairs_raw),
        "scored_pairs": total_scored,
        "tie_excluded": tie_count,
        "not_evaluated": not_eval_count,
        "pass": pass_count,
        "fail": fail_count,
        "accuracy": accuracy,
        "accuracy_str": f"{pass_count}/{total_scored}={accuracy:.4f}" if accuracy is not None else "null (0/0)",
        "families_present": sorted(family_present),
        "families_missing": missing_families,
        "verdict": verdict,
        "fail_closed": len(fail_closed_reasons) > 0,
        "fail_closed_reasons": fail_closed_reasons,
        "per_pair": per_pair,
        "per_family": {},
    }
    # per-family rollup
    for fam in sorted(REQUIRED_FAMILIES):
        fam_pairs = [x for x in per_pair if x["family_id"] == fam]
        fam_pass = sum(1 for x in fam_pairs if x["status"] == "PASS")
        fam_fail = sum(1 for x in fam_pairs if x["status"] == "FAIL")
        fam_tie = sum(1 for x in fam_pairs if x["status"] == "TIE")
        fam_ne = sum(1 for x in fam_pairs if x["status"] == "NOT_EVALUATED")
        result["per_family"][fam] = {
            "total": len(fam_pairs),
            "pass": fam_pass,
            "fail": fam_fail,
            "tie": fam_tie,
            "not_evaluated": fam_ne,
            "verdict": "PASS" if fam_fail == 0 and fam_pass > 0 else ("TIE_ONLY" if fam_pass == 0 and fam_fail == 0 else "FAIL")
        }

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False))

    # Exit code: 0 only on full PASS (no fail_closed, no FAIL)
    if verdict == "PASS":
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())
